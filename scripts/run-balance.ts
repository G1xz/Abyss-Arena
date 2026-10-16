/**
 * Executa a análise de balanceamento manualmente.
 *   npm run balance:run                -> só métricas
 *   npm run balance:run -- --proposals -> métricas + propostas (aguardam aprovação no painel)
 * Nunca altera preços.
 */
import "dotenv/config";
import { runBalanceAnalysis } from "@/server/balance/service";
import { prisma } from "@/server/db";

async function main() {
  const proposals = process.argv.includes("--proposals");
  const result = await runBalanceAnalysis({ kind: "MANUAL", generateProposals: proposals });
  console.log(`Run ${result.runId}: ${result.validMatches} partidas válidas (${result.currentCycleMatches} no ciclo atual).`);
  console.log(`Maturidade do ciclo: ${(result.maturity * 100).toFixed(0)}% | propostas criadas: ${result.proposalsCreated}`);
  if (proposals) {
    const pending = await prisma.balanceProposal.findMany({
      where: { runId: result.runId },
      include: { character: { select: { name: true } } },
      orderBy: { score: "desc" },
    });
    for (const p of pending) {
      console.log(`  ${p.character.name.padEnd(24)} ${p.currentCost} -> ${p.suggestedCost}  score ${p.score.toFixed(2)}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
