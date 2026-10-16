import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { readCookie, SESSION_COOKIE, validateSessionToken, type SessionUser } from "../auth/session";
import { prisma } from "../db";
import { AppError, toErrorResult } from "../errors";
import { confirmOpponentResult, disputeOpponentResult, submitResult } from "../matches/results";
import { cancelRoom, leaveRoom, performDraftAction, selectDeck, setReady, startDraft } from "../matches/service";
import { canWatchMatch, getMatchView, type MatchView } from "../matches/view";
import { idSchema, parseInput } from "../validation";
import { markOffline, markOnline, registerMatchNotifier, registerUserNotifier } from "./notify";

interface SocketData {
  user: SessionUser;
  token: string;
}

type AppSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;
type Ack = (response: unknown) => void;

const matchRoom = (matchId: string) => `match:${matchId}`;
const matchPayload = z.object({ matchId: idSchema }).passthrough();

/** Presença em memória (informação não crítica): matchId -> userId -> nº de conexões. */
const presence = new Map<string, Map<string, number>>();

function presenceList(matchId: string) {
  return [...(presence.get(matchId)?.keys() ?? [])];
}

function addPresence(matchId: string, userId: string) {
  const m = presence.get(matchId) ?? new Map<string, number>();
  m.set(userId, (m.get(userId) ?? 0) + 1);
  presence.set(matchId, m);
}

function removePresence(matchId: string, userId: string) {
  const m = presence.get(matchId);
  if (!m) return;
  const count = (m.get(userId) ?? 1) - 1;
  if (count <= 0) m.delete(userId);
  else m.set(userId, count);
  if (m.size === 0) presence.delete(matchId);
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    // Deixa upgrades de outros caminhos (ex.: HMR do Next) para os demais handlers.
    destroyUpgrade: false,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const user = await validateSessionToken(token);
      if (!user || !token) return next(new Error("UNAUTHENTICATED"));
      socket.data.user = user;
      socket.data.token = token;
      next();
    } catch {
      next(new Error("UNAVAILABLE"));
    }
  });

  const publish = async (matchId: string) => {
    const sockets = await io.in(matchRoom(matchId)).fetchSockets();
    const cache = new Map<string, MatchView>();
    for (const s of sockets) {
      const user = (s.data as SocketData).user;
      let view = cache.get(user.id);
      if (!view) {
        view = await getMatchView(matchId, user);
        cache.set(user.id, view);
      }
      s.emit("match:state", view);
    }
  };
  registerMatchNotifier(publish);
  registerUserNotifier((userId, event, payload) => {
    io.to(`user:${userId}`).emit(event as never, payload as never);
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as unknown as AppSocket;
    const subscribed = new Set<string>();
    // Canal pessoal (convites e avisos) e presença global.
    void socket.join(`user:${socket.data.user.id}`);
    markOnline(socket.data.user.id);

    /** Revalida a sessão a cada ação (logout ou mudança de papel valem imediatamente). */
    const currentUser = async () => {
      const user = await validateSessionToken(socket.data.token);
      if (!user) {
        socket.disconnect(true);
        throw new AppError("UNAUTHENTICATED", "Sessão expirada. Faça login novamente.");
      }
      socket.data.user = user;
      return user;
    };

    const on = (event: string, handler: (payload: z.infer<typeof matchPayload>, user: SessionUser) => Promise<unknown>) => {
      (socket as unknown as Socket).on(event, async (payload: unknown, ack?: Ack) => {
        try {
          const data = parseInput(matchPayload, payload);
          const user = await currentUser();
          const result = await handler(data, user);
          ack?.({ ok: true, ...(result && typeof result === "object" ? result : {}) });
        } catch (err) {
          ack?.(toErrorResult(err));
        }
      });
    };

    on("match:subscribe", async ({ matchId }, user) => {
      if (!(await canWatchMatch(matchId, user))) throw new AppError("FORBIDDEN", "Você não participa desta partida");
      if (!subscribed.has(matchId)) {
        subscribed.add(matchId);
        await socket.join(matchRoom(matchId));
        addPresence(matchId, user.id);
        io.to(matchRoom(matchId)).emit("match:presence" as never, { matchId, online: presenceList(matchId) } as never);
        await prisma.matchPlayer.updateMany({ where: { matchId, userId: user.id }, data: { lastSeenAt: new Date() } });
      }
      return { state: await getMatchView(matchId, user), online: presenceList(matchId) };
    });

    on("match:unsubscribe", async ({ matchId }, user) => {
      if (subscribed.delete(matchId)) {
        await socket.leave(matchRoom(matchId));
        removePresence(matchId, user.id);
        io.to(matchRoom(matchId)).emit("match:presence" as never, { matchId, online: presenceList(matchId) } as never);
      }
    });

    on("match:selectDeck", (p, user) => selectDeck(user, p.matchId, p.deckId));
    on("match:setReady", (p, user) => setReady(user, p.matchId, p.ready === true));
    on("match:start", (p, user) => startDraft(user, p.matchId));
    on("match:draftAction", (p, user) => performDraftAction(user, p.matchId, { stepIndex: p.stepIndex, characterId: p.characterId }));
    on("match:cancel", (p, user) => cancelRoom(user, p.matchId));
    on("match:leave", (p, user) => leaveRoom(user, p.matchId));
    on("match:submitResult", (p, user) =>
      submitResult(user, p.matchId, { timeMs: p.timeMs, evidenceUrls: p.evidenceUrls ?? [] }),
    );
    on("match:confirmResult", (p, user) => confirmOpponentResult(user, p.matchId));
    on("match:dispute", (p, user) => disputeOpponentResult(user, p.matchId, { reason: p.reason }));

    socket.on("disconnect", () => {
      markOffline(socket.data.user.id);
      for (const matchId of subscribed) {
        removePresence(matchId, socket.data.user.id);
        io.to(matchRoom(matchId)).emit("match:presence" as never, { matchId, online: presenceList(matchId) } as never);
      }
      subscribed.clear();
    });
  });

  return io;
}
