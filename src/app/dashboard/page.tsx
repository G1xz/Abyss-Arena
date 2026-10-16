import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Swords } from "lucide-react";
import { EmptyState, MatchStatusBadge, PageContainer, PageHeader, Stat } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { formatDuration } from "@/domain/results";
import { formatDate, formatPercent } from "@/lib/utils";
import { getCurrentCycle } from "@/server/abyss/service";
import { requireUser } from "@/server/auth/next";
import { listUserDecks } from "@/server/decks/service";
import { ACTIVE_STATUSES } from "@/server/matches/common";
import { getPlayerMatches, getPlayerRecord } from "@/server/stats/service";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [{ position, record }, matches, decks, cycle] = await Promise.all([
    getPlayerRecord(user.id),
    getPlayerMatches(user.id, undefined, 20),
    listUserDecks(user.id),
    getCurrentCycle(),
  ]);
  const active = matches.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const recent = matches.filter((m) => m.status === "COMPLETED").slice(0, 6);
  const defaultDeck = decks.find((d) => d.isDefault);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Painel"
        title={`Olá, ${user.nickname}`}
        description={cycle ? `Ciclo vigente: ${cycle.name}` : "Nenhum ciclo do Abismo vigente no momento."}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/rooms/join">Entrar em sala</Link>
            </Button>
            <Button asChild>
              <Link href="/rooms/new">
                <Swords /> Criar sala
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Posição no ranking" value={position ? `#${position}` : "—"} />
        <Stat label="Vitórias" value={record?.wins ?? 0} hint={`${record?.losses ?? 0} derrotas · ${record?.draws ?? 0} empates`} />
        <Stat label="Taxa de vitória" value={formatPercent(record?.winRate ?? null)} hint={`${record?.games ?? 0} partidas validadas`} />
        <Stat label="Decks" value={decks.length} hint={defaultDeck ? `Padrão: ${defaultDeck.name}` : "Nenhum deck padrão"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Partidas em andamento</CardTitle>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <EmptyState title="Nenhuma partida em andamento" description="Crie uma sala e envie o código para seu oponente." />
            ) : (
              <ul className="grid gap-2">
                {active.map((m) => {
                  const opponent = m.players.find((p) => p.userId !== user.id);
                  return (
                    <li key={m.id}>
                      <Link
                        href={`/rooms/${m.code}`}
                        className="flex items-center gap-3 rounded-lg border bg-background/40 px-3 py-2 transition-colors hover:border-primary/50"
                      >
                        <span className="font-mono text-sm font-semibold">{m.code}</span>
                        <MatchStatusBadge status={m.status} />
                        <span className="truncate text-sm text-muted-foreground">vs {opponent?.user.nickname ?? "aguardando oponente"}</span>
                        <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seus decks</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {decks.length === 0 ? (
              <EmptyState
                title="Você ainda não tem decks"
                action={
                  <Button asChild size="sm">
                    <Link href="/decks/new">
                      <Plus /> Montar deck
                    </Link>
                  </Button>
                }
              />
            ) : (
              decks.slice(0, 5).map((d) => (
                <Link key={d.id} href={`/decks/${d.id}`} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm hover:border-primary/50">
                  <span className="truncate font-medium">{d.name}</span>
                  {d.isDefault && <Badge variant="secondary">padrão</Badge>}
                  <span className="ml-auto text-gold tabular">
                    {d.evaluation.totalCost}/{d.evaluation.budget}
                  </span>
                  {!d.evaluation.valid && <Badge variant="destructive">inválido</Badge>}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Últimas partidas</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida concluída ainda.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((m) => {
                const me = m.players.find((p) => p.userId === user.id)!;
                const opp = m.players.find((p) => p.userId !== user.id);
                const myTime = m.results.find((r) => r.seat === me.seat);
                return (
                  <li key={m.id}>
                    <Link href={`/matches/${m.id}`} className="flex flex-wrap items-center gap-3 py-2 text-sm hover:text-primary">
                      <Badge variant={me.outcome === "WIN" ? "success" : me.outcome === "LOSS" ? "destructive" : "secondary"}>
                        {me.outcome === "WIN" ? "Vitória" : me.outcome === "LOSS" ? "Derrota" : "Empate"}
                      </Badge>
                      <span>vs {opp?.user.nickname}</span>
                      {myTime && <span className="text-muted-foreground tabular">{formatDuration(myTime.finalTimeMs ?? myTime.timeMs)}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{m.completedAt ? formatDate(m.completedAt) : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="link" className="mt-2 px-0">
            <Link href="/history">Ver histórico completo</Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
