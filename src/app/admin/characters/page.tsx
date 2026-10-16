import type { Metadata } from "next";
import Link from "next/link";
import { CharacterIcon } from "@/components/character-card";
import { PageHeader, Stat } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/server/db";
import { AnalysisButtons } from "../analysis-buttons";

export const metadata: Metadata = { title: "Catálogo" };

export default async function AdminCharactersPage() {
  const [total, enabled, missing, bySource, attention, lastSync] = await Promise.all([
    prisma.character.count(),
    prisma.character.count({ where: { competitiveEnabled: true } }),
    prisma.character.count({ where: { missingFromSource: true } }),
    prisma.character.groupBy({ by: ["externalSource"], _count: { _all: true } }),
    prisma.character.findMany({
      where: { OR: [{ competitiveEnabled: false }, { missingFromSource: true }] },
      orderBy: { createdAt: "desc" },
      include: { prices: { where: { priceVersion: { status: "ACTIVE" } } } },
    }),
    prisma.jobRun.findFirst({ where: { job: "catalog:sync" }, orderBy: { startedAt: "desc" } }),
  ]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Catálogo de personagens"
        description="Sincronizado da API comunitária (yatta.moe; jmp.blue como alternativa). Personagens e preços nunca são apagados se a fonte falhar."
        actions={<AnalysisButtons showSync />}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Personagens" value={total} hint={bySource.map((s) => `${s.externalSource}: ${s._count._all}`).join(" · ")} />
        <Stat label="Liberados" value={enabled} />
        <Stat label="Ausentes da fonte" value={missing} />
        <Stat
          label="Última sincronização automática"
          value={<span className="text-base">{lastSync ? formatDate(lastSync.startedAt) : "—"}</span>}
          hint={lastSync ? `${lastSync.status}${lastSync.error ? `: ${lastSync.error}` : ""}` : undefined}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Requer atenção</CardTitle>
          <CardDescription>
            Personagens novos entram desabilitados. Defina um preço em <Link href="/admin/prices" className="underline">Preços</Link>, publique a tabela e libere o personagem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tudo em ordem.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Personagem</TH>
                  <TH>Situação</TH>
                  <TH>Preço vigente</TH>
                  <TH>Fonte</TH>
                  <TH>Lançamento</TH>
                </TR>
              </THead>
              <TBody>
                {attention.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <CharacterIcon character={c} size={28} /> {c.name}
                      </span>
                    </TD>
                    <TD className="flex flex-wrap gap-1">
                      {!c.competitiveEnabled && <Badge variant="warning">desabilitado</Badge>}
                      {c.missingFromSource && <Badge variant="secondary">ausente na fonte</Badge>}
                    </TD>
                    <TD className="tabular">{c.prices[0]?.cost ?? "sem preço"}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {c.externalSource}:{c.externalId}
                    </TD>
                    <TD className="text-xs">{c.releasedAt ? formatDate(c.releasedAt, false) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
