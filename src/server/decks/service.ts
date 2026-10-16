import { z } from "zod";
import { evaluateDeck, type DeckEvaluation } from "@/domain/deck";
import type { SessionUser } from "../auth/session";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { getActivePriceVersion, getCompetitivePriceMap } from "../pricing/service";
import { getSettings } from "../settings";
import { parseInput } from "../validation";

export const MAX_DECKS_PER_USER = 30;

export const deckInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao deck").max(40, "Nome muito longo"),
  characterIds: z.array(z.string().min(1).max(64)).max(120, "Deck grande demais"),
});

export async function getDeckRules(db: Tx = prisma) {
  const settings = await getSettings("competitive", db);
  return {
    budget: settings.deckBudget,
    minSize: settings.draft.picksPerPlayer + settings.draft.bansPerPlayer,
  };
}

/** Avalia decks contra a tabela vigente. Decks nunca são apagados por ficarem inválidos. */
export async function evaluateDecks<T extends { characters: { characterId: string }[] }>(decks: T[], db: Tx = prisma) {
  const version = await getActivePriceVersion(db);
  const prices = version ? await getCompetitivePriceMap(version.id, db) : new Map<string, number>();
  const rules = await getDeckRules(db);
  return decks.map((deck) => ({
    deck,
    evaluation: evaluateDeck(
      deck.characters.map((c) => c.characterId),
      prices,
      rules,
    ),
  }));
}

export async function listUserDecks(userId: string, db: Tx = prisma) {
  const decks = await db.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      characters: { include: { character: { select: { id: true, name: true, element: true, rarity: true, iconUrl: true } } } },
    },
  });
  const user = await db.user.findUnique({ where: { id: userId }, select: { defaultDeckId: true } });
  const evaluated = await evaluateDecks(decks, db);
  return evaluated.map(({ deck, evaluation }) => ({ ...deck, evaluation, isDefault: user?.defaultDeckId === deck.id }));
}

export async function getUserDeck(userId: string, deckId: string, db: Tx = prisma) {
  const deck = await db.deck.findFirst({ where: { id: deckId, userId }, include: { characters: true } });
  if (!deck) throw new AppError("NOT_FOUND", "Deck não encontrado");
  return deck;
}

async function assertValidComposition(characterIds: string[], db: Tx): Promise<DeckEvaluation> {
  const version = await getActivePriceVersion(db);
  if (!version) throw new AppError("UNAVAILABLE", "Nenhuma tabela de preços publicada ainda.");
  const evaluation = evaluateDeck(characterIds, await getCompetitivePriceMap(version.id, db), await getDeckRules(db));
  if (!evaluation.valid) {
    throw new AppError("DECK_INVALID", evaluation.issues[0]!.message, { evaluation });
  }
  return evaluation;
}

export async function createDeck(user: SessionUser, input: unknown, db = prisma) {
  const data = parseInput(deckInputSchema, input);
  const count = await db.deck.count({ where: { userId: user.id } });
  if (count >= MAX_DECKS_PER_USER) throw new AppError("CONFLICT", `Limite de ${MAX_DECKS_PER_USER} decks atingido`);
  await assertValidComposition(data.characterIds, db);
  return db.$transaction(async (tx) => {
    const deck = await tx.deck.create({
      data: { userId: user.id, name: data.name, characters: { create: data.characterIds.map((characterId) => ({ characterId })) } },
    });
    const owner = await tx.user.findUnique({ where: { id: user.id }, select: { defaultDeckId: true } });
    if (!owner?.defaultDeckId) await tx.user.update({ where: { id: user.id }, data: { defaultDeckId: deck.id } });
    return deck;
  });
}

export async function updateDeck(user: SessionUser, deckId: string, input: unknown, db = prisma) {
  const data = parseInput(deckInputSchema, input);
  await getUserDeck(user.id, deckId, db);
  await assertValidComposition(data.characterIds, db);
  return db.$transaction(async (tx) => {
    await tx.deckCharacter.deleteMany({ where: { deckId } });
    const deck = await tx.deck.update({
      where: { id: deckId },
      data: { name: data.name, characters: { create: data.characterIds.map((characterId) => ({ characterId })) } },
    });
    // Mudou o deck: quem estava pronto em uma sala aberta com ele precisa confirmar de novo.
    await unreadyOpenSeats(tx, deckId);
    return deck;
  });
}

export async function duplicateDeck(user: SessionUser, deckId: string, db = prisma) {
  const source = await getUserDeck(user.id, deckId, db);
  const count = await db.deck.count({ where: { userId: user.id } });
  if (count >= MAX_DECKS_PER_USER) throw new AppError("CONFLICT", `Limite de ${MAX_DECKS_PER_USER} decks atingido`);
  return db.deck.create({
    data: {
      userId: user.id,
      name: `${source.name} (cópia)`.slice(0, 40),
      characters: { create: source.characters.map((c) => ({ characterId: c.characterId })) },
    },
  });
}

export async function deleteDeck(user: SessionUser, deckId: string, db = prisma) {
  await getUserDeck(user.id, deckId, db);
  await db.$transaction(async (tx) => {
    await unreadyOpenSeats(tx, deckId);
    await tx.deck.delete({ where: { id: deckId } });
  });
}

export async function setDefaultDeck(user: SessionUser, deckId: string, db = prisma) {
  await getUserDeck(user.id, deckId, db);
  await db.user.update({ where: { id: user.id }, data: { defaultDeckId: deckId } });
}

async function unreadyOpenSeats(tx: Tx, deckId: string) {
  const seats = await tx.matchPlayer.findMany({
    where: { deckId, match: { status: { in: ["WAITING", "READY"] } } },
    select: { id: true, matchId: true },
  });
  if (!seats.length) return;
  await tx.matchPlayer.updateMany({ where: { id: { in: seats.map((s) => s.id) } }, data: { isReady: false } });
  await tx.match.updateMany({
    where: { id: { in: seats.map((s) => s.matchId) }, status: "READY" },
    data: { status: "WAITING", revision: { increment: 1 } },
  });
}
