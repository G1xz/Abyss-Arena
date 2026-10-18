import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { confirmOpponentResult, disputeOpponentResult, resolveDispute, submitResult } from "@/server/matches/results";
import {
  cancelRoom,
  createRoom,
  joinRoom,
  leaveRoom,
  performDraftAction,
  selectDeck,
  setReady,
  startDraft,
  swapSeats,
  undoDraftPick,
} from "@/server/matches/service";
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
    expect(view.draft!.decks.A).toHaveLength(11);
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

  it("jogadores trocam A/B por acordo: prontidão desfeita e o anfitrião continua anfitrião", async () => {
    const a = await createUser();
    const b = await createUser();
    const deckA = await createValidDeck(a, world);
    const deckB = await createValidDeck(b, world, 5);
    const room = await createRoom(a, { deckId: deckA.id });
    await expect(swapSeats(a, room.id)).rejects.toMatchObject({ code: "INVALID_STATE" }); // sozinho na sala
    await joinRoom(b, room.code);
    await selectDeck(b, room.id, deckB.id);
    await setReady(a, room.id, true);

    await swapSeats(b, room.id);
    let view = await getMatchView(room.id, a);
    expect(view.viewerSeat).toBe("B");
    expect(view.players.A?.userId).toBe(b.id);
    expect(view.players.A?.deck?.id).toBe(deckB.id);
    expect(view.players.A?.isReady || view.players.B?.isReady).toBe(false);
    expect(view.events[0]).toMatchObject({ type: "SEATS_SWAPPED" });

    // Só o anfitrião inicia, mesmo como jogador B; quem age primeiro no draft é o jogador A.
    await setReady(a, room.id, true);
    await setReady(b, room.id, true);
    await expect(startDraft(b, room.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await startDraft(a, room.id);
    view = await getMatchView(room.id, b);
    expect(view.draft!.currentStep!.actor).toBe("A");
    expect(view.viewerSeat).toBe("A");
  });

  it("convidado sai depois da troca: o anfitrião fica no seu lado e a vaga livre é ocupada", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const room = await createRoom(a, {});
    await joinRoom(b, room.code);
    await swapSeats(a, room.id); // anfitrião vira B
    await leaveRoom(b, room.id);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: room.id } })).status).toBe("WAITING");
    await joinRoom(c, room.code);
    const seats = await prisma.matchPlayer.findMany({ where: { matchId: room.id }, orderBy: { seat: "asc" } });
    expect(seats.map((s) => [s.seat, s.userId])).toEqual([
      ["A", c.id],
      ["B", a.id],
    ]);
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
    // Os decks têm 2 personagens em comum: o draft começa pela imunidade.
    expect(view.draft!.currentStep).toEqual({ type: "IMMUNE", actor: "A" });
    expect(view.draft!.eligibleImmune).toHaveLength(2);
    const target = view.draft!.options[0]!;
    const notEligible = view.draft!.decks.A.find((c) => !view.draft!.eligibleImmune.includes(c.characterId))!.characterId;
    await expect(performDraftAction(m.b, m.matchId, { stepIndex: 0, characterId: target })).rejects.toMatchObject({ code: "NOT_YOUR_TURN" });
    await expect(performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: notEligible })).rejects.toMatchObject({ code: "ILLEGAL_ACTION" });
    await expect(performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: null })).rejects.toMatchObject({ code: "ILLEGAL_ACTION" });
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
    const [c1, c2] = view.draft!.options;
    const results = await Promise.allSettled([
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c1! }),
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c2! }),
      performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: c1! }),
      performDraftAction(m.b, m.matchId, { stepIndex: 0, characterId: c2! }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(1);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: m.matchId } });
    expect(match.currentStep).toBe(1);
  });

  it("draft completo: imunidade, 3 bans e 8 picks por jogador; trava os times e aguarda resultados", async () => {
    const m = await startedMatch(world);
    const view = await completeDraft(m.matchId, m.a, m.b);
    expect(view.status).toBe("LOCKED");
    const d = view.draft!;
    expect(d.picks.A).toHaveLength(8);
    expect(d.picks.B).toHaveLength(8);
    expect(d.bans.A).toHaveLength(3);
    expect(d.bannedFrom.A).toHaveLength(3);
    // Os dois imunes ficam com os dois jogadores (escolhidos no 4º e no 8º pick).
    for (const seat of ["A", "B"] as const) {
      expect([d.picks[seat][3], d.picks[seat][7]].sort()).toEqual([d.immune.A, d.immune.B].sort());
    }
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(24);
    expect(view.events.map((e) => e.type)).toEqual(expect.arrayContaining(["DRAFT_IMMUNE", "DRAFT_BAN", "DRAFT_PICK", "DRAFT_LOCKED"]));
  });

  it("ordem em duas fases e vez dupla confirmada de uma vez", async () => {
    const m = await startedMatch(world);
    const order = (await getMatchView(m.matchId, m.a)).draft!.sequence.map((s) => `${s.type[0]}${s.actor}`).join(" ");
    expect(order).toBe("IA IB BA BB BB BA PA PB PB PA PA PB PB PA BA BB PA PB PB PA PA PB PB PA");

    const single = async () => {
      const d = (await getMatchView(m.matchId, m.a)).draft!;
      await performDraftAction(d.currentStep!.actor === "A" ? m.a : m.b, m.matchId, { stepIndex: d.stepIndex, characterId: d.options[0]! });
    };
    for (let i = 0; i < 3; i++) await single(); // imunidades + 1º ban de A
    let d = (await getMatchView(m.matchId, m.b)).draft!;
    expect(d.run.size).toBe(2);
    await prisma.match.update({ where: { id: m.matchId }, data: { turnStartedAt: new Date(Date.now() - 20_000) } });
    const before = d.clock!.usedMs.B;
    await performDraftAction(m.b, m.matchId, { stepIndex: d.stepIndex, characterIds: d.run.options.slice(0, 2) });

    d = (await getMatchView(m.matchId, m.b)).draft!;
    expect(d.bans.B).toHaveLength(2);
    expect(d.currentStep).toEqual({ type: "BAN", actor: "A" });
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(5);
    // O tempo da vez dupla é debitado uma vez só.
    expect(d.clock!.usedMs.B - before).toBeGreaterThanOrEqual(20_000);
    expect(d.clock!.usedMs.B - before).toBeLessThan(25_000);
    // Lote maior que a vez é recusado sem gravar nada.
    await single(); // último ban de A na fase 1
    await single(); // 1º pick de A
    d = (await getMatchView(m.matchId, m.b)).draft!;
    await expect(performDraftAction(m.b, m.matchId, { stepIndex: d.stepIndex, characterIds: d.run.options.slice(0, 3) })).rejects.toMatchObject({ code: "ILLEGAL_ACTION" });
    expect(await prisma.draftAction.count({ where: { matchId: m.matchId } })).toBe(7);
  });

  it("vez dupla com o imune: o servidor coloca o imune no pick que aceita", async () => {
    const m = await startedMatch(world);
    // Até os 3º e 4º picks de B, sem usar imunes.
    for (;;) {
      const d = (await getMatchView(m.matchId, m.a)).draft!;
      if (d.currentStep!.actor === "B" && d.currentStep!.type === "PICK" && d.pickNumber === 3) break;
      const immune = [d.immune.A, d.immune.B];
      await performDraftAction(d.currentStep!.actor === "A" ? m.a : m.b, m.matchId, {
        stepIndex: d.stepIndex,
        characterId: d.options.find((id) => !immune.includes(id))!,
      });
    }
    const d = (await getMatchView(m.matchId, m.b)).draft!;
    const immune = d.immune.A!;
    const normal = d.options.find((id) => id !== immune)!;
    expect(d.run.options).toContain(immune);
    await performDraftAction(m.b, m.matchId, { stepIndex: d.stepIndex, characterIds: [immune, normal] });
    const after = (await getMatchView(m.matchId, m.b)).draft!;
    expect(after.picks.B.slice(-2)).toEqual([normal, immune]);
    expect(after.currentStep!.actor).toBe("A");
  });

  it("relógio: cada jogador gasta só o tempo dos próprios turnos", async () => {
    const m = await startedMatch(world);
    // Simula 40 s de reflexão de A antes de declarar o imune.
    await prisma.match.update({ where: { id: m.matchId }, data: { turnStartedAt: new Date(Date.now() - 40_000) } });
    const view = await getMatchView(m.matchId, m.a);
    await performDraftAction(m.a, m.matchId, { stepIndex: 0, characterId: view.draft!.options[0]! });
    const after = await getMatchView(m.matchId, m.a);
    expect(after.draft!.clock!.limitMs).toBe(300_000);
    expect(after.draft!.clock!.usedMs.A).toBeGreaterThanOrEqual(40_000);
    expect(after.draft!.clock!.usedMs.A).toBeLessThan(45_000);
    expect(after.draft!.clock!.usedMs.B).toBe(0);
    expect(after.draft!.clock!.turnStartedAt).not.toBeNull();
  });

  it("desfazer: só o último pick, uma vez por jogador, e o turno volta para quem desfez", async () => {
    const m = await startedMatch(world);
    const step = async () => {
      const v = await getMatchView(m.matchId, m.a);
      const d = v.draft!;
      const actor = d.currentStep!.actor === "A" ? m.a : m.b;
      await performDraftAction(actor, m.matchId, { stepIndex: d.stepIndex, characterId: d.options[0]! });
    };
    // Imunidades e a primeira fase de bans.
    while ((await getMatchView(m.matchId, m.a)).draft!.currentStep!.type !== "PICK") await step();
    await expect(undoDraftPick(m.a, m.matchId)).rejects.toMatchObject({ code: "INVALID_STATE" }); // ainda não há pick
    await step(); // 1º pick de A
    const picked = (await getMatchView(m.matchId, m.a)).draft!.picks.A[0]!;
    await expect(undoDraftPick(m.b, m.matchId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await undoDraftPick(m.a, m.matchId);

    const view = await getMatchView(m.matchId, m.a);
    expect(view.draft!.picks.A).toEqual([]);
    expect(view.draft!.currentStep).toEqual({ type: "PICK", actor: "A" });
    expect(view.draft!.options).toContain(picked);
    expect(view.draft!.undo.A).toEqual({ left: 0, available: false });
    expect(view.events[0]).toMatchObject({ type: "DRAFT_UNDO" });

    await step();
    await expect(undoDraftPick(m.a, m.matchId)).rejects.toMatchObject({ code: "INVALID_STATE" }); // já usou
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
    expect(view.draft!.decks.A).toHaveLength(11);
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
