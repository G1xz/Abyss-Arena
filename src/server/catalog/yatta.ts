import { z } from "zod";
import { slugify, type ElementKey, type WeaponKey } from "@/domain/catalog";
import { fetchJson, type CatalogCharacter, type CatalogFetchResult, type CharacterCatalogProvider } from "./provider";

/** Fonte primária: Project Amber / yatta.moe (possui nomes em português). */
export const YATTA_URL = "https://gi.yatta.moe/api/v2/pt/avatar";
const ICON_BASE = "https://gi.yatta.moe/assets/UI";

const ELEMENT_MAP: Record<string, ElementKey> = {
  Fire: "PYRO",
  Water: "HYDRO",
  Wind: "ANEMO",
  Electric: "ELECTRO",
  Grass: "DENDRO",
  Ice: "CRYO",
  Rock: "GEO",
};

const WEAPON_MAP: Record<string, WeaponKey> = {
  WEAPON_SWORD_ONE_HAND: "SWORD",
  WEAPON_CLAYMORE: "CLAYMORE",
  WEAPON_POLE: "POLEARM",
  WEAPON_BOW: "BOW",
  WEAPON_CATALYST: "CATALYST",
};

const ELEMENT_PT: Record<ElementKey, string> = {
  PYRO: "Pyro",
  HYDRO: "Hydro",
  ANEMO: "Anemo",
  ELECTRO: "Electro",
  DENDRO: "Dendro",
  CRYO: "Cryo",
  GEO: "Geo",
};

const itemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  rank: z.number().nullable().optional(),
  name: z.string(),
  element: z.string().nullable().optional(),
  weaponType: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  release: z.number().nullable().optional(),
  route: z.string().nullable().optional(),
  beta: z.boolean().optional(),
});

const responseSchema = z.object({
  response: z.number().optional(),
  data: z.object({ items: z.record(z.string(), z.unknown()) }),
});

// IDs do Viajante: 10000005 (Aether) e 10000007 (Lumine), com sufixo do elemento.
const TRAVELER_RE = /^1000000[57]-([a-z]+)$/;

/** Normalização pura (testável sem rede). */
export function normalizeYattaPayload(payload: unknown, now = new Date()): CatalogFetchResult {
  const parsed = responseSchema.parse(payload);
  const characters: CatalogCharacter[] = [];
  const skipped: CatalogFetchResult["skipped"] = [];
  const bySlug = new Map<string, CatalogCharacter>();

  for (const [key, raw] of Object.entries(parsed.data.items)) {
    const item = itemSchema.safeParse(raw);
    if (!item.success) {
      skipped.push({ externalId: key, reason: "formato inesperado" });
      continue;
    }
    const it = item.data;
    const rawId = String(it.id);
    const element = it.element ? ELEMENT_MAP[it.element] : undefined;
    const weaponType = it.weaponType ? WEAPON_MAP[it.weaponType] : undefined;

    if (it.beta) {
      skipped.push({ externalId: rawId, reason: "versão beta" });
      continue;
    }
    if (!element) {
      skipped.push({ externalId: rawId, reason: "sem elemento (não jogável)" });
      continue;
    }
    if (!weaponType) {
      skipped.push({ externalId: rawId, reason: "arma desconhecida" });
      continue;
    }
    if (!it.release || it.release * 1000 > now.getTime()) {
      skipped.push({ externalId: rawId, reason: "não lançado" });
      continue;
    }
    // Aloy aparece com rank 105 em algumas fontes (5★ colaborativa).
    const rank = it.rank === 105 ? 5 : it.rank;
    if (rank !== 4 && rank !== 5) {
      skipped.push({ externalId: rawId, reason: "raridade inválida" });
      continue;
    }

    const traveler = TRAVELER_RE.exec(rawId);
    let slug: string;
    let name: string;
    let externalId: string;
    if (traveler) {
      // As versões masculina e feminina são o mesmo personagem competitivo.
      slug = `traveler-${traveler[1]}`;
      name = `Viajante (${ELEMENT_PT[element]})`;
      externalId = slug;
    } else {
      slug = slugify(it.route || it.name);
      name = it.name.trim();
      externalId = rawId;
    }
    if (!slug) {
      skipped.push({ externalId: rawId, reason: "identificador vazio" });
      continue;
    }
    if (bySlug.has(slug)) {
      skipped.push({ externalId: rawId, reason: `duplicata de ${slug}` });
      continue;
    }
    const character: CatalogCharacter = {
      slug,
      name,
      element,
      weaponType,
      rarity: rank,
      iconUrl: it.icon ? `${ICON_BASE}/${it.icon}.png` : null,
      externalId,
      releasedAt: new Date(it.release * 1000),
    };
    bySlug.set(slug, character);
    characters.push(character);
  }

  characters.sort((a, b) => a.slug.localeCompare(b.slug));
  return { characters, skipped };
}

export class YattaCatalogProvider implements CharacterCatalogProvider {
  readonly source = "yatta";
  constructor(private readonly url = YATTA_URL) {}

  async fetchCharacters(signal?: AbortSignal): Promise<CatalogFetchResult> {
    return normalizeYattaPayload(await fetchJson(this.url, signal));
  }
}
