/**
 * Tabela de preços externa (ex.: Abyss Cup, x1 russo): custo absoluto de cada constelação (C0..C6)
 * no orçamento de origem. Ao importar, os custos são escalados para o orçamento atual
 * (500 → 1000 = ×2): C0 vira o custo base e C1..C6 viram os ajustes do personagem.
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

export function scalePriceTable(table: PriceTableSource, targetBudget: number): ScaledPrice[] {
  const factor = targetBudget / table.sourceBudget;
  return table.characters.map((c) => {
    const scaled = c.costs.map((v) => Math.round(v * factor));
    const overrides = Object.fromEntries(scaled.slice(1).map((v, i) => [String(i + 1), v])) as ConstellationOverrides;
    return { slug: c.slug, cost: scaled[0]!, overrides };
  });
}
