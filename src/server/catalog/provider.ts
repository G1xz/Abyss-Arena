import type { ElementKey, WeaponKey } from "@/domain/catalog";

/** Personagem jogável normalizado, independente da fonte externa. */
export interface CatalogCharacter {
  /** Identificador canônico, derivado do nome em inglês (comum entre fontes). */
  slug: string;
  name: string;
  element: ElementKey;
  weaponType: WeaponKey;
  rarity: 4 | 5;
  iconUrl: string | null;
  externalId: string;
  releasedAt: Date | null;
}

export interface CatalogFetchResult {
  characters: CatalogCharacter[];
  /** Entradas descartadas na normalização (não jogáveis, testes, duplicatas). */
  skipped: { externalId: string; reason: string }[];
}

/** Desacopla a origem dos dados de personagens. */
export interface CharacterCatalogProvider {
  readonly source: string;
  fetchCharacters(signal?: AbortSignal): Promise<CatalogFetchResult>;
}

export class CatalogUnavailableError extends Error {
  constructor(
    message: string,
    public readonly attempts: { source: string; error: string }[] = [],
  ) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}

export async function fetchJson(url: string, signal?: AbortSignal, timeoutMs = 20_000): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { accept: "application/json", "user-agent": "AbyssArena/0.1 (+catalog-sync)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}
