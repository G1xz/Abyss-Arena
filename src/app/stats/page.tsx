import type { Metadata } from "next";
import { BarChart3 as BarChart3Icon } from "lucide-react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { CharacterIcon, ElementDot } from "@/components/character-card";
import { PageContainer, PageHeader, Stat } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { formatPercent } from "@/lib/utils";
import { getCharacterStats } from "@/server/stats/service";
import { PriceEvolutionChart } from "./price-chart";

export const metadata: Metadata = { title: "Estatísticas" };

type Row = Awaited<ReturnType<typeof getCharacterStats>>["rows"][number];

function TopList({ title, description, rows, value, empty }: { title: string; description: string; rows: Row[]; value: (r: Row) => React.ReactNode; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ol className="grid gap-2">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                <CharacterIcon character={r} size={32} />
                <span className="truncate">{r.name}</span>
                <span className="ml-auto font-semibold tabular">{value(r)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default async function StatsPage() {
  const stats = await getCharacterStats();
  const withData = stats.rows.filter((r) => r.metrics);
  const top = <T,>(list: T[], n = 5) => list.slice(0, n);

  const mostPicked = top([...withData].filter((r) => r.metrics!.picks > 0).sort((a, b) => b.metrics!.picks - a.metrics!.picks));
  const mostBanned = top([...withData].filter((r) => r.metrics!.bans > 0).sort((a, b) => b.metrics!.bans - a.metrics!.bans));
  const bestWin = top([...withData].filter((r) => r.reliable).sort((a, b) => b.metrics!.smoothedWinRate - a.metrics!.smoothedWinRate));
  const increases = top([...stats.rows].filter((r) => r.costChange > 0).sort((a, b) => b.costChange - a.costChange));
  const decreases = top([...stats.rows].filter((r) => r.costChange < 0).sort((a, b) => a.costChange - b.costChange));

  const chartDefault = [...increases, ...decreases].map((r) => r.id);
  const chartIds = chartDefault.length ? chartDefault : mostPicked.map((r) => r.id);
  const tableRows = [...stats.rows].filter((r) => r.currentCost !== null).sort((a, b) => (b.metrics?.picks ?? 0) - (a.metrics?.picks ?? 0) || a.name.localeCompare(b.name));
  const activeVersion = stats.history[stats.history.length - 1];

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3Icon} eyebrow="Meta"
        title="Estatísticas dos personagens"
        description="Calculadas apenas sobre partidas com resultado validado (confirmado pelos dois jogadores ou resolvido pela administração)."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Partidas validadas" value={stats.totalMatches} />
        <Stat label="Pick rate médio" value={formatPercent(stats.baselines.pickRate)} hint="picks / oportunidades de pick" />
        <Stat label="Ban rate médio" value={formatPercent(stats.baselines.banRate)} hint="bans / presenças em deck" />
        <Stat label="Tabela vigente" value={activeVersion ? `v${activeVersion.number}` : "—"} hint={activeVersion?.label ?? undefined} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TopList title="Mais escolhidos" description="Total de picks" rows={mostPicked} value={(r) => r.metrics!.picks} empty="Sem partidas validadas ainda." />
        <TopList title="Mais banidos" description="Total de bans" rows={mostBanned} value={(r) => r.metrics!.bans} empty="Sem bans registrados ainda." />
        <TopList
          title="Maior win rate"
          description={`Suavizado; somente com ${stats.minSampleGames}+ jogos`}
          rows={bestWin}
          value={(r) => formatPercent(r.metrics!.smoothedWinRate)}
          empty="Nenhum personagem com amostra suficiente ainda."
        />
        <TopList
          title="Maiores aumentos de custo"
          description="Desde a primeira tabela"
          rows={increases}
          value={(r) => (
            <span className="flex items-center gap-1 text-destructive">
              <ArrowUp className="size-3.5" />+{r.costChange}
            </span>
          )}
          empty="Nenhum aumento até agora."
        />
        <TopList
          title="Maiores reduções de custo"
          description="Desde a primeira tabela"
          rows={decreases}
          value={(r) => (
            <span className="flex items-center gap-1 text-success">
              <ArrowDown className="size-3.5" />
              {r.costChange}
            </span>
          )}
          empty="Nenhuma redução até agora."
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4" /> Como ler
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Pick rate</strong>: vezes escolhido ÷ vezes em que estava disponível (no deck e não banido).
            </p>
            <p>
              <strong className="text-foreground">Ban rate</strong>: vezes banido ÷ vezes em que estava no deck de alguém.
            </p>
            <p>
              <strong className="text-foreground">Win rate suavizado</strong>: puxa amostras pequenas em direção a 50% para evitar distorções.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Evolução de preços</CardTitle>
          <CardDescription>Custo em pontos em cada tabela publicada. Compare até 4 personagens.</CardDescription>
        </CardHeader>
        <CardContent>
          <PriceEvolutionChart
            versions={stats.history.map((v) => ({ number: v.number, publishedAt: v.publishedAt.toISOString(), costs: v.costs }))}
            characters={stats.rows.filter((r) => r.currentCost !== null).map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name))}
            initialIds={chartIds}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Todos os personagens</CardTitle>
          <CardDescription>Taxas com amostra pequena aparecem esmaecidas e não devem ser lidas como representativas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Personagem</TH>
                <TH className="text-right">Custo</TH>
                <TH className="text-right">Picks</TH>
                <TH className="text-right">Pick rate</TH>
                <TH className="text-right">Bans</TH>
                <TH className="text-right">Ban rate</TH>
                <TH className="text-right">Jogos</TH>
                <TH className="text-right">Win rate</TH>
                <TH className="text-right">Suavizado</TH>
              </TR>
            </THead>
            <TBody>
              {tableRows.map((r) => {
                const m = r.metrics;
                return (
                  <TR key={r.id} className={r.reliable ? "" : "text-muted-foreground"}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <CharacterIcon character={r} size={28} />
                        <ElementDot element={r.element} className="size-2" />
                        <span className="text-foreground">{r.name}</span>
                        {!r.reliable && m && <Badge variant="secondary">amostra pequena</Badge>}
                      </span>
                    </TD>
                    <TD className="text-right text-gold tabular">{r.currentCost}</TD>
                    <TD className="text-right tabular">{m?.picks ?? 0}</TD>
                    <TD className="text-right tabular">{m ? formatPercent(m.pickRate) : "—"}</TD>
                    <TD className="text-right tabular">{m?.bans ?? 0}</TD>
                    <TD className="text-right tabular">{m ? formatPercent(m.banRate) : "—"}</TD>
                    <TD className="text-right tabular">{m?.games ?? 0}</TD>
                    <TD className="text-right tabular">{formatPercent(m?.winRate)}</TD>
                    <TD className="text-right tabular">{m && m.games ? formatPercent(m.smoothedWinRate) : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
