import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE, type SessionUser } from "@/server/auth/session";
import type { MatchView } from "@/server/matches/view";
import { registerMatchNotifier } from "@/server/realtime/notify";
import { attachSocketServer } from "@/server/realtime/socket-server";
import { createUser, resetDb, seedWorld, startedMatch } from "../support/factories";

let http: Server;
let url: string;
let ioServer: ReturnType<typeof attachSocketServer>;
const sockets: Socket[] = [];

beforeEach(async () => {
  await resetDb();
  http = createServer();
  ioServer = attachSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  registerMatchNotifier(undefined);
  await new Promise<void>((r) => ioServer.close(() => r()));
});

async function client(user: SessionUser | null): Promise<Socket> {
  const token = user ? (await createSession(user.id)).token : "invalido";
  const s = connect(url, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie: `${SESSION_COOKIE}=${token}` }, reconnection: false });
  sockets.push(s);
  return s;
}

function connected(s: Socket) {
  return new Promise<void>((resolve, reject) => {
    if (s.connected) return resolve();
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
}

function emit<T = { ok: boolean; error?: string; code?: string; state?: MatchView; online?: string[] }>(s: Socket, event: string, payload: object): Promise<T> {
  return s.timeout(5000).emitWithAck(event, payload) as Promise<T>;
}

function nextState(s: Socket, predicate: (v: MatchView) => boolean): Promise<MatchView> {
  return new Promise((resolve) => {
    const handler = (v: MatchView) => {
      if (predicate(v)) {
        s.off("match:state", handler);
        resolve(v);
      }
    };
    s.on("match:state", handler);
  });
}

describe("tempo real (Socket.IO)", () => {
  it("rejeita conexões sem sessão válida", async () => {
    const s = await client(null);
    await expect(connected(s)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("apenas participantes acompanham a sala", async () => {
    const world = await seedWorld();
    const m = await startedMatch(world);
    const outsider = await client(await createUser());
    await connected(outsider);
    const res = await emit(outsider, "match:subscribe", { matchId: m.matchId });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("sincroniza ações entre os jogadores e restaura o estado após reconexão", async () => {
    const world = await seedWorld();
    const m = await startedMatch(world);
    const sa = await client(m.a);
    let sb = await client(m.b);
    await Promise.all([connected(sa), connected(sb)]);

    const subA = await emit(sa, "match:subscribe", { matchId: m.matchId });
    const subB = await emit(sb, "match:subscribe", { matchId: m.matchId });
    expect(subA.state!.viewerSeat).toBe("A");
    expect(subB.state!.viewerSeat).toBe("B");
    expect(subB.online!.sort()).toEqual([m.a.id, m.b.id].sort());

    // A bane; B recebe o novo estado em tempo real.
    const target = subA.state!.draft!.decks.B[0]!.characterId;
    const received = nextState(sb, (v) => v.draft?.stepIndex === 1);
    const ack = await emit(sa, "match:draftAction", { matchId: m.matchId, stepIndex: 0, characterId: target });
    expect(ack.ok).toBe(true);
    expect((await received).draft!.bannedFrom.B).toEqual([target]);

    // B cai; ações continuam persistidas no banco.
    sb.disconnect();
    const out = await emit(sa, "match:draftAction", { matchId: m.matchId, stepIndex: 1, characterId: subA.state!.draft!.decks.A[0]!.characterId });
    expect(out).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });

    // B reconecta (nova conexão, como ao atualizar a página) e recebe o estado completo.
    sb = await client(m.b);
    await connected(sb);
    const restored = await emit(sb, "match:subscribe", { matchId: m.matchId });
    expect(restored.state!.draft!.stepIndex).toBe(1);
    expect(restored.state!.draft!.bannedFrom.B).toEqual([target]);
    expect(restored.state!.draft!.currentStep).toEqual({ type: "BAN", actor: "B" });

    // E segue jogando normalmente.
    const toA = nextState(sa, (v) => v.draft?.stepIndex === 2);
    const banByB = restored.state!.draft!.decks.A[0]!.characterId;
    expect((await emit(sb, "match:draftAction", { matchId: m.matchId, stepIndex: 1, characterId: banByB })).ok).toBe(true);
    expect((await toA).draft!.bannedFrom.A).toEqual([banByB]);
  });

  it("valida o formato das mensagens", async () => {
    const world = await seedWorld();
    const m = await startedMatch(world);
    const sa = await client(m.a);
    await connected(sa);
    const res = await emit(sa, "match:draftAction", { matchId: m.matchId, stepIndex: "x", characterId: 1 });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});
