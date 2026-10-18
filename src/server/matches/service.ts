import { randomInt } from "node:crypto";
import { z } from "zod";
import { evaluateDeck } from "@/domain/deck";
import {
  canUndo,
  computeDraftState,
  immunityEligible,
  effectiveSequence,
  opponentOf,
  planDraftBatch,
  validateDraftAction,
  type DraftActionRecord,
  type DraftCopies,
  type DraftDecks,
  type DraftErrorCode,
  type DraftState,
  type DraftStep,
} from "@/domain/draft";
import { Prisma, type Seat } from "@/generated/prisma/client";
import { getCurrentCycle, toRulesSnapshot } from "../abyss/service";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { DEFAULT_COST_RULES } from "@/domain/pricing";
import { getActivePriceVersion, getUserCostMap, requireActivePriceVersion } from "../pricing/service";
import { enforceRateLimit } from "../rate-limit";
import { notifyMatchChanged, notifyUser } from "../realtime/notify";
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

/**
 * Valida um deck do usuário para uma partida: tabela vigente, conta do jogador (constelação/nível)
 * e configuração congelada na sala.
 */
async function evaluateSeatDeck(tx: Tx, userId: string, deckId: string, config: MatchConfig, priceVersionId?: string) {
  const deck = await tx.deck.findFirst({ where: { id: deckId, userId }, include: { characters: true } });
  if (!deck) throw new AppError("NOT_FOUND", "Deck não encontrado");
  const versionId = priceVersionId ?? (await requireActivePriceVersion(tx)).id;
  const costs = await getUserCostMap(userId, versionId, config.costRules ?? DEFAULT_COST_RULES, tx);
  const evaluation = evaluateDeck(
    deck.characters.map((c) => c.characterId),
    costs.prices,
    { budget: config.deckBudget, minSize: config.minDeckSize },
    costs.owned,
  );
  return { deck, costs, evaluation };
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

/** Ocupa o assento B (dentro de uma transação). Usado ao aceitar convites. */
export async function joinMatchTx(tx: Tx, user: SessionUser, matchId: string) {
  {
    const match = await loadLockedMatch(tx, matchId);
    if (match.players.some((p) => p.userId === user.id)) return match; // reentrada idempotente
    requireStatus(match, ["WAITING"], "Esta sala não está aceitando jogadores");
    if (match.players.length >= 2) throw new AppError("CONFLICT", "A sala já está cheia");
    if ((await countActiveMatches(tx, user.id)) >= MAX_ACTIVE_MATCHES_PER_USER) {
      throw new AppError("CONFLICT", `Você já tem ${MAX_ACTIVE_MATCHES_PER_USER} partidas em andamento.`);
    }
    // O anfitrião pode ter trocado de lado antes de o convidado anterior sair: ocupa o assento livre.
    const seat: Seat = match.players.some((p) => p.seat === "B") ? "A" : "B";

    // Seleciona automaticamente o deck padrão, se for válido para esta partida.
    let deckId: string | null = null;
    const profile = await tx.user.findUnique({ where: { id: user.id }, select: { defaultDeckId: true } });
    if (profile?.defaultDeckId) {
      const { evaluation } = await evaluateSeatDeck(tx, user.id, profile.defaultDeckId, readConfig(match));
      if (evaluation.valid) deckId = profile.defaultDeckId;
    }
    await tx.matchPlayer.create({ data: { matchId: match.id, userId: user.id, seat, deckId } });
    await bumpMatch(tx, match.id);
    await recordEvent(tx, match.id, "PLAYER_JOINED", user.id);
    return match;
  }
}

/** Entrada direta pelo código (uso interno, testes e seed). Na interface, a entrada é por convite. */
export async function joinRoom(user: SessionUser, codeInput: unknown, db: Db = prisma) {
  const code = parseInput(roomCodeSchema, codeInput);
  const found = await db.match.findUnique({ where: { code }, select: { id: true } });
  if (!found) throw new AppError("NOT_FOUND", "Sala não encontrada");
  const match = await db.$transaction((tx) => joinMatchTx(tx, user, found.id));
  notifyMatchChanged(match.id);
  return match;
}

/** Cancela convites pendentes de uma sala; devolve quem precisa ser avisado. */
async function cancelPendingInvites(tx: Tx, matchId: string) {
  const pending = await tx.matchInvite.findMany({ where: { matchId, status: "PENDING" }, select: { id: true, toUserId: true } });
  if (pending.length) {
    await tx.matchInvite.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "CANCELLED", respondedAt: new Date() } });
  }
  return pending;
}

