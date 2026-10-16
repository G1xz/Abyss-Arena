import { z } from "zod";
import { slugify, type ElementKey, type WeaponKey } from "@/domain/catalog";
import { fetchJson, type CatalogCharacter, type CatalogFetchResult, type CharacterCatalogProvider } from "./provider";

/**
 * Fonte alternativa: genshin.jmp.blue. Nomes apenas em inglês e catálogo menos atualizado;
 * usada somente quando a fonte primária falha.
 */
export const JMP_BASE = "https://genshin.jmp.blue";

const ELEMENT_MAP: Record<string, ElementKey> = {
  Pyro: "PYRO",
  Hydro: "HYDRO",
  Anemo: "ANEMO",
  Electro: "ELECTRO",
  Dendro: "DENDRO",
  Cryo: "CRYO",
  Geo: "GEO",
};

const WEAPON_MAP: Record<string, WeaponKey> = {
  Sword: "SWORD",
  Claymore: "CLAYMORE",
  Polearm: "POLEARM",
  Bow: "BOW",
  Catalyst: "CATALYST",
};

const detailSchema = z.object({
  name: z.string(),
  vision: z.string().optional(),
  weapon: z.string().optional(),
  rarity: z.number().optional(),
  release: z.string().optional(),
});

export function normalizeJmpCharacter(id: string, raw: unknown, now = new Date()): CatalogCharacter | { skip: string } {
  const parsed = detailSchema.safeParse(raw);
  if (!parsed.success) return { skip: "formato inesperado" };
  const d = parsed.data;
  const element = d.vision ? ELEMENT_MAP[d.vision] : undefined;
  const weaponType = d.weapon ? WEAPON_MAP[d.weapon] : undefined;
  if (!element) return { skip: "sem elemento (não jogável)" };
  if (!weaponType) return { skip: "arma desconhecida" };
  const rarity = d.rarity === 105 ? 5 : d.rarity;
  if (rarity !== 4 && rarity !== 5) return { skip: "raridade inválida" };
  const releasedAt = d.release ? new Date(`${d.release}T00:00:00Z`) : null;
  if (releasedAt && releasedAt.getTime() > now.getTime()) return { skip: "não lançado" };
  const isTraveler = id.startsWith("traveler-");
  return {
    slug: isTraveler ? id : slugify(d.name),
    name: isTraveler ? `Viajante (${d.vision})` : d.name,
    element,
    weaponType,
    rarity,
    iconUrl: `${JMP_BASE}/characters/${id}/icon`,
    externalId: id,
    releasedAt,
  };
}

export class JmpCatalogProvider implements CharacterCatalogProvider {
  readonly source = "jmp";
  constructor(private readonly base = JMP_BASE) {}

  async fetchCharacters(signal?: AbortSignal): Promise<CatalogFetchResult> {
    const ids = z.array(z.string()).parse(await fetchJson(`${this.base}/characters`, signal));
    const characters: CatalogCharacter[] = [];
    const skipped: CatalogFetchResult["skipped"] = [];
    const seen = new Set<string>();
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const result = normalizeJmpCharacter(id, await fetchJson(`${this.base}/characters/${id}`, signal));
          if ("skip" in result) skipped.push({ externalId: id, reason: result.skip });
          else if (seen.has(result.slug)) skipped.push({ externalId: id, reason: `duplicata de ${result.slug}` });
          else {
            seen.add(result.slug);
            characters.push(result);
          }
        } catch (err) {
          skipped.push({ externalId: id, reason: `falha ao buscar: ${(err as Error).message}` });
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    characters.sort((a, b) => a.slug.localeCompare(b.slug));
    return { characters, skipped };
  }
}
