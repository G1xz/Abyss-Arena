import { afterAll, inject } from "vitest";
import { resetPrismaClient } from "@/server/db";

// O cliente Prisma é criado sob demanda e lê DATABASE_URL no primeiro uso.
process.env.DATABASE_URL = inject("databaseUrl");

afterAll(async () => {
  await resetPrismaClient();
});
