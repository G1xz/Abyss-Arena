"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/next";
import { createDeck, deleteDeck, duplicateDeck, setDefaultDeck, updateDeck } from "@/server/decks/service";
import { toErrorResult, type ActionResult } from "@/server/errors";

export async function saveDeckAction(input: { deckId?: string; name: string; characterIds: string[] }): Promise<ActionResult<{ deckId: string }>> {
  const user = await requireUser();
  try {
    const deck = input.deckId
      ? await updateDeck(user, input.deckId, { name: input.name, characterIds: input.characterIds })
      : await createDeck(user, { name: input.name, characterIds: input.characterIds });
    revalidatePath("/decks");
    return { ok: true, data: { deckId: deck.id } };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function duplicateDeckAction(deckId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await duplicateDeck(user, deckId);
    revalidatePath("/decks");
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function deleteDeckAction(deckId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteDeck(user, deckId);
    revalidatePath("/decks");
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function setDefaultDeckAction(deckId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await setDefaultDeck(user, deckId);
    revalidatePath("/decks");
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
