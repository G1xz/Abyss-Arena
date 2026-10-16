import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogFetchResult, CharacterCatalogProvider, CatalogCharacter } from "./provider";

/**
 * Último recurso documentado: snapshot local (prisma/data/characters-snapshot.json) capturado da
 * fonte primária. Usado apenas pelo seed quando todas as APIs públicas estão indisponíveis.
 * Não marca personagens como ausentes, pois não é uma fonte "viva".
 */
export class SnapshotCatalogProvider implements CharacterCatalogProvider {
  readonly source = "yatta-snapshot";
  constructor(private readonly file = path.resolve("prisma/data/characters-snapshot.json")) {}

  async fetchCharacters(): Promise<CatalogFetchResult> {
    const raw = JSON.parse(await readFile(this.file, "utf8")) as { characters: (CatalogCharacter & { releasedAt: string | null })[] };
    return {
      characters: raw.characters.map((c) => ({ ...c, releasedAt: c.releasedAt ? new Date(c.releasedAt) : null })),
      skipped: [],
    };
  }
}
