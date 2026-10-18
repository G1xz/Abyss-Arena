"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
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
  cancelScheduleAction,
  discardDraftAction,
  publishDraftAction,
  revertPriceAction,
  reviewProposalsAction,
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

export interface ProposalRow {
  id: string;
  character: { id: string; name: string; element: string; rarity: number; iconUrl: string | null };
  currentCost: number;
  suggestedCost: number;
  score: number;
  confidence: number;
  explanation: string;
  signals: Signal[];
  /** A tabela vigente mudou desde a análise: não dá para aprovar. */
  stale: boolean;
  metrics: { pickRate: number; banRate: number; winRate: number; games: number } | null;
}

/**
 * Revisão em lote das propostas: todas começam marcadas com o valor sugerido; o admin desmarca ou edita
 * o que quiser e aprova (ou rejeita) as selecionadas de uma vez, com uma justificativa só.
 */
export function ProposalReview({ proposals, bounds }: { proposals: ProposalRow[]; bounds: { min: number; max: number } }) {
  const { pending, run } = useRun();
  // Guarda só exceções (desmarcadas e valores editados): propostas novas entram marcadas com o sugerido.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const reviewable = proposals.filter((p) => !p.stale);
  const isSelected = (p: ProposalRow) => !p.stale && !deselected.has(p.id);
  const chosen = proposals.filter(isSelected);
  const costOf = (p: ProposalRow) => {
    const raw = edits[p.id];
    return raw === undefined || raw.trim() === "" ? p.suggestedCost : Number(raw);
  };
  const outOfRange = (p: ProposalRow) => {
    const c = costOf(p);
    return !Number.isInteger(c) || c < bounds.min || c > bounds.max;
  };
  const invalid = chosen.filter(outOfRange);
  const allSelected = reviewable.length > 0 && reviewable.every(isSelected);
  const delta = chosen.reduce((sum, p) => sum + (costOf(p) - p.currentCost), 0);
  const ready = chosen.length > 0 && note.trim().length >= 3 && !pending;

  const toggle = (id: string) =>
    setDeselected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const reset = () => {
    setNote("");
    setEdits({});
    setDeselected(new Set());
  };
  const approve = () =>
    run(
      () => reviewProposalsAction({ note, approve: chosen.map((p) => ({ proposalId: p.id, cost: costOf(p) })), reject: [] }),
      `${chosen.length} proposta(s) aprovada(s) e enviada(s) ao rascunho`,
      reset,
    );
  const reject = () => run(() => reviewProposalsAction({ note, approve: [], reject: chosen.map((p) => p.id) }), `${chosen.length} proposta(s) rejeitada(s)`, reset);

  return (
    <div className="grid gap-3" data-testid="proposal-list">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <THead>
            <TR>
              <TH className="w-8">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={allSelected}
                  onChange={() => setDeselected(allSelected ? new Set(reviewable.map((p) => p.id)) : new Set())}
                  aria-label={allSelected ? "Desmarcar todas" : "Marcar todas"}
                  data-testid="proposal-select-all"
                />
              </TH>
              <TH>Personagem</TH>
              <TH className="text-right">Atual</TH>
              <TH className="text-right">Sugerido</TH>
              <TH>Aprovar com</TH>
              <TH className="text-right">Pick</TH>
              <TH className="text-right">Ban</TH>
              <TH className="text-right">Win</TH>
              <TH className="text-right">Jogos</TH>
              <TH>Sinais</TH>
            </TR>
          </THead>
          <TBody>
            {proposals.map((p) => {
              const selected = isSelected(p);
              const cost = costOf(p);
              const edited = cost !== p.suggestedCost;
              const up = p.suggestedCost > p.currentCost;
              return (
                <Fragment key={p.id}>
                  <TR
                    className={cn(!selected && "opacity-50", p.stale && "opacity-40")}
                    data-testid="proposal-row"
                    data-character-name={p.character.name}
                    data-current={p.currentCost}
                    data-suggested={p.suggestedCost}
                  >
                    <TD>
                      <input
                        type="checkbox"
                        className="accent-[var(--primary)]"
                        checked={selected}
                        disabled={p.stale}
                        onChange={() => toggle(p.id)}
                        aria-label={`Incluir ${p.character.name}`}
                        data-testid="proposal-check"
                      />
                    </TD>
                    <TD>
                      <button type="button" className="flex items-center gap-2 text-left" onClick={() => setExpanded(expanded === p.id ? null : p.id)} title="Ver explicação">
                        <CharacterIcon character={p.character} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.character.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            score {p.score.toFixed(2)} · confiança {formatPercent(p.confidence, 0)}
                            {p.stale && <span className="text-warning"> · tabela mudou</span>}
                          </span>
                        </span>
                      </button>
                    </TD>
                    <TD className="text-right tabular text-muted-foreground">{p.currentCost}</TD>
                    <TD className={cn("text-right font-semibold tabular", up ? "text-destructive" : "text-success")}>
                      {p.suggestedCost} <span className="text-[11px] font-normal">({up ? "+" : ""}{p.suggestedCost - p.currentCost})</span>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          className={cn("h-8 w-20 text-right tabular", edited && "border-gold/70", selected && outOfRange(p) && "border-destructive")}
                          min={bounds.min}
                          max={bounds.max}
                          value={edits[p.id] ?? String(p.suggestedCost)}
                          disabled={!selected}
                          onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })}
                          aria-label={`Preço aprovado de ${p.character.name}`}
                          data-testid="proposal-cost"
                        />
                        {edited && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setEdits(({ [p.id]: _removed, ...rest }) => rest)}
                            title={`Voltar ao sugerido (${p.suggestedCost})`}
                          >
                            <Undo2 className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </TD>
                    <TD className="text-right tabular">{p.metrics ? formatPercent(p.metrics.pickRate) : "—"}</TD>
                    <TD className="text-right tabular">{p.metrics ? formatPercent(p.metrics.banRate) : "—"}</TD>
                    <TD className="text-right tabular">{p.metrics ? formatPercent(p.metrics.winRate) : "—"}</TD>
                    <TD className="text-right tabular">{p.metrics?.games ?? "—"}</TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {p.signals.map((s) => (
                          <Badge key={s.code} variant={s.code === "LOW_SAMPLE" || s.code === "EARLY_CYCLE" ? "warning" : "outline"} title={s.detail} className="text-[10px]">
                            {s.label}
                          </Badge>
                        ))}
                      </span>
                    </TD>
                  </TR>
                  {expanded === p.id && (
                    <TR>
                      <TD />
                      <TD colSpan={9} className="text-xs whitespace-normal text-muted-foreground">
                        {p.explanation}
                      </TD>
                    </TR>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      </div>

      <div className="sticky bottom-3 z-10 grid gap-2 rounded-xl border border-primary/40 bg-popover/95 p-3 shadow-xl backdrop-blur md:grid-cols-[auto_1fr_auto] md:items-center">
        <p className="text-sm">
          <span className="font-semibold">{chosen.length}</span> de {proposals.length} selecionada(s)
          {chosen.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · soma das mudanças {delta > 0 ? "+" : ""}
              {delta} pts
            </span>
          )}
          {invalid.length > 0 && <span className="block text-xs text-destructive">Valores fora do intervalo {bounds.min}–{bounds.max}: {invalid.map((p) => p.character.name).join(", ")}</span>}
        </p>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Justificativa da revisão (vale para todas)" data-testid="proposal-note" />
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!ready} onClick={reject} data-testid="proposal-reject-all">
            <X /> Rejeitar selecionadas
          </Button>
          <Button disabled={!ready || invalid.length > 0} onClick={approve} data-testid="proposal-approve-all">
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Aprovar selecionadas
          </Button>
        </div>
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
