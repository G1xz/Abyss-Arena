import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, History, Layers, Percent, Swords, Trophy, Users } from "lucide-react";
import { EmptyState, MatchStatusBadge, PageContainer, PageHeader, Stat } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { formatDuration } from "@/domain/results";
import { formatDate, formatPercent } from "@/lib/utils";
import { getCurrentCycle } from "@/server/abyss/service";
import { requireUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { listUserDecks } from "@/server/decks/service";
import { ACTIVE_STATUSES } from "@/server/matches/common";
import { getPlayerMatches, getPlayerRecord } from "@/server/stats/service";

export const metadata: Metadata = { title: "Painel" };

function QuickAction({ href, icon: Icon, title, text, highlight }: { href: string; icon: typeof Swords; title: string; text: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={
        "group flex min-w-0 items-center gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 " +
        (highlight ? "border-primary/40 bg-gradient-to-br from-primary/20 to-primary/5 hover:border-primary/70" : "border-border/70 bg-card/70 hover:border-primary/40")
      }
    >
      <span className={"grid size-11 shrink-0 place-items-center rounded-xl " + (highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [{ position, record }, matches, decks, cycle, owned] = await Promise.all([
    getPlayerRecord(user.id),
    getPlayerMatches(user.id, undefined, 20),
    listUserDecks(user.id),
    getCurrentCycle(),
    prisma.ownedCharacter.count({ where: { userId: user.id } }),
  ]);
  const active = matches.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const recent = matches.filter((m) => m.status === "COMPLETED").slice(0, 6);
  const defaultDeck = decks.find((d) => d.isDefault);
  const validDecks = decks.filter((d) => d.evaluation.valid).length;

  return (
    <PageContainer>
      <PageHeader eyebrow="Painel" title={`Olá, ${user.nickname}`} description={cycle ? `Ciclo vigente: ${cycle.name}` : "Nenhum ciclo do Abismo vigente no momento."} />

      <div className="grid gap-3 md:grid-cols-3">
        <QuickAction href="/play" icon={Swords} title="Desafiar jogador" text="Convide pelo nickname e façam o draft" highlight />
        <QuickAction href="/roster" icon={Users} title="Meus personagens" text={owned ? `${owned} na sua conta` : "Importe do HoYoLAB ou adicione à mão"} />
        <QuickAction
          href="/decks"
          icon={Layers}
          title="Meus decks"
          text={decks.length ? `${validDecks} válido(s) · padrão: ${defaultDeck?.name ?? "nenhum"}` : "Monte seu primeiro deck"}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Trophy} label="Posição no ranking" value={position ? `#${position}` : "—"} />
        <Stat icon={Swords} label="Vitórias" value={record?.wins ?? 0} hint={`${record?.losses ?? 0} derrotas · ${record?.draws ?? 0} empates`} />
        <Stat icon={Percent} label="Taxa de vitória" value={formatPercent(record?.winRate ?? null)} />
        <Stat icon={History} label="Partidas validadas" value={record?.games ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Partidas em andamento</CardTitle>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <EmptyState icon={Swords} title="Nenhuma partida em andamento" description="Desafie alguém em Jogar. Convites recebidos aparecem no sino, no topo da página." />
            ) : (
              <ul className="grid gap-2">
                {active.map((m) => {
                  const opponent = m.players.find((p) => p.userId !== user.id);
                  return (
                    <li key={m.id}>
                      <Link href={`/rooms/${m.code}`} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 transition-colors hover:border-primary/50">
                        <MatchStatusBadge status={m.status} />
                        <span className="truncate text-sm">vs {opponent?.user.nickname ?? "aguardando oponente"}</span>
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
            <CardTitle>Últimas partidas</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState icon={History} title="Nenhuma partida concluída" description="Seus resultados validados aparecem aqui." />
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((m) => {
                  const me = m.players.find((p) => p.userId === user.id)!;
                  const opp = m.players.find((p) => p.userId !== user.id);
                  const myTime = m.results.find((r) => r.seat === me.seat);
                  return (
                    <li key={m.id}>
                      <Link href={`/matches/${m.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm hover:text-primary">
                        <Badge variant={me.outcome === "WIN" ? "success" : me.outcome === "LOSS" ? "destructive" : "secondary"}>
                          {me.outcome === "WIN" ? "Vitória" : me.outcome === "LOSS" ? "Derrota" : "Empate"}
                        </Badge>
                        <span>vs {opp?.user.nickname}</span>
                        {myTime && <span className="font-mono text-xs text-muted-foreground">{formatDuration(myTime.finalTimeMs ?? myTime.timeMs)}</span>}
                        <span className="ml-auto text-xs text-muted-foreground">{m.completedAt ? formatDate(m.completedAt) : ""}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {recent.length > 0 && (
              <Link href="/history" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Ver histórico completo <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
