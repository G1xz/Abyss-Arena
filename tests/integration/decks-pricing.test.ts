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
import { createUser, createValidDeck, resetDb, seedWorld } from "../support/factories";

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
    expect(listed!.evaluation).toMatchObject({ valid: true, totalCost: 76, remaining: 24 });
    expect(listed!.isDefault).toBe(true); // primeiro deck vira padrão
  });

  it("rejeita deck acima do orçamento", async () => {
    const user = await createUser();
    const sixFive = world.fiveStars.slice(0, 6).map((c) => c.id); // 6 × 18 = 108
    await expect(createDeck(user, { name: "Caro demais", characterIds: sixFive })).rejects.toMatchObject({ code: "DECK_INVALID" });
    expect(await prisma.deck.count()).toBe(0);
  });

  it("rejeita duplicatas, decks curtos e personagens desabilitados", async () => {
    const user = await createUser();
    const [a, b, c, d, e] = world.fourStars;
    await expect(createDeck(user, { name: "dup", characterIds: [a!.id, a!.id, b!.id, c!.id, d!.id, e!.id] })).rejects.toMatchObject({ code: "DECK_INVALID" });
    await expect(createDeck(user, { name: "curto", characterIds: [a!.id, b!.id] })).rejects.toMatchObject({ code: "DECK_INVALID" });
    const admin = world.admin;
    await setCharacterCompetitive(admin, a!.id, false);
    await expect(createDeck(user, { name: "off", characterIds: [a!.id, b!.id, c!.id, d!.id, e!.id, world.fiveStars[0]!.id] })).rejects.toMatchObject({
      code: "DECK_INVALID",
    });
  });

  it("edita, duplica, define padrão e exclui", async () => {
    const user = await createUser();
    const deck = await createValidDeck(user, world);
    const ids = [...world.fourStars.slice(0, 6)].map((c) => c.id);
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
    const ids = [...world.fiveStars.slice(0, 4), ...world.fourStars.slice(0, 2)].map((c) => c.id); // 4×18 + 2×10 = 92
    const deck = await createDeck(user, { name: "No limite", characterIds: ids });
    await setDraftPrice(world.admin, { characterId: world.fiveStars[0]!.id, cost: 30, justification: "Teste de aumento" });
    // Rascunho ainda não afeta os decks.
    expect((await listUserDecks(user.id))[0]!.evaluation.valid).toBe(true);
    await publishDraft(world.admin, {});
    const [after] = await listUserDecks(user.id);
    expect(after!.id).toBe(deck.id);
    expect(after!.evaluation).toMatchObject({ valid: false, totalCost: 104, excess: 4 });
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
    await setDraftPrice(world.admin, { characterId: target.id, cost: 20, justification: "Ajuste manual" });
    const active = await getActivePriceVersion();
    expect(active!.number).toBe(1);
    expect((await prisma.characterPrice.findFirstOrThrow({ where: { priceVersionId: active!.id, characterId: target.id } })).cost).toBe(18);

    const published = await publishDraft(world.admin, { label: "v2 teste" });
    expect(published).toMatchObject({ status: "ACTIVE", number: 2 });
    expect((await prisma.priceVersion.findUniqueOrThrow({ where: { id: active!.id } })).status).toBe("ARCHIVED");
    const change = await prisma.priceChange.findFirstOrThrow({ where: { priceVersionId: published.id } });
    expect(change).toMatchObject({ previousCost: 18, newCost: 20, source: "MANUAL", justification: "Ajuste manual", adminId: world.admin.id });
    expect(change.effectiveAt).not.toBeNull();
    // Histórico preservado: a v1 continua com o custo original.
    expect((await prisma.characterPrice.findFirstOrThrow({ where: { priceVersionId: active!.id, characterId: target.id } })).cost).toBe(18);
  });

  it("desfazer alteração do rascunho volta ao preço base", async () => {
    const target = world.fourStars[0]!;
    await setDraftPrice(world.admin, { characterId: target.id, cost: 12, justification: "teste" });
    await revertDraftPrice(world.admin, target.id);
    const draft = await prisma.priceVersion.findFirstOrThrow({ where: { status: "DRAFT" }, include: { prices: true, changes: true } });
    expect(draft.changes).toHaveLength(0);
    expect(draft.prices.find((p) => p.characterId === target.id)!.cost).toBe(10);
  });

  it("publicação agendada só entra em vigor na data", async () => {
    await setDraftPrice(world.admin, { characterId: world.fourStars[0]!.id, cost: 11, justification: "agendado" });
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
    await setDraftPrice(world.admin, { characterId: newcomer.id, cost: 20, justification: "Preço de lançamento" });
    await publishDraft(world.admin, {});
    await setCharacterCompetitive(world.admin, newcomer.id, true);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: newcomer.id } })).competitiveEnabled).toBe(true);
  });
});
