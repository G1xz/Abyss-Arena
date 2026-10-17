import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createDeck, deleteDeck, duplicateDeck, listUserDecks, setDefaultDeck, updateDeck } from "@/server/decks/service";
import {
  getActivePriceVersion,
  publishDraft,
  publishDueScheduledVersions,
  revertDraftPrice,
  setCharacterCompetitive,
  setDraftPrice,
} from "@/server/pricing/service";
import { createUser, createValidDeck, giveRoster, resetDb, seedWorld, TEST_COST } from "../support/factories";

describe("decks", () => {
  let world: Awaited<ReturnType<typeof seedWorld>>;
  beforeEach(async () => {
    await resetDb();
    world = await seedWorld();
  });

  it("valida no servidor e calcula custo", async () => {
    const user = await createUser();
    const deck = await createValidDeck(user, world);
    const [listed] = await listUserDecks(user.id);
    expect(listed!.id).toBe(deck.id);
    expect(listed!.evaluation).toMatchObject({ valid: true, totalCost: 680, remaining: 320, size: 11, minSize: 11 });
    expect(listed!.isDefault).toBe(true); // primeiro deck vira padrão
  });

  it("custo depende da constelação e, nos 5★, do nível 95/100", async () => {
    const user = await createUser();
    const [five1, five2] = world.fiveStars;
    const [four1] = world.fourStars;
    const rest = [...world.fiveStars.slice(2, 4), ...world.fourStars.slice(1, 7)].map((c) => c.id);
    await giveRoster(user, rest);
    await giveRoster(user, [five1!.id], { constellation: 2, level: 90 }); // 100 × 1,30 = 130
    await giveRoster(user, [five2!.id], { constellation: 0, level: 100 }); // 100 × 1,10 = 110
    await giveRoster(user, [four1!.id], { constellation: 6, level: 100 }); // 40 × 2 = 80 (nível não conta em 4★)
    await createDeck(user, { name: "Constelações", characterIds: [five1!.id, five2!.id, four1!.id, ...rest] });
    const [listed] = await listUserDecks(user.id);
    // 130 + 110 + 80 + 2×100 + 6×40
    expect(listed!.evaluation.totalCost).toBe(130 + 110 + 80 + 200 + 240);
  });

  it("rejeita deck acima do orçamento (constelações altas encarecem)", async () => {
    const user = await createUser();
    const fives = world.fiveStars.slice(0, 6).map((c) => c.id);
    const fours = world.fourStars.slice(0, 4).map((c) => c.id);
    await giveRoster(user, fives, { constellation: 6 }); // 6 × 200 = 1200
    await giveRoster(user, fours);
    await expect(createDeck(user, { name: "Caro demais", characterIds: [...fives, ...fours] })).rejects.toMatchObject({ code: "DECK_INVALID" });
    expect(await prisma.deck.count()).toBe(0);
  });

  it("só aceita personagens da conta do jogador", async () => {
    const user = await createUser();
    const ids = [...world.fiveStars.slice(0, 4), ...world.fourStars.slice(0, 7)].map((c) => c.id);
    await giveRoster(user, ids.slice(1));
    await expect(createDeck(user, { name: "Sem o primeiro", characterIds: ids })).rejects.toMatchObject({
      code: "DECK_INVALID",
      message: expect.stringContaining("não estão na sua conta"),
    });
  });

  it("rejeita duplicatas, decks curtos e personagens desabilitados", async () => {
    const user = await createUser();
    const eleven = [...world.fiveStars.slice(0, 4), ...world.fourStars.slice(0, 7)].map((c) => c.id);
    await giveRoster(user, eleven);
    await expect(createDeck(user, { name: "dup", characterIds: [eleven[0]!, ...eleven.slice(0, 10)] })).rejects.toMatchObject({ code: "DECK_INVALID" });
    await expect(createDeck(user, { name: "curto", characterIds: eleven.slice(0, 10) })).rejects.toMatchObject({ code: "DECK_INVALID" });
    await setCharacterCompetitive(world.admin, eleven[0]!, false);
    await expect(createDeck(user, { name: "off", characterIds: eleven })).rejects.toMatchObject({ code: "DECK_INVALID" });
  });

  it("edita, duplica, define padrão e exclui", async () => {
    const user = await createUser();
    const deck = await createValidDeck(user, world);
    const ids = world.fourStars.slice(0, 11).map((c) => c.id);
    await giveRoster(user, ids);
    await updateDeck(user, deck.id, { name: "Só 4★", characterIds: ids });
    const copy = await duplicateDeck(user, deck.id);
    await setDefaultDeck(user, copy.id);
    const list = await listUserDecks(user.id);
    expect(list.map((d) => d.name).sort()).toEqual(["Só 4★", "Só 4★ (cópia)"]);
    expect(list.find((d) => d.isDefault)!.id).toBe(copy.id);
    await deleteDeck(user, deck.id);
    expect(await prisma.deck.count({ where: { userId: user.id } })).toBe(1);
  });

  it("não permite mexer em decks de outro jogador", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const deck = await createValidDeck(owner, world);
    await expect(deleteDeck(intruder, deck.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateDeck(intruder, deck.id, { name: "x", characterIds: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("nova tabela de preços invalida o deck sem excluí-lo e mostra o excesso", async () => {
    const user = await createUser();
    const ids = [...world.fiveStars.slice(0, 9), ...world.fourStars.slice(0, 2)].map((c) => c.id); // 9×100 + 2×40 = 980
    await giveRoster(user, ids);
    const deck = await createDeck(user, { name: "No limite", characterIds: ids });
    await setDraftPrice(world.admin, { characterId: world.fiveStars[0]!.id, cost: 170, justification: "Teste de aumento" });
    // Rascunho ainda não afeta os decks.
    expect((await listUserDecks(user.id))[0]!.evaluation.valid).toBe(true);
    await publishDraft(world.admin, {});
    const [after] = await listUserDecks(user.id);
    expect(after!.id).toBe(deck.id);
    expect(after!.evaluation).toMatchObject({ valid: false, totalCost: 1050, excess: 50 });
  });

  it("subir a constelação na conta também pode invalidar o deck", async () => {
    const user = await createUser();
    const ids = [...world.fiveStars.slice(0, 9), ...world.fourStars.slice(0, 2)].map((c) => c.id);
    await giveRoster(user, ids);
    await createDeck(user, { name: "No limite", characterIds: ids });
    await giveRoster(user, [ids[0]!], { constellation: 1 }); // 100 → 115
    const [after] = await listUserDecks(user.id);
    expect(after!.evaluation.totalCost).toBe(995);
    expect(after!.evaluation.valid).toBe(true);
    await giveRoster(user, [ids[1]!, ids[2]!, ids[3]!], { constellation: 6 }); // +300
    const [over] = await listUserDecks(user.id);
    expect(over!.evaluation.valid).toBe(false);
    expect(over!.evaluation.excess).toBe(295);
  });
});

describe("versionamento de preços", () => {
  let world: Awaited<ReturnType<typeof seedWorld>>;
  beforeEach(async () => {
    await resetDb();
    world = await seedWorld();
  });

  it("alterações ficam no rascunho até a publicação, que cria nova versão e arquiva a anterior", async () => {
    const target = world.fiveStars[0]!;
    await setDraftPrice(world.admin, { characterId: target.id, cost: 120, overrides: { "2": 220 }, justification: "Ajuste manual" });
    const active = await getActivePriceVersion();
    expect(active!.number).toBe(1);
    expect((await prisma.characterPrice.findFirstOrThrow({ where: { priceVersionId: active!.id, characterId: target.id } })).cost).toBe(TEST_COST.five);

    const published = await publishDraft(world.admin, { label: "v2 teste" });
    expect(published).toMatchObject({ status: "ACTIVE", number: 2 });
    expect((await prisma.priceVersion.findUniqueOrThrow({ where: { id: active!.id } })).status).toBe("ARCHIVED");
    const change = await prisma.priceChange.findFirstOrThrow({ where: { priceVersionId: published.id } });
    expect(change).toMatchObject({ previousCost: TEST_COST.five, newCost: 120, newOverrides: { "2": 220 }, source: "MANUAL", justification: "Ajuste manual", adminId: world.admin.id });
    expect(change.effectiveAt).not.toBeNull();
    const price = await prisma.characterPrice.findFirstOrThrow({ where: { priceVersionId: published.id, characterId: target.id } });
    expect(price.constellationOverrides).toEqual({ "2": 220 });
    // Histórico preservado: a v1 continua com o custo original.
    expect((await prisma.characterPrice.findFirstOrThrow({ where: { priceVersionId: active!.id, characterId: target.id } })).cost).toBe(TEST_COST.five);
  });

  it("desfazer alteração do rascunho volta ao preço base", async () => {
    const target = world.fourStars[0]!;
    await setDraftPrice(world.admin, { characterId: target.id, cost: 55, justification: "teste" });
    await revertDraftPrice(world.admin, target.id);
    const draft = await prisma.priceVersion.findFirstOrThrow({ where: { status: "DRAFT" }, include: { prices: true, changes: true } });
    expect(draft.changes).toHaveLength(0);
    expect(draft.prices.find((p) => p.characterId === target.id)!.cost).toBe(TEST_COST.four);
  });

  it("publicação agendada só entra em vigor na data", async () => {
    await setDraftPrice(world.admin, { characterId: world.fourStars[0]!.id, cost: 45, justification: "agendado" });
    const when = new Date(Date.now() + 3600_000);
    const scheduled = await publishDraft(world.admin, { scheduledFor: when.toISOString() });
    expect(scheduled.status).toBe("SCHEDULED");
    expect(await publishDueScheduledVersions(prisma, new Date())).toBeNull();
    expect((await getActivePriceVersion())!.number).toBe(1);
    const published = await publishDueScheduledVersions(prisma, new Date(when.getTime() + 1000));
    expect(published).toMatchObject({ status: "ACTIVE", number: 2 });
  });

  it("rejeita preço fora do intervalo configurado", async () => {
    await expect(setDraftPrice(world.admin, { characterId: world.fourStars[0]!.id, cost: 999, justification: "x".repeat(5) })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("personagem só pode ser liberado com preço publicado", async () => {
    const newcomer = await prisma.character.create({
      data: { slug: "novo-personagem", name: "Novo", element: "PYRO", weaponType: "SWORD", rarity: 5, externalSource: "yatta", externalId: "999" },
    });
    await expect(setCharacterCompetitive(world.admin, newcomer.id, true)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await setDraftPrice(world.admin, { characterId: newcomer.id, cost: 120, justification: "Preço de lançamento" });
    await publishDraft(world.admin, {});
    await setCharacterCompetitive(world.admin, newcomer.id, true);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: newcomer.id } })).competitiveEnabled).toBe(true);
  });
});
