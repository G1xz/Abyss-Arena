import type { Metadata } from "next";
import { Trophy as TrophyIcon } from "lucide-react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { cn, formatPercent } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/next";
import { getRanking } from "@/server/stats/service";

export const metadata: Metadata = { title: "Ranking" };

export default async function RankingPage() {
  const [ranking, user] = await Promise.all([getRanking(), getCurrentUser()]);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        icon={TrophyIcon} eyebrow="Competitivo"
        title="Ranking de jogadores"
        description="Ordem: mais vitórias → maior taxa de vitória → menos derrotas. Só contam partidas com resultado validado."
      />
      {ranking.length === 0 ? (
        <EmptyState title="Ranking vazio" description="Assim que as primeiras partidas forem confirmadas, os jogadores aparecem aqui." />
      ) : (
        <Card>
          <CardContent>
            <Table data-testid="ranking-table">
              <THead>
                <TR>
                  <TH className="w-12">#</TH>
                  <TH>Jogador</TH>
                  <TH className="text-right">V</TH>
                  <TH className="text-right">D</TH>
                  <TH className="text-right">E</TH>
                  <TH className="text-right">Partidas</TH>
                  <TH className="text-right">Taxa</TH>
                </TR>
              </THead>
              <TBody>
                {ranking.map((r, i) => (
                  <TR key={r.userId} className={cn(r.userId === user?.id && "bg-primary/10")}>
                    <TD className="font-display font-bold tabular">
                      {i < 3 ? <Trophy className={cn("size-4", i === 0 ? "text-gold" : i === 1 ? "text-zinc-300" : "text-amber-700")} /> : i + 1}
                    </TD>
                    <TD>
                      <Link href={`/players/${encodeURIComponent(r.nickname)}`} className="font-medium hover:text-primary">
                        {r.nickname}
                      </Link>
                    </TD>
                    <TD className="text-right text-success tabular">{r.wins}</TD>
                    <TD className="text-right text-destructive tabular">{r.losses}</TD>
                    <TD className="text-right tabular">{r.draws}</TD>
                    <TD className="text-right tabular">{r.games}</TD>
                    <TD className="text-right font-semibold tabular">{formatPercent(r.winRate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
