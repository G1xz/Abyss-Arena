import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Stat } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { getCurrentCycle } from "@/server/abyss/service";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { AnalysisButtons } from "./analysis-buttons";

export const metadata: Metadata = { title: "Administração" };

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export default async function AdminHome() {
  const [users, completed, active, openDisputes, pending, draft, activeVersion, scheduled, lastRun, cycle, settings, logs, disabledChars] = await Promise.all([
    prisma.user.count(),
    prisma.match.count({ where: { status: "COMPLETED" } }),
    prisma.match.count({ where: { status: { in: ["WAITING", "READY", "BANNING", "PICKING", "LOCKED", "AWAITING_RESULTS"] } } }),
    prisma.matchDispute.count({ where: { status: "OPEN" } }),
    prisma.balanceProposal.count({ where: { status: "PENDING" } }),
    prisma.priceVersion.findFirst({ where: { status: "DRAFT" }, include: { _count: { select: { changes: true } } } }),
    prisma.priceVersion.findFirst({ where: { status: "ACTIVE" } }),
    prisma.priceVersion.findFirst({ where: { status: "SCHEDULED" } }),
    prisma.balanceRun.findFirst({ orderBy: { createdAt: "desc" } }),
    getCurrentCycle(),
    getSettings("balance"),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { admin: { select: { nickname: true } } } }),
    prisma.character.count({ where: { competitiveEnabled: false } }),
  ]);
  const cycleMatches = cycle ? await prisma.match.count({ where: { abyssCycleId: cycle.id, status: "COMPLETED" } }) : 0;
  const lastRunSummary = lastRun?.summary as { validMatches?: number; proposalsCreated?: number } | null;

  return (
    <div>
      <PageHeader eyebrow="Administração" title="Visão geral" />
      {openDisputes > 0 && (
        <Alert variant="destructive" className="mb-4">
          {openDisputes} disputa(s) aguardando decisão. <Link href="/admin/disputes" className="underline">Resolver</Link>
        </Alert>
      )}
      {!cycle && (
        <Alert variant="warning" className="mb-4">
          Nenhum ciclo do Abismo vigente — novas salas não podem ser criadas. <Link href="/admin/abyss" className="underline">Configurar ciclo</Link>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usuários" value={users} />
        <Stat label="Partidas validadas" value={completed} hint={`${active} em andamento`} />
        <Stat label="Propostas pendentes" value={pending} hint={draft ? `${draft._count.changes} alteração(ões) no rascunho` : "sem rascunho"} />
        <Stat label="Tabela vigente" value={activeVersion ? `v${activeVersion.number}` : "—"} hint={scheduled?.scheduledFor ? `próxima agendada: ${formatDate(scheduled.scheduledFor)}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balanceamento</CardTitle>
            <CardDescription>
              Métricas diárias automáticas; propostas regulares toda {WEEKDAYS[settings.proposalWeekday]}. Nenhum preço muda sem aprovação e publicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              Ciclo vigente: <strong>{cycle?.name ?? "—"}</strong> · {cycleMatches} partida(s) validada(s) no ciclo
              {cycle && ` (maturidade ${Math.min(100, Math.round((cycleMatches / settings.cycleMaturityMatches) * 100))}%)`}
            </p>
            <p className="text-muted-foreground">
              Última análise: {lastRun ? `${formatDate(lastRun.createdAt)} (${lastRun.kind}) — ${lastRunSummary?.validMatches ?? 0} partidas, ${lastRunSummary?.proposalsCreated ?? 0} propostas` : "nunca"}
            </p>
            <AnalysisButtons />
            <Link href="/admin/prices" className="text-primary hover:underline">
              Revisar propostas e rascunho →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atividade administrativa recente</CardTitle>
            <CardDescription>
              {disabledChars} personagem(ns) desabilitado(s) para competição · <Link href="/admin/audit" className="underline">ver auditoria completa</Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{formatDate(l.createdAt)}</span>
                  <span>
                    <span className="font-medium">{l.admin?.nickname ?? "Sistema"}</span> · {l.action}
                    {l.reason && <span className="text-muted-foreground"> — {l.reason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
