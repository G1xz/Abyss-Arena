import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abyssResetAt, cycleKeysAround, parseEnemyList, parseWikiCycle, translateDisorder, translateTarget } from "@/domain/abyss-wiki";
import { matchMonster } from "@/server/abyss/sync";

const wikitext = readFileSync(new URL("../fixtures/fandom-abyss-2026-10-16.wikitext", import.meta.url), "utf8");
const monsters = Object.values(
  (JSON.parse(readFileSync(new URL("../fixtures/yatta-monsters-sample.json", import.meta.url), "utf8")) as { data: { items: Record<string, { name: string; route: string; icon: string }> } }).data
    .items,
);

describe("leitura da página do ciclo na wiki", () => {
  const cycle = parseWikiCycle(wikitext)!;

  it("lê datas e o próximo ciclo", () => {
    expect(cycle).toMatchObject({ start: "2026-10-16", end: "2026-11-15", next: "2026-11-16" });
  });

  it("lê só o andar 12: nível, meta, inimigos por onda e perturbação por metade", () => {
    expect(cycle.floor12.map((c) => c.level)).toEqual([95, 98, 100]);
    const [c1] = cycle.floor12;
    expect(c1!.targetEn).toBe("Remaining challenge time longer than (180/300/420) sec.");
    expect(c1!.halves[0]!.enemies).toEqual([{ nameEn: "Battle-Hardened Chimeric Volkodlak Archer", count: null, wave: 1 }]);
    expect(c1!.halves[1]!.enemies.map((e) => [e.nameEn, e.wave])).toEqual([
      ["Iniquitous Baptist - Caller of Flood, Flame, and Fulmination", 1],
      ["Shadowy Husk: Standard Bearer", 2],
      ["Shadowy Husk: Defender", 2],
    ]);
    expect(c1!.halves[0]!.disorderEn).toEqual(["Characters' Stellar Glimmer reaction DMG increased by 75%."]);
    expect(c1!.halves[1]!.disorderEn).toEqual(["All party members gain a 75% Cryo DMG Bonus."]);
    // Inimigos do andar 11 não vazam para o 12.
    expect(JSON.stringify(cycle.floor12)).not.toContain("Oprichniki");
  });

  it("quantidades, '?' e comentários na lista de inimigos", () => {
    expect(parseEnemyList("Rockfond Rifthound*2; Thundercraven Rifthound*?<!-- x -->// Large Hydro Slime*24")).toEqual([
      { nameEn: "Rockfond Rifthound", count: 2, wave: 1 },
      { nameEn: "Thundercraven Rifthound", count: null, wave: 1 },
      { nameEn: "Large Hydro Slime", count: 24, wave: 2 },
    ]);
  });

  it("página sem andar 12 ou sem data é ignorada", () => {
    expect(parseWikiCycle("{{Abyssal Moon Spire\n|start = 2026-10-16\n}}\n===Floor 11===")).toBeNull();
    expect(parseWikiCycle("texto qualquer")).toBeNull();
  });
});

describe("tradução e datas", () => {
  it("traduz perturbações comuns e identifica o elemento", () => {
    expect(translateDisorder("All party members gain a 75% Cryo DMG Bonus.")).toEqual({
      pt: "Todos os membros da equipe recebem 75% de Bônus de Dano Cryo.",
      elements: ["CRYO"],
    });
    expect(translateDisorder("Characters' Overloaded DMG increased by 200%.").pt).toBe("Dano da reação Sobrecarregado dos personagens aumentado em 200%.");
    expect(translateDisorder("Normal Attack DMG is increased by 40%.").pt).toBe("Dano de Ataque Normal aumentado em 40%.");
    expect(translateDisorder("Something brand new happens.").pt).toBe("Something brand new happens.");
    expect(translateTarget("Remaining challenge time longer than (180/300/420) sec.")).toBe("Tempo restante maior que 180/300/420 s");
  });

  it("virada às 04:00 do servidor América (09:00 UTC) e chaves do ciclo vigente/próximo", () => {
    expect(abyssResetAt("2026-11-16").toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(abyssResetAt("2026-11-16", 8).toISOString()).toBe("2026-11-15T20:00:00.000Z");
    expect(cycleKeysAround(new Date("2026-10-16T08:59:00Z"))).toEqual({ current: "2026-09-16", next: "2026-10-16" });
    expect(cycleKeysAround(new Date("2026-10-16T09:00:00Z"))).toEqual({ current: "2026-10-16", next: "2026-11-16" });
    expect(cycleKeysAround(new Date("2026-12-20T00:00:00Z"))).toEqual({ current: "2026-12-16", next: "2027-01-16" });
  });

  it("casa inimigos da wiki com o catálogo em português", () => {
    expect(matchMonster("Chimeric Winged Lion", monsters)?.name).toBe("Leão Alado Quimérico");
    expect(matchMonster("Iniquitous Baptist - Caller of Flood, Flame, and Fulmination", monsters)?.name).toBe("Batizador Iníquo");
    expect(matchMonster("Battle-Hardened Chimeric Volkodlak Archer", monsters)).toBeNull();
  });
});
