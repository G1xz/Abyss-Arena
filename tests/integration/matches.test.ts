import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { confirmOpponentResult, disputeOpponentResult, resolveDispute, submitResult } from "@/server/matches/results";
import { cancelRoom, createRoom, joinRoom, leaveRoom, performDraftAction, selectDeck, setReady, startDraft } from "@/server/matches/service";
import { getMatchView } from "@/server/matches/view";
import { publishDraft, setDraftPrice } from "@/server/pricing/service";
import { getRanking } from "@/server/stats/service";
import { completeDraft, createUser, createValidDeck, playCompletedMatch, resetDb, seedWorld, startedMatch } from "../support/factories";

let world: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb();
  world = await seedWorld();
});

describe("salas", () => {
  it("fluxo de sala: criar, entrar, selecionar deck, prontidão e início", async () => {
    const a = await createUser();
    const b = await createUser();
    const deckA = await createValidDeck(a, world);
    const deckB = await createValidDeck(b, world, 1);
    const room = await createRoom(a, {});
    expect(room.status).toBe("WAITING");
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);

    await joinRoom(b, room.code.toLowerCase());
    await joinRoom(b, room.code); // idempotente
    await selectDeck(a, room.id, deckA.id);
    await selectDeck(b, room.id, deckB.id);
    await expect(startDraft(a, room.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await setReady(a, room.id, true);
    await setReady(b, room.id, true);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: room.id } })).status).toBe("READY");
    await expect(startDraft(b, room.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await startDraft(a, room.id);

    const view = await getMatchView(room.id, a);
    expect(view.status).toBe("BANNING");
    expect(view.draft!.decks.A).toHaveLength(10);
    expect(view.viewerSeat).toBe("A");
    expect(view.events.map((e) => e.type)).toEqual(expect.arrayContaining(["ROOM_CREATED", "PLAYER_JOINED", "DRAFT_STARTED"]));
  });

  it("bloqueia entrada de terceiros, auto-partida e sala cheia", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const room = await createRoom(a, {});
    await joinRoom(b, room.code);
    await expect(joinRoom(c, room.code)).rejects.toMatchObject({ code: "CONFLICT" });
    const again = await joinRoom(a, room.code); // anfitrião não ocupa o assento B
    expect((await prisma.matchPlayer.count({ where: { matchId: again.id } }))).toBe(2);
    await expect(setReady(c, room.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("anfitrião cancela antes do início; convidado pode sair", async () => {
    const a = await createUser();
    const b = await createUser();
    const room = await createRoom(a, {});
    await joinRoom(b, room.code);
    await leaveRoom(b, room.id);
    expect(await prisma.matchPlayer.count({ where: { matchId: room.id } })).toBe(1);
    await expect(cancelRoom(b, room.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await cancelRoom(a, room.id);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: room.id } })).status).toBe("CANCELLED");
  });

  it("não aceita deck inválido nem troca de deck após o início", async () => {
    const m = await startedMatch(world);
    await expect(selectDeck(m.a, m.matchId, m.deckA.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("motor de draft no servidor", () => {
  it("rejeita ações fora do turno e ilegais", async () => {
    const m = await startedMatch(world);
    const view = await getMatchView(m.matchId, m.a);
    const target = view.draft!.decks.B[0]!.characterId;
    await expect(performDraftAction(m.b, m.matchId, { stepIndex: 0, characterId: view.draft!.decks.A[0]!.characterId })).rejects.toMatchObject({
      code: "NOT_YOUR_TURN",
    });
    await expect(performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: view.draft!.decks.A[0]!.characterId })).rejects.toMatchObject({
      code: "ILLEGAL_ACTION",
    });
    await expect(performDraftAction(m.a, m.matchId, { stepIndex: 3, characterId: target })).rejects.toMatchObject({ code: "STALE_ACTION" });
    const outsider = await createUser();
    await expect(performDraftAction(outsider, m.matchId, { stepIndex: 0, characterId: target })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: target });
    // Repetição da mesma ação (ex.: duplo clique ou reenvio) é rejeitada.
    await expect(performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: target })).rejects.toMatchObject({ code: "STALE_ACTION" });
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(1);
  });

  it("concorrência: ações simultâneas no mesmo turno resultam em uma única escolha", async () => {
    const m = await startedMatch(world);
    const view = await getMatchView(m.matchId, m.a);
    const [c1, c2, c3] = view.draft!.decks.B.map((c) => c.characterId);
    const results = await Promise.allSettled([
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c1! }),
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c2! }),
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c3! }),
      performDraftAction(m.b, m.matchId, { stepIndex: 0, characterId: view.draft!.decks.A[0]!.characterId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(1);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } });
    expect(match.currentStep).toBe(1);
  });

  it("draft completo trava os times e aguarda resultados", async () => {
    const m = await startedMatch(world);
    const view = await completeDraft(m.matchId, m.a, m.b);
    expect(view.status).toBe("LOCKED");
    expect(view.draft!.picks.A).toHaveLength(8);
    expect(view.draft!.picks.B).toHaveLength(8);
    expect(view.draft!.bannedFrom.A).toHaveLength(2);
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(20);
  });

  it("snapshots congelam decks e custos: mudanças posteriores não alteram a partida", async () => {
    const m = await startedMatch(world);
    const snapshot = await prisma.matchDeckSnapshot.findUniqueOrThrow({ where: { matchId_seat: { matchId: m.matchId, seat: "A" } }, include: { entries: true } });
    const target = snapshot.entries[0]!;
    const originalCost = target.cost;

    // Nova tabela, edição do deck original e exclusão do deck: nada disso afeta a partida.
    await setDraftPrice(world.admin, { characterId: target.characterId, cost: originalCost + 5, justification: "Aumento pós-partida" });
    await publishDraft(world.admin, {});
    await prisma.deck.delete({ where: { id: m.deckA.id } });

    const view = await getMatchView(m.matchId, m.a);
    expect(view.draft!.decks.A.find((c) => c.characterId === target.characterId)!.cost).toBe(originalCost);
    expect(view.draft!.decks.A).toHaveLength(10);
    expect(view.draft!.deckCosts.A).toBe(snapshot.totalCost);
    expect(view.priceVersion.number).toBe(1);
  });
});

