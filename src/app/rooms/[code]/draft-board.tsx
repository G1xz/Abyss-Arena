"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, Check, Diamond, Loader2, ShieldCheck, SkipForward, Swords, Timer, Undo2, X } from "lucide-react";
import { ConstellationBadge, CostPill } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { ELEMENT_META, type ElementKey } from "@/domain/catalog";
import { clockRemainingMs, formatClock, opponentOf, type DraftStepKind, type Seat } from "@/domain/draft";
import { splashUrl } from "@/lib/character-art";
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

/**
 * Largura das cápsulas (picks, imunes) e das menores (bans). Acompanha a largura e a altura da janela,
 * para o draft inteiro (tabuleiro e personagens para escolher) caber numa tela só.
 */
const CAPSULE_VARS = {
  "--cap": "clamp(38px, min(3.9vw, calc((100vh - 520px) / 4.8)), 72px)",
  "--cap-md": "calc(var(--cap) * 0.84)",
  "--cap-sm": "calc(var(--cap) * 0.66)",
} as CSSProperties;

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

/** Ícone quadrado com custo, constelação/nível e marcações (personagens para escolher). */
function Portrait({ c, size, fluid, className, children }: { c: DraftCharacterView; size: number; fluid?: boolean; className?: string; children?: ReactNode }) {
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

/**
 * Retrato em cápsula: arte de corpo inteiro recortada na vertical (ícone quadrado se a arte não existir).
 * Vazia, mostra a legenda da vaga.
 */
function Capsule({
  c,
  small,
  tone,
  label,
  highlight,
  className,
  children,
}: {
  c?: DraftCharacterView;
  small?: boolean;
  tone: "pick" | "ban" | "immune";
  label?: string;
  highlight?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  const art = c && !broken ? splashUrl(c.iconUrl) : null;
  const meta = c ? ELEMENT_META[c.element as ElementKey] : null;
  const empty = tone === "ban" ? "border-ban/35 bg-ban/5" : tone === "immune" ? "border-gold/45 bg-gold/5" : "border-pick/30 bg-card/60";
  return (
    <div
      className={cn(
        "relative aspect-[5/12] shrink-0 overflow-hidden rounded-full border",
        c ? "border-white/15 bg-gradient-to-b from-[#2c2a52] to-[#141634]" : cn("border-dashed", empty),
        c && tone === "immune" && "border-gold/80 ring-1 ring-gold/60",
        highlight,
        className,
      )}
      style={{ width: small ? "var(--cap-sm)" : tone === "immune" ? "var(--cap-md)" : "var(--cap)" }}
      title={c?.name}
    >
      {c ? (
        <>
          {/* Ícone por baixo: aparece enquanto a arte carrega ou se ela não existir. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.iconUrl ?? ""} alt={art ? "" : c.name} className={cn("absolute inset-x-0 top-1/2 w-full -translate-y-1/2 object-contain", tone === "ban" && "grayscale")} />
          {art && (
            <Image
              src={art}
              alt={c.name}
              fill
              // A arte é 2:1 e a cápsula ~5:12: a imagem renderizada tem cerca de 5× a largura da cápsula.
              sizes={small ? "240px" : "360px"}
              className={cn("object-cover", tone === "ban" && "opacity-70 grayscale")}
              style={{ objectPosition: "50% 35%" }}
              onError={() => setBroken(true)}
            />
          )}
        </>
      ) : (
        <span className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">{label}</span>
      )}
      {c && <span className="absolute inset-x-[30%] bottom-1.5 h-0.5 rounded-full" style={{ backgroundColor: meta?.color }} />}
      {c && tone === "ban" && <Ban className="absolute inset-0 m-auto size-1/2 max-h-7 text-ban drop-shadow" />}
      {c && !small && (
        <ConstellationBadge constellation={c.constellation} level={null} rarity={c.rarity} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-1 py-0 text-[9px]" />
      )}
      {children}
    </div>
  );
}

function SeatTag({ seat, className }: { seat: Seat; className?: string }) {
  return (
    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold", seat === "A" ? "bg-primary text-white" : "bg-gold text-black", className)}>
      {seat}
    </span>
  );
}

function ClockChip({ ms, active, seat }: { ms: number | undefined; active: boolean; seat: Seat }) {
  if (ms === undefined) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums",
        active ? "text-foreground" : "text-[oklch(0.78_0.12_250)]",
        ms < 0 ? "text-ban" : ms < 30_000 && active ? "text-warning" : "",
      )}
      data-testid={`clock-${seat}`}
    >
      <Timer className="size-3.5" />
      {formatClock(ms)}
    </span>
  );
}

/** Lateral de um jogador: nome e relógio, e os picks em duas fileiras de cápsulas desencontradas. */
function SidePanel({ ctx, seat, align, clock }: { ctx: RoomContext; seat: Seat; align: "left" | "right"; clock: number | undefined }) {
  const { state, online } = ctx;
  const draft = state.draft!;
  const byId = charactersById(draft);
  const player = state.players[seat];
  const active = draft.currentStep?.actor === seat;
  const total = state.config.draft.picksPerPlayer;
  const perRow = Math.ceil(total / 2);
  const nextPick = active && draft.currentStep?.type === "PICK" ? draft.picks[seat].length : -1;
  const rows = [Array.from({ length: perRow }, (_, i) => i), Array.from({ length: total - perRow }, (_, i) => perRow + i)];
  const right = align === "right";

  return (
    <section className="grid min-w-0 content-start gap-2.5" data-testid={`team-${seat}`}>
      <header
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5",
          right ? "flex-row-reverse border-r-4" : "border-l-4",
          active ? "border-primary bg-primary/30" : "border-primary/40 bg-[oklch(0.3_0.1_268/0.6)]",
        )}
      >
        <SeatTag seat={seat} />
        <span className={cn("size-2 shrink-0 rounded-full", player && online.includes(player.userId) ? "bg-success" : "bg-muted-foreground/40")} />
        <span className="min-w-0 truncate font-semibold">{nick(state, seat)}</span>
        <span className={cn("flex-1", right ? "mr-1" : "ml-1")} />
        <ClockChip ms={clock} active={active} seat={seat} />
      </header>
      <div className="grid gap-2">
        {rows.map((row, r) => (
          <div
            key={r}
            className={cn("flex gap-2", right && "flex-row-reverse")}
            // Fileira de baixo deslocada meia cápsula para dentro, como no layout de transmissão.
            style={r === 1 ? { [right ? "paddingRight" : "paddingLeft"]: "calc(var(--cap) * 0.6)" } : undefined}
          >
            {row.map((i) => {
              const c = byId.get(draft.picks[seat][i] ?? "");
              const immuneSlot = draft.immuneSlots.includes(i + 1);
              return (
                <div key={i} className="relative">
                  <Capsule key={c?.characterId ?? `empty-${i}`} c={c} tone="pick" label={`${i + 1}º`} highlight={i === nextPick ? "ring-2 ring-pick" : undefined} />
                  {immuneSlot && <ShieldCheck className="absolute -top-1 left-1/2 size-4 -translate-x-1/2 rounded-full bg-background p-0.5 text-gold" aria-label="Pick que aceita imune" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function UndoDots({ draft, seat, max }: { draft: Draft; seat: Seat; max: number }) {
  if (!max) return null;
  const left = draft.undo[seat].left;
  return (
    <div className="grid justify-items-center gap-0.5" title={`Desfazer: ${left} de ${max}`}>
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className={cn("size-3.5 rounded-full border", i < left ? "border-gold bg-gold/80" : "border-border bg-muted/40")} />
        ))}
      </div>
      <span className="text-[9px] tracking-wider text-muted-foreground uppercase">Desfazer</span>
    </div>
  );
}

/** Centro: relógio da vez, desfazer de cada jogador, imunes e bans. */
function CenterPanel({ ctx, order, clocks }: { ctx: RoomContext; order: Seat[]; clocks: Record<Seat, number> | null }) {
  const { state } = ctx;
  const draft = state.draft!;
  const byId = charactersById(draft);
  const step = draft.currentStep;
  const next = draft.isComplete ? null : draft.sequence[draft.stepIndex + 1];
  const [left, right] = order as [Seat, Seat];
  const undoMax = state.config.draft.undoPerPlayer ?? 0;
  const immunePair = (seat: Seat) => {
    const other = opponentOf(seat);
    return [draft.immune[seat], draft.immune[other]].map((id, i) => {
      const c = byId.get(id ?? "");
      const taken = Boolean(c && draft.picks[seat].includes(c.characterId));
      return (
        <div key={i} className="relative">
          <Capsule key={c?.characterId ?? `immune-${i}`} c={c} tone="immune" label="Imune" highlight={taken ? "ring-2 ring-pick" : undefined} />
          {taken && <Check className="absolute -top-1 left-1/2 size-4 -translate-x-1/2 rounded-full bg-pick p-0.5 text-black" aria-label={`Escolhido por ${nick(state, seat)}`} />}
        </div>
      );
    });
  };

  return (
    <section className="grid content-start justify-items-center gap-1.5" data-testid="bans-board">
      <div className="flex w-full items-center gap-2 rounded-md bg-[oklch(0.92_0.02_270)] px-3 py-1.5 text-[#0a0f2c]" data-testid="turn-clock">
        <Diamond className="size-3.5 fill-current opacity-50" />
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">
          {draft.isComplete
            ? "Draft concluído"
            : `${nick(state, step!.actor)} · ${STEP_LABEL[step!.type]}${step!.type === "PICK" && draft.pickNumber ? ` ${draft.pickNumber}º` : ""}`}
        </span>
        {!draft.isComplete && clocks && <span className={cn("font-mono text-sm font-bold tabular-nums", clocks[step!.actor] < 0 && "text-red-700")}>{formatClock(clocks[step!.actor])}</span>}
        <Diamond className="size-3.5 fill-current opacity-50" />
      </div>
      <div className="flex w-full items-start justify-between px-1">
        <UndoDots draft={draft} seat={left} max={undoMax} />
        {next && (
          <span className="pt-0.5 text-center text-[10px] text-muted-foreground">
            Depois: {nick(state, next.actor)} · {STEP_LABEL[next.type]}
          </span>
        )}
        <UndoDots draft={draft} seat={right} max={undoMax} />
      </div>

      <p className="font-display text-sm leading-none font-bold tracking-wide text-gold">Imunes</p>
      {draft.immunityActive ? (
        <div className="flex w-full items-start justify-between gap-3" data-testid="immune-board">
          <div className="flex gap-1.5">{immunePair(left)}</div>
          <div className="flex flex-row-reverse gap-1.5">{immunePair(right)}</div>
        </div>
      ) : (
        <p className="max-w-56 text-center text-xs text-muted-foreground">Sem imunidade nesta partida: os decks não têm 2 personagens em comum com a mesma constelação.</p>
      )}

      <p className="mt-1 font-display text-sm leading-none font-bold tracking-wide text-ban">Bans</p>
      <div className="flex w-full items-start justify-between gap-3">
        {[left, right].map((seat, side) => (
          <div key={seat} className={cn("flex gap-1.5", side === 1 && "flex-row-reverse")}>
            {Array.from({ length: state.config.draft.bansPerPlayer }).map((_, i) => {
              const c = byId.get(draft.bans[seat][i] ?? "");
              return <Capsule key={c?.characterId ?? `ban-${i}`} c={c} small tone="ban" />;
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Personagens para escolher (parte de baixo): o deck de cada jogador, com as opções da vez destacadas. */
function DeckPanel({ ctx, seat, candidate, onSelect }: { ctx: RoomContext; seat: Seat; candidate: string | null; onSelect: (id: string) => void }) {
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-1.5">
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
                size={60}
                fluid
                className={cn(banned && "opacity-40 grayscale", isImmune && "ring-2 ring-gold", !isImmune && eligible && "outline outline-1 outline-gold/60 outline-dashed")}
              >
                <CostPill cost={c.cost} className="absolute top-0.5 right-0.5 px-1 py-0 text-[10px]" />
                <ConstellationBadge constellation={c.constellation} level={c.level} rarity={c.rarity} className="absolute bottom-1 left-0.5 px-1 py-0 text-[9px]" />
                {banned && (
                  <span className="absolute inset-0 grid place-items-center bg-ban/20">
                    <Ban className="size-7 text-ban drop-shadow" strokeWidth={2.5} />
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
              <span className="truncate px-0.5 text-[10px] leading-tight font-medium">{c.name}</span>
            </button>
          );
        })}
      </div>
    </section>
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
    <div className="grid gap-3" data-testid="draft-board" style={CAPSULE_VARS}>
      {/* Tabuleiro: picks nas laterais, imunes e bans no centro. */}
      <div className="grid items-start gap-4 rounded-xl border bg-[oklch(0.24_0.08_268/0.55)] p-3 lg:grid-cols-[1fr_minmax(250px,320px)_1fr]">
        <SidePanel ctx={ctx} seat={order[0]!} align="left" clock={clocks?.[order[0]!]} />
        <CenterPanel ctx={ctx} order={order} clocks={clocks} />
        <SidePanel ctx={ctx} seat={order[1]!} align="right" clock={clocks?.[order[1]!]} />
      </div>

      <div
        className={cn(
          "flex min-h-12 flex-wrap items-center gap-3 rounded-xl border px-4 py-2",
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
                <Portrait c={selected} size={30} />
                <span className="max-w-40 truncate text-sm font-medium">{selected.name}</span>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setCandidate(null)} aria-label="Limpar seleção">
                  <X />
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Selecione um personagem abaixo</span>
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

      {/* Personagens para escolher. */}
      <div className="grid gap-3 lg:grid-cols-2">
        {order.map((seat) => (
          <DeckPanel key={seat} ctx={ctx} seat={seat} candidate={selection} onSelect={setCandidate} />
        ))}
      </div>
    </div>
  );
}
