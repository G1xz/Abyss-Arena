/**
 * Dados de combate dos inimigos do Abismo.
 * - HP base: HP de mundo aberto da yatta.moe no nível da câmara (HP inicial × curva de crescimento).
 * - O Abismo multiplica esse HP por um fator que nenhuma fonte pública traz (ex.: 4,75 na 12-1 de 2026-10).
 *   O admin informa o multiplicador de cada metade ou o HP exato de um inimigo. Sem isso, o HP não é exibido:
 *   o valor de mundo aberto seria um número errado para o Abismo.
 */
import type { ElementKey } from "./catalog";

export type ResistanceKey = ElementKey | "PHYSICAL";
/** Resistências em % (10 = 10%). */
export type Resistances = Partial<Record<ResistanceKey, number>>;

export interface AbyssEnemy {
  name: string;
  nameEn: string;
  count: number | null;
  wave: number;
  image: string | null;
  /** HP de mundo aberto no nível da câmara, sem arredondar (null: fonte sem dados). */
  baseHp?: number | null;
  resistances?: Resistances | null;
  mechanics?: string[];
}

/** abyss = HP base × multiplicador da metade; manual = informado pelo admin. */
export type HpSource = "abyss" | "manual";

export interface ResolvedAbyssEnemy extends AbyssEnemy {
  /** HP real no Abismo; null enquanto o admin não informar. */
  hp?: number | null;
  hpSource?: HpSource | null;
}

/** Só conta HP confirmado para o Abismo (dados antigos podem trazer outras origens). */
export const hasAbyssHp = (e: ResolvedAbyssEnemy): e is ResolvedAbyssEnemy & { hp: number } =>
  e.hp != null && (e.hpSource === "abyss" || e.hpSource === "manual");

/** HP informado à mão pelo admin, por inimigo: { "<onda>:<nome em inglês>": hp }. */
export type HpOverrides = Record<string, number>;

export const enemyKey = (e: { wave: number; nameEn: string }) => `${e.wave}:${e.nameEn}`;

/** Variantes "Battle-Hardened" só existem no Abismo e têm atributos próprios: o HP do inimigo comum não serve. */
export const isBattleHardened = (nameEn: string) => /^Battle-Hardened\s/i.test(nameEn);

export function resolveEnemyHp(enemies: AbyssEnemy[], hpMultiplier: number | null | undefined, overrides: HpOverrides | null | undefined): ResolvedAbyssEnemy[] {
  return enemies.map((e) => {
    const manual = overrides?.[enemyKey(e)];
    if (manual && manual > 0) return { ...e, hp: Math.round(manual), hpSource: "manual" };
    if (e.baseHp != null && hpMultiplier && hpMultiplier > 0) return { ...e, hp: Math.round(e.baseHp * hpMultiplier), hpSource: "abyss" };
    return { ...e, hp: null, hpSource: null };
  });
}

/** HP somado da metade (quantidade × HP). Null quando falta o HP ou a quantidade de algum inimigo. */
export function totalHp(enemies: ResolvedAbyssEnemy[]): number | null {
  if (!enemies.length || enemies.some((e) => !hasAbyssHp(e) || e.count === null)) return null;
  return enemies.reduce((sum, e) => sum + e.hp! * (e.count ?? 1), 0);
}

// ── Leitura dos dados da yatta.moe ─────────────────────────────────────

export interface YattaMonsterEntry {
  id: number;
  prop: { propType: string; initValue: number; type: string }[];
  resistance: Record<string, unknown>;
}

export interface YattaMonsterDetail {
  id: number;
  entries: Record<string, YattaMonsterEntry>;
  tips?: Record<string, { description: string }> | null;
}

/** Curva de crescimento por nível: { "95": { curveInfos: { GROW_CURVE_HP_2: 3344.27, ... } } }. */
export type HpCurve = Record<string, { curveInfos: Record<string, number> }>;

/** Versão principal do inimigo (a mesma id do catálogo); as outras são variantes de eventos e domínios. */
export function mainEntry(detail: YattaMonsterDetail): YattaMonsterEntry | null {
  return detail.entries[String(detail.id)] ?? Object.values(detail.entries)[0] ?? null;
}

export function monsterBaseHp(entry: YattaMonsterEntry, level: number | null, curve: HpCurve): number | null {
  if (!level) return null;
  const hp = entry.prop.find((p) => p.propType === "FIGHT_PROP_BASE_HP");
  const factor = hp ? curve[String(level)]?.curveInfos[hp.type] : undefined;
  return hp && factor ? hp.initValue * factor : null;
}

const RESISTANCE_FIELDS: [string, ResistanceKey][] = [
  ["fireSubHurt", "PYRO"],
  ["waterSubHurt", "HYDRO"],
  ["windSubHurt", "ANEMO"],
  ["elecSubHurt", "ELECTRO"],
  ["grassSubHurt", "DENDRO"],
  ["iceSubHurt", "CRYO"],
  ["rockSubHurt", "GEO"],
  ["physicalSubHurt", "PHYSICAL"],
];

export function monsterResistances(entry: YattaMonsterEntry): Resistances | null {
  const result: Resistances = {};
  for (const [field, key] of RESISTANCE_FIELDS) {
    const value = entry.resistance[field];
    if (typeof value === "number") result[key] = Math.round(value * 100);
  }
  return Object.keys(result).length ? result : null;
}

/** Dicas de combate do jogo, sem as marcações de cor. */
export function monsterMechanics(detail: YattaMonsterDetail): string[] {
  return Object.values(detail.tips ?? {})
    .map((t) =>
      t.description
        .replace(/\\n/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\{\/?LINK[^}]*\}/g, "")
        .trim(),
    )
    .filter(Boolean);
}

export const RESISTANCE_LABEL: Record<ResistanceKey, string> = {
  PYRO: "Pyro",
  HYDRO: "Hydro",
  ANEMO: "Anemo",
  ELECTRO: "Electro",
  DENDRO: "Dendro",
  CRYO: "Cryo",
  GEO: "Geo",
  PHYSICAL: "Físico",
};

/** Resistências fora do padrão de 10%, da maior para a menor (o que vale destacar). */
export function notableResistances(resistances: Resistances | null | undefined): [ResistanceKey, number][] {
  return (Object.entries(resistances ?? {}) as [ResistanceKey, number][]).filter(([, v]) => v !== 10).sort((a, b) => b[1] - a[1]);
}
