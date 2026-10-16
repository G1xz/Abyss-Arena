import { randomInt } from "node:crypto";
import { z } from "zod";
import { evaluateDeck } from "@/domain/deck";
import { validateDraftAction, type DraftActionRecord, type DraftDecks } from "@/domain/draft";
import { Prisma, type Seat } from "@/generated/prisma/client";
import { getCurrentCycle, toRulesSnapshot } from "../abyss/service";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { getActivePriceVersion, getCompetitivePriceMap, requireActivePriceVersion } from "../pricing/service";
import { enforceRateLimit } from "../rate-limit";
import { notifyMatchChanged } from "../realtime/notify";
import { getSettings, toMatchConfig, type MatchConfig } from "../settings";
import { idSchema, parseInput } from "../validation";
import {
  ACTIVE_STATUSES,
  bumpMatch,
  DRAFT_STATUSES,
  loadLockedMatch,
  OPEN_STATUSES,
  readConfig,
  recordEvent,
  requireSeat,
  requireStatus,
} from "./common";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_ACTIVE_MATCHES_PER_USER = 3;

export function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,10}$/, "Código de sala inválido");

/** Valida um deck do usuário para uma partida, usando a tabela vigente e a configuração congelada. */
async function evaluateSeatDeck(tx: Tx, userId: string, deckId: string, config: MatchConfig, priceVersionId?: string) {
  const deck = await tx.deck.findFirst({ where: { id: deckId, userId }, include: { characters: true } });
  if (!deck) throw new AppError("NOT_FOUND", "Deck não encontrado");
  const versionId = priceVersionId ?? (await requireActivePriceVersion(tx)).id;
  const prices = await getCompetitivePriceMap(versionId, tx);
  const evaluation = evaluateDeck(
    deck.characters.map((c) => c.characterId),
    prices,
    { budget: config.deckBudget, minSize: config.minDeckSize },
  );
  return { deck, prices, evaluation };
}

async function assertSeatDeckValid(tx: Tx, userId: string, deckId: string, config: MatchConfig) {
  const result = await evaluateSeatDeck(tx, userId, deckId, config);
  if (!result.evaluation.valid) {
    throw new AppError("DECK_INVALID", `Deck inválido para esta partida: ${result.evaluation.issues[0]!.message}`);
  }
  return result;
}

async function countActiveMatches(db: Tx, userId: string) {
  return db.matchPlayer.count({ where: { userId, match: { status: { in: ACTIVE_STATUSES } } } });
}

export const createRoomSchema = z.object({ deckId: idSchema.optional().or(z.literal("").transform(() => undefined)) });

export async function createRoom(user: SessionUser, input: unknown, db: Db = prisma) {
  const data = parseInput(createRoomSchema, input);
  enforceRateLimit("createRoom", user.id);
  if ((await countActiveMatches(db, user.id)) >= MAX_ACTIVE_MATCHES_PER_USER) {
    throw new AppError("CONFLICT", `Você já tem ${MAX_ACTIVE_MATCHES_PER_USER} partidas em andamento. Conclua ou cancele uma delas.`);
  }
  const version = await requireActivePriceVersion(db);
  const config = toMatchConfig(await getSettings("competitive", db));
  const cycle = await getCurrentCycle(db);
  if (!cycle) throw new AppError("UNAVAILABLE", "Nenhum ciclo do Abismo ativo. Um administrador precisa configurar o ciclo atual.");
  const rules = toRulesSnapshot(cycle);
  if (rules.challenges.length === 0) throw new AppError("UNAVAILABLE", "O ciclo atual não possui salas válidas configuradas.");

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const match = await db.$transaction(async (tx) => {
        let deckId: string | null = null;
        if (data.deckId) {
          await assertSeatDeckValid(tx, user.id, data.deckId, config);
          deckId = data.deckId;
        }
        const created = await tx.match.create({
          data: {
            code: generateRoomCode(),
            hostId: user.id,
            priceVersionId: version.id,
            abyssCycleId: cycle.id,
            config: config as unknown as Prisma.InputJsonValue,
            rules: rules as unknown as Prisma.InputJsonValue,
            players: { create: { userId: user.id, seat: "A", deckId } },
          },
        });
        await recordEvent(tx, created.id, "ROOM_CREATED", user.id, { code: created.code });
        return created;
      });
      return match;
    } catch (err) {
      const codeClash =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("code");
      if (!codeClash) throw err;
    }
  }
  throw new AppError("INTERNAL", "Não foi possível gerar um código de sala. Tente novamente.");
}

