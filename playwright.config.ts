import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra o build de produção (mesmo artefato do deploy), servidor Next + Socket.IO real
 * e PostgreSQL real (embutido em .local/test-pgdata, ou TEST_DATABASE_URL).
 *   npm run build && npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB_NAME = "abyss_arena_e2e";

function e2eDatabaseUrl() {
  const base = process.env.TEST_DATABASE_URL ?? `postgresql://postgres:postgres@localhost:${process.env.TEST_DB_PORT ?? 54329}/postgres`;
  const u = new URL(base);
  u.pathname = `/${DB_NAME}`;
  return u.toString();
}

export const E2E = {
  port: PORT,
  dbName: DB_NAME,
  databaseUrl: e2eDatabaseUrl(),
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@abyss.local",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node dist/server.js",
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: E2E.databaseUrl,
      APP_URL: `http://localhost:${PORT}`,
      SESSION_COOKIE_SECURE: "false",
      JOBS_ENABLED: "false",
      CATALOG_SYNC_ENABLED: "false",
      ABYSS_SYNC_ENABLED: "false",
    },
  },
});
