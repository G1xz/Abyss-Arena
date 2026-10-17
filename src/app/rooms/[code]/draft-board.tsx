"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Loader2, ShieldCheck, SkipForward, Swords, Timer, Undo2, X } from "lucide-react";
import { ConstellationBadge, CostPill } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { ELEMENT_META, type ElementKey } from "@/domain/catalog";
import { clockRemainingMs, formatClock, opponentOf, type DraftStepKind, type Seat } from "@/domain/draft";
import { cn } from "@/lib/utils";
import type { DraftCharacterView, MatchView } from "@/server/matches/view";
import { nick, type RoomContext } from "./shared";

type Draft = NonNullable<MatchView["draft"]>;

const STEP_LABEL: Record<DraftStepKind, string> = { IMMUNE: "Imune", BAN: "Ban", PICK: "Pick" };
const STEP_TONE: Record<DraftStepKind, { text: string; border: string; bg: string; ring: string }> = {
  IMMUNE: { text: "text-gold", border: "border-gold/60", bg: "bg-gold/10", ring: "ring-gold" },
  BAN: { text: "text-ban", border: "border-ban/60", bg: "bg-ban/10", ring: "ring-ban" },
  PICK: { text: "text-pick", border: "border-pick/60", bg: "bg-pick/10", ring: "ring-pick" },
};

/** Tempo restante dos dois relógios, atualizado em tempo real a partir do horário do servidor. */
function useClocks(draft: Draft) {
  const clock = draft.clock;
  const offset = useMemo(() => (clock ? Date.parse(clock.serverNow) - Date.now() : 0), [clock]);
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(clock?.turnStartedAt && draft.currentStep);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  if (!clock) return null;
  const since = clock.turnStartedAt ? Date.parse(clock.turnStartedAt) : null;
  const remaining = (seat: Seat) =>
    clockRemainingMs(clock.limitMs, clock.usedMs[seat], running && draft.currentStep?.actor === seat ? since : null, now + offset);
  return { A: remaining("A"), B: remaining("B") };
}

function charactersById(draft: Draft) {
  return new Map([...draft.decks.A, ...draft.decks.B].map((c) => [c.characterId, c]));
}

/** Retrato compacto: ícone, custo, constelação/nível e marcações do draft. `fluid` ocupa a largura disponível. */
function Portrait({ c, size, fluid, className, children }: { c: DraftCharacterView; size: number; fluid?: boolean; className?: string; children?: React.ReactNode }) {
  const meta = ELEMENT_META[c.element as ElementKey];
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-md",
        c.rarity === 5 ? "bg-gradient-to-b from-[#8a6530] to-[#3b2a19]" : "bg-gradient-to-b from-[#62509a] to-[#2a2442]",
        fluid && "aspect-square w-full",
        className,
      )}
      style={fluid ? undefined : { width: size, height: size }}
    >
      {c.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.iconUrl} alt={c.name} width={size} height={size} loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-xs">{c.name.slice(0, 2)}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: meta?.color }} />
      {children}
    </span>
  );
}

function SeatTag({ seat, className }: { seat: Seat; className?: string }) {
  return (
    <span className={cn("grid size-4 place-items-center rounded-full text-[9px] font-bold", seat === "A" ? "bg-primary text-white" : "bg-gold text-black", className)}>
      {seat}
    </span>
  );
}

