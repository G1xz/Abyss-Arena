import { beforeEach, describe, expect, it } from "vitest";
import { scalePriceTable, type PriceTableSource } from "@/domain/price-table";
import { parseOverrides } from "@/domain/pricing";
import { prisma } from "@/server/db";
import { importPriceTableToDraft, loadAbyssCupTable } from "@/server/pricing/import";
import { getActiveUserCosts } from "@/server/decks/service";
import { publishDraft } from "@/server/pricing/service";
import { getSettings, saveSettings } from "@/server/settings";
import { createUser, giveRoster, resetDb, seedWorld } from "../support/factories";

let world: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
});

describe("importação da tabela da Abyss Cup", () => {
  it("leva custos e constelações ao rascunho; só valem depois de publicar", async () => {
    const cup = loadAbyssCupTable();
    const scaled = new Map(scalePriceTable(cup).map((p) => [p.slug, p]));
    const report = await importPriceTableToDraft(world.admin, cup, { justification: "Tabela da Abyss Cup" });
    const inWorld = world.characters.filter((c) => scaled.has(c.slug));
    expect(report.applied).toBe(inWorld.length);
    expect(report.missing.length).toBe(cup.characters.length - inWorld.length); // o mundo de teste tem só 48 personagens

    const draft = await prisma.priceVersion.findFirstOrThrow({ where: { status: "DRAFT" }, include: { prices: true } });
    const sample = inWorld.find((c) => c.rarity === 5 && scaled.get(c.slug)!.cost > 0)!;
    const price = draft.prices.find((p) => p.characterId === sample.id)!;
    expect(price.cost).toBe(scaled.get(sample.slug)!.cost);
    expect(parseOverrides(price.constellationOverrides)).toEqual(scaled.get(sample.slug)!.overrides);
    expect(await prisma.priceChange.count({ where: { priceVersionId: draft.id } })).toBe(inWorld.length);

    // Antes de publicar, a conta do jogador ainda usa a tabela vigente.
    const user = await createUser();
    await giveRoster(user, [sample.id], { constellation: 2, level: 90 });
    expect((await getActiveUserCosts(user.id)).prices.get(sample.id)).not.toBe(scaled.get(sample.slug)!.overrides[2]);

    await publishDraft(world.admin, {});
    expect((await getActiveUserCosts(user.id)).prices.get(sample.id)).toBe(scaled.get(sample.slug)!.overrides[2]);
  });

  it("aceita personagens gratuitos e amplia os limites do custo base quando preciso", async () => {
    const [free, pricey] = world.characters;
    await saveSettings("competitive", { ...(await getSettings("competitive")), minCharacterCost: 10, maxCharacterCost: 400 }, world.admin.id);
    const table: PriceTableSource = {
      source: "teste",
      sourceBudget: 500,
      characters: [
        { slug: free!.slug, name: free!.name, element: free!.element, costs: [0, 0, 0, 0, 0, 0, 1] },
        { slug: pricey!.slug, name: pricey!.name, element: pricey!.element, costs: [450, 450, 460, 470, 480, 490, 500] },
        { slug: "nao-existe", name: "Ninguém", element: "PYRO", costs: [1, 1, 1, 1, 1, 1, 1] },
      ],
    };
    const report = await importPriceTableToDraft(world.admin, table, { justification: "Teste de limites" });
    expect(report).toMatchObject({ applied: 2, missing: ["nao-existe"], bounds: { min: 0, max: 450 } });
    expect(await getSettings("competitive")).toMatchObject({ minCharacterCost: 0, maxCharacterCost: 450 });
    expect(await prisma.adminAuditLog.count({ where: { action: "SETTINGS_COMPETITIVE_UPDATED" } })).toBe(1);

    await publishDraft(world.admin, {});
    const active = await prisma.priceVersion.findFirstOrThrow({ where: { status: "ACTIVE" }, include: { prices: true } });
    expect(active.prices.find((p) => p.characterId === free!.id)).toMatchObject({ cost: 0, constellationOverrides: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1 } });
  });

  it("só administradores importam", async () => {
    const player = await createUser();
    await expect(importPriceTableToDraft(player, loadAbyssCupTable(), { justification: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
