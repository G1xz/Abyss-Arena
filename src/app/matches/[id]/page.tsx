import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, ExternalLink, Trophy } from "lucide-react";
import { CharacterIcon, ConstellationBadge } from "@/components/character-card";
import { MatchStatusBadge, PageContainer, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/misc";
import type { Seat } from "@/domain/draft";
import { formatDuration } from "@/domain/results";
import { cn, formatDate } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { getMatchView } from "@/server/matches/view";
import { describeEvent } from "@/app/rooms/[code]/shared";

export const metadata: Metadata = { title: "Resultado da partida" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const exists = await prisma.match.findUnique({ where: { id }, select: { status: true, players: { select: { userId: true } } } });
  if (!exists) notFound();
  const participant = Boolean(user && exists.players.some((p) => p.userId === user.id));
  // Partidas concluídas são públicas; as demais só para participantes e administradores.
  if (exists.status !== "COMPLETED" && !participant && user?.role !== "ADMIN") notFound();

  const view = await getMatchView(id, user);
  const draft = view.draft;
  const seatName = (seat: Seat) => view.players[seat]?.nickname ?? seat;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow={`Sala ${view.code}`}
        title={
          view.status === "COMPLETED" ? (
            <span data-testid="match-summary-title">{view.isDraw ? "Empate" : `Vitória de ${seatName(view.winnerSeat!)}`}</span>
          ) : (
            `${seatName("A")} vs ${seatName("B")}`
          )
        }
        description={`${view.rules?.cycleName ?? ""} · tabela v${view.priceVersion.number ?? "?"} · ${formatDate(view.completedAt ?? view.createdAt)}`}
        actions={
          <>
            <MatchStatusBadge status={view.status} />
            {participant && view.status !== "COMPLETED" && view.status !== "CANCELLED" && (
              <Link href={`/rooms/${view.code}`} className="text-sm text-primary hover:underline">
                Abrir sala
              </Link>
            )}
          </>
        }
      />
      {view.resolvedBy === "ADMIN" && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">Resultado definido pela administração após contestação.</p>
      )}
      {view.cancelReason && <p className="mb-4 text-sm text-muted-foreground">{view.cancelReason}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {(["A", "B"] as Seat[]).map((seat) => {
          const result = view.results[seat];
          const winner = view.status === "COMPLETED" && view.winnerSeat === seat;
          const team = draft ? draft.picks[seat].map((cid) => draft.decks[seat].find((c) => c.characterId === cid)!).filter(Boolean) : [];
          const banned = draft ? draft.bannedFrom[seat].map((cid) => draft.decks[seat].find((c) => c.characterId === cid)!).filter(Boolean) : [];
          return (
            <section key={seat} className={cn("rounded-xl border bg-card/70 p-4", winner && "border-gold/60")}>
              <div className="flex items-center gap-2">
                <Link href={`/players/${encodeURIComponent(seatName(seat))}`} className="font-display text-lg font-semibold hover:text-primary">
                  {seatName(seat)}
                </Link>
                {winner && <Trophy className="size-4 text-gold" />}
                <Badge variant="secondary" className="ml-auto">
                  {seat}
                </Badge>
              </div>
              <p className="mt-2 font-mono text-3xl font-bold" data-testid={`summary-time-${seat}`}>
                {result ? formatDuration(result.finalTimeMs ?? result.timeMs) : "—"}
              </p>
              {result?.finalTimeMs && result.finalTimeMs !== result.timeMs && (
                <p className="text-xs text-muted-foreground">Declarado: {formatDuration(result.timeMs)} (ajustado pela administração)</p>
              )}
              {result && result.evidence.length > 0 && (
                <ul className="mt-2 grid gap-1 text-xs">
                  {result.evidence.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="size-3" /> evidência (não verificada)
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {draft && (
                <>
                  <p className="mt-4 mb-1.5 text-xs text-muted-foreground">Time · deck “{draft.deckNames[seat]}” ({draft.deckCosts[seat]} pts)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {team.map((c) => (
                      <div key={c.characterId} className="flex flex-col items-center gap-1 text-center">
                        <CharacterIcon character={c} size={56} />
                        <span className="w-full truncate text-xs">{c.name}</span>
                        <ConstellationBadge constellation={c.constellation} level={c.level} rarity={c.rarity} />
                        <span className="text-[10px] text-gold">{c.cost} pts</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Ban className="size-3" /> Banidos deste deck
                  </p>
                  <div className="flex gap-1.5">
                    {banned.map((c) => (
                      <CharacterIcon key={c.characterId} character={c} size={36} className="opacity-60 grayscale" />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {view.disputes.length > 0 && (
        <section className="mt-6 rounded-xl border bg-card/60 p-4">
          <h2 className="mb-2 font-semibold">Contestações</h2>
          <ul className="grid gap-2 text-sm">
            {view.disputes.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.raisedBy}</span> contestou o tempo do jogador {d.againstSeat}: {d.reason}
                {d.resolution && (
                  <p className="text-muted-foreground">
                    Decisão: {d.resolution} — {d.resolutionNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-xl border bg-card/60 p-4">
        <h2 className="mb-2 font-semibold">Histórico da partida</h2>
        <ol className="grid gap-1 text-sm">
          {[...view.events].reverse().map((e) => (
            <li key={e.id} className="flex gap-3">
              <time className="w-20 shrink-0 text-xs text-muted-foreground tabular">{new Date(e.createdAt).toLocaleTimeString("pt-BR")}</time>
              <span>{describeEvent(e)}</span>
            </li>
          ))}
        </ol>
      </section>
    </PageContainer>
  );
}
