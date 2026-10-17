import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scalePriceTable, validatePriceTable, type PriceTableSource } from "@/domain/price-table";
import { DEFAULT_COST_RULES, effectiveCost } from "@/domain/pricing";

const cup = JSON.parse(readFileSync(new URL("../../prisma/data/abyss-cup-prices.json", import.meta.url), "utf8")) as PriceTableSource & {
  skipped: { name: string }[];
};

describe("tabela da Abyss Cup", () => {
  it("arquivo de dados válido: 127 personagens, orçamento 500, sem variantes nem custo 999", () => {
    expect(validatePriceTable(cup)).toEqual([]);
    expect(cup.sourceBudget).toBe(500);
    expect(cup.characters).toHaveLength(127);
    expect(cup.characters.some((c) => c.costs.includes(999))).toBe(false);
    expect(cup.skipped.map((s) => s.name).sort()).toEqual(["No name 1", "No name 2", "Raiden Shogun (Bloom)", "Sandrone (LGBT)"]);
  });

  it("valores da planilha: C0 vira o custo base e C1..C6 viram ajustes", () => {
    const mavuika = scalePriceTable(cup).find((p) => p.slug === "mavuika")!;
    expect(mavuika).toEqual({ slug: "mavuika", cost: 58, overrides: { 1: 65, 2: 95, 3: 105, 4: 113, 5: 123, 6: 185 } });
    // Custo efetivo: constelação pela tabela; nível 95/100 continua somando % nos 5★.
    const at = (constellation: number, level = 90) => effectiveCost({ baseCost: mavuika.cost, rarity: 5, constellation, level, overrides: mavuika.overrides }, DEFAULT_COST_RULES);
    expect(at(0)).toBe(58);
    expect(at(2)).toBe(95);
    expect(at(6, 100)).toBe(204);
  });

  it("personagens gratuitos continuam com custo 0", () => {
    const sucrose = scalePriceTable(cup).find((p) => p.slug === "sucrose")!;
    expect(sucrose.cost).toBe(0);
    expect(Object.values(sucrose.overrides).every((v) => v === 0)).toBe(true);
    expect(effectiveCost({ baseCost: 0, rarity: 4, constellation: 6, level: 90, overrides: sucrose.overrides }, DEFAULT_COST_RULES)).toBe(0);
  });

  it("reescala por um fator, se pedido, e recusa tabelas inválidas", () => {
    const table: PriceTableSource = { source: "teste", sourceBudget: 500, characters: [{ slug: "x", name: "X", element: "PYRO", costs: [3, 3, 3, 3, 3, 3, 5] }] };
    expect(scalePriceTable(table)[0]).toMatchObject({ cost: 3, overrides: { 6: 5 } });
    expect(scalePriceTable(table, 1.5)[0]).toMatchObject({ cost: 5, overrides: { 6: 8 } });
    expect(validatePriceTable({ ...table, characters: [{ ...table.characters[0]!, costs: [1, 2] }] })).toHaveLength(1);
    expect(validatePriceTable({ ...table, characters: [table.characters[0]!, table.characters[0]!] })).toEqual(["X: repetido na tabela."]);
  });
});
