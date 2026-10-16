import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { cancelInvite, challengePlayer, inviteToRoom, listInvites, respondInvite, searchPlayers } from "@/server/invites/service";
import { cancelRoom } from "@/server/matches/service";
import { getRoster, importRoster, saveRosterChanges } from "@/server/roster/service";
import { createUser, createValidDeck, resetDb, seedWorld, snapshotCharacters } from "../support/factories";

const sample = readFileSync(new URL("../fixtures/hoyolab-roster-pt.txt", import.meta.url), "utf8");

describe("Meus personagens: importação", () => {
  beforeEach(async () => {
    await resetDb();
    // Catálogo completo para o texto colado bater com os nomes.
    await prisma.character.createMany({
      data: snapshotCharacters().map((c) => ({
        slug: c.slug,
        name: c.name,
        element: c.element,
        weaponType: c.weaponType,
        rarity: c.rarity,
        externalSource: "yatta",
        externalId: c.externalId,
        competitiveEnabled: true,
      })),
    });
  });

  it("importa nível e constelação do texto colado", async () => {
    const user = await createUser();
    const report = await importRoster(user, { text: sample, mode: "replace" });
    expect(report.created).toBe(16 + 7); // 16 personagens + 7 variantes do Viajante
    const roster = await getRoster(user.id);
    const furina = roster.find((o) => o.character.slug === "furina")!;
    expect(furina).toMatchObject({ constellation: 6, level: 95 });
    expect(roster.filter((o) => o.character.slug.startsWith("traveler-")).every((o) => o.constellation === 4)).toBe(true);
  });

  it("substituir remove quem saiu da lista; mesclar mantém", async () => {
    const user = await createUser();
    await importRoster(user, { text: sample, mode: "replace" });
    const merged = await importRoster(user, { text: "Nv.100\n3\nFurina", mode: "merge" });
    expect(merged).toMatchObject({ created: 0, updated: 1, removed: 0 });
    expect(await prisma.ownedCharacter.count({ where: { userId: user.id } })).toBe(23);
    const replaced = await importRoster(user, { text: "Nv.100\n3\nFurina", mode: "replace" });
    expect(replaced.removed).toBe(22);
    const roster = await getRoster(user.id);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ constellation: 3, level: 100 });
  });

  it("edição manual em lote: adiciona, altera constelação/nível e remove", async () => {
    const user = await createUser();
    await importRoster(user, { text: "Nv.90\nFurina\n\nNv.80\n6\nBennett", mode: "replace" });
    const ids = Object.fromEntries((await prisma.character.findMany({ where: { slug: { in: ["furina", "bennett", "nahida"] } } })).map((c) => [c.slug, c.id]));
    const result = await saveRosterChanges(user, {
      upserts: [
        { characterId: ids.furina, constellation: 2, level: 100 },
        { characterId: ids.nahida, constellation: 0, level: 90 },
      ],
      removals: [ids.bennett],
    });
    expect(result).toEqual({ saved: 2, removed: 1 });
    const roster = await getRoster(user.id);
    expect(roster.map((o) => [o.character.slug, o.constellation, o.level]).sort()).toEqual([
      ["furina", 2, 100],
      ["nahida", 0, 90],
    ]);
    await expect(saveRosterChanges(user, { upserts: [{ characterId: ids.furina, constellation: 7, level: 90 }], removals: [] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(saveRosterChanges(user, { upserts: [], removals: ["inexistente"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejeita texto sem personagens reconhecidos", async () => {
    const user = await createUser();
    await expect(importRoster(user, { text: "nada aqui" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("convites diretos", () => {
  let world: Awaited<ReturnType<typeof seedWorld>>;
  beforeEach(async () => {
    await resetDb();
    world = await seedWorld();
  });

  it("desafiar cria a sala e o convite; aceitar coloca o convidado no assento B", async () => {
    const a = await createUser("Alpha");
    const b = await createUser("Bravo");
    const deck = await createValidDeck(a, world);
    await createValidDeck(b, world, 1);
    const { match, invite } = await challengePlayer(a, { opponentId: b.id, deckId: deck.id });
    expect(invite).toMatchObject({ status: "PENDING", from: { nickname: "Alpha" }, to: { nickname: "Bravo" }, code: match.code });
    expect((await listInvites(b.id)).received).toHaveLength(1);
    expect((await listInvites(a.id)).sent).toHaveLength(1);

    const outsider = await createUser();
    await expect(respondInvite(outsider, invite.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const accepted = await respondInvite(b, invite.id, true);
    expect(accepted.status).toBe("ACCEPTED");
    const seats = await prisma.matchPlayer.findMany({ where: { matchId: match.id }, orderBy: { seat: "asc" } });
    expect(seats.map((s) => [s.seat, s.userId])).toEqual([
      ["A", a.id],
      ["B", b.id],
    ]);
    expect(seats[1]!.deckId).not.toBeNull(); // deck padrão selecionado automaticamente
    await expect(respondInvite(b, invite.id, true)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("recusa, novo convite, cancelamento e convite pendente único", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const { match, invite } = await challengePlayer(a, { opponentId: b.id });
    await expect(inviteToRoom(a, match.id, { opponentId: c.id })).rejects.toMatchObject({ code: "CONFLICT" });
    await respondInvite(b, invite.id, false);
    expect((await prisma.matchInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe("DECLINED");

    const second = await inviteToRoom(a, match.id, { opponentId: c.id });
    await expect(cancelInvite(b, second.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelInvite(a, second.id);
    await expect(respondInvite(c, second.id, true)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(inviteToRoom(b, match.id, { opponentId: c.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("convites expiram e são cancelados junto com a sala", async () => {
    const a = await createUser();
    const b = await createUser();
    const { match, invite } = await challengePlayer(a, { opponentId: b.id });
    await prisma.matchInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(respondInvite(b, invite.id, true)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect((await prisma.matchInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe("EXPIRED");

    const again = await inviteToRoom(a, match.id, { opponentId: b.id });
    await cancelRoom(a, match.id);
    expect((await prisma.matchInvite.findUniqueOrThrow({ where: { id: again.id } })).status).toBe("CANCELLED");
  });

  it("não é possível desafiar a si mesmo; busca por nickname exclui o próprio usuário", async () => {
    const a = await createUser("Alpha");
    await createUser("Alphonse");
    await expect(challengePlayer(a, { opponentId: a.id })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await searchPlayers(a, "alph")).map((p) => p.nickname)).toEqual(["Alphonse"]);
    expect(await searchPlayers(a, "a")).toEqual([]);
  });
});
