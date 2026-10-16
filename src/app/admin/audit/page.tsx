import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const logs = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { admin: { select: { nickname: true } } } });
  return (
    <div className="grid gap-4">
      <PageHeader title="Auditoria" description="Registro imutável das ações administrativas e automáticas (últimas 200)." />
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Responsável</TH>
                <TH>Ação</TH>
                <TH>Entidade</TH>
                <TH>Motivo</TH>
                <TH>Detalhes</TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="text-xs whitespace-nowrap">{formatDate(l.createdAt)}</TD>
                  <TD>{l.admin?.nickname ?? "Sistema"}</TD>
                  <TD className="font-mono text-xs">{l.action}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {l.entityType}
                    {l.entityId ? `:${l.entityId.slice(0, 10)}` : ""}
                  </TD>
                  <TD className="max-w-xs text-xs">{l.reason}</TD>
                  <TD>
                    {(l.before || l.after) && (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">ver</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify({ antes: l.before, depois: l.after }, null, 1)}</pre>
                      </details>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