export async function joinRoom(user: SessionUser, codeInput: unknown, db: Db = prisma) {
  const code = parseInput(roomCodeSchema, codeInput);
  const found = await db.match.findUnique({ where: { code }, select: { id: true } });
  if (!found) throw new AppError("NOT_FOUND", "Sala não encontrada");

  const match = await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, found.id);
    if (match.players.some((p) => p.userId === user.id)) return match; // reentrada idempotente
    requireStatus(match, ["WAITING"], "Esta sala não está aceitando jogadores");
    if (match.players.length >= 2) throw new AppError("CONFLICT", "A sala já está cheia");
    if ((await countActiveMatches(tx, user.id)) >= MAX_ACTIVE_MATCHES_PER_USER) {
      throw new AppError("CONFLICT", `Você já tem ${MAX_ACTIVE_MATCHES_PER_USER} partidas em andamento.`);
    }

    // Seleciona automaticamente o deck padrão, se for válido para esta partida.
    let deckId: string | null = null;
    const profile = await tx.user.findUnique({ where: { id: user.id }, select: { defaultDeckId: true } });
    if (profile?.defaultDeckId) {
      const { evaluation } = await evaluateSeatDeck(tx, user.id, profile.defaultDeckId, readConfig(match));
      if (evaluation.valid) deckId = profile.defaultDeckId;
    }
    await tx.matchPlayer.create({ data: { matchId: match.id, userId: user.id, seat: "B", deckId } });
    await bumpMatch(tx, match.id);
    await recordEvent(tx, match.id, "PLAYER_JOINED", user.id);
    return match;
  });
  notifyMatchChanged(match.id);
  return match;
}

export async function leaveRoom(user: SessionUser, matchId: string, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, OPEN_STATUSES, "Não é possível sair depois que o draft começou");
    if (seat === "A") {
      await bumpMatch(tx, matchId, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "O anfitrião saiu da sala" });
      await recordEvent(tx, matchId, "ROOM_CANCELLED", user.id, { reason: "host_left" });
      return;
    }
    await tx.matchPlayer.delete({ where: { matchId_seat: { matchId, seat: "B" } } });
    await tx.matchPlayer.update({ where: { matchId_seat: { matchId, seat: "A" } }, data: { isReady: false } });
    await bumpMatch(tx, matchId, { status: "WAITING" });
    await recordEvent(tx, matchId, "PLAYER_LEFT", user.id);
  });
  notifyMatchChanged(matchId);
}

export async function cancelRoom(user: SessionUser, matchId: string, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    if (match.hostId !== user.id) throw new AppError("FORBIDDEN", "Apenas o anfitrião pode cancelar a sala");
    requireStatus(match, OPEN_STATUSES, "A sala só pode ser cancelada antes do início do draft");
    await bumpMatch(tx, matchId, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelada pelo anfitrião" });
    await recordEvent(tx, matchId, "ROOM_CANCELLED", user.id, { reason: "host_cancelled" });
  });
  notifyMatchChanged(matchId);
}

export async function selectDeck(user: SessionUser, matchId: string, deckIdInput: unknown, db: Db = prisma) {
  const deckId = parseInput(idSchema, deckIdInput);
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, OPEN_STATUSES, "O deck não pode mais ser trocado nesta partida");
    const { deck } = await assertSeatDeckValid(tx, user.id, deckId, readConfig(match));
    await tx.matchPlayer.update({ where: { matchId_seat: { matchId, seat } }, data: { deckId: deck.id, isReady: false } });
    await bumpMatch(tx, matchId, { status: "WAITING" });
    await recordEvent(tx, matchId, "DECK_SELECTED", user.id, { seat, deckName: deck.name });
  });
  notifyMatchChanged(matchId);
}

export async function setReady(user: SessionUser, matchId: string, ready: boolean, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, OPEN_STATUSES, "A partida já começou");
    const player = match.players.find((p) => p.seat === seat)!;
    if (ready) {
      if (!player.deckId) throw new AppError("DECK_INVALID", "Selecione um deck antes de confirmar prontidão");
      await assertSeatDeckValid(tx, user.id, player.deckId, readConfig(match));
    }
    await tx.matchPlayer.update({ where: { id: player.id }, data: { isReady: ready } });
    const readyCount = match.players.filter((p) => (p.id === player.id ? ready : p.isReady)).length;
    const status = match.players.length === 2 && readyCount === 2 ? "READY" : "WAITING";
    await bumpMatch(tx, matchId, { status });
    await recordEvent(tx, matchId, ready ? "PLAYER_READY" : "PLAYER_UNREADY", user.id, { seat });
  });
  notifyMatchChanged(matchId);
}