describe("resultados e disputas", () => {
  it("registro e confirmação bilateral definem o vencedor", async () => {
    const m = await startedMatch(world);
    await completeDraft(m.matchId, m.a, m.b);
    await expect(submitResult(m.a, m.matchId, { timeMs: 100 })).rejects.toMatchObject({ code: "VALIDATION" }); // abaixo do mínimo
    await submitResult(m.a, m.matchId, { timeMs: 300_000, evidenceUrls: ["https://example.com/video"] });
    await expect(confirmOpponentResult(m.a, m.matchId)).rejects.toMatchObject({ code: "INVALID_STATE" }); // B ainda não enviou
    await submitResult(m.b, m.matchId, { timeMs: 320_500 });
    await confirmOpponentResult(m.a, m.matchId);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } })).status).toBe("AWAITING_RESULTS");
    // Resultado do B já foi confirmado pelo A: B não pode mais alterá-lo.
    await expect(submitResult(m.b, m.matchId, { timeMs: 200_000 })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await confirmOpponentResult(m.b, m.matchId);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: m.matchId }, include: { players: true } });
    expect(match).toMatchObject({ status: "COMPLETED", winnerSeat: "A", isDraw: false, resolvedBy: "CONFIRMED" });
    expect(match.players.find((p) => p.seat === "A")!.outcome).toBe("WIN");
    expect(match.players.find((p) => p.seat === "B")!.outcome).toBe("LOSS");
    const ranking = await getRanking();
    expect(ranking[0]).toMatchObject({ userId: m.a.id, wins: 1, losses: 0 });
  });

  it("empate exato registra empate", async () => {
    const m = await playCompletedMatch(world, { A: 300_000, B: 300_000 });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } });
    expect(match).toMatchObject({ status: "COMPLETED", isDraw: true, winnerSeat: null });
  });

  it("resultado não validado não conta no ranking", async () => {
    const m = await startedMatch(world);
    await completeDraft(m.matchId, m.a, m.b);
    await submitResult(m.a, m.matchId, { timeMs: 300_000 });
    await submitResult(m.b, m.matchId, { timeMs: 310_000 });
    await confirmOpponentResult(m.a, m.matchId);
    expect(await getRanking()).toHaveLength(0);
  });

  it("contestação leva à disputa e o administrador ajusta os tempos", async () => {
    const m = await startedMatch(world);
    await completeDraft(m.matchId, m.a, m.b);
    await submitResult(m.a, m.matchId, { timeMs: 300_000 });
    await submitResult(m.b, m.matchId, { timeMs: 310_000 });
    await expect(disputeOpponentResult(m.b, m.matchId, { reason: "curto" })).rejects.toMatchObject({ code: "VALIDATION" });
    await disputeOpponentResult(m.b, m.matchId, { reason: "O vídeo mostra 5:20 e não 5:00." });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } })).status).toBe("DISPUTED");
    await expect(confirmOpponentResult(m.a, m.matchId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await getRanking()).toHaveLength(0);

    const dispute = await prisma.matchDispute.findFirstOrThrow({ where: { matchId: m.matchId } });
    await expect(resolveDispute(m.a, dispute.id, { resolution: "DRAW", note: "tentativa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await resolveDispute(world.admin, dispute.id, { resolution: "ACCEPT_TIMES", timeAMs: 320_000, timeBMs: 310_000, note: "Vídeo confirma 5:20 para A." });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: m.matchId }, include: { results: true } });
    expect(match).toMatchObject({ status: "COMPLETED", winnerSeat: "B", resolvedBy: "ADMIN" });
    expect(match.results.find((r) => r.seat === "A")!.finalTimeMs).toBe(320_000);
    expect((await prisma.matchDispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe("RESOLVED");
    expect(await prisma.adminAuditLog.count({ where: { action: "DISPUTE_RESOLVED" } })).toBe(1);
    await expect(resolveDispute(world.admin, dispute.id, { resolution: "DRAW", note: "de novo" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("anulação pela administração cancela a partida sem efeito no ranking", async () => {
    const m = await startedMatch(world);
    await completeDraft(m.matchId, m.a, m.b);
    await submitResult(m.a, m.matchId, { timeMs: 300_000 });
    await submitResult(m.b, m.matchId, { timeMs: 310_000 });
    await disputeOpponentResult(m.b, m.matchId, { reason: "Personagem fora do time no vídeo." });
    const dispute = await prisma.matchDispute.findFirstOrThrow({ where: { matchId: m.matchId } });
    await resolveDispute(world.admin, dispute.id, { resolution: "VOID", note: "Partida irregular." });
    expect((await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } })).status).toBe("CANCELLED");
    expect(await getRanking()).toHaveLength(0);
  });
});
