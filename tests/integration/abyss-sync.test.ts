import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { AbyssEnemy, HpCurve, YattaMonsterDetail } from "@/domain/abyss-enemy";
import { getCurrentCycle, setChallengeHp, toChallengeView, toRulesSnapshot } from "@/server/abyss/service";
import { syncAbyss, syncAbyssCycle, type AbyssSources } from "@/server/abyss/sync";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../support/factories";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const wikitext = readFileSync(new URL("../fixtures/fandom-abyss-2026-10-16.wikitext", import.meta.url), "utf8");
const monsters = Object.values((fixture("yatta-monsters-sample.json") as { data: { items: Record<string, { id: number; name: string; route: string; icon: string }> } }).data.items);
const details = fixture("yatta-monster-details-sample.json") as Record<string, YattaMonsterDetail>;
const curve = (fixture("yatta-monster-curve-sample.json") as { data: HpCurve }).data;

function fakeSources(pages: Record<string, string>, calls = { downloads: 0 }): AbyssSources {
  return {
    fetchCycleWikitext: async (key) => pages[key] ?? null,
    fetchMonsters: async () => monsters,
    fetchMonsterDetail: async (id) => details[id] ?? null,
    fetchHpCurve: async () => curve,
    fetchWikiImages: async (names) => new Map(names.map((n) => [n, `https://static.example/${encodeURIComponent(n)}.png`])),
    downloadImage: async () => {
      calls.downloads++;
      return { contentType: "image/png", data: new Uint8Array([137, 80, 78, 71]) };
    },
  };
}

