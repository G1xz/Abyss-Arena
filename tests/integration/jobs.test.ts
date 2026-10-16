import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runJobOnce, runScheduledJobs } from "@/server/jobs/scheduler";
import { publishDraft, setDraftPrice } from "@/server/pricing/service";
import { DEFAULT_BALANCE_SETTINGS, saveSettings } from "@/server/settings";
import { playCompletedMatch, resetDb, seedWorld } from "../support/factories";

describe("agendador de jobs", () => {
  let world: Awaited<ReturnType<typeof seedWorld>>;
  beforeEach(async () => {
    await resetDb();
    world = await seedWorld();
    process.env.CATALOG_SYNC_ENABLED = "false"; // sem rede nos testes
  });

  it("executa cada job no máximo uma vez por período", async () => {
    let calls = 0;
    await runJobOnce("teste", "2026-10-16", async () => ++calls);
    await runJobOnce("teste", "2026-10-16", async () => ++calls);
    await runJobOnce("teste", "2026-10-17", async () => ++calls);
    expect(calls).toBe(2);
  });

  it("registra falhas sem quebrar o agendador", async () => {
    const result = await runJobOnce("falha", "p1", async () => {
      throw new Error("boom");
    });
    expect(result).toMatchObject({ skipped: false });
    expect((await prisma.jobRun.findFirstOrThrow({ where: { job: "falha" } })).status).toBe("FAILED");
  });

  it("calcula métricas diárias, gera propostas no dia configurado e publica tabelas agendadas", async () => {
    await playCompletedMatch(world);
    const now = new Date();
    await saveSettings("balance", { ...DEFAULT_BALANCE_SETTINGS, proposalWeekday: now.getUTCDay(), minSampleGames: 1, minSampleOpportunities: 1, priorGames: 0, cycleMaturityMatches: 1, actionThreshold: 0.1 }, null);
    await setDraftPrice(world.admin, { characterId: world.fourStars[0]!.id, cost: 11, justification: "agendado" });
    await publishDraft(world.admin, { scheduledFor: new Date(now.getTime() + 60_000).toISOString() });

    await runScheduledJobs(new Date(now.getTime() + 120_000));
    await runScheduledJobs(new Date(now.getTime() + 180_000)); // segunda passada no mesmo dia não repete

    expect(await prisma.priceVersion.findFirst({ where: { status: "ACTIVE" }, select: { number: true } })).toEqual({ number: 2 });
    const runs = await prisma.balanceRun.findMany();
    expect(runs.filter((r) => r.kind === "DAILY")).toHaveLength(1);
    expect(runs.filter((r) => r.kind === "WEEKLY")).toHaveLength(1);
    expect(await prisma.balanceMetric.count()).toBeGreaterThan(0);
    expect(await prisma.balanceProposal.count()).toBeGreaterThan(0);
  });
});
