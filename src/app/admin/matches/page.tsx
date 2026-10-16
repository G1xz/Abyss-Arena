import type { Metadata } from "next";
import Link from "next/link";
import { MatchStatusBadge, PageHeader, STATUS_LABEL } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { formatDuration } from "@/domain/results";
import type { MatchStatus } from "@/generated/prisma/client";
import { cn, formatDate } from "@/lib/utils";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Partidas" };

export default async function AdminMatchesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status && status in STATUS_LABEL ? (status as MatchStatus) : undefined;
  const [matches, counts] = await Promise.all([
    prisma.match.findMany({
      where: filter ? { status: filter } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        players: { include: { user: { select: { nickname: true } } } },
        results: { select: { seat: true, timeMs: true, finalTimeMs: true } },
        priceVersion: { select: { number: true } },
        abyssCycle: { select: { name: true } },
      },
    }),
    prisma.match.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return (
    <div className="grid gap-4">
      <PageHeader title="Partidas" description="Últimas 100 partidas. Admins podem abrir qualquer sala em modo de acompanhamento." />
      <div className="flex flex-wrap gap-1.5 text-sm">
        <Link href="/admin/matches" className={cn("rounded-md border px-2.5 py-1", !filter && "bg-accent")}>
          Todas
        </Link>
        {counts.map((c) => (
          <Link key={c.status} href={`/admin/matches?status=${c.status}`} className={cn("rounded-md border px-2.5 py-1", filter === c.status && "bg-accent")}>
            {STATUS_LABEL[c.status]} ({c._count._all})
          </Link>
        ))}
      </div>
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Sala</TH>
                <TH>Status</TH>
                <TH>Jogador A</TH>
                <TH>Jogador B</TH>
                <TH>Tempos</TH>
                <TH>Tabela</TH>
                <TH>Ciclo</TH>
                <TH>Criada</TH>
              </TR>
            </THead>
            <TBody>
              {matches.map((m) => {
                const p = (seat: "A" | "B") => m.players.find((x) => x.seat === seat);
                const t = (seat: "A" | "B") => {
                  const r = m.results.find((x) => x.seat === seat);
                  return r ? formatDuration(r.finalTimeMs ?? r.timeMs) : "—";
                };
                return (
                  <TR key={m.id}>
                    <TD>
                      <Link href={m.status === "COMPLETED" || m.status === "CANCELLED" ? `/matches/${m.id}` : `/rooms/${m.code}`} className="font-mono text-primary hover:underline">
                        {m.code}
                      </Link>
                    </TD>
                    <TD>
                      <MatchStatusBadge status={m.status} />
                    </TD>
                    <TD className={cn(m.winnerSeat === "A" && "font-semibold text-success")}>{p("A")?.user.nickname ?? "—"}</TD>
                    <TD className={cn(m.winnerSeat === "B" && "font-semibold text-success")}>{p("B")?.user.nickname ?? "—"}</TD>
                    <TD className="font-mono text-xs">
                      {t("A")} / {t("B")}
                    </TD>
                    <TD>v{m.priceVersion.number}</TD>
                    <TD className="text-xs">{m.abyssCycle?.name ?? "—"}</TD>
                    <TD className="text-xs">{formatDate(m.createdAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