export async function leaveRoom(user: SessionUser, matchId: string, db: Db = prisma) {
  const cancelled = await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, OPEN_STATUSES, "Não é possível sair depois que o draft começou");
    if (match.hostId === user.id) {
      await bumpMatch(tx, matchId, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "O anfitrião saiu da sala" });
      await recordEvent(tx, matchId, "ROOM_CANCELLED", user.id, { reason: "host_left" });
      return cancelPendingInvites(tx, matchId);
    }
    await tx.matchPlayer.delete({ where: { matchId_seat: { matchId, seat } } });
    await tx.matchPlayer.updateMany({ where: { matchId }, data: { isReady: false } });
    await bumpMatch(tx, matchId, { status: "WAITING" });
    await recordEvent(tx, matchId, "PLAYER_LEFT", user.id);
    return [];
  });
  for (const invite of cancelled) notifyUser(invite.toUserId, "invite:updated", { id: invite.id, status: "CANCELLED" });
  notifyMatchChanged(matchId);
}

export async function cancelRoom(user: SessionUser, matchId: string, db: Db = prisma) {
  const cancelled = await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    if (match.hostId !== user.id) throw new AppError("FORBIDDEN", "Apenas o anfitrião pode cancelar a sala");
    requireStatus(match, OPEN_STATUSES, "A sala só pode ser cancelada antes do início do draft");
    await bumpMatch(tx, matchId, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelada pelo anfitrião" });
    await recordEvent(tx, matchId, "ROOM_CANCELLED", user.id, { reason: "host_cancelled" });
    return cancelPendingInvites(tx, matchId);
  });
  for (const invite of cancelled) notifyUser(invite.toUserId, "invite:updated", { id: invite.id, status: "CANCELLED" });
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

/**
 * Troca quem é o jogador A e quem é o B (definido por acordo, sem sorteio nem prioridade do anfitrião).
 * A prontidão dos dois é desfeita: confirmar de novo é o aceite do novo lado.
 */
export async function swapSeats(user: SessionUser, matchId: string, db: Db = prisma) {
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    requireSeat(match, user.id);
    requireStatus(match, OPEN_STATUSES, "Os lados só podem ser trocados antes do draft");
    if (match.players.length !== 2) throw new AppError("INVALID_STATE", "Os lados são trocados com os dois jogadores na sala");
    // O índice único (matchId, seat) não permite trocar no lugar: recria os dois assentos.
    await tx.matchPlayer.deleteMany({ where: { matchId } });
    for (const p of match.players) {
      await tx.matchPlayer.create({
        data: { matchId, userId: p.userId, seat: opponentOf(p.seat), deckId: p.deckId, isReady: false, joinedAt: p.joinedAt, lastSeenAt: p.lastSeenAt },
      });
    }
    await bumpMatch(tx, matchId, { status: "WAITING" });
    await recordEvent(tx, matchId, "SEATS_SWAPPED", user.id);
  });
  notifyMatchChanged(matchId);
}

const statusFor = (step: DraftStep | undefined) => (!step ? "LOCKED" : step.type === "PICK" ? "PICKING" : "BANNING");

