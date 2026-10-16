import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { constellationTable, DEFAULT_COST_RULES, effectiveCost } from "@/domain/pricing";
import { parseRosterText } from "@/domain/roster-import";

const snapshot = JSON.parse(readFileSync(new URL("../../prisma/data/characters-snapshot.json", import.meta.url), "utf8")) as {
  characters: { slug: string; name: string }[];
};
const catalog = snapshot.characters.map((c) => ({ id: c.slug, name: c.name, slug: c.slug }));
const sample = readFileSync(new URL("../fixtures/hoyolab-roster-pt.txt", import.meta.url), "utf8");

describe("importação da lista do HoYoLAB (Ctrl+A / Ctrl+C)", () => {
  const result = parseRosterText(sample, catalog);
  const byName = new Map(result.entries.map((e) => [e.name, e]));

  it("lê nível e constelação de cada personagem", () => {
    expect(byName.get("Furina")).toMatchObject({ level: 95, constellation: 6, characterIds: ["furina"] });
    expect(byName.get("Nilou")).toMatchObject({ level: 90, constellation: 2 });
    expect(byName.get("Xingqiu")).toMatchObject({ level: 80, constellation: 6 });
    expect(byName.get("Yaoyao")).toMatchObject({ level: 20, constellation: 1 });
  });

  it("sem linha de constelação = C0", () => {
    expect(byName.get("Odette")).toMatchObject({ level: 90, constellation: 0 });
    expect(byName.get("Shogun Raiden")).toMatchObject({ constellation: 0, characterIds: ["raiden-shogun"] });
  });

  it("Viajante vira as variantes por elemento; Manequins e números soltos são ignorados", () => {
    const traveler = byName.get("Viajante")!;
    expect(traveler.constellation).toBe(4);
    expect(traveler.characterIds.length).toBe(7);
    expect(traveler.characterIds.every((id) => id.startsWith("traveler-"))).toBe(true);
    expect(result.ignored.sort()).toEqual(["Manequim", "Manequina"]);
    expect(result.unknown).toEqual([]);
    expect(result.entries).toHaveLength(17);
  });

  it("aceita o formato em inglês (Lv. / C2) e reporta nomes desconhecidos", () => {
    const en = parseRosterText("Lv. 90\nC2\nRaiden Shogun\n\nLv.80\nPersonagem Inventado\n\nLv.70\nKaedehara Kazuha", catalog);
    expect(en.entries.map((e) => [e.characterIds[0], e.constellation, e.level])).toEqual([
      ["raiden-shogun", 2, 90],
      ["kaedehara-kazuha", 0, 70],
    ]);
    expect(en.unknown).toEqual([{ name: "Personagem Inventado", level: 80, constellation: 0 }]);
  });

  it("texto sem personagens não gera entradas", () => {
    expect(parseRosterText("Novos Personagens\nFiltrar\n11", catalog).entries).toEqual([]);
  });
});

describe("custo efetivo (constelação e nível)", () => {
  const rules = DEFAULT_COST_RULES;

  it("constelação segue a curva sobre o custo base", () => {
    expect(constellationTable(100, 5, null, rules)).toEqual([100, 115, 130, 140, 150, 160, 200]);
    expect(constellationTable(40, 4, null, rules)).toEqual([40, 46, 52, 56, 60, 64, 80]);
  });

  it("ajuste do admin substitui a curva só na constelação ajustada", () => {
    expect(constellationTable(100, 5, { "2": 220 }, rules)).toEqual([100, 115, 220, 140, 150, 160, 200]);
  });

  it("nível 95 e 100 encarecem apenas 5★", () => {
    expect(effectiveCost({ baseCost: 100, rarity: 5, constellation: 0, level: 90 }, rules)).toBe(100);
    expect(effectiveCost({ baseCost: 100, rarity: 5, constellation: 0, level: 95 }, rules)).toBe(105);
    expect(effectiveCost({ baseCost: 100, rarity: 5, constellation: 6, level: 100 }, rules)).toBe(220);
    expect(effectiveCost({ baseCost: 40, rarity: 4, constellation: 6, level: 100 }, rules)).toBe(80);
    expect(effectiveCost({ baseCost: 40, rarity: 4, constellation: 0, level: 20 }, rules)).toBe(40);
  });

  it("bônus de nível incide também sobre ajustes do admin", () => {
    expect(effectiveCost({ baseCost: 100, rarity: 5, constellation: 2, level: 95, overrides: { "2": 220 } }, rules)).toBe(231);
  });
});
