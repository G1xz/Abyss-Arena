import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // Testes de integração compartilham um banco real: execução serial.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: { RATE_LIMIT_DISABLED: "true", JOBS_ENABLED: "false", ABYSS_SYNC_ENABLED: "false" },
  },
});
