/**
 * Sincroniza o catálogo de personagens com a fonte externa.
 *   npm run catalog:sync
 * Fontes em ordem de preferência via CATALOG_PROVIDERS (padrão: "yatta,jmp").
 * Falhas de todas as fontes não alteram o banco.
 */
import "dotenv/config";
import { writeAuditLog } from "@/server/audit";
import { syncCatalog } from "@/server/catalog/sync";
import { CatalogUnavailableError } from "@/server/catalog/provider";
import { prisma } from "@/server/db";

async function main() {
  try {
    const report = await syncCatalog();
    await writeAuditLog(prisma, {
      adminId: null,
      action: "CATALOG_SYNC_CLI",
      entityType: "Character",
      after: { ...report, createdSlugs: report.createdSlugs.slice(0, 50) },
    });
    console.log(`Fonte: ${report.source}`);
    console.log(`Recebidos: ${report.fetched} | novos: ${report.created} | atualizados: ${report.updated} | sem mudança: ${report.unchanged}`);
    console.log(`Marcados como ausentes: ${report.markedMissing} | descartados na normalização: ${report.skipped}`);
    if (report.partialResponse) console.log("Atenção: resposta parcial — nenhum personagem foi marcado como ausente.");
    if (report.attempts.length) console.log("Falhas antes do sucesso:", report.attempts);
    if (report.created) console.log("Novos personagens entram DESABILITADOS até receberem preço e liberação:", report.createdSlugs.join(", "));
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      console.error(err.message, err.attempts);
      process.exitCode = 2;
      return;
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
