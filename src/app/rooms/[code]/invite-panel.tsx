"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelInviteAction, inviteToRoomAction } from "@/app/play/actions";
import { PlayerRow, usePlayerSearch } from "@/app/play/play-panel";
import type { MatchView } from "@/server/matches/view";

const STATUS_TEXT: Record<string, string> = {
  DECLINED: "recusou o convite",
  EXPIRED: "não respondeu a tempo (convite expirado)",
  CANCELLED: "teve o convite cancelado",
};

/** Vaga do oponente: status do convite enviado e opção de convidar outra pessoa. */
export function InvitePanel({ state, isHost }: { state: MatchView; isHost: boolean }) {
  const [pending, start] = useTransition();
  const [searching, setSearching] = useState(false);
  const search = usePlayerSearch();
  const latest = state.invites[0];
  const waiting = latest?.status === "PENDING";

  const invite = (opponentId: string, nickname: string) =>
    start(async () => {
      const r = await inviteToRoomAction(state.id, opponentId);
      if (r.ok) {
        toast.success(`Convite enviado para ${nickname}`);
        setSearching(false);
        search.setQuery("");
      } else toast.error(r.error);
    });

  const cancel = () =>
    start(async () => {
      if (!latest) return;
      const r = await cancelInviteAction(latest.id);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/40 p-5 text-center" data-testid="invite-box">
      {waiting ? (
        <>
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="font-display font-semibold" data-testid="invite-status">
            Aguardando {latest.toNickname} aceitar o convite
          </p>
          <p className="text-xs text-muted-foreground">Expira às {new Date(latest.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          {isHost && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={cancel}>
              <X /> Cancelar convite
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="font-display font-semibold">Aguardando oponente</p>
          {latest && (
            <p className="text-sm text-warning" data-testid="invite-status">
              {latest.toNickname} {STATUS_TEXT[latest.status] ?? ""}
            </p>
          )}
          {isHost &&
            (searching ? (
              <div className="grid w-full max-w-sm gap-2 text-left">
                <label className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input autoFocus value={search.query} onChange={(e) => search.setQuery(e.target.value)} placeholder="Nickname do oponente" className="pl-8" />
                </label>
                <ul className="grid gap-1.5">
                  {search.results.map((p) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      action={
                        <Button size="sm" disabled={pending} onClick={() => invite(p.id, p.nickname)}>
                          <Send /> Convidar
                        </Button>
                      }
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <Button size="sm" onClick={() => setSearching(true)}>
                <Send /> Convidar jogador
              </Button>
            ))}
        </>
      )}
    </div>
  );
}