describe("sincronização do Abismo com a wiki", () => {
  beforeEach(resetDb);

  it("cria o ciclo com o andar 12, nomes em português e imagens", async () => {
    const calls = { downloads: 0 };
    const result = await syncAbyssCycle("2026-10-16", { sources: fakeSources({ "2026-10-16": wikitext }, calls) });
    expect(result.status).toBe("created");
    const cycle = await prisma.abyssCycle.findUniqueOrThrow({ where: { externalKey: "2026-10-16" }, include: { challenges: true } });
    expect(cycle).toMatchObject({ source: "WIKI", nextKey: "2026-11-16" });
    expect(cycle.startsAt.toISOString()).toBe("2026-10-16T09:00:00.000Z");
    expect(cycle.endsAt.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(cycle.challenges).toHaveLength(6);
    const c3b = cycle.challenges.find((c) => c.chamber === 3 && c.half === "SECOND")!;
    expect(c3b).toMatchObject({ floor: 12, enemyLevel: 100, enabled: true, leyLineDisorder: "Todos os membros da equipe recebem 75% de Bônus de Dano Cryo." });
    expect(c3b.enemies).toEqual([
      expect.objectContaining({ name: "Autômato da Fonte Secreta: Dispositivo Supervisor", image: expect.stringContaining("gi.yatta.moe/assets/UI/monster/") }),
    ]);
    // Inimigos sem correspondência na yatta: imagem baixada da wiki e servida pelo próprio app.
    const c1a = cycle.challenges.find((c) => c.chamber === 1 && c.half === "FIRST")!;
    expect((c1a.enemies as { image: string }[])[0]!.image).toMatch(/^\/api\/abyss\/images\//);
    expect(await prisma.abyssImage.count()).toBe(2);
    expect(calls.downloads).toBe(2);
  });

  it("vincula ao ciclo cadastrado à mão no mesmo período e preserva metades desligadas", async () => {
    const manual = await prisma.abyssCycle.create({
      data: {
        name: "Abismo de outubro",
        startsAt: new Date("2026-10-16T04:00:00Z"),
        endsAt: new Date("2026-11-16T04:00:00Z"),
        rules: "Regras do admin",
        challenges: { create: [{ floor: 12, chamber: 2, half: "SECOND", enabled: false }] },
      },
    });
    const calls = { downloads: 0 };
    const sources = fakeSources({ "2026-10-16": wikitext }, calls);
    expect((await syncAbyssCycle("2026-10-16", { sources })).status).toBe("adopted");
    expect((await syncAbyssCycle("2026-10-16", { sources })).status).toBe("updated");
    expect(await prisma.abyssCycle.count()).toBe(1);
    const cycle = await prisma.abyssCycle.findUniqueOrThrow({ where: { id: manual.id }, include: { challenges: true } });
    expect(cycle).toMatchObject({ name: "Abismo de outubro", rules: "Regras do admin", externalKey: "2026-10-16", source: "WIKI" });
    expect(cycle.challenges.find((c) => c.chamber === 2 && c.half === "SECOND")!.enabled).toBe(false);
    expect(calls.downloads).toBe(2); // imagens reaproveitadas na segunda sincronização
  });

  it("wiki sem a página: nada muda", async () => {
    const results = await syncAbyss({ now: new Date("2026-10-20T12:00:00Z"), sources: fakeSources({}) });
    expect(results.map((r) => r.status)).toEqual(["missing", "missing"]);
    expect(await prisma.abyssCycle.count()).toBe(0);
  });

  it("o ciclo sincronizado entra em vigor sozinho na virada e congela inimigos na partida", async () => {
    await syncAbyssCycle("2026-10-16", { sources: fakeSources({ "2026-10-16": wikitext }) });
    expect(await getCurrentCycle(prisma, new Date("2026-10-16T08:59:00Z"))).toBeNull();
    const current = await getCurrentCycle(prisma, new Date("2026-10-16T09:00:00Z"));
    expect(current?.externalKey).toBe("2026-10-16");
    const snapshot = toRulesSnapshot(current!);
    expect(snapshot.challenges).toHaveLength(6);
    expect(snapshot.challenges[0]!.enemies?.length).toBeGreaterThan(0);
    expect(snapshot.challenges.find((c) => c.chamber === 1 && c.half === "SECOND")!.leyLineDisorder).toContain("Cryo");
  });

  it("guarda HP base no nível da câmara, resistências e mecânicas; Battle-Hardened fica sem HP", async () => {
    await syncAbyssCycle("2026-10-16", { sources: fakeSources({ "2026-10-16": wikitext }) });
    const challenges = await prisma.abyssChallenge.findMany();
    const enemiesOf = (chamber: number, half: "FIRST" | "SECOND") => challenges.find((c) => c.chamber === chamber && c.half === half)!.enemies as unknown as AbyssEnemy[];

    const lower = enemiesOf(1, "SECOND");
    expect(lower.map((e) => [e.count, Math.round(e.baseHp!)])).toEqual([
      [1, 454_287],
      [1, 227_143],
      [1, 181_715],
    ]);
    expect(lower[1]!.resistances).toMatchObject({ PYRO: 30, PHYSICAL: 30, CRYO: 10 });
    expect(lower[1]!.mechanics?.[0]).toContain("escudo");
    // Mesmo inimigo, nível 100: HP base da câmara 12-3.
    expect(Math.round(enemiesOf(3, "FIRST")[0]!.baseHp!)).toBe(1_209_028);
    // Variantes do Abismo e inimigos fora da yatta: sem HP (o admin informa).
    expect(enemiesOf(1, "FIRST")[0]).toMatchObject({ baseHp: null, resistances: null, mechanics: [] });
    expect(enemiesOf(2, "SECOND")[0]).toMatchObject({ baseHp: null });
  });

  it("multiplicador e HP manual do admin: valem na tela e na partida e sobrevivem à sincronização", async () => {
    const sources = fakeSources({ "2026-10-16": wikitext });
    await syncAbyssCycle("2026-10-16", { sources });
    const admin = await createUser("abyssadmin", "ADMIN");
    const player = await createUser("abyssplayer");
    const [upper, lower] = await Promise.all([
      prisma.abyssChallenge.findFirstOrThrow({ where: { chamber: 1, half: "FIRST" } }),
      prisma.abyssChallenge.findFirstOrThrow({ where: { chamber: 1, half: "SECOND" } }),
    ]);

    await expect(setChallengeHp(player, lower.id, { hpMultiplier: 4.75, hpOverrides: {} })).rejects.toThrow();
    await expect(setChallengeHp(admin, lower.id, { hpMultiplier: 0, hpOverrides: {} })).rejects.toThrow();
    await setChallengeHp(admin, lower.id, { hpMultiplier: 4.75, hpOverrides: {} });
    await setChallengeHp(admin, upper.id, { hpMultiplier: null, hpOverrides: { "1:Battle-Hardened Chimeric Volkodlak Archer": 5_535_346 } });

    await syncAbyssCycle("2026-10-16", { sources });
    const after = await prisma.abyssChallenge.findMany({ where: { chamber: 1 }, orderBy: { half: "asc" } });
    expect(after.map((c) => c.hpMultiplier)).toEqual([null, 4.75]);

    const view = after.map(toChallengeView);
    expect(view[0]!.enemies!.map((e) => [e.hp, e.hpSource])).toEqual([[5_535_346, "manual"]]);
    expect(view[1]!.enemies!.map((e) => e.hp)).toEqual([2_157_861, 1_078_931, 863_145]);

    const snapshot = toRulesSnapshot((await getCurrentCycle(prisma, new Date("2026-10-20T12:00:00Z")))!);
    const frozen = snapshot.challenges.find((c) => c.chamber === 1 && c.half === "SECOND")!;
    expect(frozen.hpMultiplier).toBe(4.75);
    expect(frozen.enemies!.map((e) => [e.hp, e.hpSource])).toEqual([
      [2_157_861, "abyss"],
      [1_078_931, "abyss"],
      [863_145, "abyss"],
    ]);
    expect(await prisma.adminAuditLog.count({ where: { action: "ABYSS_CHALLENGE_HP_UPDATED" } })).toBe(2);
  });
});
