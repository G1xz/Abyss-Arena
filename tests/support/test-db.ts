/**
 * Provisiona um banco PostgreSQL real e isolado para testes.
 *  - Com TEST_DATABASE_URL: usa esse servidor e (re)cria o banco pedido.
 *  - Sem: sobe um PostgreSQL embutido em .local/test-pgdata (porta TEST_DB_PORT ou 54329).
 * As migrations Prisma reais são aplicadas em seguida.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function withDatabase(url: string, database: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

async function canConnect(url: string) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function startEmbedded(): Promise<{ serverUrl: string; stop: () => Promise<void> }> {
  const port = Number(process.env.TEST_DB_PORT ?? 54329);
  const serverUrl = `postgresql://postgres:postgres@localhost:${port}/postgres`;
  if (await canConnect(serverUrl)) return { serverUrl, stop: async () => {} }; // já em execução
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = path.join(ROOT, ".local", "test-pgdata");
  const instance = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await instance.initialise();
  await instance.start();
  return {
    serverUrl,
    // Desligamento limpo via pg_ctl. No Windows, o stop() do pacote usa "taskkill /f", que pode deixar
    // processos filhos órfãos segurando a porta.
    stop: async () => {
      const platform = process.platform === "win32" ? "windows" : process.platform;
      const pgCtl = path.join(ROOT, "node_modules", "@embedded-postgres", `${platform}-${process.arch}`, "native", "bin", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
      try {
        execFileSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w"], { stdio: "pipe" });
      } catch {
        await instance.stop();
      }
    },
  };
}

export async function provisionDatabase(database: string): Promise<{ url: string; stop: () => Promise<void> }> {
  const base = process.env.TEST_DATABASE_URL;
  const { serverUrl, stop } = base ? { serverUrl: withDatabase(base, "postgres"), stop: async () => {} } : await startEmbedded();

  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const url = withDatabase(serverUrl, database);
  execFileSync(process.execPath, [path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return { url, stop };
}
