import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "../db";
import { JmpCatalogProvider } from "./jmp";
import { CatalogUnavailableError, type CatalogCharacter, type CharacterCatalogProvider } from "./provider";
import { YattaCatalogProvider } from "./yatta";

export const PRIMARY_SOURCE = "yatta";

export function defaultProviders(): CharacterCatalogProvider[] {
  const order = (process.env.CATALOG_PROVIDERS ?? "yatta,jmp").split(",").map((s) => s.trim());
  const all: Record<string, () => CharacterCatalogProvider> = {
    yatta: () => new YattaCatalogProvider(),
    jmp: () => new JmpCatalogProvider(),
  };
  return order.filter((name) => all[name]).map((name) => all[name]!());
}

export interface SyncReport {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  markedMissing: number;
  skipped: number;
  /** Resposta suspeita de estar incompleta: ninguém foi marcado como ausente. */
  partialResponse: boolean;
  attempts: { source: string; error: string }[];
  createdSlugs: string[];
}

/** Proporção mínima do catálogo atual que a resposta precisa ter para ser tratada como completa. */
const COMPLETENESS_RATIO = 0.6;

/**
 * Sincroniza o catálogo local com a primeira fonte disponível.
 * - Nunca apaga personagens nem preços; ausências são apenas sinalizadas.
 * - Personagens novos entram desabilitados para competição (aguardam preço e liberação).
 * - Se todas as fontes falharem, o banco não é alterado e CatalogUnavailableError é lançado.
 */
export async function syncCatalog(options: { providers?: CharacterCatalogProvider[]; db?: Db } = {}): Promise<SyncReport> {
  const db = options.db ?? prisma;
  const providers = options.providers ?? defaultProviders();
  const attempts: SyncReport["attempts"] = [];

  let provider: CharacterCatalogProvider | null = null;
  let fetched: CatalogCharacter[] = [];
  let skipped = 0;
  for (const candidate of providers) {
    try {
      const result = await candidate.fetchCharacters();
      if (result.characters.length === 0) throw new Error("resposta sem personagens");
      provider = candidate;
      fetched = result.characters;
      skipped = result.skipped.length;
      break;
    } catch (err) {
      attempts.push({ source: candidate.source, error: (err as Error).message });
    }
  }
  if (!provider) throw new CatalogUnavailableError("Nenhuma fonte de personagens disponível; catálogo local mantido.", attempts);

  const source = provider.source;
  const existing = await db.character.findMany();
  const byExternal = new Map(existing.map((c) => [`${c.externalSource}:${c.externalId}`, c]));
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  const ownedBySource = existing.filter((c) => c.externalSource === source && !c.missingFromSource).length;
  const partialResponse = ownedBySource > 0 && fetched.length < ownedBySource * COMPLETENESS_RATIO;

  const report: SyncReport = {
    source,
    fetched: fetched.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    markedMissing: 0,
    skipped,
    partialResponse,
    attempts,
    createdSlugs: [],
  };
  const now = new Date();
  const seenIds = new Set<string>();

  await db.$transaction(
    async (tx) => {
      for (const item of fetched) {
        const match = byExternal.get(`${source}:${item.externalId}`) ?? bySlug.get(item.slug);
        if (!match) {
          const created = await tx.character.create({
            data: {
              slug: item.slug,
              name: item.name,
              element: item.element,
              weaponType: item.weaponType,
              rarity: item.rarity,
              iconUrl: item.iconUrl,
              externalSource: source,
              externalId: item.externalId,
              releasedAt: item.releasedAt,
              competitiveEnabled: false,
              lastSyncedAt: now,
            },
          });
          seenIds.add(created.id);
          report.created++;
          report.createdSlugs.push(item.slug);
          continue;
        }
        seenIds.add(match.id);

        // A fonte primária assume registros criados por fontes alternativas; fontes alternativas
        // não sobrescrevem dados (ex.: nomes em PT) vindos da primária.
        const owns = match.externalSource === source || source === PRIMARY_SOURCE;
        const data: Prisma.CharacterUpdateInput = { lastSyncedAt: now, missingFromSource: false };
        let changed = match.missingFromSource;
        if (owns) {
          const next = {
            name: item.name,
            element: item.element,
            weaponType: item.weaponType,
            rarity: item.rarity,
            iconUrl: item.iconUrl,
            externalSource: source,
            externalId: item.externalId,
            releasedAt: item.releasedAt,
          };
          for (const [key, value] of Object.entries(next)) {
            const current = (match as Record<string, unknown>)[key];
            const same = value instanceof Date ? current instanceof Date && current.getTime() === value.getTime() : current === value;
            if (!same) {
              (data as Record<string, unknown>)[key] = value;
              changed = true;
            }
          }
        }
        await tx.character.update({ where: { id: match.id }, data });
        if (changed) report.updated++;
        else report.unchanged++;
      }

      if (!partialResponse) {
        const missing = existing.filter((c) => c.externalSource === source && !seenIds.has(c.id) && !c.missingFromSource);
        if (missing.length) {
          await tx.character.updateMany({ where: { id: { in: missing.map((c) => c.id) } }, data: { missingFromSource: true } });
          report.markedMissing = missing.length;
        }
      }
    },
    { timeout: 60_000 },
  );

  return report;
}
