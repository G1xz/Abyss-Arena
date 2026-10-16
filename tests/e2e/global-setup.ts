import { execFileSync } from "node:child_process";
import path from "node:path";
import { E2E } from "../../playwright.config";
import { provisionDatabase } from "../support/test-db";

/** Banco E2E limpo + seed real (catálogo do snapshot local, tabela v1, ciclo vigente e admin). */
export default async function globalSetup() {
  const { url, stop } = await provisionDatabase(E2E.dbName);
  execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "prisma/seed.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      SEED_OFFLINE: "true",
      SEED_DEMO_DATA: "false",
      ADMIN_EMAIL: E2E.adminEmail,
      ADMIN_PASSWORD: E2E.adminPassword,
      ADMIN_NICKNAME: "AdminE2E",
    },
    stdio: "inherit",
  });
  return async () => {
    await stop();
  };
}