/** Debita do relógio de `seat` o tempo desde o início do turno atual. */
async function chargeClock(tx: Tx, match: { id: string; turnStartedAt: Date | null }, seat: Seat, now: Date) {
  if (!match.turnStartedAt) return;
  const elapsed = Math.max(0, now.getTime() - match.turnStartedAt.getTime());
  await tx.matchPlayer.update({ where: { matchId_seat: { matchId: match.id, seat } }, data: { clockUsedMs: { increment: elapsed } } });
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

    const decks: DraftDecks = { A: [], B: [] };
    const copies: DraftCopies = { A: {}, B: {} };
    for (const player of match.players) {
      const { deck, costs, evaluation } = await evaluateSeatDeck(tx, player.userId, player.deckId!, config, version.id);
      if (!evaluation.valid) {
        throw new AppError("DECK_INVALID", `O deck do jogador ${player.seat} ficou inválido: ${evaluation.issues[0]!.message}`);
      }
      const characters = await tx.character.findMany({ where: { id: { in: deck.characters.map((c) => c.characterId) } } });
      decks[player.seat] = characters.map((c) => c.id);
      copies[player.seat] = Object.fromEntries(characters.map((c) => [c.id, costs.details.get(c.id)!.constellation]));
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
              cost: costs.prices.get(c.id)!,
              constellation: costs.details.get(c.id)!.constellation,
              level: costs.details.get(c.id)!.level,
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
    const eligible = immunityEligible(decks, copies);
    const { sequence, immunityActive } = effectiveSequence(config.draft, eligible);
    const now = new Date();
    await bumpMatch(tx, matchId, {
      status: statusFor(sequence[0]),
      currentStep: 0,
      draftStartedAt: now,
      turnStartedAt: now,
      priceVersion: { connect: { id: version.id } },
    });
    await recordEvent(tx, matchId, "DRAFT_STARTED", user.id, { priceVersion: version.number, immunity: immunityActive, eligible: eligible.length });
  });
  notifyMatchChanged(matchId);
}

export async function loadDraftContext(tx: Tx, matchId: string) {
  // Sequencial: roda dentro da transação da ação de draft.
  const snapshots = await tx.matchDeckSnapshot.findMany({ where: { matchId }, include: { entries: true } });
  const actions = await tx.draftAction.findMany({ where: { matchId }, orderBy: { stepIndex: "asc" } });
  const decks: DraftDecks = { A: [], B: [] };
  const copies: DraftCopies = { A: {}, B: {} };
  for (const snapshot of snapshots) {
    decks[snapshot.seat] = snapshot.entries.map((e) => e.characterId);
    copies[snapshot.seat] = Object.fromEntries(snapshot.entries.map((e) => [e.characterId, e.constellation]));
  }
  const records: DraftActionRecord[] = actions.map((a) => ({
    stepIndex: a.stepIndex,
    type: a.type,
    actorSeat: a.actorSeat,
    targetSeat: a.targetSeat,
    characterId: a.characterId,
  }));
  return { snapshots, decks, copies, actions: records };
}

export const draftActionSchema = z
  .object({
    stepIndex: z.number().int().min(0).max(100),
    /** Null = passar a vez (só aceito quando não há nenhuma opção válida). */
    characterId: idSchema.nullable().optional(),
    /** Vez dupla (ex.: B B) confirmada de uma vez. */
    characterIds: z.array(idSchema).min(1).max(4).optional(),
  })
  .refine((v) => (v.characterId === undefined) !== (v.characterIds === undefined), { message: "Informe o personagem (ou os personagens) da vez" });

const EVENT_BY_TYPE = { IMMUNE: "DRAFT_IMMUNE", BAN: "DRAFT_BAN", PICK: "DRAFT_PICK", SKIP: "DRAFT_SKIP" } as const;

function characterName(snapshots: Awaited<ReturnType<typeof loadDraftContext>>["snapshots"], characterId: string | null) {
  if (!characterId) return undefined;
  for (const s of snapshots) {
    const entry = s.entries.find((e) => e.characterId === characterId);
    if (entry) return entry.name;
  }
  return undefined;
}

