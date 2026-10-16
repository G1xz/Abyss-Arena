import Link from "next/link";
import { formatDuration } from "@/domain/results";
import { formatDate } from "@/lib/utils";
import type { getPlayerMatches } from "@/server/stats/service";
import { MatchStatusBadge } from "./page";
import { Badge } from "./ui/misc";

type Matches = Awaited<ReturnType<typeof getPlayerMatches>>;

/** Lista de partidas sob a perspectiva de um jogador. */
export function MatchList({ matches, userId }: { matches: Matches; userId: string }) {
  if (matches.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma partida.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card/60" data-testid="match-list">
      {matches.map((m) => {
        const me = m.players.find((p) => p.userId === userId);
        const opp = m.players.find((p) => p.userId !== userId);
        const myResult = me ? m.results.find((r) => r.seat === me.seat) : undefined;
        const href = m.status === "COMPLETED" || m.status === "CANCELLED" ? `/matches/${m.id}` : `/rooms/${m.code}`;
        return (
          <li key={m.id}>
            <Link href={href} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/40">
              {m.status === "COMPLETED" && me?.outcome ? (
                <Badge variant={me.outcome === "WIN" ? "success" : me.outcome === "LOSS" ? "destructive" : "secondary"}>
                  {me.outcome === "WIN" ? "Vitória" : me.outcome === "LOSS" ? "Derrota" : "Empate"}
                </Badge>
              ) : (
                <MatchStatusBadge status={m.status} />
              )}
              <span className="font-medium">vs {opp?.user.nickname ?? "—"}</span>
              {myResult && <span className="font-mono text-muted-foreground">{formatDuration(myResult.finalTimeMs ?? myResult.timeMs)}</span>}
              {m.abyssCycle && <span className="hidden text-xs text-muted-foreground sm:inline">{m.abyssCycle.name}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(m.completedAt ?? m.createdAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
