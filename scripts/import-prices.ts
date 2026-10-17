/**
 * Leva a tabela da Abyss Cup (prisma/data/abyss-cup-prices.json) ao rascunho de preços, escalada para o
 * orçamento atual (500 → 1000 = ×2), com o custo de cada constelação.
 *   npm run prices:import                # só o rascunho: revise em Admin → Preços e publique
 *   npm run prices:import -- --publish   # publica em seguida
 * Executa como o administrador de ADMIN_EMAIL (ou o primeiro admin cadastrado).
 */
import "dotenv/config";
import { prisma } from "@/server/db";
import { importPriceTableToDraft, loadAbyssCupTable } from "@/server/pricing/import";
import { publishDraft } from "@/server/pricing/service";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", ...(email ? { email } : {}) },
    select: { id: true, email: true, nickname: true, role: true },
  });
  if (!admin) throw new Error("Nenhum administrador encontrado (defina ADMIN_EMAIL e rode o seed).");

  const table = loadAbyssCupTable();
  const report = await importPriceTableToDraft(admin, table, { justification: `Tabela da Abyss Cup (orçamento ${table.sourceBudget} escalado)` });
  console.log(`${report.applied} preços no rascunho.`);
  if (report.bounds) console.log(`Limites do custo base ajustados para ${report.bounds.min}–${report.bounds.max}.`);
  if (report.missing.length) console.log(`Fora do catálogo (ignorados): ${report.missing.join(", ")}`);
  if (report.untouched.length) console.log(`Sem preço na tabela (mantêm o atual): ${report.untouched.join(", ")}`);

  if (process.argv.includes("--publish")) {
    const version = await publishDraft(admin, { label: "Tabela da Abyss Cup", notes: `Custos por constelação da ${table.source}, escalados para o orçamento atual.` });
    console.log(`Tabela v${version.number} publicada.`);
  } else {
    console.log("Revise em Admin → Preços e publique o rascunho.");
  }
}

main()
  .catch((err) => {
    console.error("Falha ao importar a tabela:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
