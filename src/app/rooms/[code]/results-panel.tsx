"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Flag, Loader2, Plus, Send, Trophy } from "lucide-react";
import { CharacterIcon } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Label, Textarea } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlays";
import type { Seat } from "@/domain/draft";
import { formatDuration, parseDuration } from "@/domain/results";
import { cn } from "@/lib/utils";
import { nick, type RoomContext } from "./shared";

const RESULT_STATUS: Record<string, { label: string; variant: "warning" | "success" | "destructive" }> = {
  SUBMITTED: { label: "Aguardando confirmação", variant: "warning" },
  CONFIRMED: { label: "Confirmado", variant: "success" },
  DISPUTED: { label: "Contestado", variant: "destructive" },
};

const HALF = { FIRST: "1ª metade", SECOND: "2ª metade" } as const;

export function FinalTeams({ ctx }: { ctx: RoomContext }) {
  const { state } = ctx;
  const draft = state.draft;
  if (!draft) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["A", "B"] as Seat[]).map((seat) => {
        const team = draft.picks[seat].map((id) => draft.decks[seat].find((c) => c.characterId === id)!).filter(Boolean);
        const winner = state.status === "COMPLETED" && state.winnerSeat === seat;
        return (
          <div key={seat} className={cn("rounded-xl border bg-card/70 p-4", winner && "border-gold/60 shadow-[0_0_30px_-12px_var(--gold)]")} data-testid={`final-team-${seat}`}>
            <div className="mb-3 flex items-center gap-2">
              <p className="font-display font-semibold">{nick(state, seat)}</p>
              {winner && <Trophy className="size-4 text-gold" />}
              <Badge variant="secondary" className="ml-auto">
                {seat}
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {team.map((c) => (
                <div key={c.characterId} className="flex flex-col items-center gap-1 text-center">
                  <CharacterIcon character={c} size={60} />
                  <span className="w-full truncate text-xs">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RulesCard({ ctx }: { ctx: RoomContext }) {
  const rules = ctx.state.rules;
  if (!rules) return null;
  return (
    <div className="rounded-xl border bg-card/60 p-4 text-sm">
      <p className="font-display font-semibold">{rules.cycleName}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {rules.challenges.map((c) => (
          <li key={`${c.floor}-${c.chamber}-${c.half}`} className="rounded border bg-background/50 px-2 py-0.5 text-xs">
            Andar {c.floor} · Câmara {c.chamber} · {HALF[c.half]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs whitespace-pre-line text-muted-foreground">{rules.rules}</p>
    </div>
  );
}

function SubmitTimeForm({ ctx, current }: { ctx: RoomContext; current?: { timeMs: number; evidence: string[] } }) {
  const { state, emit } = ctx;
  const [time, setTime] = useState(current ? formatDuration(current.timeMs).replace(/s$/, "") : "");
  const [links, setLinks] = useState<string[]>(current?.evidence.length ? current.evidence : [""]);
  const [sending, setSending] = useState(false);
  const parsed = parseDuration(time);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed === null) return toast.error("Formato de tempo inválido. Use m:ss.mmm ou segundos.");
    setSending(true);
    const res = await emit("match:submitResult", { timeMs: parsed, evidenceUrls: links.map((l) => l.trim()).filter(Boolean) });
    setSending(false);
    if (res.ok) toast.success("Tempo enviado");
    else toast.error(res.error);
  };

  return (
    <form onSubmit={submit} className="grid gap-3" data-testid="submit-time-form">
      <div className="grid gap-1.5">
        <Label htmlFor="time">Tempo total (m:ss.mmm)</Label>
        <Input id="time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Ex.: 5:42.310" inputMode="decimal" className="font-mono" data-testid="time-input" />
        <p className="text-xs text-muted-foreground">
          {parsed !== null ? `= ${(parsed / 1000).toFixed(3)} segundos` : "Soma das metades válidas"} · limite {state.config.minResultSeconds}s a{" "}
          {Math.round(state.config.maxResultSeconds / 60)} min
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label>Evidências (opcional)</Label>
        {links.map((l, i) => (
          <Input
            key={i}
            value={l}
            onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder="https://youtube.com/... ou link da captura"
            type="url"
          />
        ))}
        {links.length < 5 && (
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLinks([...links, ""])}>
            <Plus /> Adicionar link
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Links não são verificados automaticamente; servem para eventuais contestações.</p>
      </div>
      <Button type="submit" disabled={sending || parsed === null} data-testid="submit-time">
        {sending ? <Loader2 className="animate-spin" /> : <Send />} {current ? "Corrigir tempo" : "Enviar tempo"}
      </Button>
    </form>
  );
}

function DisputeDialog({ ctx }: { ctx: RoomContext }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    const res = await ctx.emit("match:dispute", { reason });
    setSending(false);
    if (res.ok) {
      toast.success("Contestação registrada. Um administrador vai analisar.");
      setOpen(false);
    } else toast.error(res.error);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive" data-testid="dispute-open">
          <Flag /> Contestar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contestar o tempo do oponente</DialogTitle>
          <DialogDescription>A partida ficará em disputa até a decisão de um administrador. Descreva o problema.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Ex.: o vídeo mostra 6:10 e não 5:10." data-testid="dispute-reason" />
        <div className="flex justify-end">
          <Button variant="destructive" disabled={sending || reason.trim().length < 10} onClick={send} data-testid="dispute-submit">
            {sending && <Loader2 className="animate-spin" />} Enviar contestação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResultsPanel({ ctx }: { ctx: RoomContext }) {
  const { state, mySeat, oppSeat, emit } = ctx;
  const [confirming, setConfirming] = useState(false);
  const mine = mySeat ? state.results[mySeat] : undefined;
  const theirs = oppSeat ? state.results[oppSeat] : undefined;
  const canEdit = state.status === "LOCKED" || state.status === "AWAITING_RESULTS";

  const confirm = async () => {
    setConfirming(true);
    const res = await emit("match:confirmResult");
    setConfirming(false);
    if (res.ok) toast.success("Tempo do oponente confirmado");
    else toast.error(res.error);
  };

  if (state.status === "COMPLETED") {
    const a = state.results.A;
    const b = state.results.B;
    return (
      <div className="rounded-xl border border-gold/50 bg-gold/10 p-5" data-testid="match-completed">
        <div className="flex flex-wrap items-center gap-3">
          <Trophy className="size-8 text-gold" />
          <div>
            <p className="font-display text-xl font-bold" data-testid="winner-text">
              {state.isDraw ? "Empate!" : `Vitória de ${nick(state, state.winnerSeat)}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {nick(state, "A")}: {a ? formatDuration(a.finalTimeMs ?? a.timeMs) : "—"} · {nick(state, "B")}: {b ? formatDuration(b.finalTimeMs ?? b.timeMs) : "—"}
              {state.resolvedBy === "ADMIN" && " · decidido pela administração"}
            </p>
          </div>
          <Button asChild variant="outline" className="ml-auto">
            <Link href={`/matches/${state.id}`}>Ver resumo da partida</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border bg-card/70 p-4">
        <p className="mb-3 font-display font-semibold">Seu resultado</p>
        {!mySeat ? (
          <p className="text-sm text-muted-foreground">Você está assistindo como administrador.</p>
        ) : mine && mine.status !== "SUBMITTED" ? (
          <div className="grid gap-2" data-testid="my-result">
            <p className="font-mono text-2xl font-bold">{formatDuration(mine.timeMs)}</p>
            <Badge variant={RESULT_STATUS[mine.status]?.variant}>{RESULT_STATUS[mine.status]?.label}</Badge>
          </div>
        ) : canEdit ? (
          <>
            {mine && (
              <p className="mb-3 text-sm" data-testid="my-result">
                Enviado: <span className="font-mono font-semibold">{formatDuration(mine.timeMs)}</span> — aguardando confirmação do oponente. Você pode corrigir até lá.
              </p>
            )}
            <SubmitTimeForm ctx={ctx} current={mine} key={mine?.timeMs ?? "new"} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{mine ? formatDuration(mine.timeMs) : "Sem resultado enviado."}</p>
        )}
      </div>

      <div className="rounded-xl border bg-card/70 p-4" data-testid="opponent-result">
        <p className="mb-3 font-display font-semibold">Resultado de {nick(state, oppSeat ?? "B")}</p>
        {!theirs ? (
          <p className="text-sm text-muted-foreground">Ainda não enviado.</p>
        ) : (
          <div className="grid gap-3">
            <p className="font-mono text-2xl font-bold" data-testid="opponent-time">
              {formatDuration(theirs.timeMs)}
            </p>
            <Badge variant={RESULT_STATUS[theirs.status]?.variant}>{RESULT_STATUS[theirs.status]?.label}</Badge>
            {theirs.evidence.length > 0 && (
              <ul className="grid gap-1 text-sm">
                {theirs.evidence.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="size-3.5" /> {url.length > 50 ? `${url.slice(0, 50)}…` : url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {mySeat && state.status === "AWAITING_RESULTS" && theirs.status === "SUBMITTED" && (
              <>
                {!mine && <p className="text-xs text-warning">Envie seu tempo antes de confirmar o do oponente.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!mine || confirming} onClick={confirm} data-testid="confirm-opponent">
                    {confirming ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirmar tempo
                  </Button>
                  <DisputeDialog ctx={ctx} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {state.status === "DISPUTED" && (
        <div className="flex gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm md:col-span-2" data-testid="dispute-banner">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Partida em disputa</p>
            <p className="text-muted-foreground">Um administrador vai analisar os tempos e as evidências. O resultado não conta para ranking ou balanceamento até a decisão.</p>
            {state.disputes
              .filter((d) => d.status === "OPEN")
              .map((d) => (
                <p key={d.id} className="mt-2">
                  <span className="font-medium">{d.raisedBy}:</span> {d.reason}
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
