import { z } from "zod";
import {
  aggregateMetrics,
  computeProposal,
  cycleMaturity,
  type Baselines,
  type CharacterMetrics,
  type MatchSample,
} from "@/domain/balance";
import type { BalanceRunKind, MetricScope, Prisma } from "@/generated/prisma/client";
import { getCurrentCycle } from "../abyss/service";
import { writeAuditLog } from "../audit";
import { assertAdmin } from "../auth/accounts";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { requireActivePriceVersion, setDraftPriceTx } from "../pricing/service";
import { getSettings } from "../settings";
import { idSchema, parseInput } from "../validation";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Partidas validadas (COMPLETED) convertidas em amostras para o motor. */
export async function loadMatchSamples(where: Prisma.MatchWhereInput, db: Tx = prisma): Promise<MatchSample[]> {
  const matches = await db.match.findMany({
    where: { ...where, status: "COMPLETED" },
    select: {
      id: true,
      completedAt: true,
      abyssCycleId: true,
      winnerSeat: true,
      isDraw: true,
      snapshots: { select: { seat: true, entries: { select: { characterId: true } } } },
      actions: { select: { type: true, targetSeat: true, characterId: true } },
    },
  });
  return matches.map((m) => {
    const seats = {
      A: { deck: [] as string[], bannedFrom: [] as string[], picks: [] as string[] },
      B: { deck: [] as string[], bannedFrom: [] as string[], picks: [] as string[] },
    };
    for (const s of m.snapshots) seats[s.seat].deck = s.entries.map((e) => e.characterId);
    // Imunidades e turnos passados não contam como pick nem ban.
    for (const a of m.actions) {
      if (!a.characterId || (a.type !== "BAN" && a.type !== "PICK")) continue;
      (a.type === "BAN" ? seats[a.targetSeat].bannedFrom : seats[a.targetSeat].picks).push(a.characterId);
    }
    return { matchId: m.id, completedAt: m.completedAt!, cycleId: m.abyssCycleId, seats, winnerSeat: m.winnerSeat, isDraw: m.isDraw };
  });
}

export interface RunOptions {
  kind: BalanceRunKind;
  generateProposals: boolean;
  actor?: SessionUser | null;
  now?: Date;
  db?: Db;
}

/**
 * Calcula métricas (ciclo atual, histórico e geral) e, opcionalmente, gera propostas.
 * Nunca altera preços: propostas aguardam aprovação administrativa.
 */
