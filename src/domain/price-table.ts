/**
 * Tabela de preços externa (ex.: Abyss Cup, x1 russo): custo absoluto de cada constelação (C0..C6).
 * Ao importar, C0 vira o custo base e C1..C6 viram os ajustes do personagem. Os valores entram como
 * estão na planilha (fator 1): com o nosso orçamento de 1000, sobra o dobro da folga do formato
 * original (500). Um fator diferente pode ser passado para reescalar.
 */
import type { ConstellationOverrides } from "./pricing";

export interface PriceTableSource {
  source: string;
  sourceBudget: number;
  characters: { slug: string; name: string; element: string; costs: number[] }[];
}

export interface ScaledPrice {
  slug: string;
  cost: number;
  overrides: ConstellationOverrides;
}

/** Fator aplicado à tabela inicial: valores da planilha, sem conversão. */
export const INITIAL_TABLE_SCALE = 1;

export function validatePriceTable(table: PriceTableSource): string[] {
  const errors: string[] = [];
  if (!(table.sourceBudget > 0)) errors.push("Orçamento de origem inválido.");
  const seen = new Set<string>();
  for (const c of table.characters) {
    if (seen.has(c.slug)) errors.push(`${c.name}: repetido na tabela.`);
    seen.add(c.slug);
    if (c.costs.length !== 7 || c.costs.some((v) => !Number.isInteger(v) || v < 0)) errors.push(`${c.name}: informe 7 custos inteiros (C0..C6) a partir de 0.`);
  }
  return errors;
}

export function scalePriceTable(table: PriceTableSource, factor = INITIAL_TABLE_SCALE): ScaledPrice[] {
  return table.characters.map((c) => {
    const scaled = c.costs.map((v) => Math.round(v * factor));
    const overrides = Object.fromEntries(scaled.slice(1).map((v, i) => [String(i + 1), v])) as ConstellationOverrides;
    return { slug: c.slug, cost: scaled[0]!, overrides };
  });
}
