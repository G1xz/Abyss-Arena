/**
 * Sincroniza o ciclo vigente e o próximo do Abismo (andar 12) com a wiki do Fandom.
 *   npm run abyss:sync
 */
import "dotenv/config";
import { syncAbyss } from "@/server/abyss/sync";
import { prisma } from "@/server/db";

const STATUS: Record<string, string> = {
  created: "criado",
  updated: "atualizado",
  adopted: "vinculado ao ciclo cadastrado à mão",
  missing: "ainda não publicado na wiki",
};

syncAbyss()
  .then((results) => {
    for (const r of results) console.log(`${r.key}: ${STATUS[r.status] ?? r.status}`);
  })
  .catch((err) => {
    console.error("Falha ao sincronizar o Abismo:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
