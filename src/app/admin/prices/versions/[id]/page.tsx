import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Versão de preços" };

export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = await prisma.priceVersion.findUnique({
    where: { id },
    include: {
      publishedBy: { select: { nickname: true } },
      changes: { orderBy: { approvedAt: "asc" }, include: { character: { select: { name: true } }, admin: { select: { nickname: true } } } },
      _count: { select: { prices: true, matches: true } },
    },
  });
  if (!version) notFound();
  return (
    <div>
      <Link href="/admin/prices" className="text-sm text-muted-foreground hover:text-foreground">
        ← Preços
      </Link>
      <PageHeader
        title={`Tabela ${version.number ? `v${version.number}` : "(rascunho)"} ${version.label ? `— ${version.label}` : ""}`}
        description={`${version.status} · vigência ${version.publishedAt ? formatDate(version.publishedAt) : "—"} · publicada por ${version.publishedBy?.nickname ?? "sistema"} · ${version._count.prices} preços · usada em ${version._count.matches} partida(s)`}
      />
      {version.notes && <p className="mb-4 text-sm whitespace-pre-line text-muted-foreground">{version.notes}</p>}
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Personagem</TH>
                <TH className="text-right">Anterior</TH>
                <TH className="text-right">Novo</TH>
                <TH>Origem</TH>
                <TH>Justificativa</TH>
                <TH>Administrador</TH>
                <TH>Aprovação</TH>
                <TH>Vigência</TH>
              </TR>
            </THead>
            <TBody>
              {version.changes.map((c) => (
                <TR key={c.id}>
                  <TD>{c.character.name}</TD>
                  <TD className="text-right tabular">{c.previousCost ?? "—"}</TD>
                  <TD className="text-right font-semibold tabular">{c.newCost}</TD>
                  <TD>
                    <Badge variant="secondary">{c.source}</Badge>
                  </TD>
                  <TD className="max-w-sm text-muted-foreground">{c.justification}</TD>
                  <TD>{c.admin?.nickname ?? "—"}</TD>
                  <TD className="text-xs">{formatDate(c.approvedAt)}</TD>
                  <TD className="text-xs">{c.effectiveAt ? formatDate(c.effectiveAt) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