/** Anfitrião inicia o draft: fixa a tabela vigente e congela os decks em snapshots imutáveis. */
export async function startDraft(user: SessionUser, matchId: string, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    if (match.hostId !== user.id) throw new AppError("FORBIDDEN", "Apenas o anfitrião inicia o draft");
    requireStatus(match, ["READY"], "Os dois jogadores precisam estar prontos");
    if (match.players.length !== 2 || match.players.some((p) => !p.isReady || !p.deckId)) {
      throw new AppError("INVALID_STATE", "Os dois jogadores precisam estar prontos");
    }
    const config = readConfig(match);
    const version = await getActivePriceVersion(tx);
    if (!version) throw new AppError("UNAVAILABLE", "Nenhuma tabela de preços publicada");

    for (const player of match.players) {
      const { deck, prices, evaluation } = await evaluateSeatDeck(tx, player.userId, player.deckId!, config, version.id);
      if (!evaluation.valid) {
        throw new AppError("DECK_INVALID", `O deck do jogador ${player.seat} ficou inválido: ${evaluation.issues[0]!.message}`);
      }
      const characters = await tx.character.findMany({ where: { id: { in: deck.characters.map((c) => c.characterId) } } });
      await tx.matchDeckSnapshot.create({
        data: {
          matchId,
          seat: player.seat,
          userId: player.userId,
          sourceDeckId: deck.id,
          deckName: deck.name,
          priceVersionId: version.id,
          budget: config.deckBudget,
          totalCost: evaluation.totalCost,
          entries: {
            create: characters.map((c) => ({
              characterId: c.id,
              cost: prices.get(c.id)!,
              name: c.name,
              element: c.element,
              weaponType: c.weaponType,
              rarity: c.rarity,
              iconUrl: c.iconUrl,
            })),
          },
        },
      });
    }
    const first = config.draft.sequence[0]!;
    await bumpMatch(tx, matchId, {
      status: first.type === "BAN" ? "BANNING" : "PICKING",
      currentStep: 0,
      draftStartedAt: new Date(),
      priceVersion: { connect: { id: version.id } },
    });
    await recordEvent(tx, matchId, "DRAFT_STARTED", user.id, { priceVersion: version.number });
  });
  notifyMatchChanged(matchId);
}

export async function loadDraftContext(tx: Tx, matchId: string) {
  const [snapshots, actions] = await Promise.all([
    tx.matchDeckSnapshot.findMany({ where: { matchId }, include: { entries: true } }),
    tx.draftAction.findMany({ where: { matchId }, orderBy: { stepIndex: "asc" } }),
  ]);
  const decks: DraftDecks = { A: [], B: [] };
  for (const snapshot of snapshots) decks[snapshot.seat] = snapshot.entries.map((e) => e.characterId);
  const records: DraftActionRecord[] = actions.map((a) => ({
    stepIndex: a.stepIndex,
    type: a.type,
    actorSeat: a.actorSeat,
    targetSeat: a.targetSeat,
    characterId: a.characterId,
  }));
  return { snapshots, decks, actions: records };
}

export const draftActionSchema = z.object({
  stepIndex: z.number().int().min(0).max(100),
  characterId: idSchema,
});

/**
 * Aplica um ban/pick de forma atômica. O lock da linha da partida serializa ações concorrentes;
 * a chave única (matchId, stepIndex) é a segunda barreira contra escolhas simultâneas.
 */
export async function performDraftAction(user: SessionUser, matchId: string, input: unknown, db: Db = prisma) {
  const data = parseInput(draftActionSchema, input);
  enforceRateLimit("matchAction", user.id);
  try {
    await db.$transaction(async (tx) => {
      const match = await loadLockedMatch(tx, matchId);
      const seat = requireSeat(match, user.id);
      requireStatus(match, DRAFT_STATUSES, "O draft não está em andamento");
      const config = readConfig(match);
      const ctx = await loadDraftContext(tx, matchId);
      const result = validateDraftAction(config.draft, ctx.decks, ctx.actions, {
        actorSeat: seat,
        stepIndex: data.stepIndex,
        characterId: data.characterId,
      });
      if (!result.ok) {
        throw new AppError(result.code === "DRAFT_COMPLETE" ? "INVALID_STATE" : result.code, result.message);
      }
      await tx.draftAction.create({
        data: {
          matchId,
          stepIndex: data.stepIndex,
          type: result.step.type,
          actorSeat: seat,
          targetSeat: result.targetSeat,
          characterId: data.characterId,
          actorUserId: user.id,
        },
      });
      const nextIndex = data.stepIndex + 1;
      const next = config.draft.sequence[nextIndex];
      await bumpMatch(tx, matchId, {
        currentStep: nextIndex,
        status: next ? (next.type === "BAN" ? "BANNING" : "PICKING") : "LOCKED",
        ...(next ? {} : { lockedAt: new Date() }),
      });
      const entry = ctx.snapshots.find((s) => s.seat === result.targetSeat)?.entries.find((e) => e.characterId === data.characterId);
      await recordEvent(tx, matchId, result.step.type === "BAN" ? "DRAFT_BAN" : "DRAFT_PICK", user.id, {
        seat,
        stepIndex: data.stepIndex,
        characterId: data.characterId,
        characterName: entry?.name,
      });
      if (!next) await recordEvent(tx, matchId, "DRAFT_LOCKED", null);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("STALE_ACTION", "Outra ação já foi registrada neste turno. O estado foi atualizado.");
    }
    throw err;
  }
  notifyMatchChanged(matchId);
}

export function seatOf(match: { players: { userId: string; seat: Seat }[] }, userId: string): Seat | null {
  return match.players.find((p) => p.userId === userId)?.seat ?? null;
}
