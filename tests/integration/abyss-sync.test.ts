import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getCurrentCycle, toRulesSnapshot } from "@/server/abyss/service";
import { syncAbyss, syncAbyssCycle, type AbyssSources } from "@/server/abyss/sync";
import { prisma } from "@/server/db";
import { resetDb } from "../support/factories";

const wikitext = readFileSync(new URL("../fixtures/fandom-abyss-2026-10-16.wikitext", import.meta.url), "utf8");
const monsters = Object.values(
  (JSON.parse(readFileSync(new URL("../fixtures/yatta-monsters-sample.json", import.meta.url), "utf8")) as { data: { items: Record<string, { name: string; route: string; icon: string }> } }).data
    .items,
);

function fakeSources(pages: Record<string, string>, calls = { downloads: 0 }): AbyssSources {
  return {
    fetchCycleWikitext: async (key) => pages[key] ?? null,
    fetchMonsters: async () => monsters,
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
});
