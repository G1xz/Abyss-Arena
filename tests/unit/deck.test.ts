import { describe, expect, it } from "vitest";
import { evaluateDeck } from "@/domain/deck";

const prices = new Map([
  ["a", 18],
  ["b", 18],
  ["c", 10],
  ["d", 10],
  ["e", 10],
  ["f", 10],
  ["g", 25],
  ["h", 30],
]);
const rules = { budget: 100, minSize: 6 };

describe("cálculo de pontos dos decks", () => {
  it("soma os custos e calcula o orçamento restante", () => {
    const r = evaluateDeck(["a", "b", "c", "d", "e", "f"], prices, rules);
    expect(r).toMatchObject({ valid: true, totalCost: 76, remaining: 24, excess: 0, size: 6 });
  });

  it("rejeita deck acima do orçamento e informa o excesso", () => {
    const r = evaluateDeck(["a", "b", "c", "d", "g", "h"], prices, rules);
    expect(r.valid).toBe(false);
    expect(r.totalCost).toBe(111);
    expect(r.excess).toBe(11);
    expect(r.issues.map((i) => i.code)).toContain("OVER_BUDGET");
  });

  it("aceita deck exatamente no limite", () => {
    const r = evaluateDeck(["a", "b", "c", "d", "e", "h"], new Map([...prices, ["h", 34]]), rules);
    expect(r.totalCost).toBe(100);
    expect(r.valid).toBe(true);
  });

  it("não permite o mesmo personagem duas vezes", () => {
    const r = evaluateDeck(["a", "a", "c", "d", "e", "f"], prices, rules);
    expect(r.issues.map((i) => i.code)).toContain("DUPLICATE");
    expect(r.totalCost).toBe(58); // duplicata não é cobrada duas vezes
  });

  it("exige personagens suficientes para o formato", () => {
    const r = evaluateDeck(["a", "c", "d"], prices, rules);
    expect(r.issues.map((i) => i.code)).toEqual(["TOO_FEW"]);
  });

  it("aponta personagens indisponíveis (sem preço ou desabilitados)", () => {
    const r = evaluateDeck(["a", "b", "c", "d", "e", "zz"], prices, rules);
    expect(r.issues.find((i) => i.code === "UNAVAILABLE")?.characterIds).toEqual(["zz"]);
  });

  it("um deck válido fica inválido quando uma nova tabela aumenta os preços", () => {
    const deck = ["a", "b", "c", "d", "e", "f", "g"]; // 101 com g=25 -> inválido; ajustando para 90 com g=14
    expect(evaluateDeck(deck, new Map([...prices, ["g", 14]]), rules).valid).toBe(true);
    const after = evaluateDeck(deck, new Map([...prices, ["g", 14], ["a", 30]]), rules);
    expect(after.valid).toBe(false);
    expect(after.excess).toBe(2);
  });
});
