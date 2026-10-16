import { z } from "zod";
import { parseRosterText, type RosterParseResult } from "@/domain/roster-import";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { parseInput } from "../validation";

export async function getRoster(userId: string, db: Tx = prisma) {
  return db.ownedCharacter.findMany({
    where: { userId },
    include: { character: { select: { id: true, slug: true, name: true, element: true, weaponType: true, rarity: true, iconUrl: true, competitiveEnabled: true } } },
    orderBy: [{ character: { rarity: "desc" } }, { character: { name: "asc" } }],
  });
}

export async function getRosterCatalog(db: Tx = prisma) {
  return db.character.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } });
}

export const importRosterSchema = z.object({
  text: z.string().min(1, "Cole o texto da página de personagens").max(200_000, "Texto grande demais"),
  mode: z.enum(["replace", "merge"]).default("replace"),
});

export interface RosterImportReport {
  parsed: RosterParseResult;
  created: number;
  updated: number;
  removed: number;
}

/**
 * Importa a lista colada do HoYoLAB. "replace" deixa a conta exatamente como a lista;
 * "merge" só cria/atualiza os personagens colados.
 */
export async function importRoster(user: SessionUser, input: unknown, db: Db = prisma): Promise<RosterImportReport> {
  const data = parseInput(importRosterSchema, input);
  const parsed = parseRosterText(data.text, await getRosterCatalog(db));
  if (parsed.entries.length === 0) {
    throw new AppError("VALIDATION", "Nenhum personagem reconhecido. Copie a página inteira de personagens do HoYoLAB (Ctrl+A, Ctrl+C) e cole aqui.");
  }
  return db.$transaction(async (tx) => {
    const current = await tx.ownedCharacter.findMany({ where: { userId: user.id } });
    const currentMap = new Map(current.map((o) => [o.characterId, o]));
    const imported = new Set<string>();
    let created = 0;
    let updated = 0;
    for (const entry of parsed.entries) {
      for (const characterId of entry.characterIds) {
        imported.add(characterId);
        const existing = currentMap.get(characterId);
        if (!existing) {
          await tx.ownedCharacter.create({ data: { userId: user.id, characterId, constellation: entry.constellation, level: entry.level } });
          created++;
        } else if (existing.constellation !== entry.constellation || existing.level !== entry.level) {
          await tx.ownedCharacter.update({
            where: { userId_characterId: { userId: user.id, characterId } },
            data: { constellation: entry.constellation, level: entry.level },
          });
          updated++;
        }
      }
    }
    let removed = 0;
    if (data.mode === "replace") {
      const stale = current.filter((o) => !imported.has(o.characterId)).map((o) => o.characterId);
      if (stale.length) removed = (await tx.ownedCharacter.deleteMany({ where: { userId: user.id, characterId: { in: stale } } })).count;
    }
    return { parsed, created, updated, removed };
  });
}

export const ownedCharacterSchema = z.object({
  characterId: z.string().min(1).max(64),
  constellation: z.coerce.number().int().min(0, "Constelação de 0 a 6").max(6, "Constelação de 0 a 6"),
  level: z.coerce.number().int().min(1, "Nível de 1 a 100").max(100, "Nível de 1 a 100"),
});

export async function upsertOwnedCharacter(user: SessionUser, input: unknown, db: Db = prisma) {
  const data = parseInput(ownedCharacterSchema, input);
  const character = await db.character.findUnique({ where: { id: data.characterId }, select: { id: true } });
  if (!character) throw new AppError("NOT_FOUND", "Personagem não encontrado");
  return db.ownedCharacter.upsert({
    where: { userId_characterId: { userId: user.id, characterId: data.characterId } },
    create: { userId: user.id, ...data },
    update: { constellation: data.constellation, level: data.level },
  });
}

export async function removeOwnedCharacter(user: SessionUser, characterId: string, db: Db = prisma) {
  await db.ownedCharacter.deleteMany({ where: { userId: user.id, characterId } });
}

export const rosterChangesSchema = z.object({
  upserts: z.array(ownedCharacterSchema).max(400, "Alterações demais de uma vez"),
  removals: z.array(z.string().min(1).max(64)).max(400, "Alterações demais de uma vez"),
});

/** Edição manual em lote: adiciona/atualiza e remove personagens da conta numa única transação. */
export async function saveRosterChanges(user: SessionUser, input: unknown, db: Db = prisma) {
  const data = parseInput(rosterChangesSchema, input);
  const ids = [...new Set([...data.upserts.map((u) => u.characterId), ...data.removals])];
  const known = await db.character.count({ where: { id: { in: ids } } });
  if (known !== ids.length) throw new AppError("NOT_FOUND", "Personagem não encontrado");
  const removals = data.removals.filter((id) => !data.upserts.some((u) => u.characterId === id));
  return db.$transaction(async (tx) => {
    for (const u of data.upserts) {
      await tx.ownedCharacter.upsert({
        where: { userId_characterId: { userId: user.id, characterId: u.characterId } },
        create: { userId: user.id, ...u },
        update: { constellation: u.constellation, level: u.level },
      });
    }
    const removed = removals.length ? (await tx.ownedCharacter.deleteMany({ where: { userId: user.id, characterId: { in: removals } } })).count : 0;
    return { saved: data.upserts.length, removed };
  });
}
