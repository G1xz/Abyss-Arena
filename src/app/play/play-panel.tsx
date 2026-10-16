"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Search, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, NativeSelect } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { InviteView } from "@/server/invites/service";
import { challengeAction, searchPlayersAction } from "./actions";

interface Player {
  id: string;
  nickname: string;
  online?: boolean;
}

/** Busca de jogadores por nickname com debounce. */
export function usePlayerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      setResults(await searchPlayersAction(query));
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  return { query, setQuery, results, loading };
}

export function PlayerRow({ player, action, disabled }: { player: Player; action: React.ReactNode; disabled?: boolean }) {
  return (
    <li className={cn("flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2", disabled && "opacity-60")} data-testid="player-row">
      <span className={cn("size-2 rounded-full", player.online ? "bg-success shadow-[0_0_6px_var(--success)]" : "bg-muted-foreground/40")} />
      <span className="truncate font-medium">{player.nickname}</span>
      <span className="ml-auto">{action}</span>
    </li>
  );
}

export function PlayPanel({
  decks,
  defaultDeckId,
  online,
  recent,
  sent,
}: {
  decks: { id: string; name: string; totalCost: number }[];
  defaultDeckId?: string;
  online: Player[];
  recent: Player[];
  sent: InviteView[];
}) {
  const router = useRouter();
  const [deckId, setDeckId] = useState(defaultDeckId ?? "");
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const search = usePlayerSearch();

  const challenge = (player: Player) => {
    setTarget(player.id);
    start(async () => {
      const r = await challengeAction({ opponentId: player.id, deckId: deckId || undefined });
      if (!r.ok) {
        toast.error(r.error);
        setTarget(null);
        return;
      }
      toast.success(`Convite enviado para ${player.nickname}`);
      router.push(`/rooms/${r.data.code}`);
    });
  };

  const button = (p: Player) => (
    <Button size="sm" disabled={pending} onClick={() => challenge(p)} data-testid={`challenge-${p.nickname}`}>
      {pending && target === p.id ? <Loader2 className="animate-spin" /> : <Swords />} Desafiar
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo desafio</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="deck">Seu deck</Label>
          <NativeSelect id="deck" value={deckId} onChange={(e) => setDeckId(e.target.value)} data-testid="play-deck">
            <option value="">Escolher depois, na sala</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.totalCost} pts)
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="player-search">Buscar jogador</Label>
          <label className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              id="player-search"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="Digite o nickname"
              className="pl-8"
              autoComplete="off"
              data-testid="player-search"
            />
          </label>
          {search.loading && <p className="text-xs text-muted-foreground">Buscando…</p>}
          {search.results.length > 0 && <ul className="grid gap-1.5">{search.results.map((p) => <PlayerRow key={p.id} player={p} action={button(p)} />)}</ul>}
          {!search.loading && search.query.trim().length >= 2 && search.results.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum jogador encontrado.</p>
          )}
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Online agora ({online.length})</p>
          {online.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém mais online no momento. Você ainda pode convidar pelo nickname: o convite aparece quando a pessoa abrir o site.</p>
          ) : (
            <ul className="grid gap-1.5">{online.map((p) => <PlayerRow key={p.id} player={{ ...p, online: true }} action={button(p)} />)}</ul>
          )}
        </div>

        {recent.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Oponentes recentes</p>
            <ul className="grid gap-1.5">{recent.map((p) => <PlayerRow key={p.id} player={p} action={button(p)} />)}</ul>
          </div>
        )}

        {sent.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Convites enviados aguardando resposta</p>
            <ul className="grid gap-1.5">
              {sent.map((i) => (
                <PlayerRow
                  key={i.id}
                  player={i.to}
                  action={
                    <Button size="sm" variant="outline" onClick={() => router.push(`/rooms/${i.code}`)}>
                      Abrir sala
                    </Button>
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
