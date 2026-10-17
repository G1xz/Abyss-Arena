"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { History, Undo2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { MatchStatusBadge } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { opponentOf } from "@/domain/draft";
import { useMatchRoom } from "@/lib/use-match-room";
import { cn } from "@/lib/utils";
import type { MatchView } from "@/server/matches/view";
import { DraftBoard } from "./draft-board";
import { Lobby, type LobbyDeck } from "./lobby";
import { FinalTeams, ResultsPanel, RulesCard } from "./results-panel";
import { describeEvent, nick, type RoomContext } from "./shared";

/** Logo após o último pick, antes de qualquer resultado: ainda dá para desfazer. */
function LateUndo({ ctx }: { ctx: RoomContext }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pick/40 bg-pick/10 p-3 text-sm">
      <p className="flex-1">Seu último pick fechou o draft. Se quiser, ainda dá para desfazê-lo antes de alguém enviar o tempo.</p>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await ctx.emit("match:undo");
          setBusy(false);
          if (!res.ok) toast.error(res.error);
        }}
        data-testid="undo-pick"
      >
        <Undo2 /> Desfazer último pick
      </Button>
    </div>
  );
}

export function MatchRoom({ initial, me, decks }: { initial: MatchView; me: { id: string; nickname: string }; decks: LobbyDeck[] }) {
  const router = useRouter();
  const { state, online, status, lastError, emit } = useMatchRoom(initial);
  const mySeat = state.viewerSeat;
  const ctx: RoomContext = { state, mySeat, oppSeat: mySeat ? opponentOf(mySeat) : null, me, emit, online };

  useEffect(() => {
    if (status === "unauthorized") {
      toast.error("Sessão expirada. Faça login novamente.");
      router.push(`/login?next=/rooms/${state.code}`);
    }
  }, [status, router, state.code]);

  const inLobby = state.status === "WAITING" || state.status === "READY";
  const drafting = Boolean(state.draft) && (state.status === "BANNING" || state.status === "PICKING");
  const afterDraft = ["LOCKED", "AWAITING_RESULTS", "DISPUTED", "COMPLETED"].includes(state.status);
  const lateUndo = state.status === "LOCKED" && mySeat && state.draft?.undo[mySeat].available;

  const history = (
    <ol className="grid max-h-[480px] gap-2 overflow-y-auto text-sm" data-testid="event-log">
      {state.events.map((e) => (
        <li key={e.id} className="border-l-2 border-border pl-2">
          <p>{describeEvent(e)}</p>
          <time className="text-[11px] text-muted-foreground" dateTime={e.createdAt}>
            {new Date(e.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={cn("mx-auto w-full px-4", drafting ? "max-w-[1600px] py-3" : "max-w-7xl py-6")} data-testid="match-room" data-status={state.status}>
      <header className={cn("flex flex-wrap items-center gap-3", drafting ? "mb-3" : "mb-5")}>
        <div>
          <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Sala</p>
          <p className={cn("font-mono font-bold tracking-[0.2em]", drafting ? "text-lg" : "text-2xl")}>{state.code}</p>
        </div>
        <MatchStatusBadge status={state.draft?.currentStep?.type === "IMMUNE" ? "IMMUNITY" : state.status} />
        <div className="flex items-center gap-2 text-sm">
          {(["A", "B"] as const).map((seat, i) => {
            const p = state.players[seat];
            return (
              <span key={seat} className="flex items-center gap-1.5">
                {i === 1 && <span className="text-muted-foreground">vs</span>}
                <span className={cn("size-2 rounded-full", p && online.includes(p.userId) ? "bg-success" : "bg-muted-foreground/40")} />
                <span className={cn(seat === mySeat && "font-semibold")}>{p?.nickname ?? "—"}</span>
              </span>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline">Tabela v{state.priceVersion.number ?? "?"}</Badge>
          <span
            className={cn("flex items-center gap-1.5 text-xs", status === "connected" ? "text-success" : "text-warning")}
            data-testid="connection-status"
            data-connected={status === "connected" ? "true" : "false"}
          >
            {status === "connected" ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {status === "connected" ? "Conectado" : status === "unauthorized" ? "Sessão expirada" : "Reconectando…"}
          </span>
        </div>
      </header>

      {lastError && <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{lastError}</p>}

      {!mySeat && !state.viewerIsAdmin ? (
        <div className="rounded-xl border bg-card/70 p-6 text-center">
          <p className="font-semibold">Você não participa mais desta sala.</p>
          <Button asChild className="mt-3">
            <Link href="/play">Desafiar alguém</Link>
          </Button>
        </div>
      ) : drafting ? (
        // Draft: tela inteira para decks, ordem e picks; o histórico fica recolhido abaixo.
        <div className="grid gap-3">
          <DraftBoard ctx={ctx} />
          <details className="rounded-xl border bg-card/50 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <History className="size-4" /> Histórico da sala
            </summary>
            <div className="mt-3">{history}</div>
          </details>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
          <div className="grid min-w-0 gap-6">
            {lateUndo && <LateUndo ctx={ctx} />}
            {state.status === "CANCELLED" && (
              <div className="rounded-xl border bg-card/70 p-6" data-testid="room-cancelled">
                <p className="font-display text-lg font-semibold">Sala cancelada</p>
                <p className="text-sm text-muted-foreground">{state.cancelReason}</p>
                <Button asChild className="mt-3">
                  <Link href="/play">Desafiar alguém</Link>
                </Button>
              </div>
            )}
            {inLobby && <Lobby ctx={ctx} decks={decks} />}
            {inLobby && <RulesCard ctx={ctx} />}
            {afterDraft && (
              <>
                <FinalTeams ctx={ctx} />
                <ResultsPanel ctx={ctx} />
                <RulesCard ctx={ctx} />
                {state.draft && (
                  <details className="rounded-xl border bg-card/50 p-4">
                    <summary className="cursor-pointer text-sm font-medium">Ver draft completo (decks, bans e picks)</summary>
                    <div className="mt-4">
                      <DraftBoard ctx={ctx} />
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          <aside className="h-fit rounded-xl border bg-card/60 p-4" aria-label="Histórico da sala">
            <p className="mb-3 flex items-center gap-2 font-display font-semibold">
              <History className="size-4" /> Histórico
            </p>
            {history}
            <p className="mt-3 text-xs text-muted-foreground">
              Você: {me.nickname}
              {mySeat ? ` (jogador ${mySeat})` : " (admin)"} · Oponente: {mySeat ? nick(state, opponentOf(mySeat)) : "—"}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
