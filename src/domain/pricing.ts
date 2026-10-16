/**
 * Custo efetivo de um personagem na conta de um jogador.
 *
 *   custo(C) = ajuste do admin para C   ou   round(base × (1 + curva[raridade][C] / 100))
 *   5★: × (1 + bônus de nível / 100) para nível 95 e 100. 4★: o nível não altera o custo.
 *
 * A tabela de preços guarda só o custo base (C0) e eventuais ajustes por constelação.
 */

export const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const;

export interface CostRules {
  /** Percentual somado ao custo base em cada constelação (índice 0..6). */
  constellationCurve: { fourStar: number[]; fiveStar: number[] };
  /** Percentual somado ao custo de 5★ nos níveis 95 e 100. */
  levelBonus: { level95: number; level100: number };
}

export const DEFAULT_COST_RULES: CostRules = {
  constellationCurve: {
    fourStar: [0, 15, 30, 40, 50, 60, 100],
    fiveStar: [0, 15, 30, 40, 50, 60, 100],
  },
  levelBonus: { level95: 5, level100: 10 },
};

/** Ajustes absolutos por constelação: { "2": 220 }. C0 é sempre o custo base. */
export type ConstellationOverrides = Partial<Record<"1" | "2" | "3" | "4" | "5" | "6", number>>;

export function parseOverrides(value: unknown): ConstellationOverrides {
  if (!value || typeof value !== "object") return {};
  const out: ConstellationOverrides = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^[1-6]$/.test(k) && typeof v === "number" && Number.isInteger(v) && v > 0) out[k as keyof ConstellationOverrides] = v;
  }
  return out;
}

export function constellationCost(baseCost: number, rarity: number, constellation: number, overrides: ConstellationOverrides | null | undefined, rules: CostRules): number {
  const c = Math.min(6, Math.max(0, Math.trunc(constellation)));
  const override = c > 0 ? overrides?.[String(c) as keyof ConstellationOverrides] : undefined;
  if (override !== undefined) return override;
  const curve = rarity === 5 ? rules.constellationCurve.fiveStar : rules.constellationCurve.fourStar;
  return Math.round(baseCost * (1 + (curve[c] ?? 0) / 100));
}

export function levelBonusPercent(rarity: number, level: number, rules: CostRules): number {
  if (rarity !== 5) return 0;
  if (level >= 100) return rules.levelBonus.level100;
  if (level >= 95) return rules.levelBonus.level95;
  return 0;
}

export function effectiveCost(
  input: { baseCost: number; rarity: number; constellation: number; level: number; overrides?: ConstellationOverrides | null },
  rules: CostRules,
): number {
  const byConstellation = constellationCost(input.baseCost, input.rarity, input.constellation, input.overrides, rules);
  const bonus = levelBonusPercent(input.rarity, input.level, rules);
  return bonus ? Math.round(byConstellation * (1 + bonus / 100)) : byConstellation;
}

/** Custos de C0 a C6 (sem bônus de nível), para exibição no painel. */
export function constellationTable(baseCost: number, rarity: number, overrides: ConstellationOverrides | null | undefined, rules: CostRules): number[] {
  return CONSTELLATIONS.map((c) => constellationCost(baseCost, rarity, c, overrides, rules));
}
