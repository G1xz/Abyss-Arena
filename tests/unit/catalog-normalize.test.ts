import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slugify } from "@/domain/catalog";
import { normalizeJmpCharacter } from "@/server/catalog/jmp";
import { normalizeYattaPayload } from "@/server/catalog/yatta";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/yatta-avatar-pt.json", import.meta.url), "utf8"));
const NOW = new Date("2026-10-16T12:00:00Z");

describe("normalização do catálogo (yatta)", () => {
  const { characters, skipped } = normalizeYattaPayload(fixture, NOW);

  it("importa personagens jogáveis com campos normalizados", () => {
    expect(characters.length).toBeGreaterThan(100);
    const ayaka = characters.find((c) => c.slug === "kamisato-ayaka")!;
    expect(ayaka).toMatchObject({
      name: "Kamisato Ayaka",
      element: "CRYO",
      weaponType: "SWORD",
      rarity: 5,
      externalId: "10000002",
      iconUrl: "https://gi.yatta.moe/assets/UI/UI_AvatarIcon_Ayaka.png",
    });
    for (const c of characters) {
      expect(["PYRO", "HYDRO", "ANEMO", "ELECTRO", "DENDRO", "CRYO", "GEO"]).toContain(c.element);
      expect([4, 5]).toContain(c.rarity);
    }
  });

  it("consolida as variantes do Viajante em uma por elemento", () => {
    const travelers = characters.filter((c) => c.slug.startsWith("traveler-"));
    expect(travelers.map((t) => t.slug).sort()).toEqual([
      "traveler-anemo",
      "traveler-cryo",
      "traveler-dendro",
      "traveler-electro",
      "traveler-geo",
      "traveler-hydro",
      "traveler-pyro",
    ]);
    expect(travelers.find((t) => t.slug === "traveler-geo")!.name).toBe("Viajante (Geo)");
    expect(skipped.filter((s) => s.reason.startsWith("duplicata de traveler"))).toHaveLength(7);
  });

  it("exclui não jogáveis (sem elemento) e não gera duplicatas", () => {
    expect(characters.some((c) => /manequi/i.test(c.name))).toBe(false);
    expect(skipped.some((s) => s.reason.includes("sem elemento"))).toBe(true);
    const slugs = characters.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("exclui personagens ainda não lançados e versões beta", () => {
    const payload = structuredClone(fixture);
    payload.data.items["99999991"] = { id: 99999991, rank: 5, name: "Futuro", element: "Fire", weaponType: "WEAPON_BOW", release: NOW.getTime() / 1000 + 86400, route: "Future" };
    payload.data.items["99999992"] = { id: 99999992, rank: 4, name: "Beta", element: "Fire", weaponType: "WEAPON_BOW", release: 1600000000, route: "Beta Char", beta: true };
    const result = normalizeYattaPayload(payload, NOW);
    expect(result.characters.some((c) => c.slug === "future" || c.slug === "beta-char")).toBe(false);
    expect(result.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "não lançado" }), expect.objectContaining({ reason: "versão beta" })]));
  });

  it("rejeita resposta com formato inesperado", () => {
    expect(() => normalizeYattaPayload({ foo: 1 }, NOW)).toThrow();
  });
});

describe("normalização do catálogo (jmp)", () => {
  it("mapeia campos e usa o mesmo slug canônico da fonte primária", () => {
    const result = normalizeJmpCharacter("ayaka", { name: "Kamisato Ayaka", vision: "Cryo", weapon: "Sword", rarity: 5, release: "2021-07-21" }, NOW);
    expect(result).toMatchObject({ slug: "kamisato-ayaka", element: "CRYO", weaponType: "SWORD", rarity: 5, externalId: "ayaka" });
  });

  it("mantém o slug do Viajante e descarta entradas sem visão", () => {
    expect(normalizeJmpCharacter("traveler-geo", { name: "Traveler", vision: "Geo", weapon: "Sword", rarity: 5, release: "2020-09-28" }, NOW)).toMatchObject({
      slug: "traveler-geo",
    });
    expect(normalizeJmpCharacter("x", { name: "X", weapon: "Sword", rarity: 4 }, NOW)).toEqual({ skip: "sem elemento (não jogável)" });
  });

  it("slugify remove acentos e pontuação", () => {
    expect(slugify("Shogun Raiden")).toBe("shogun-raiden");
    expect(slugify("Hu Tao")).toBe("hu-tao");
    expect(slugify("Kaedehara Kazuha")).toBe("kaedehara-kazuha");
    expect(slugify("Lan'yan")).toBe("lanyan");
    expect(slugify("Ação")).toBe("acao");
  });
});
