import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;
/** Cliente dentro de uma transação interativa. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL não configurada");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Um único cliente por processo (o servidor customizado e o bundle do Next compartilham via globalThis).
const globalForPrisma = globalThis as unknown as { __abyssPrisma?: PrismaClient };

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    globalForPrisma.__abyssPrisma ??= createPrismaClient();
    return Reflect.get(globalForPrisma.__abyssPrisma, prop, receiver);
  },
});

/** Encerra e descarta o cliente global (o próximo uso cria um novo). Usado por testes e scripts. */
export async function resetPrismaClient() {
  const client = globalForPrisma.__abyssPrisma;
  globalForPrisma.__abyssPrisma = undefined;
  await client?.$disconnect();
}
