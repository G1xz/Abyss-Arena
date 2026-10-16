import { z } from "zod";
import { opponentOf } from "@/domain/draft";
import { decideWinner, type MatchDecision } from "@/domain/results";
import type { DisputeResolution, MatchResult, Seat } from "@/generated/prisma/client";
import { writeAuditLog } from "../audit";
import { assertAdmin } from "../auth/accounts";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit } from "../rate-limit";
import { notifyMatchChanged } from "../realtime/notify";
import { parseInput } from "../validation";
import { bumpMatch, loadLockedMatch, readConfig, recordEvent, requireSeat, requireStatus, RESULT_STATUSES } from "./common";

const evidenceUrlSchema = z
  .string()
  .trim()
  .url("URL de evidência inválida")
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "Use um link http(s)");

export const submitResultSchema = z.object({
  timeMs: z.number().int().positive("Informe um tempo válido"),
  evidenceUrls: z.array(evidenceUrlSchema).max(5, "No máximo 5 links").default([]),
});

/** Jogador registra o próprio tempo total. Pode corrigir enquanto o oponente não confirmou. */
export async function submitResult(user: SessionUser, matchId: string, input: unknown, db: Db = prisma) {
  const data = parseInput(submitResultSchema, input);
  enforceRateLimit("submitResult", user.id);
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, RESULT_STATUSES, "Resultados só podem ser enviados após o fim do draft");
    const config = readConfig(match);
    if (data.timeMs < config.minResultSeconds * 1000 || data.timeMs > config.maxResultSeconds * 1000) {
      throw new AppError(
        "VALIDATION",
        `O tempo deve ficar entre ${config.minResultSeconds}s e ${Math.round(config.maxResultSeconds / 60)} min.`,
      );
    }
    const existing = await tx.matchResult.findUnique({ where: { matchId_seat: { matchId, seat } } });
    if (existing?.status === "CONFIRMED") throw new AppError("INVALID_STATE", "Seu resultado já foi confirmado pelo oponente");
    if (existing?.status === "DISPUTED") throw new AppError("INVALID_STATE", "Seu resultado está em contestação");

    const result = await tx.matchResult.upsert({
      where: { matchId_seat: { matchId, seat } },
      create: { matchId, seat, userId: user.id, timeMs: data.timeMs },
      update: { timeMs: data.timeMs, status: "SUBMITTED", submittedAt: new Date() },
    });
    await tx.resultEvidence.deleteMany({ where: { resultId: result.id } });
    if (data.evidenceUrls.length) {
      await tx.resultEvidence.createMany({ data: data.evidenceUrls.map((url) => ({ resultId: result.id, url })) });
    }
    await bumpMatch(tx, matchId, { status: "AWAITING_RESULTS" });
    await recordEvent(tx, matchId, existing ? "RESULT_UPDATED" : "RESULT_SUBMITTED", user.id, { seat, timeMs: data.timeMs });
  });
  notifyMatchChanged(matchId);
}

async function finalizeMatch(tx: Tx, matchId: string, decision: MatchDecision | null, resolvedBy: "CONFIRMED" | "ADMIN") {
  const now = new Date();
  if (!decision) {
    await bumpMatch(tx, matchId, { status: "CANCELLED", cancelledAt: now, cancelReason: "Anulada pela administração", resolvedBy });
    await recordEvent(tx, matchId, "MATCH_VOIDED", null);
    return;
  }
  for (const seat of ["A", "B"] as Seat[]) {
    const outcome = decision.isDraw ? "DRAW" : decision.winnerSeat === seat ? "WIN" : "LOSS";
    await tx.matchPlayer.update({ where: { matchId_seat: { matchId, seat } }, data: { outcome } });
  }
  await bumpMatch(tx, matchId, {
    status: "COMPLETED",
    completedAt: now,
    winnerSeat: decision.winnerSeat,
    isDraw: decision.isDraw,
    resolvedBy,
  });
  await recordEvent(tx, matchId, "MATCH_COMPLETED", null, { winnerSeat: decision.winnerSeat, isDraw: decision.isDraw, resolvedBy });
}

function effectiveTime(result: MatchResult) {
  return { timeMs: result.finalTimeMs ?? result.timeMs, submittedAt: result.submittedAt };
}

/** Confirma o tempo do oponente. Com os dois resultados confirmados, a partida é concluída. */
export async function confirmOpponentResult(user: SessionUser, matchId: string, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, ["AWAITING_RESULTS"], "Não há resultados aguardando confirmação");
    const results = await tx.matchResult.findMany({ where: { matchId } });
    const mine = results.find((r) => r.seat === seat);
    const theirs = results.find((r) => r.seat === opponentOf(seat));
    if (!mine) throw new AppError("INVALID_STATE", "Envie o seu tempo antes de confirmar o do oponente");
    if (!theirs) throw new AppError("INVALID_STATE", "O oponente ainda não enviou o tempo");
    if (theirs.status !== "SUBMITTED") throw new AppError("INVALID_STATE", "Este resultado já foi confirmado ou contestado");

    await tx.matchResult.update({
      where: { id: theirs.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedByUserId: user.id },
    });
    await recordEvent(tx, matchId, "RESULT_CONFIRMED", user.id, { confirmedSeat: theirs.seat });

    if (mine.status === "CONFIRMED") {
      const a = results.find((r) => r.seat === "A")!;
      const b = results.find((r) => r.seat === "B")!;
      await finalizeMatch(tx, matchId, decideWinner(effectiveTime(a), effectiveTime(b), readConfig(match).tiePolicy), "CONFIRMED");
    } else {
      await bumpMatch(tx, matchId);
    }
  });
  notifyMatchChanged(matchId);
}

