import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import type { Signal } from "@/domain/balance";
import { formatDate } from "@/lib/utils";
import { getLatestMetrics } from "@/server/balance/service";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { AnalysisButtons } from "../analysis-buttons";
import { CharacterPriceTable, DraftPanel, ProposalCard } from "./price-ui";

export const metadata: Metadata = { title: "Preços e propostas" };

export default async function AdminPricesPage() {
  const [active, draft, scheduled, proposals, reviewed, characters, latest, versions, settings] = await Promise.all([
    prisma.priceVersion.findFirst({ where: { status: "ACTIVE" }, include: { prices: true } }),
    prisma.priceVersion.findFirst({
      where: { status: "DRAFT" },
      include: { prices: true, changes: { include: { character: { select: { name: true } }, admin: { select: { nickname: true } } }, orderBy: { approvedAt: "desc" } } },
    }),
    prisma.priceVersion.findFirst({ where: { status: "SCHEDULED" }, include: { _count: { select: { changes: true } } } }),
    prisma.balanceProposal.findMany({
      where: { status: "PENDING" },
      orderBy: [{ score: "desc" }],
      include: { character: { select: { id: true, name: true, element: true, rarity: true, iconUrl: true } } },
    }),
    prisma.balanceProposal.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 15,
      include: { character: { select: { name: true } }, reviewedBy: { select: { nickname: true } } },
    }),
    prisma.character.findMany({ orderBy: [{ name: "asc" }] }),
    getLatestMetrics(),
    prisma.priceVersion.findMany({
      where: { status: { in: ["ACTIVE", "ARCHIVED"] } },
      orderBy: { number: "desc" },
      take: 20,
      include: { publishedBy: { select: { nickname: true } }, _count: { select: { changes: true, matches: true } } },
    }),
    getSettings("competitive"),
  ]);

  const activeCost = new Map(active?.prices.map((p) => [p.characterId, p]) ?? []);
  const draftCost = new Map(draft?.prices.map((p) => [p.characterId, p.cost]) ?? []);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Preços e propostas"
        description={`Tabela vigente v${active?.number ?? "—"}. Preços entre ${settings.minCharacterCost} e ${settings.maxCharacterCost} pontos. Alterações vão para o rascunho e só valem após publicação.`}
        actions={<AnalysisButtons />}
      />

      <DraftPanel
        draft={
          draft
            ? {
                id: draft.id,
                changes: draft.changes.map((c) => ({
                  characterId: c.characterId,
                  name: c.character.name,
                  previousCost: c.previousCost,
                  newCost: c.newCost,
                  source: c.source,
                  justification: c.justification,
                  admin: c.admin?.nickname ?? "—",
                  approvedAt: c.approvedAt.toISOString(),
                })),
              }
            : null
        }
        scheduled={scheduled ? { scheduledFor: scheduled.scheduledFor!.toISOString(), changes: scheduled._count.changes } : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>Propostas pendentes ({proposals.length})</CardTitle>
          <CardDescription>
            Geradas pelo BalanceEngine. Aprovar envia o preço ao rascunho; você pode editar o valor sugerido. Detalhes do algoritmo em docs/BALANCEAMENTO.md.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma proposta pendente.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2" data-testid="proposal-list">
              {proposals.map((p) => {
                const m = latest.metrics.get(p.characterId);
                const details = p.signals as unknown as { signals: Signal[] };
                return (
                  <ProposalCard
                    key={p.id}
                    proposal={{
                      id: p.id,
                      character: p.character,
                      currentCost: p.currentCost,
                      suggestedCost: p.suggestedCost,
                      score: p.score,
                      confidence: p.confidence,
                      explanation: p.explanation,
                      signals: details.signals ?? [],
                      createdAt: p.createdAt.toISOString(),
                      stale: p.basePriceVersionId !== active?.id,
                    }}
                    metrics={m ? { pickRate: m.pickRate, banRate: m.banRate, winRate: m.smoothedWinRate, games: m.games, matches: m.matches } : null}
                    bounds={{ min: settings.minCharacterCost, max: settings.maxCharacterCost }}
                  />
                );
              })}
            </div>
          )}
          {reviewed.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">Revisadas recentemente</summary>
              <ul className="mt-2 grid gap-1 text-sm">
                {reviewed.map((r) => (
                  <li key={r.id}>
                    <Badge variant={r.status === "APPROVED" ? "success" : "secondary"}>{r.status === "APPROVED" ? "aprovada" : "rejeitada"}</Badge>{" "}
                    {r.character.name}: {r.currentCost} → {r.approvedCost ?? r.suggestedCost} · {r.reviewedBy?.nickname} — {r.reviewNote}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personagens e preços</CardTitle>
          <CardDescription>
            Métricas da última análise ({latest.run ? formatDate(latest.run.createdAt) : "nenhuma"}), escopo geral. Novos personagens chegam desabilitados até receberem preço e liberação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CharacterPriceTable
            bounds={{ min: settings.minCharacterCost, max: settings.maxCharacterCost }}
            rows={characters.map((c) => {
              const m = latest.metrics.get(c.id);
              const ap = activeCost.get(c.id);
              return {
                id: c.id,
                name: c.name,
                element: c.element,
                rarity: c.rarity,
                iconUrl: c.iconUrl,
                activeCost: ap?.cost ?? null,
                provisional: ap?.isProvisional ?? false,
                draftCost: draftCost.get(c.id) ?? null,
                enabled: c.competitiveEnabled,
                locked: c.balanceLocked,
                lockReason: c.balanceLockReason,
                missing: c.missingFromSource,
                metrics: m ? { pickRate: m.pickRate, banRate: m.banRate, winRate: m.smoothedWinRate, games: m.games } : null,
              };
            })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de versões</CardTitle>
          <CardDescription>Partidas sempre usam os custos congelados no snapshot do início do draft.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Versão</TH>
                <TH>Status</TH>
                <TH>Vigência</TH>
                <TH>Publicada por</TH>
                <TH className="text-right">Alterações</TH>
                <TH className="text-right">Partidas</TH>
              </TR>
            </THead>
            <TBody>
              {versions.map((v) => (
                <TR key={v.id}>
                  <TD>
                    <Link href={`/admin/prices/versions/${v.id}`} className="font-semibold text-primary hover:underline">
                      v{v.number}
                    </Link>{" "}
                    <span className="text-muted-foreground">{v.label}</span>
                  </TD>
                  <TD>{v.status === "ACTIVE" ? <Badge variant="success">vigente</Badge> : <Badge variant="secondary">arquivada</Badge>}</TD>
                  <TD>{v.publishedAt ? formatDate(v.publishedAt) : "—"}</TD>
                  <TD>{v.publishedBy?.nickname ?? "Sistema"}</TD>
                  <TD className="text-right tabular">{v._count.changes}</TD>
                  <TD className="text-right tabular">{v._count.matches}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
