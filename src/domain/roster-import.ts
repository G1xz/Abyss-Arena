/**
 * Importação da lista de personagens a partir do texto copiado (Ctrl+A, Ctrl+C) da página de
 * personagens do HoYoLAB (Battle Chronicle). Formato observado, por personagem:
 *
 *   Nv.90        ← nível
 *   2            ← constelação (linha ausente = C0)
 *   Nilou        ← nome
 *
 * Cabeçalhos, filtros e números soltos são ignorados. Funciona também com "Lv. 90" (inglês)
 * e com constelação no formato "C2".
 */

export interface RosterCatalogEntry {
  id: string;
  name: string;
  slug: string;
}

export interface ParsedRosterEntry {
  /** O Viajante aparece uma vez no HoYoLAB e corresponde às variantes por elemento. */
  characterIds: string[];
  name: string;
  level: number;
  constellation: number;
}

export interface RosterParseResult {
  entries: ParsedRosterEntry[];
  /** Nomes que não estão no catálogo (ex.: personagem novo ainda não sincronizado). */
  unknown: { name: string; level: number; constellation: number }[];
  /** Personagens não jogáveis (Manequins). */
  ignored: string[];
}

const LEVEL_RE = /^(?:nv|lv|lvl|n[íi]vel|level)\s*\.?\s*(\d{1,3})$/i;
const CONSTELLATION_RE = /^c?\s*([0-6])$/i;
const NON_PLAYABLE = new Set(["manequim", "manequina", "manekin", "manekina"]);
const TRAVELER = new Set(["viajante", "traveler", "viajantes"]);

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function parseRosterText(text: string, catalog: RosterCatalogEntry[]): RosterParseResult {
  const byName = new Map<string, RosterCatalogEntry>();
  for (const c of catalog) {
    byName.set(normalizeName(c.name), c);
    byName.set(normalizeName(c.slug), c);
  }
  const travelerIds = catalog.filter((c) => c.slug.startsWith("traveler-")).map((c) => c.id);

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: RosterParseResult = { entries: [], unknown: [], ignored: [] };
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const levelMatch = LEVEL_RE.exec(lines[i]!);
    if (!levelMatch) continue;
    const level = Math.min(100, Math.max(1, Number(levelMatch[1])));
    let constellation = 0;
    let j = i + 1;
    const cMatch = j < lines.length ? CONSTELLATION_RE.exec(lines[j]!) : null;
    if (cMatch) {
      constellation = Number(cMatch[1]);
      j++;
    }
    const name = lines[j];
    if (!name || LEVEL_RE.test(name)) continue; // bloco incompleto
    i = j;

    const key = normalizeName(name);
    if (NON_PLAYABLE.has(key)) {
      result.ignored.push(name);
      continue;
    }
    const characterIds = TRAVELER.has(key) ? travelerIds : byName.has(key) ? [byName.get(key)!.id] : [];
    if (characterIds.length === 0) {
      result.unknown.push({ name, level, constellation });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.entries.push({ characterIds, name, level, constellation });
  }
  return result;
}