function DeckPanel({
  ctx,
  seat,
  candidate,
  onSelect,
}: {
  ctx: RoomContext;
  seat: Seat;
  candidate: string | null;
  onSelect: (id: string) => void;
}) {
  const { state, mySeat } = ctx;
  const draft = state.draft!;
  const step = draft.currentStep;
  const myTurn = Boolean(step && mySeat && step.actor === mySeat);
  // Em qual deck o jogador da vez escolhe: ban no deck do oponente; imune e pick no próprio.
  const actingDeck = step ? (step.type === "BAN" ? opponentOf(step.actor) : step.actor) : null;
  const options = new Set(seat === actingDeck ? draft.options : []);
  const immune = [draft.immune.A, draft.immune.B];
  const title = mySeat ? (seat === mySeat ? "Seu deck" : `Deck de ${nick(state, seat)}`) : `Deck de ${nick(state, seat)} (${seat})`;

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card/70 p-3" aria-label={title} data-testid={`deck-panel-${seat}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate font-display text-sm font-semibold">{title}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {draft.deckNames[seat]} · <span className="text-gold">{draft.deckCosts[seat]} pts</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5">
        {draft.decks[seat].map((c) => {
          const id = c.characterId;
          const banned = draft.banned.includes(id);
          const pickedBy = (["A", "B"] as Seat[]).filter((s) => draft.picks[s].includes(id));
          const isImmune = immune.includes(id);
          const eligible = draft.immunityActive && draft.eligibleImmune.includes(id);
          const clickable = myTurn && options.has(id);
          const selected = clickable && candidate === id;
          const dim = Boolean(step) && myTurn && !clickable && !banned && pickedBy.length === 0 && !isImmune;
          const tone = step ? STEP_TONE[step.type] : null;
          return (
            <button
              key={id}
              type="button"
              disabled={!clickable}
              onClick={() => onSelect(id)}
              data-testid={`draft-char-${seat}-${id}`}
              data-state={banned ? "banned" : pickedBy.length ? "picked" : selected ? "selected" : clickable ? "option" : "default"}
              data-option={clickable ? "true" : undefined}
              data-immune={isImmune ? "true" : undefined}
              title={`${c.name} · ${c.cost} pts`}
              className={cn(
                "group flex min-w-0 flex-col items-stretch gap-0.5 rounded-lg border border-transparent p-0.5 text-left transition-all",
                clickable && tone && cn("cursor-pointer", tone.border, "hover:-translate-y-0.5 hover:bg-accent/40"),
                selected && tone && cn("ring-2", tone.ring, tone.bg),
                dim && "opacity-45",
                !clickable && "cursor-default",
              )}
            >
              <Portrait
                c={c}
                size={64}
                fluid
                className={cn(banned && "opacity-40 grayscale", isImmune && "ring-2 ring-gold", !isImmune && eligible && "outline outline-1 outline-gold/60 outline-dashed")}
              >
                <CostPill cost={c.cost} className="absolute top-0.5 right-0.5 px-1 py-0 text-[10px]" />
                <ConstellationBadge constellation={c.constellation} level={c.level} rarity={c.rarity} className="absolute bottom-1 left-0.5 px-1 py-0 text-[9px]" />
                {banned && (
                  <span className="absolute inset-0 grid place-items-center bg-ban/20">
                    <Ban className="size-8 text-ban drop-shadow" strokeWidth={2.5} />
                  </span>
                )}
                {(pickedBy.length > 0 || isImmune) && (
                  <span className="absolute top-0.5 left-0.5 flex gap-0.5">
                    {isImmune && <ShieldCheck className="size-4 rounded-full bg-black/70 p-0.5 text-gold" aria-label="Imune" />}
                    {pickedBy.map((s) => (
                      <SeatTag key={s} seat={s} />
                    ))}
                  </span>
                )}
                {selected && (
                  <span className="absolute inset-0 grid place-items-center bg-black/30">
                    <Check className="size-7 text-white drop-shadow" strokeWidth={3} />
                  </span>
                )}
              </Portrait>
              <span className="truncate px-0.5 text-[11px] leading-tight font-medium">{c.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Ordem do draft em uma linha, separada por fase. */
function Timeline({ draft, mySeat }: { draft: Draft; mySeat: Seat | null }) {
  const byId = charactersById(draft);
  const done = new Map(draft.actions.map((a) => [a.stepIndex, a]));
  const phases = (["IMMUNE", "BAN", "PICK"] as DraftStepKind[])
    .map((type) => ({ type, steps: draft.sequence.map((s, i) => ({ ...s, index: i })).filter((s) => s.type === type) }))
    .filter((p) => p.steps.length);
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" aria-label="Sequência do draft" data-testid="draft-sequence">
      {phases.map((phase) => (
        <li key={phase.type} className="flex flex-wrap items-center gap-1">
          <span className={cn("mr-0.5 text-[10px] font-semibold tracking-wider uppercase", STEP_TONE[phase.type].text)}>
            {phase.type === "IMMUNE" ? "Imunes" : phase.type === "BAN" ? "Bans" : "Picks"}
          </span>
          {phase.steps.map((s) => {
            const action = done.get(s.index);
            const character = action?.characterId ? byId.get(action.characterId) : undefined;
            const current = s.index === draft.stepIndex && !draft.isComplete;
            return (
              <span
                key={s.index}
                aria-current={current ? "step" : undefined}
                title={`${STEP_LABEL[s.type]} ${s.actor}${character ? `: ${character.name}` : action ? ": passou" : ""}`}
                className={cn(
                  "relative grid size-6 place-items-center overflow-hidden rounded border text-[10px] font-bold",
                  s.actor === "A" ? "border-primary/40" : "border-gold/40",
                  current && cn("ring-2", STEP_TONE[s.type].ring),
                  !action && !current && "opacity-50",
                  s.actor === mySeat && !action && "bg-accent/40",
                )}
              >
                {character ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={character.iconUrl ?? ""} alt="" className={cn("size-full object-cover", s.type === "BAN" && "grayscale")} />
                ) : (
                  <span className={s.actor === "A" ? "text-primary" : "text-gold"}>{action ? "–" : s.actor}</span>
                )}
              </span>
            );
          })}
        </li>
      ))}
    </ol>
  );
}

function ClockChip({ ms, active, seat }: { ms: number | undefined; active: boolean; seat: Seat }) {
  if (ms === undefined) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
        active ? "border-primary/60 bg-primary/15" : "border-border/70 text-muted-foreground",
        ms < 0 ? "text-ban" : ms < 30_000 && active ? "text-warning" : "",
      )}
      data-testid={`clock-${seat}`}
    >
      <Timer className="size-3.5" />
      {formatClock(ms)}
    </span>
  );
}

function PlayerHeader({ ctx, seat, clock, align }: { ctx: RoomContext; seat: Seat; clock: number | undefined; align: "left" | "right" }) {
  const { state, online } = ctx;
  const draft = state.draft!;
  const player = state.players[seat];
  const active = draft.currentStep?.actor === seat;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
      <SeatTag seat={seat} className="size-5 text-[11px]" />
      <span className={cn("size-2 shrink-0 rounded-full", player && online.includes(player.userId) ? "bg-success" : "bg-muted-foreground/40")} />
      <span className={cn("truncate font-semibold", active && "text-foreground", !active && "text-muted-foreground")}>{nick(state, seat)}</span>
      <ClockChip ms={clock} active={active} seat={seat} />
      {draft.undo[seat].left > 0 && (
        <span className="shrink-0 text-[11px] text-muted-foreground" title="Desfazer restante">
          <Undo2 className="inline size-3" /> {draft.undo[seat].left}
        </span>
      )}
    </div>
  );
}

