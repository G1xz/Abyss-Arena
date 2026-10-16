import type { MatchStatus, Prisma, Seat } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { AppError } from "../errors";
import type { MatchConfig } from "../settings";

export const OPEN_STATUSES: MatchStatus[] = ["WAITING", "READY"];
export const DRAFT_STATUSES: MatchStatus[] = ["BANNING", "PICKING"];
export const RESULT_STATUSES: MatchStatus[] = ["LOCKED", "AWAITING_RESULTS"];
export const ACTIVE_STATUSES: MatchStatus[] = ["WAITING", "READY", "BANNING", "PICKING", "LOCKED", "AWAITING_RESULTS", "DISPUTED"];

/** Bloqueia a linha da partida até o fim da transação: serializa ações concorrentes. */
export async function lockMatch(tx: Tx, matchId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError("NOT_FOUND", "Partida não encontrada");
}

export async function loadLockedMatch(tx: Tx, matchId: string) {
  await lockMatch(tx, matchId);
  return tx.match.findUniqueOrThrow({ where: { id: matchId }, include: { players: true } });
}

export function requireSeat(match: { players: { userId: string; seat: Seat }[] }, userId: string): Seat {
  const player = match.players.find((p) => p.userId === userId);
  if (!player) throw new AppError("FORBIDDEN", "Você não participa desta partida");
  return player.seat;
}

export function requireStatus(match: { status: MatchStatus }, allowed: MatchStatus[], message: string) {
  if (!allowed.includes(match.status)) throw new AppError("INVALID_STATE", message);
}

export function readConfig(match: { config: Prisma.JsonValue }): MatchConfig {
  return match.config as unknown as MatchConfig;
}

export async function recordEvent(tx: Tx, matchId: string, type: string, actorUserId: string | null, payload?: Record<string, unknown>) {
  await tx.matchEvent.create({
    data: { matchId, type, actorUserId, payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

export async function bumpMatch(tx: Tx, matchId: string, data: Prisma.MatchUpdateInput = {}) {
  return tx.match.update({ where: { id: matchId }, data: { ...data, revision: { increment: 1 } } });
}
