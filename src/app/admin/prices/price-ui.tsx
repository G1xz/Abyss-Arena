"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Lock, Pencil, Send, Trash2, Undo2, Unlock, X } from "lucide-react";
import { CharacterIcon, ElementDot } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, Label, NativeSelect, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Switch } from "@/components/ui/overlays";
import type { Signal } from "@/domain/balance";
import { constellationTable, type ConstellationOverrides, type CostRules } from "@/domain/pricing";
import { cn, formatDate, formatPercent } from "@/lib/utils";
import {
  approveProposalAction,
  cancelScheduleAction,
  discardDraftAction,
  publishDraftAction,
  rejectProposalAction,
  revertPriceAction,
  setBalanceLockAction,
  setCompetitiveAction,
  setPriceAction,
} from "../actions";
import { ActionButton } from "../admin-ui";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        after?.();
      } else toast.error(r.error);
    });
  return { pending, run };
}

const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", SUGGESTED: "Sugerida", INITIAL: "Inicial" };

export function DraftPanel({
  draft,
  scheduled,
}: {
  draft: null | {
    id: string;
    changes: { characterId: string; name: string; previousCost: number | null; newCost: number; source: string; justification: string; admin: string; approvedAt: string }[];
  };
  scheduled: null | { scheduledFor: string; changes: number };
}) {
  const { pending, run } = useRun();
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState("");

  if (scheduled) {
    return (
      <Card className="border-warning/50">
        <CardHeader>
          <CardTitle>Publicação agendada</CardTitle>
          <CardDescription>
            {scheduled.changes} alteração(ões) serão publicadas em {formatDate(scheduled.scheduledFor)}. Para editar preços, cancele o agendamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionButton variant="outline" action={cancelScheduleAction} success="Agendamento cancelado; a versão voltou a ser rascunho">
            <X /> Cancelar agendamento
          </ActionButton>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(draft?.changes.length && "border-primary/50")} data-testid="draft-panel">
      <CardHeader>
        <CardTitle>Rascunho da próxima tabela</CardTitle>
        <CardDescription>
          {draft?.changes.length
            ? `${draft.changes.length} alteração(ões) aguardando publicação.`
            : "Nenhuma alteração pendente. Aprove propostas ou defina preços manualmente para criar o rascunho."}
        </CardDescription>
      </CardHeader>
      {draft && draft.changes.length > 0 && (
        <CardContent className="grid gap-4">
          <Table>
            <THead>
              <TR>
                <TH>Personagem</TH>
                <TH>Preço</TH>
                <TH>Origem</TH>
                <TH>Justificativa</TH>
                <TH>Admin</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {draft.changes.map((c) => (
                <TR key={c.characterId} data-testid="draft-change">
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="tabular">
                    <span className="flex items-center gap-1">
                      {c.previousCost ?? "—"} <ArrowRight className="size-3" />
                      <span className={cn("font-semibold", c.previousCost !== null && c.newCost > c.previousCost ? "text-destructive" : "text-success")}>{c.newCost}</span>
                    </span>
                  </TD>
                  <TD>
                    <Badge variant={c.source === "SUGGESTED" ? "default" : "secondary"}>{SOURCE_LABEL[c.source]}</Badge>
                  </TD>
                  <TD className="max-w-xs truncate text-muted-foreground" title={c.justification}>
                    {c.justification}
                  </TD>
                  <TD className="text-muted-foreground">{c.admin}</TD>
                  <TD>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revertPriceAction(c.characterId), "Alteração desfeita")}>
                      <Undo2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="grid gap-3 rounded-lg border bg-background/40 p-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="pub-label">Nome da versão (opcional)</Label>
              <Input id="pub-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Ajuste semanal 42" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pub-when">Agendar para (opcional)</Label>
              <Input id="pub-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <ActionButton
                variant="ghost"
                className="text-destructive"
                action={discardDraftAction}
                confirmText="Descartar todas as alterações do rascunho? Propostas aprovadas voltam a pendentes."
                success="Rascunho descartado"
              >
                <Trash2 />
              </ActionButton>
              <Button
                disabled={pending}
                data-testid="publish-draft"
                onClick={() =>
                  run(
                    () => publishDraftAction({ label: label || undefined, notes: notes || undefined, scheduledFor: when ? new Date(when).toISOString() : undefined }),
                    when ? "Publicação agendada" : "Nova tabela publicada",
                  )
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Send />} {when ? "Agendar" : "Publicar agora"}
              </Button>
            </div>
            <div className="grid gap-1.5 md:col-span-3">
              <Label htmlFor="pub-notes">Notas da versão</Label>
              <Textarea id="pub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Resumo das mudanças para a comunidade" />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ProposalCard({
  proposal,
  metrics,
  bounds,
}: {
  proposal: {
    id: string;
    character: { id: string; name: string; element: string; rarity: number; iconUrl: string | null };
    currentCost: number;
    suggestedCost: number;
    score: number;
    confidence: number;
    explanation: string;
    signals: Signal[];
    createdAt: string;
    stale: boolean;
  };
  metrics: { pickRate: number; banRate: number; winRate: number; games: number; matches: number } | null;
  bounds: { min: number; max: number };
}) {
  const { pending, run } = useRun();
  const [cost, setCost] = useState(proposal.suggestedCost);
  const [note, setNote] = useState("");
  const up = proposal.suggestedCost > proposal.currentCost;
  return (
    <div className="grid gap-3 rounded-xl border bg-background/40 p-4" data-testid="proposal-card">
      <div className="flex items-center gap-3">
        <CharacterIcon character={proposal.character} size={44} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{proposal.character.name}</p>
          <p className="text-xs text-muted-foreground">
            score {proposal.score.toFixed(2)} · confiança {formatPercent(proposal.confidence, 0)}
          </p>
        </div>
        <span className={cn("ml-auto flex items-center gap-1 font-display text-xl font-bold tabular", up ? "text-destructive" : "text-success")}>
          {proposal.currentCost} <ArrowRight className="size-4" /> {proposal.suggestedCost}
        </span>
      </div>
      {metrics && (
        <dl className="grid grid-cols-4 gap-2 text-center text-xs">
          {[
            ["Pick", formatPercent(metrics.pickRate)],
            ["Ban", formatPercent(metrics.banRate)],
            ["Win (suav.)", formatPercent(metrics.winRate)],
            ["Jogos", metrics.games],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-muted/50 px-1 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-semibold tabular">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {proposal.signals.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {proposal.signals.map((s) => (
            <li key={s.code}>
              <Badge variant={s.code === "LOW_SAMPLE" || s.code === "EARLY_CYCLE" ? "warning" : "outline"} title={s.detail}>
                {s.label}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{proposal.explanation}</p>
      {proposal.stale && <p className="text-xs text-warning">A tabela vigente mudou desde esta análise; gere uma nova análise.</p>}
      <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
        <Input
          type="number"
          aria-label="Preço aprovado"
          min={bounds.min}
          max={bounds.max}
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
          data-testid="proposal-cost"
        />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Justificativa (obrigatória)" data-testid="proposal-note" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending || note.trim().length < 3} onClick={() => run(() => rejectProposalAction(proposal.id, { note }), "Proposta rejeitada")}>
          <X /> Rejeitar
        </Button>
        <Button
          size="sm"
          disabled={pending || note.trim().length < 3 || proposal.stale}
          onClick={() => run(() => approveProposalAction(proposal.id, { cost, note }), "Proposta aprovada e enviada ao rascunho")}
          data-testid="proposal-approve"
        >
          <Check /> Aprovar {cost !== proposal.suggestedCost && "(editada)"}
        </Button>
      </div>
    </div>
  );
}

interface PriceRow {
  id: string;
  name: string;
  element: string;
  rarity: number;
  iconUrl: string | null;
  activeCost: number | null;
  activeOverrides: ConstellationOverrides;
  provisional: boolean;
  draftCost: number | null;
  draftOverrides: ConstellationOverrides | null;
  enabled: boolean;
  locked: boolean;
  lockReason: string | null;
  missing: boolean;
  metrics: { pickRate: number; banRate: number; winRate: number; games: number } | null;
}

function PriceDialog({ row, bounds, costRules }: { row: PriceRow; bounds: { min: number; max: number }; costRules: CostRules }) {
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(row.draftCost ?? row.activeCost ?? (row.rarity === 5 ? 100 : 40));
  const initialOverrides = row.draftOverrides ?? row.activeOverrides;
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialOverrides).map(([k, v]) => [k, String(v)])),
  );
  const [justification, setJustification] = useState("");
  const { pending, run } = useRun();
  const parsedOverrides: ConstellationOverrides = Object.fromEntries(
    Object.entries(overrides)
      .filter(([, v]) => v.trim() !== "" && Number(v) >= 0)
      .map(([k, v]) => [k, Math.round(Number(v))]),
  );
  const curveOnly = constellationTable(cost, row.rarity, null, costRules);
  const table = constellationTable(cost, row.rarity, parsedOverrides, costRules);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Definir preço de ${row.name}`} data-testid={`set-price-${row.id}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preço de {row.name}</DialogTitle>
          <DialogDescription>
            Vigente: C0 = {row.activeCost ?? "sem preço"}. O novo valor entra no rascunho e só vale após a publicação. Custo base entre {bounds.min} e {bounds.max}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cost">Custo base (C0)</Label>
            <Input id="cost" type="number" min={bounds.min} max={bounds.max} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Ajustes por constelação (vazio = segue a curva)</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((c) => (
                <label key={c} className="grid gap-1 text-center text-xs">
                  <span className="text-muted-foreground">C{c}</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 px-1 text-center"
                    placeholder={String(curveOnly[c])}
                    value={overrides[String(c)] ?? ""}
                    onChange={(e) => setOverrides({ ...overrides, [String(c)]: e.target.value })}
                    aria-label={`Custo em C${c}`}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Resultado: {table.map((v, i) => `C${i} ${v}`).join(" · ")}
              {row.rarity === 5 && ` (5★: +${costRules.levelBonus.level95}% no nível 95 e +${costRules.levelBonus.level100}% no 100)`}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="just">Justificativa</Label>
            <Textarea id="just" value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} />
          </div>
          <Button
            disabled={pending || justification.trim().length < 3}
            onClick={() => run(() => setPriceAction({ characterId: row.id, cost, overrides: parsedOverrides, justification }), "Preço registrado no rascunho", () => setOpen(false))}
          >
            {pending && <Loader2 className="animate-spin" />} Salvar no rascunho
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CharacterPriceTable({ rows, bounds, costRules }: { rows: PriceRow[]; bounds: { min: number; max: number }; costRules: CostRules }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const { pending, run } = useRun();
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.name.toLowerCase().includes(query.trim().toLowerCase()) &&
          (filter === "all" ||
            (filter === "disabled" && !r.enabled) ||
            (filter === "locked" && r.locked) ||
            (filter === "changed" && r.draftCost !== null && r.draftCost !== r.activeCost) ||
            (filter === "noprice" && r.activeCost === null) ||
            (filter === "missing" && r.missing)),
      ),
    [rows, query, filter],
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar personagem" value={query} onChange={(e) => setQuery(e.target.value)} />
        <NativeSelect className="max-w-56" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtro">
          <option value="all">Todos ({rows.length})</option>
          <option value="disabled">Desabilitados</option>
          <option value="noprice">Sem preço vigente</option>
          <option value="changed">Alterados no rascunho</option>
          <option value="locked">Bloqueados para sugestões</option>
          <option value="missing">Ausentes da fonte</option>
        </NativeSelect>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Personagem</TH>
            <TH className="text-right">C0 vigente</TH>
            <TH className="text-right">Rascunho</TH>
            <TH className="text-right">Pick</TH>
            <TH className="text-right">Ban</TH>
            <TH className="text-right">Win</TH>
            <TH className="text-right">Jogos</TH>
            <TH>Competitivo</TH>
            <TH>Sugestões</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {visible.map((r) => (
            <TR key={r.id}>
              <TD>
                <span className="flex items-center gap-2">
                  <CharacterIcon character={r} size={28} />
                  <ElementDot element={r.element} className="size-2" />
                  <span>{r.name}</span>
                  {r.missing && <Badge variant="warning">ausente na fonte</Badge>}
                </span>
              </TD>
              <TD className="text-right text-gold tabular">
                {r.activeCost ?? "—"}
                {r.provisional && <span title="Provisório">*</span>}
                {Object.keys(r.activeOverrides).length > 0 && (
                  <span className="ml-1 text-[10px] text-primary" title={Object.entries(r.activeOverrides).map(([k, v]) => `C${k}=${v}`).join(", ")}>
                    ajustes
                  </span>
                )}
              </TD>
              <TD className={cn("text-right tabular", r.draftCost !== null && r.draftCost !== r.activeCost && "font-semibold text-primary")}>
                {r.draftCost !== null && r.draftCost !== r.activeCost ? r.draftCost : "—"}
              </TD>
              <TD className="text-right tabular">{r.metrics ? formatPercent(r.metrics.pickRate) : "—"}</TD>
              <TD className="text-right tabular">{r.metrics ? formatPercent(r.metrics.banRate) : "—"}</TD>
              <TD className="text-right tabular">{r.metrics?.games ? formatPercent(r.metrics.winRate) : "—"}</TD>
              <TD className="text-right tabular">{r.metrics?.games ?? 0}</TD>
              <TD>
                <Switch
                  checked={r.enabled}
                  disabled={pending}
                  aria-label={`Liberar ${r.name} para competição`}
                  onCheckedChange={(v) => run(() => setCompetitiveAction(r.id, v), v ? `${r.name} liberado` : `${r.name} desabilitado`)}
                />
              </TD>
              <TD>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  title={r.locked ? `Bloqueado: ${r.lockReason ?? ""}` : "Bloquear sugestões automáticas"}
                  onClick={() => {
                    if (r.locked) return run(() => setBalanceLockAction(r.id, false, ""), "Sugestões reativadas");
                    const reason = window.prompt(`Motivo para bloquear sugestões para ${r.name}:`);
                    if (reason !== null) run(() => setBalanceLockAction(r.id, true, reason), "Sugestões bloqueadas");
                  }}
                >
                  {r.locked ? <Lock className="text-warning" /> : <Unlock className="text-muted-foreground" />}
                </Button>
              </TD>
              <TD>
                <PriceDialog row={r} bounds={bounds} costRules={costRules} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