export async function runBalanceAnalysis(options: RunOptions) {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  if (options.actor) assertAdmin(options.actor);

  const settings = await getSettings("balance", db);
  const competitive = await getSettings("competitive", db);
  const version = await requireActivePriceVersion(db);
  const cycle = await getCurrentCycle(db, now);
  const windowStart = new Date(now.getTime() - settings.historyDays * DAY_MS);

  const samples = await loadMatchSamples(
    { OR: [{ completedAt: { gte: windowStart, lte: now } }, ...(cycle ? [{ abyssCycleId: cycle.id, completedAt: { lte: now } }] : [])] },
    db,
  );
  const currentSamples = cycle ? samples.filter((s) => s.cycleId === cycle.id) : [];
  const historySamples = samples.filter((s) => !cycle || s.cycleId !== cycle.id);

  const current = aggregateMetrics(currentSamples, settings.priorGames);
  const history = aggregateMetrics(historySamples, settings.priorGames);
  const overall = aggregateMetrics(samples, settings.priorGames);
  const maturity = cycle ? cycleMaturity(currentSamples.length, settings.cycleMaturityMatches) : 0;

  const prices = await db.characterPrice.findMany({
    where: { priceVersionId: version.id },
    include: { character: { select: { id: true, name: true, competitiveEnabled: true, balanceLocked: true } } },
  });

  return db.$transaction(
    async (tx) => {
      const run = await tx.balanceRun.create({
        data: {
          kind: options.kind,
          generateProposals: options.generateProposals,
          triggeredById: options.actor?.id ?? null,
          abyssCycleId: cycle?.id ?? null,
          priceVersionId: version.id,
          windowStart,
          windowEnd: now,
          params: settings as unknown as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      const metricRows: Prisma.BalanceMetricCreateManyInput[] = [];
      const pushRows = (scope: MetricScope, map: Map<string, CharacterMetrics>) => {
        for (const price of prices) {
          const m = map.get(price.characterId);
          if (!m) continue;
          metricRows.push({ runId: run.id, characterId: price.characterId, scope, createdAt: now, ...m });
        }
      };
      pushRows("CURRENT_CYCLE", current.metrics);
      pushRows("HISTORICAL", history.metrics);
      pushRows("OVERALL", overall.metrics);
      if (metricRows.length) await tx.balanceMetric.createMany({ data: metricRows });

      let proposalsCreated = 0;
      let superseded = 0;
      if (options.generateProposals) {
        const old = await tx.balanceProposal.updateMany({
          where: { status: "PENDING" },
          data: { status: "SUPERSEDED", reviewNote: "Substituída por uma análise mais recente" },
        });
        superseded = old.count;
        for (const price of prices) {
          if (!price.character.competitiveEnabled || price.character.balanceLocked) continue;
          const result = computeProposal({
            currentCost: price.cost,
            current: current.metrics.get(price.characterId),
            history: history.metrics.get(price.characterId),
            baseCurrent: current.baselines,
            baseHistory: history.baselines,
            maturity,
            params: settings,
            minCost: competitive.minCharacterCost,
            maxCost: competitive.maxCharacterCost,
          });
          if (result.delta === 0) continue;
          await tx.balanceProposal.create({
            data: {
              runId: run.id,
              characterId: price.characterId,
              basePriceVersionId: version.id,
              currentCost: price.cost,
              suggestedCost: result.suggestedCost,
              score: result.score,
              confidence: result.confidence,
              signals: { signals: result.signals, current: result.current, history: result.history, lambda: result.lambda } as unknown as Prisma.InputJsonValue,
              explanation: result.explanation,
              createdAt: now,
            },
          });
          proposalsCreated++;
        }
      }

      const summary = {
        validMatches: samples.length,
        currentCycleMatches: currentSamples.length,
        historyMatches: historySamples.length,
        maturity,
        baselines: { current: current.baselines, history: history.baselines, overall: overall.baselines },
        proposalsCreated,
        superseded,
      };
      await tx.balanceRun.update({ where: { id: run.id }, data: { summary: summary as unknown as Prisma.InputJsonValue } });
      if (options.actor) {
        await writeAuditLog(tx, {
          adminId: options.actor.id,
          action: options.kind === "EXTRAORDINARY" ? "BALANCE_EXTRAORDINARY_REVIEW" : "BALANCE_ANALYSIS_RUN",
          entityType: "BalanceRun",
          entityId: run.id,
          after: summary,
        });
      }
      return { runId: run.id, ...summary };
    },
    { timeout: 60_000 },
  );
}

export const reviewProposalSchema = z.object({
  cost: z.coerce.number().int().optional(),
  note: z.string().trim().min(3, "Registre a justificativa").max(500),
});

async function pendingProposal(tx: Tx, proposalId: string) {
  const proposal = await tx.balanceProposal.findUnique({ where: { id: proposalId }, include: { character: { select: { name: true } } } });
  if (!proposal) throw new AppError("NOT_FOUND", "Proposta não encontrada");
  if (proposal.status !== "PENDING") throw new AppError("INVALID_STATE", `A proposta de ${proposal.character.name} já foi revisada`);
  return proposal;
}

async function approveProposalTx(tx: Tx, admin: SessionUser, proposalId: string, data: { cost?: number; note: string }) {
  const proposal = await pendingProposal(tx, proposalId);
  const active = await tx.priceVersion.findFirst({ where: { status: "ACTIVE" } });
  if (!active || active.id !== proposal.basePriceVersionId) {
    throw new AppError("INVALID_STATE", `A tabela vigente mudou desde a análise (${proposal.character.name}). Gere uma nova análise.`);
  }
  const cost = data.cost ?? proposal.suggestedCost;
  await setDraftPriceTx(tx, admin, { characterId: proposal.characterId, cost, justification: data.note }, "SUGGESTED", proposal.id);
  return tx.balanceProposal.update({
    where: { id: proposalId },
    data: { status: "APPROVED", approvedCost: cost, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: data.note },
  });
}

async function rejectProposalTx(tx: Tx, admin: SessionUser, proposalId: string, note: string) {
  const proposal = await pendingProposal(tx, proposalId);
  const updated = await tx.balanceProposal.update({
    where: { id: proposalId },
    data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note },
  });
  await writeAuditLog(tx, {
    adminId: admin.id,
    action: "PRICE_SUGGESTION_REJECTED",
    entityType: "Character",
    entityId: proposal.characterId,
    reason: note,
    after: { proposalId, suggestedCost: proposal.suggestedCost },
  });
  return updated;
}

/** Aprova uma proposta: o preço vai para o RASCUNHO da próxima tabela (publicação é outra etapa). */
export async function approveProposal(admin: SessionUser, proposalId: string, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(reviewProposalSchema, input);
  return db.$transaction((tx) => approveProposalTx(tx, admin, proposalId, data));
}

export async function rejectProposal(admin: SessionUser, proposalId: string, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(reviewProposalSchema.pick({ note: true }), input);
  return db.$transaction((tx) => rejectProposalTx(tx, admin, proposalId, data.note));
}

export const batchReviewSchema = z
  .object({
    note: z.string().trim().min(3, "Registre a justificativa").max(500),
    approve: z.array(z.object({ proposalId: idSchema, cost: z.coerce.number().int().optional() })).max(500).default([]),
    reject: z.array(idSchema).max(500).default([]),
  })
  .refine((v) => v.approve.length + v.reject.length > 0, { message: "Selecione ao menos uma proposta" })
  .refine((v) => !v.approve.some((a) => v.reject.includes(a.proposalId)), { message: "Uma proposta não pode ser aprovada e rejeitada ao mesmo tempo" });

/**
 * Revisão em lote: aprova (com o valor sugerido ou editado) e/ou rejeita várias propostas de uma vez,
 * com a mesma justificativa. Tudo numa transação: se uma falhar, nada muda.
 */
export async function reviewProposals(admin: SessionUser, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(batchReviewSchema, input);
  return db.$transaction(
    async (tx) => {
      for (const item of data.approve) await approveProposalTx(tx, admin, item.proposalId, { cost: item.cost, note: data.note });
      for (const id of data.reject) await rejectProposalTx(tx, admin, id, data.note);
      return { approved: data.approve.length, rejected: data.reject.length };
    },
    { timeout: 60_000 },
  );
}

/** Última métrica OVERALL de cada personagem (painéis). */
export async function getLatestMetrics(db: Tx = prisma) {
  const run = await db.balanceRun.findFirst({ orderBy: { createdAt: "desc" } });
  if (!run) return { run: null, metrics: new Map<string, CharacterMetrics & { scope: MetricScope }>() };
  const rows = await db.balanceMetric.findMany({ where: { runId: run.id } });
  const metrics = new Map<string, CharacterMetrics & { scope: MetricScope }>();
  for (const r of rows) if (r.scope === "OVERALL") metrics.set(r.characterId, r);
  return { run, metrics, rows };
}

export type { Baselines };
