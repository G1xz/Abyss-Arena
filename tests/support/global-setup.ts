import type { TestProject } from "vitest/node";
import { provisionDatabase } from "./test-db";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const { url, stop } = await provisionDatabase(process.env.TEST_DB_NAME ?? "abyss_arena_test");
  project.provide("databaseUrl", url);
  return async () => {
    await stop();
  };
}
