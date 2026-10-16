import { runBalanceAnalysis } from "../balance/service";
import { syncCatalog } from "../catalog/sync";
import { prisma } from "../db";
import { publishDueScheduledVersions } from "../pricing/service";
import { getSettings } from "../settings";
import { writeAuditLog } from "../audit";
import { abyssSyncPeriod, syncAbyss } from "../abyss/sync";

const TICK_MS = 10 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 60 * 1000;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Executa um job no máximo uma vez por período (garantido pela chave única job+periodKey).
 * Falhas ficam registradas e são re-tentadas após 1h.
 */
export async function runJobOnce(job: string, periodKey: string, fn: () => Promise<unknown>) {
  const existing = await prisma.jobRun.findUnique({ where: { job_periodKey: { job, periodKey } } });
  if (existing) {
    const retryable = existing.status === "FAILED" && Date.now() - (existing.finishedAt?.getTime() ?? 0) > RETRY_AFTER_MS;
    if (!retryable) return { skipped: true as const };
    const claimed = await prisma.jobRun.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: { status: "RUNNING", startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) return { skipped: true as const };
  } else {
    try {
      await prisma.jobRun.create({ data: { job, periodKey, status: "RUNNING" } });
    } catch {
      return { skipped: true as const }; // outra instância assumiu
    }
  }
  try {
    const details = await fn();
    await prisma.jobRun.update({
      where: { job_periodKey: { job, periodKey } },
      data: { status: "DONE", finishedAt: new Date(), details: JSON.parse(JSON.stringify(details ?? null)) },
    });
    return { skipped: false as const, details };
  } catch (err) {
    console.error(`[jobs] ${job} falhou`, err);
    await prisma.jobRun.update({
      where: { job_periodKey: { job, periodKey } },
      data: { status: "FAILED", finishedAt: new Date(), error: (err as Error).message.slice(0, 500) },
    });
    return { skipped: false as const, error: err as Error };
  }
}

export async function runScheduledJobs(now = new Date()) {
  await publishDueScheduledVersions(prisma, now).then(async (published) => {
    if (published) console.log(`[jobs] tabela v${published.number} publicada (agendada)`);
  });

  const today = dayKey(now);
  const hasActiveTable = await prisma.priceVersion.count({ where: { status: "ACTIVE" } });
  if (hasActiveTable) {
    await runJobOnce("balance:daily-metrics", today, () => runBalanceAnalysis({ kind: "DAILY", generateProposals: false, now }));
    const settings = await getSettings("balance");
    if (now.getUTCDay() === settings.proposalWeekday) {
      await runJobOnce("balance:weekly-proposals", today, () => runBalanceAnalysis({ kind: "WEEKLY", generateProposals: true, now }));
    }
  }

  // Ciclos do Abismo (andar 12) vindos da wiki: o ciclo novo entra sozinho na virada.
  if (process.env.ABYSS_SYNC_ENABLED !== "false") {
    await runJobOnce("abyss:sync", await abyssSyncPeriod(now), () => syncAbyss({ now }));
  }

  if (process.env.CATALOG_SYNC_ENABLED !== "false") {
    await runJobOnce("catalog:sync", today, async () => {
      const report = await syncCatalog();
      await writeAuditLog(prisma, {
        adminId: null,
        action: "CATALOG_SYNC_SCHEDULED",
        entityType: "Character",
        after: { ...report, createdSlugs: report.createdSlugs.slice(0, 50) },
      });
      return report;
    });
  }
}

export function startJobScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledJobs();
    } catch (err) {
      console.error("[jobs] erro no ciclo do agendador", err);
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(tick, 15_000);
  const interval = setInterval(tick, TICK_MS);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
