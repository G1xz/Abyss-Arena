"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { MatchView } from "@/server/matches/view";

let socket: Socket | null = null;

/** Conexão única por aba; reconecta automaticamente. A sessão vai no cookie httpOnly. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, autoConnect: false, reconnectionDelayMax: 5000 });
  }
  return socket;
}

export type EmitResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; code?: string };

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "unauthorized";

export function useMatchRoom(initial: MatchView) {
  const matchId = initial.id;
  const [state, setState] = useState<MatchView>(initial);
  const [online, setOnline] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const revisionRef = useRef(initial.revision);

  const apply = useCallback(
    (next: MatchView) => {
      if (next.id !== matchId) return;
      // Ignora estados antigos que cheguem fora de ordem.
      if (next.revision < revisionRef.current) return;
      revisionRef.current = next.revision;
      setState(next);
    },
    [matchId],
  );

  useEffect(() => {
    const s = getSocket();
    const subscribe = () => {
      s.timeout(10_000).emit("match:subscribe", { matchId }, (err: Error | null, res: { ok: boolean; state?: MatchView; online?: string[]; error?: string }) => {
        if (err) return setLastError("Sem resposta do servidor ao entrar na sala.");
        if (res.ok && res.state) {
          // Na (re)inscrição o servidor é a fonte da verdade: aceita mesmo com a mesma revisão.
          revisionRef.current = res.state.revision;
          setState(res.state);
          setOnline(res.online ?? []);
          setLastError(null);
        } else setLastError(res.error ?? "Não foi possível entrar na sala.");
      });
    };
    const onConnect = () => {
      setStatus("connected");
      subscribe();
    };
    const onDisconnect = () => setStatus("reconnecting");
    const onConnectError = (err: Error) => {
      if (err.message === "UNAUTHENTICATED") setStatus("unauthorized");
      else setStatus("reconnecting");
    };
    const onState = (next: MatchView) => apply(next);
    const onPresence = (p: { matchId: string; online: string[] }) => {
      if (p.matchId === matchId) setOnline(p.online);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("match:state", onState);
    s.on("match:presence", onPresence);
    if (s.connected) onConnect();
    else s.connect();

    return () => {
      s.emit("match:unsubscribe", { matchId });
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.off("match:state", onState);
      s.off("match:presence", onPresence);
    };
  }, [matchId, apply]);

  const emit = useCallback(
    (event: string, payload: Record<string, unknown> = {}): Promise<EmitResult> =>
      new Promise((resolve) => {
        const s = getSocket();
        if (!s.connected) return resolve({ ok: false, error: "Sem conexão com o servidor. Tentando reconectar..." });
        s.timeout(10_000).emit(event, { matchId, ...payload }, (err: Error | null, res: EmitResult) => {
          resolve(err ? { ok: false, error: "O servidor não respondeu. Verifique sua conexão." } : res);
        });
      }),
    [matchId],
  );

  return { state, online, status, lastError, emit };
}
