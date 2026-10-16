"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/next";
import { toErrorResult, type ActionResult } from "@/server/errors";
import { importRoster, removeOwnedCharacter, saveRosterChanges, upsertOwnedCharacter } from "@/server/roster/service";

export async function saveRosterChangesAction(input: {
  upserts: { characterId: string; constellation: number; level: number }[];
  removals: string[];
}): Promise<ActionResult<{ saved: number; removed: number }>> {
  const user = await requireUser("/roster");
  try {
    const data = await saveRosterChanges(user, input);
    revalidatePath("/roster");
    revalidatePath("/decks");
    return { ok: true, data };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function importRosterAction(input: { text: string; mode: "replace" | "merge" }): Promise<
  ActionResult<{ created: number; updated: number; removed: number; recognized: number; unknown: string[]; ignored: number }>
> {
  const user = await requireUser("/roster");
  try {
    const report = await importRoster(user, input);
    revalidatePath("/roster");
    revalidatePath("/decks");
    return {
      ok: true,
      data: {
        created: report.created,
        updated: report.updated,
        removed: report.removed,
        recognized: report.parsed.entries.length,
        unknown: report.parsed.unknown.map((u) => u.name),
        ignored: report.parsed.ignored.length,
      },
    };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function saveOwnedCharacterAction(input: { characterId: string; constellation: number; level: number }): Promise<ActionResult> {
  const user = await requireUser("/roster");
  try {
    await upsertOwnedCharacter(user, input);
    revalidatePath("/roster");
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function removeOwnedCharacterAction(characterId: string): Promise<ActionResult> {
  const user = await requireUser("/roster");
  try {
    await removeOwnedCharacter(user, characterId);
    revalidatePath("/roster");
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
