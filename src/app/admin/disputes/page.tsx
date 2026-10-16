import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { formatDuration } from "@/domain/results";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/server/db";
import { ResolveDisputeForm } from "./resolve-form";

export const metadata: Metadata = { title: "Disputas" };

export default async function AdminDisputesPage() {
  const [open, resolved] = await Promise.all([
    prisma.matchDispute.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: {
        raisedBy: { select: { nickname: true } },
        match: {
          include: {
            players: { include: { user: { select: { nickname: true } } } },
            results: { include: { evidence: true } },
          },
        },
      },
    }),
    prisma.matchDispute.findMany({
      where: { status: "RESOLVED" },
      orderBy: { resolvedAt: "desc" },
      take: 20,
      include: { raisedBy: { select: { nickname: true } }, resolvedBy: { select: { nickname: true } }, match: { select: { id: true, code: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Disputas" description="Capturas e vídeos são links informados pelos jogadores e não são verificados automaticamente." />
      {open.length === 0 ? (
        <EmptyState title="Nenhuma disputa aberta" />
      ) : (
        open.map((d) => {
          const nick = (seat: "A" | "B") => d.match.players.find((p) => p.seat === seat)?.user.nickname ?? seat;
          return (
            <Card key={d.id} data-testid="dispute-card">
              <CardHeader>
                <CardTitle>
                  Sala {d.match.code}: {nick("A")} vs {nick("B")}
                </CardTitle>
                <CardDescription>
                  Aberta por {d.raisedBy.nickname} em {formatDate(d.createdAt)} contra o resultado de {nick(d.againstSeat)} ({d.againstSeat})
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <blockquote className="rounded-md border-l-4 border-destructive/60 bg-destructive/5 px-3 py-2 text-sm">{d.reason}</blockquote>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["A", "B"] as const).map((seat) => {
                    const r = d.match.results.find((x) => x.seat === seat);
                    return (
                      <div key={seat} className="rounded-lg border bg-background/40 p-3 text-sm">
                        <p className="font-medium">
                          {nick(seat)} ({seat})
                        </p>
                        <p className="font-mono text-xl">{r ? formatDuration(r.timeMs) : "sem tempo"}</p>
                        {r && <Badge variant="secondary">{r.status}</Badge>}
                        <ul className="mt-2 grid gap-1">
                          {r?.evidence.map((e) => (
                            <li key={e.id}>
                              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <ExternalLink className="size-3" /> {e.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                <Link href={`/matches/${d.match.id}`} className="text-sm text-primary hover:underline">
                  Ver draft e histórico completo da partida →
                </Link>
                <ResolveDisputeForm
                  disputeId={d.id}
                  names={{ A: nick("A"), B: nick("B") }}
                  times={{
                    A: d.match.results.find((r) => r.seat === "A")?.timeMs ?? null,
                    B: d.match.results.find((r) => r.seat === "B")?.timeMs ?? null,
                  }}
                />
              </CardContent>
            </Card>
          );
        })
      )}
      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolvidas recentemente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {resolved.map((d) => (
                <li key={d.id}>
                  <Link href={`/matches/${d.match.id}`} className="font-mono text-primary">
                    {d.match.code}
                  </Link>{" "}
                  · {d.resolution} por {d.resolvedBy?.nickname} em {d.resolvedAt ? formatDate(d.resolvedAt) : ""} — {d.resolutionNote}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