/** Vaga do tabuleiro. `fluid`: ocupa a coluna (picks); senão, 44 px sem legenda (bans e imunes, nome no title). */
function Slot({ c, tone, label, fluid, className }: { c?: DraftCharacterView; tone: "pick" | "ban" | "immune"; label?: string; fluid?: boolean; className?: string }) {
  const border = tone === "pick" ? "border-pick/40" : tone === "ban" ? "border-ban/40" : "border-gold/50";
  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-0.5", fluid ? "w-full min-w-0" : "w-11", className)} title={c?.name}>
      {c ? (
        <Portrait
          c={c}
          size={44}
          fluid={fluid}
          className={cn(tone === "ban" && "opacity-60 grayscale", tone === "immune" && "ring-2 ring-gold", tone === "pick" && "ring-1 ring-pick/50")}
        >
          {tone === "ban" && <Ban className="absolute inset-0 m-auto size-6 text-ban" />}
        </Portrait>
      ) : (
        <span
          className={cn(
            "grid place-items-center rounded-md border border-dashed text-[10px] text-muted-foreground",
            fluid ? "aspect-square w-full text-xs" : "size-11",
            border,
          )}
        >
          {label}
        </span>
      )}
      {fluid && <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">{c?.name ?? " "}</span>}
    </div>
  );
}

