"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Crown, Loader2, LogOut, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, NativeSelect } from "@/components/ui/misc";
import type { Seat } from "@/domain/draft";
import { cn } from "@/lib/utils";
import type { RoomContext } from "./shared";

export interface LobbyDeck {
  id: string;
  name: string;
  totalCost: number;
  valid: boolean;
  size: number;
}

export function Lobby({ ctx, decks }: { ctx: RoomContext; decks: LobbyDeck[] }) {
  const { state, mySeat, emit, online } = ctx;
  const [busy, setBusy] = useState<string | null>(null);
  const isHost = mySeat === "A";
  const guest = state.players.B;

  const run = async (key: string, event: string, payload?: Record<string, unknown>, success?: string) => {
    setBusy(key);
    const res = await emit(event, payload);
    setBusy(null);
    if (!res.ok) toast.error(res.error);
    else if (success) toast.success(success);
  };

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/rooms/${state.code}` : `/rooms/${state.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Link de convite copiado");
    } catch {
      toast.message(inviteUrl);
    }
  };

  const seatCard = (seat: Seat) => {
    const player = state.players[seat];
    const mine = seat === mySeat;
    if (!player) {
      return (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/40 p-5 text-center" data-testid="invite-box">
          <p className="font-display font-semibold">Aguardando oponente</p>
          <p className="text-sm text-muted-foreground">Envie o código ou o link de convite.</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em] text-primary" data-testid="room-code">
            {state.code}
          </p>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy /> Copiar link
          </Button>
        </div>
      );
    }
    const isOnline = online.includes(player.userId);
    return (
      <div className={cn("flex min-h-48 flex-col gap-3 rounded-xl border bg-card/80 p-5", player.isReady && "border-success/50")} data-testid={`seat-${seat}`}>
        <div className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", isOnline ? "bg-success shadow-[0_0_8px_var(--success)]" : "bg-muted-foreground/40")} title={isOnline ? "Conectado" : "Desconectado"} />
          <span className="font-display text-lg font-semibold">{player.nickname}</span>
          {seat === "A" && <Crown className="size-4 text-gold" aria-label="Anfitrião" />}
          <Badge variant="secondary" className="ml-auto">
            Jogador {seat}
          </Badge>
        </div>
        {mine ? (
          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="room-deck">
              Seu deck
            </label>
            <NativeSelect
              id="room-deck"
              value={player.deck?.id ?? ""}
              disabled={busy !== null}
              onChange={(e) => e.target.value && run("deck", "match:selectDeck", { deckId: e.target.value }, "Deck selecionado")}
              data-testid="room-deck-select"
            >
              <option value="" disabled>
                Selecione um deck
              </option>
              {decks.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.valid}>
                  {d.name} — {d.totalCost} pts{d.valid ? "" : " (inválido)"}
                </option>
              ))}
            </NativeSelect>
            {decks.length === 0 && (
              <p className="text-xs text-warning">
                Você não tem decks.{" "}
                <Link href="/decks/new" className="underline">
                  Monte um
                </Link>
                .
              </p>
            )}
            <Button
              variant={player.isReady ? "outline" : "default"}
              disabled={busy !== null || !player.deck}
              onClick={() => run("ready", "match:setReady", { ready: !player.isReady })}
              data-testid="ready-toggle"
            >
              {busy === "ready" ? <Loader2 className="animate-spin" /> : player.isReady ? <X /> : <Check />}
              {player.isReady ? "Cancelar prontidão" : "Estou pronto"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-1 text-sm">
            <p className="text-muted-foreground">
              Deck: {player.deck ? <span className="text-foreground">{player.deck.name}</span> : "não selecionado"}
              {player.deck && <span className="text-muted-foreground"> · {player.deck.size} personagens</span>}
            </p>
            <p className="text-xs text-muted-foreground">A composição é revelada quando o draft começa.</p>
          </div>
        )}
        <div className="mt-auto">
          {player.isReady ? (
            <Badge variant="success" data-testid={`seat-${seat}-ready`}>
              <Check /> Pronto
            </Badge>
          ) : (
            <Badge variant="warning">Não está pronto</Badge>
          )}
          {player.deck && !player.deck.valid && <p className="mt-2 text-xs text-destructive">{player.deck.issue}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
        {seatCard("A")}
        <div className="hidden items-center justify-center font-display text-2xl font-bold text-muted-foreground md:flex">VS</div>
        {seatCard("B")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-4">
        <p className="text-sm text-muted-foreground">
          {state.status === "READY"
            ? isHost
              ? "Os dois jogadores estão prontos. Inicie o draft quando quiser."
              : "Os dois jogadores estão prontos. Aguardando o anfitrião iniciar o draft."
            : guest
              ? "Os dois jogadores precisam selecionar um deck válido e confirmar prontidão."
              : "Compartilhe o código da sala com seu oponente."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!mySeat ? null : isHost ? (
            <>
              <Button variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => run("cancel", "match:cancel", {}, "Sala cancelada")} data-testid="cancel-room">
                <X /> Cancelar sala
              </Button>
              <Button disabled={state.status !== "READY" || busy !== null} onClick={() => run("start", "match:start")} data-testid="start-draft">
                {busy === "start" ? <Loader2 className="animate-spin" /> : <Play />} Iniciar draft
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={busy !== null} onClick={() => run("leave", "match:leave", {}, "Você saiu da sala")}>
              <LogOut /> Sair da sala
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
