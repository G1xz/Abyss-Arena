/**
 * PostgreSQL local para desenvolvimento em máquinas sem Docker.
 * Usa binários oficiais via `embedded-postgres` e mantém os dados em `.local/pgdata`.
 *
 *   npm run db:local          -> sobe o banco e fica em execução (Ctrl+C para parar)
 *
 * Em produção/VPS use o PostgreSQL do docker-compose.yml.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const databaseDir = path.resolve(process.env.LOCAL_DB_DIR ?? ".local/pgdata");
const databaseName = process.env.LOCAL_DB_NAME ?? "abyss_arena";

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    // UTF-8 explícito: no Windows o initdb usaria o encoding do sistema (WIN1252).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log(`[local-db] inicializando cluster em ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  await client.end();
  if (exists.rowCount === 0) await pg.createDatabase(databaseName);

  console.log(`[local-db] PostgreSQL pronto: postgresql://postgres:postgres@localhost:${port}/${databaseName}`);

  const shutdown = async () => {
    console.log("[local-db] encerrando...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[local-db] falha ao iniciar:", err);
  process.exit(1);
});