/** Parte de baixo: picks de cada jogador nas laterais, bans e imunes separados no centro. */
function Board({ ctx, order }: { ctx: RoomContext; order: Seat[] }) {
  const { state } = ctx;
  const draft = state.draft!;
  const cfg = state.config.draft;
  const byId = charactersById(draft);
  const get = (id: string | null | undefined) => (id ? byId.get(id) : undefined);

  const picks = (seat: Seat, align: "left" | "right") => (
    <div className="grid min-w-0 gap-1.5" data-testid={`team-${seat}`}>
      <p className={cn("text-xs font-semibold tracking-wider text-pick uppercase", align === "right" && "lg:text-right")}>
        Picks · {nick(state, seat)}
      </p>
      {/* Do lado direito, o 1º pick fica na borda (espelhado), como nos decks acima. */}
      <div className={cn("grid w-full max-w-[720px] grid-cols-4 gap-2 sm:grid-cols-8", align === "right" && "lg:ml-auto lg:[direction:rtl]")}>
        {Array.from({ length: cfg.picksPerPlayer }).map((_, i) => {
          const immuneSlot = draft.immuneSlots.includes(i + 1);
          return (
            <div key={i} className="relative min-w-0 [direction:ltr]">
              <Slot c={get(draft.picks[seat][i])} tone="pick" label={`${i + 1}º`} fluid />
              {immuneSlot && <ShieldCheck className="absolute -top-1 -right-1 size-4 rounded-full bg-background p-0.5 text-gold" aria-label="Pick que aceita imune" />}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="grid items-start gap-4 rounded-xl border bg-card/60 p-3 lg:grid-cols-[1fr_auto_1fr]">
      {picks(order[0]!, "left")}
      {/* Bans de cada jogador numa linha e, ao lado, o imune que ele declarou. */}
      <div className="grid content-start gap-1.5 justify-self-center rounded-lg border border-ban/25 bg-ban/5 p-2" data-testid="bans-board">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
          <span className="w-4" />
          <span className="text-center text-ban" style={{ width: cfg.bansPerPlayer * 44 + (cfg.bansPerPlayer - 1) * 6 }}>
            Bans
          </span>
          {draft.immunityActive && <span className="ml-3 w-11 text-center text-gold">Imune</span>}
        </div>
        {order.map((seat) => (
          <div key={seat} className="flex items-center gap-1.5">
            <SeatTag seat={seat} />
            {Array.from({ length: cfg.bansPerPlayer }).map((_, i) => (
              <Slot key={i} c={get(draft.bans[seat][i])} tone="ban" />
            ))}
            {draft.immunityActive && (
              <>
                <span className="mx-1 h-8 w-px bg-gold/30" aria-hidden />
                <Slot c={get(draft.immune[seat])} tone="immune" className="" />
              </>
            )}
          </div>
        ))}
      </div>
      {picks(order[1]!, "right")}
    </div>
  );
}

export function DraftBoard({ ctx }: { ctx: RoomContext }) {
  const { state, mySeat, emit } = ctx;
  const draft = state.draft!;
  const [candidate, setCandidate] = useState<string | null>(null);
  const [sending, setSending] = useState<null | "confirm" | "undo" | "skip">(null);
  const clocks = useClocks(draft);

  const step = draft.currentStep;
  const myTurn = Boolean(step && mySeat && step.actor === mySeat);
  const byId = charactersById(draft);
  // A seleção só vale para o passo em que foi feita.
  const selection = candidate && myTurn && draft.options.includes(candidate) ? candidate : null;
  const selected = selection ? byId.get(selection) : null;
  const order: Seat[] = mySeat === "B" ? ["B", "A"] : ["A", "B"];
  const immuneSlot = step?.type === "PICK" && draft.pickNumber !== null && draft.immuneSlots.includes(draft.pickNumber);
  const canUndo = Boolean(mySeat && draft.undo[mySeat].available);

  const send = async (kind: "confirm" | "undo" | "skip") => {
    setSending(kind);
    const res =
      kind === "undo"
        ? await emit("match:undo")
        : await emit("match:draftAction", { stepIndex: draft.stepIndex, characterId: kind === "skip" ? null : selection });
    setSending(null);
    if (!res.ok) toast.error(res.error);
    setCandidate(null);
  };

  const opp = mySeat ? nick(state, opponentOf(mySeat)) : "";
  const message = draft.isComplete
    ? "Draft concluído: times travados. Hora do Abismo!"
    : myTurn
      ? draft.options.length === 0
        ? "Você não tem nenhuma opção válida neste turno: passe a vez."
        : step!.type === "IMMUNE"
          ? "Sua vez: declare um personagem imune (está nos dois decks, com a mesma constelação)."
          : step!.type === "BAN"
            ? `Sua vez: bana um personagem do deck de ${opp} (o ban vale para os dois).`
            : `Sua vez: escolha seu ${draft.pickNumber}º pick${immuneSlot ? " (pode ser um imune)" : ""}.`
      : `Aguardando ${nick(state, step!.actor)} ${step!.type === "IMMUNE" ? "declarar o imune" : step!.type === "BAN" ? "banir" : `escolher o ${draft.pickNumber}º pick`}…`;
  const tone = step ? STEP_TONE[step.type] : null;

  return (
    <div className="grid gap-3" data-testid="draft-board">
      <div className="grid items-center gap-3 rounded-xl border bg-card/60 px-3 py-2 lg:grid-cols-[1fr_auto_1fr]">
        <PlayerHeader ctx={ctx} seat={order[0]!} clock={clocks?.[order[0]!]} align="left" />
        <Timeline draft={draft} mySeat={mySeat} />
        <PlayerHeader ctx={ctx} seat={order[1]!} clock={clocks?.[order[1]!]} align="right" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {order.map((seat) => (
          <DeckPanel key={seat} ctx={ctx} seat={seat} candidate={selection} onSelect={setCandidate} />
        ))}
      </div>

      <div
        className={cn(
          "flex min-h-14 flex-wrap items-center gap-3 rounded-xl border px-4 py-2",
          draft.isComplete ? "border-success/40 bg-success/10" : myTurn && tone ? cn(tone.border, tone.bg) : "bg-card/60",
        )}
        data-testid="turn-banner"
        data-my-turn={myTurn ? "true" : "false"}
      >
        {draft.isComplete ? (
          <Swords className="text-success" />
        ) : myTurn ? (
          step!.type === "BAN" ? (
            <Ban className="text-ban" />
          ) : step!.type === "IMMUNE" ? (
            <ShieldCheck className="text-gold" />
          ) : (
            <Check className="text-pick" />
          )
        ) : (
          <Loader2 className="animate-spin text-muted-foreground" />
        )}
        <p className="min-w-0 flex-1 font-semibold">{message}</p>
        <span className="text-xs text-muted-foreground tabular">
          Passo {Math.min(draft.stepIndex + 1, draft.totalSteps)}/{draft.totalSteps}
        </span>
        {canUndo && (
          <Button size="sm" variant="outline" disabled={sending !== null} onClick={() => send("undo")} data-testid="undo-pick">
            {sending === "undo" ? <Loader2 className="animate-spin" /> : <Undo2 />} Desfazer último pick
          </Button>
        )}
        {myTurn && draft.options.length === 0 && (
          <Button size="sm" variant="outline" disabled={sending !== null} onClick={() => send("skip")} data-testid="skip-turn">
            {sending === "skip" ? <Loader2 className="animate-spin" /> : <SkipForward />} Passar a vez
          </Button>
        )}
        {myTurn && draft.options.length > 0 && (
          <div className="flex items-center gap-2" data-testid="confirm-bar">
            {selected ? (
              <>
                <Portrait c={selected} size={32} />
                <span className="max-w-40 truncate text-sm font-medium">{selected.name}</span>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setCandidate(null)} aria-label="Limpar seleção">
                  <X />
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Selecione um personagem</span>
            )}
            <Button
              size="sm"
              variant={step!.type === "BAN" ? "destructive" : step!.type === "IMMUNE" ? "gold" : "default"}
              disabled={!selection || sending !== null}
              onClick={() => send("confirm")}
              data-testid="confirm-action"
            >
              {sending === "confirm" ? <Loader2 className="animate-spin" /> : step!.type === "BAN" ? <Ban /> : step!.type === "IMMUNE" ? <ShieldCheck /> : <Check />}
              Confirmar {STEP_LABEL[step!.type].toLowerCase()}
            </Button>
          </div>
        )}
      </div>

      <Board ctx={ctx} order={order} />
    </div>
  );
}