export const disputeSchema = z.object({
  reason: z.string().trim().min(10, "Explique o motivo da contestação (mín. 10 caracteres)").max(1000),
});

/** Contesta o tempo do oponente. A partida fica em DISPUTED até a resolução de um administrador. */
export async function disputeOpponentResult(user: SessionUser, matchId: string, input: unknown, db: Db = prisma) {
  const data = parseInput(disputeSchema, input);
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, ["AWAITING_RESULTS"], "Só é possível contestar resultados aguardando confirmação");
    const theirs = await tx.matchResult.findUnique({ where: { matchId_seat: { matchId, seat: opponentOf(seat) } } });
    if (!theirs) throw new AppError("INVALID_STATE", "O oponente ainda não enviou o tempo");
    if (theirs.status === "CONFIRMED") throw new AppError("INVALID_STATE", "Você já confirmou este resultado");
    await tx.matchResult.update({ where: { id: theirs.id }, data: { status: "DISPUTED" } });
    await tx.matchDispute.create({ data: { matchId, raisedByUserId: user.id, againstSeat: theirs.seat, reason: data.reason } });
    await bumpMatch(tx, matchId, { status: "DISPUTED" });
    await recordEvent(tx, matchId, "RESULT_DISPUTED", user.id, { againstSeat: theirs.seat });
  });
  notifyMatchChanged(matchId);
}

export const resolveDisputeSchema = z
  .object({
    resolution: z.enum(["ACCEPT_TIMES", "FORCE_WINNER", "DRAW", "VOID"]),
    timeAMs: z.number().int().positive().optional(),
    timeBMs: z.number().int().positive().optional(),
    winnerSeat: z.enum(["A", "B"]).optional(),
    note: z.string().trim().min(5, "Registre a justificativa da decisão").max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.resolution === "FORCE_WINNER" && !v.winnerSeat) ctx.addIssue({ code: "custom", message: "Informe o vencedor", path: ["winnerSeat"] });
  });

/** Resolução administrativa: aceita/ajusta tempos, define vencedor, declara empate ou anula a partida. */
export async function resolveDispute(admin: SessionUser, disputeId: string, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(resolveDisputeSchema, input);
  const dispute = await db.matchDispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new AppError("NOT_FOUND", "Contestação não encontrada");

  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, dispute.matchId);
    requireStatus(match, ["DISPUTED"], "Esta partida não está em disputa");
    const current = await tx.matchDispute.findUniqueOrThrow({ where: { id: disputeId } });
    if (current.status !== "OPEN") throw new AppError("INVALID_STATE", "Esta contestação já foi resolvida");
    const results = await tx.matchResult.findMany({ where: { matchId: match.id } });

    let decision: MatchDecision | null;
    switch (data.resolution as DisputeResolution) {
      case "ACCEPT_TIMES": {
        const a = results.find((r) => r.seat === "A");
        const b = results.find((r) => r.seat === "B");
        const timeA = data.timeAMs ?? a?.timeMs;
        const timeB = data.timeBMs ?? b?.timeMs;
        if (!a || !b || !timeA || !timeB) throw new AppError("VALIDATION", "Os dois tempos são necessários para esta resolução");
        await tx.matchResult.update({ where: { id: a.id }, data: { finalTimeMs: timeA, status: "CONFIRMED" } });
        await tx.matchResult.update({ where: { id: b.id }, data: { finalTimeMs: timeB, status: "CONFIRMED" } });
        decision = decideWinner(
          { timeMs: timeA, submittedAt: a.submittedAt },
          { timeMs: timeB, submittedAt: b.submittedAt },
          readConfig(match).tiePolicy,
        );
        break;
      }
      case "FORCE_WINNER":
        decision = { winnerSeat: data.winnerSeat!, isDraw: false };
        break;
      case "DRAW":
        decision = { winnerSeat: null, isDraw: true };
        break;
      case "VOID":
        decision = null;
        break;
    }

    await tx.matchDispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolution: data.resolution, resolutionNote: data.note, resolvedByUserId: admin.id, resolvedAt: new Date() },
    });
    // Outras contestações abertas da mesma partida são encerradas pela mesma decisão.
    await tx.matchDispute.updateMany({
      where: { matchId: match.id, status: "OPEN", NOT: { id: disputeId } },
      data: { status: "RESOLVED", resolution: data.resolution, resolutionNote: data.note, resolvedByUserId: admin.id, resolvedAt: new Date() },
    });
    await finalizeMatch(tx, match.id, decision, "ADMIN");
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: "DISPUTE_RESOLVED",
      entityType: "Match",
      entityId: match.id,
      reason: data.note,
      after: { disputeId, ...data },
    });
  });
  notifyMatchChanged(dispute.matchId);
}
