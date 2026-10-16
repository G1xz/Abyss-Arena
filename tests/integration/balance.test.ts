import { beforeEach, describe, expect, it } from "vitest";
import { approveProposal, rejectProposal, runBalanceAnalysis } from "@/server/balance/service";
import { prisma } from "@/server/db";
import { getActivePriceVersion, publishDraft, setCharacterBalanceLock } from "@/server/pricing/service";
import { saveSettings, DEFAULT_BALANCE_SETTINGS } from "@/server/settings";
import { getCharacterStats } from "@/server/stats/service";
import { playCompletedMatch, resetDb, seedWorld, startedMatch, completeDraft } from "../support/factories";

let world: Awaited<ReturnType<typeof seedWorld>>;

/** Parâmetros sensíveis para amostras pequenas (apenas em teste). */
async function sensitiveSettings() {
  await saveSettings(
    "balance",
    { ...DEFAULT_BALANCE_SETTINGS, minSampleGames: 1, minSampleOpportunities: 1, priorGames: 0, cycleMaturityMatches: 1, actionThreshold: 0.1 },
    world.admin.id,
  );
}

beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
});

describe("métricas e propostas", () => {
  it("calcula métricas apenas de partidas validadas", async () => {
    await playCompletedMatch(world);
    const pending = await startedMatch(world);
    await completeDraft(pending.matchId, pending.a, pending.b); // draft completo, sem resultado

    const run = await runBalanceAnalysis({ kind: "MANUAL", generateProposals: false });
    expect(run.validMatches).toBe(1);
    const metrics = await prisma.balanceMetric.findMany({ where: { runId: run.runId, scope: "OVERALL" } });
    const totalPicks = metrics.reduce((s, m) => s + m.picks, 0);
    const totalBans = metrics.reduce((s, m) => s + m.bans, 0);
    expect(totalPicks).toBe(8);
    expect(totalBans).toBe(4);
    expect(metrics.reduce((s, m) => s + m.wins, 0)).toBe(4);

    const stats = await getCharacterStats();
    expect(stats.totalMatches).toBe(1);
  });

  it("propostas nunca alteram preços em produção sem aprovação e publicação", async () => {
    await sensitiveSettings();
    await playCompletedMatch(world);
    const before = await prisma.characterPrice.findMany({ where: { priceVersion: { status: "ACTIVE" } }, orderBy: { characterId: "asc" } });

    const run = await runBalanceAnalysis({ kind: "MANUAL", generateProposals: true, actor: world.admin });
    expect(run.proposalsCreated).toBeGreaterThan(0);
    const after = await prisma.characterPrice.findMany({ where: { priceVersion: { status: "ACTIVE" } }, orderBy: { characterId: "asc" } });
    expect(after).toEqual(before);
    expect(await prisma.priceVersion.count({ where: { status: "DRAFT" } })).toBe(0);

    // Aprovar envia ao rascunho, mas a tabela vigente segue igual.
    const [up] = await prisma.balanceProposal.findMany({ where: { status: "PENDING" }, orderBy: { score: "desc" } });
    await approveProposal(world.admin, up!.id, { note: "Venceu a partida de teste" });
    expect((await getActivePriceVersion())!.number).toBe(1);
    const draftPrice = await prisma.characterPrice.findFirstOrThrow({ where: { priceVersion: { status: "DRAFT" }, characterId: up!.characterId } });
    expect(draftPrice.cost).toBe(up!.suggestedCost);

    const published = await publishDraft(world.admin, {});
    expect(published.number).toBe(2);
    const change = await prisma.priceChange.findFirstOrThrow({ where: { priceVersionId: published.id, characterId: up!.characterId } });
    expect(change).toMatchObject({ source: "SUGGESTED", proposalId: up!.id, previousCost: up!.currentCost, newCost: up!.suggestedCost });
  });

  it("aprovação com preço editado, rejeição e proposta desatualizada", async () => {
    await sensitiveSettings();
    await playCompletedMatch(world);
    await runBalanceAnalysis({ kind: "MANUAL", generateProposals: true });
    const [p1, p2, p3] = await prisma.balanceProposal.findMany({ where: { status: "PENDING" } });

    await approveProposal(world.admin, p1!.id, { cost: 25, note: "Ajuste editado" });
    expect((await prisma.balanceProposal.findUniqueOrThrow({ where: { id: p1!.id } })).approvedCost).toBe(25);
    await rejectProposal(world.admin, p2!.id, { note: "Amostra insuficiente" });
    expect((await prisma.balanceProposal.findUniqueOrThrow({ where: { id: p2!.id } })).status).toBe("REJECTED");
    await expect(approveProposal(world.admin, p2!.id, { note: "de novo" })).rejects.toMatchObject({ code: "INVALID_STATE" });

    await publishDraft(world.admin, {});
    await expect(approveProposal(world.admin, p3!.id, { note: "tarde demais" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("personagens bloqueados não recebem sugestões automáticas", async () => {
    await sensitiveSettings();
    const m = await playCompletedMatch(world);
    const picks = await prisma.draftAction.findMany({ where: { matchId: m.matchId, type: "PICK" } });
    for (const p of picks) await setCharacterBalanceLock(world.admin, p.characterId, true, "Em observação");
    const run = await runBalanceAnalysis({ kind: "MANUAL", generateProposals: true });
    const lockedIds = new Set(picks.map((p) => p.characterId));
    const proposals = await prisma.balanceProposal.findMany({ where: { runId: run.runId } });
    expect(proposals.some((p) => lockedIds.has(p.characterId))).toBe(false);
  });

  it("nova análise substitui propostas pendentes anteriores", async () => {
    await sensitiveSettings();
    await playCompletedMatch(world);
    await runBalanceAnalysis({ kind: "MANUAL", generateProposals: true });
    const first = await prisma.balanceProposal.count({ where: { status: "PENDING" } });
    await runBalanceAnalysis({ kind: "EXTRAORDINARY", generateProposals: true, actor: world.admin });
    expect(await prisma.balanceProposal.count({ where: { status: "SUPERSEDED" } })).toBe(first);
    expect(await prisma.adminAuditLog.count({ where: { action: "BALANCE_EXTRAORDINARY_REVIEW" } })).toBe(1);
  });
});