/**
 * Aplica uma imunidade, ban, pick ou passe (ou a vez dupla inteira, com `characterIds`) de forma atômica.
 * O lock da linha da partida serializa ações concorrentes; a chave única (matchId, stepIndex) é a segunda
 * barreira contra escolhas simultâneas. O tempo do turno é debitado do relógio de quem agiu.
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
      const fail = (code: DraftErrorCode, message: string) => new AppError(code === "DRAFT_COMPLETE" ? "INVALID_STATE" : code, message);

      let planned: DraftActionRecord[];
      let finalState: DraftState;
      if (data.characterIds) {
        const plan = planDraftBatch(config.draft, ctx.decks, ctx.actions, { actorSeat: seat, stepIndex: data.stepIndex, characterIds: data.characterIds }, ctx.copies);
        if (!plan.ok) throw fail(plan.code, plan.message);
        planned = plan.actions;
        finalState = plan.state;
      } else {
        const characterId = data.characterId ?? null;
        const result = validateDraftAction(config.draft, ctx.decks, ctx.actions, { actorSeat: seat, stepIndex: data.stepIndex, characterId }, ctx.copies);
        if (!result.ok) throw fail(result.code, result.message);
        planned = [{ stepIndex: data.stepIndex, type: result.type, actorSeat: seat, targetSeat: result.targetSeat, characterId }];
        finalState = computeDraftState(config.draft, ctx.decks, [...ctx.actions, ...planned], ctx.copies);
      }

      for (const action of planned) {
        await tx.draftAction.create({
          data: { matchId, stepIndex: action.stepIndex, type: action.type, actorSeat: seat, targetSeat: action.targetSeat, characterId: action.characterId, actorUserId: user.id },
        });
      }
      const now = new Date();
      await chargeClock(tx, match, seat, now);
      const next = finalState.currentStep ?? undefined;
      await bumpMatch(tx, matchId, {
        currentStep: finalState.stepIndex,
        status: statusFor(next),
        turnStartedAt: next ? now : null,
        ...(next ? {} : { lockedAt: now }),
      });
      for (const action of planned) {
        await recordEvent(tx, matchId, EVENT_BY_TYPE[action.type], user.id, {
          seat,
          stepIndex: action.stepIndex,
          characterId: action.characterId,
          characterName: characterName(ctx.snapshots, action.characterId),
        });
      }
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

/**
 * Desfazer (1 por jogador, configurável): remove o último pick confirmado do jogador, desde que ainda seja
 * a última ação do draft. É público: o personagem volta a ficar disponível e o turno volta para quem desfez.
 * Também vale logo após o último pick, enquanto ninguém enviou resultado.
 */
export async function undoDraftPick(user: SessionUser, matchId: string, db: Db = prisma) {
  enforceRateLimit("matchAction", user.id);
  await db.$transaction(async (tx) => {
    const match = await loadLockedMatch(tx, matchId);
    const seat = requireSeat(match, user.id);
    requireStatus(match, [...DRAFT_STATUSES, "LOCKED"], "Não é mais possível desfazer");
    const config = readConfig(match);
    const player = match.players.find((p) => p.seat === seat)!;
    const ctx = await loadDraftContext(tx, matchId);
    if (!canUndo(config.draft, ctx.actions, seat, player.undosUsed)) {
      const left = (config.draft.undoPerPlayer ?? 0) - player.undosUsed;
      throw new AppError(
        "INVALID_STATE",
        left <= 0 ? "Você não tem mais desfazer nesta partida" : "Só dá para desfazer o seu último pick enquanto ele for a última ação do draft",
      );
    }
    const last = ctx.actions[ctx.actions.length - 1]!;
    const now = new Date();
    // Quem estava com a vez para de gastar tempo; o turno volta para quem desfez.
    const state = computeDraftState(config.draft, ctx.decks, ctx.actions, ctx.copies);
    if (state.currentStep) await chargeClock(tx, match, state.currentStep.actor, now);
    await tx.draftAction.delete({ where: { matchId_stepIndex: { matchId, stepIndex: last.stepIndex } } });
    await tx.matchPlayer.update({ where: { id: player.id }, data: { undosUsed: { increment: 1 } } });
    await bumpMatch(tx, matchId, { currentStep: last.stepIndex, status: "PICKING", turnStartedAt: now, lockedAt: null });
    await recordEvent(tx, matchId, "DRAFT_UNDO", user.id, {
      seat,
      stepIndex: last.stepIndex,
      characterId: last.characterId,
      characterName: characterName(ctx.snapshots, last.characterId),
    });
  });
  notifyMatchChanged(matchId);
}

export function seatOf(match: { players: { userId: string; seat: Seat }[] }, userId: string): Seat | null {
  return match.players.find((p) => p.userId === userId)?.seat ?? null;
}
