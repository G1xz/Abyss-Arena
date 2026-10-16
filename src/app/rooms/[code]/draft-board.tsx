"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Loader2, Swords, X } from "lucide-react";
import { CharacterCard, CharacterIcon, type CharacterCardState } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { opponentOf, type Seat } from "@/domain/draft";
import { cn } from "@/lib/utils";
import type { DraftCharacterView } from "@/server/matches/view";
import { nick, type RoomContext } from "./shared";

function SequenceTimeline({ ctx }: { ctx: RoomContext }) {
  const draft = ctx.state.draft!;
  const all = [...draft.decks.A, ...draft.decks.B];
  const byId = new Map(all.map((c) => [c.characterId, c]));
  // Reconstrói o personagem de cada passo a partir das listas de bans/picks em ordem.
  const counters = { BAN: { A: 0, B: 0 }, PICK: { A: 0, B: 0 } } as Record<"BAN" | "PICK", Record<Seat, number>>;
  const steps = ctx.state.config.draft.sequence.map((step, i) => {
    let characterId: string | undefined;
    if (i < draft.stepIndex) {
      const target = step.type === "BAN" ? opponentOf(step.actor) : step.actor;
      const list = step.type === "BAN" ? draft.bannedFrom[target] : draft.picks[target];
      characterId = list[counters[step.type][step.actor]++];
    }
    return { ...step, index: i, character: characterId ? byId.get(characterId) : undefined };
  });

  return (
    <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Sequência do draft" data-testid="draft-sequence">
      {steps.map((s) => {
        const current = s.index === draft.stepIndex;
        const done = s.index < draft.stepIndex;
        const mine = s.actor === ctx.mySeat;
        return (
          <li
            key={s.index}
            className={cn(
              "flex min-w-14 flex-col items-center gap-1 rounded-lg border px-1.5 py-1.5 text-[10px] font-semibold",
              s.type === "BAN" ? "border-ban/30" : "border-pick/30",
              current && (s.type === "BAN" ? "border-ban bg-ban/15 ring-1 ring-ban" : "border-pick bg-pick/15 ring-1 ring-pick"),
              !done && !current && "opacity-60",
            )}
            aria-current={current ? "step" : undefined}
          >
            <span className={s.type === "BAN" ? "text-ban" : "text-pick"}>
              {s.type === "BAN" ? "BAN" : "PICK"} {s.actor}
            </span>
            {s.character ? (
              <CharacterIcon character={s.character} size={30} className={s.type === "BAN" ? "grayscale" : ""} />
            ) : (
              <span className={cn("grid size-[30px] place-items-center rounded-md border border-dashed", mine && "border-primary/60")}>{s.index + 1}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TeamStrip({ title, characters, slots, variant }: { title: string; characters: DraftCharacterView[]; slots: number; variant: "pick" | "ban" }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: slots }).map((_, i) => {
          const c = characters[i];
          return c ? (
            <div key={c.characterId} className="relative" title={c.name}>
              <CharacterIcon character={c} size={44} className={variant === "ban" ? "opacity-60 grayscale" : "ring-2 ring-pick/70"} />
              {variant === "ban" && <Ban className="absolute inset-0 m-auto size-6 text-ban" />}
            </div>
          ) : (
            <span key={i} className={cn("size-11 rounded-md border border-dashed", variant === "ban" ? "border-ban/30" : "border-pick/30")} />
          );
        })}
      </div>
    </div>
  );
}

export function DraftBoard({ ctx }: { ctx: RoomContext }) {
  const { state, mySeat, emit } = ctx;
  const draft = state.draft!;
  const [candidate, setCandidate] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const step = draft.currentStep;
  const myTurn = Boolean(step && mySeat && step.actor === mySeat);
  const cfg = state.config.draft;

  const byId = new Map([...draft.decks.A, ...draft.decks.B].map((c) => [c.characterId, c]));
  const charsOf = (seat: Seat, ids: string[]) => ids.map((id) => draft.decks[seat].find((c) => c.characterId === id) ?? byId.get(id)!).filter(Boolean);

  const stateFor = (deckSeat: Seat, id: string): CharacterCardState => {
    if (draft.bannedFrom[deckSeat].includes(id)) return "banned";
    if (draft.picks[deckSeat].includes(id)) return "picked";
    if (candidate === id && myTurn) return "selected";
    if (myTurn && step) {
      if (step.type === "BAN" && deckSeat !== mySeat) return "bannable";
      if (step.type === "PICK" && deckSeat === mySeat) return "pickable";
    }
    return "default";
  };
  const clickable = (deckSeat: Seat, id: string) => {
    if (!myTurn || !step) return false;
    if (draft.bannedFrom[deckSeat].includes(id) || draft.picks[deckSeat].includes(id)) return false;
    return step.type === "BAN" ? deckSeat !== mySeat : deckSeat === mySeat;
  };

  const confirm = async () => {
    if (!candidate) return;
    setSending(true);
    const res = await emit("match:draftAction", { stepIndex: draft.stepIndex, characterId: candidate });
    setSending(false);
    if (!res.ok) toast.error(res.error);
    setCandidate(null);
  };

  const candidateChar = candidate ? byId.get(candidate) : null;

  const deckPanel = (deckSeat: Seat) => {
    const isMine = deckSeat === mySeat;
    const title = mySeat ? (isMine ? "Seu deck" : `Deck de ${nick(state, deckSeat)}`) : `Deck de ${nick(state, deckSeat)} (${deckSeat})`;
    return (
      <section className="rounded-xl border bg-card/70 p-3" aria-label={title} data-testid={`deck-panel-${deckSeat}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">
            {draft.deckNames[deckSeat]} · <span className="text-gold">{draft.deckCosts[deckSeat]} pts</span>
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
          {draft.decks[deckSeat].map((c) => (
            <CharacterCard
              key={c.characterId}
              compact
              testId={`draft-char-${deckSeat}-${c.characterId}`}
              character={{ id: c.characterId, name: c.name, element: c.element, rarity: c.rarity, iconUrl: c.iconUrl, cost: c.cost }}
              state={stateFor(deckSeat, c.characterId)}
              onClick={clickable(deckSeat, c.characterId) ? () => setCandidate(c.characterId) : undefined}
            />
          ))}
        </div>
      </section>
    );
  };

  const order: Seat[] = mySeat === "B" ? ["B", "A"] : ["A", "B"];

  return (
    <div className="grid gap-4">
      <SequenceTimeline ctx={ctx} />

      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border p-4",
          draft.isComplete ? "border-success/40 bg-success/10" : myTurn ? (step!.type === "BAN" ? "border-ban/50 bg-ban/10" : "border-pick/50 bg-pick/10") : "bg-card/60",
        )}
        data-testid="turn-banner"
        data-my-turn={myTurn ? "true" : "false"}
      >
        {draft.isComplete ? (
          <>
            <Swords className="text-success" />
            <p className="font-semibold">Draft concluído — times travados. Hora do Abismo!</p>
          </>
        ) : myTurn ? (
          <>
            {step!.type === "BAN" ? <Ban className="text-ban" /> : <Check className="text-pick" />}
            <p className="font-semibold">
              Sua vez: {step!.type === "BAN" ? `bana um personagem do deck de ${nick(state, opponentOf(mySeat!))}` : "escolha um personagem do seu deck"}
            </p>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin text-muted-foreground" />
            <p>
              Aguardando <span className="font-semibold">{nick(state, step!.actor)}</span> {step!.type === "BAN" ? "banir" : "escolher"}…
            </p>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular">
          Passo {Math.min(draft.stepIndex + 1, draft.totalSteps)}/{draft.totalSteps}
        </span>
      </div>

      {candidateChar && myTurn && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-primary/50 bg-popover/95 p-3 shadow-2xl backdrop-blur" data-testid="confirm-bar">
          <CharacterIcon character={candidateChar} size={40} />
          <p className="flex-1 text-sm">
            {step!.type === "BAN" ? "Banir" : "Escolher"} <span className="font-semibold">{candidateChar.name}</span>?
          </p>
          <Button variant="ghost" size="sm" onClick={() => setCandidate(null)}>
            <X /> Cancelar
          </Button>
          <Button size="sm" variant={step!.type === "BAN" ? "destructive" : "default"} disabled={sending} onClick={confirm} data-testid="confirm-action">
            {sending ? <Loader2 className="animate-spin" /> : step!.type === "BAN" ? <Ban /> : <Check />}
            Confirmar {step!.type === "BAN" ? "ban" : "pick"}
          </Button>
        </div>
      )}

      <div className="grid gap-4 rounded-xl border bg-card/50 p-4 sm:grid-cols-2">
        {order.map((seat) => (
          <div key={seat} className="grid gap-3" data-testid={`team-${seat}`}>
            <p className="font-display font-semibold">
              Time de {nick(state, seat)} <span className="text-xs text-muted-foreground">({seat})</span>
            </p>
            <TeamStrip title="Picks" characters={charsOf(seat, draft.picks[seat])} slots={cfg.picksPerPlayer} variant="pick" />
            <TeamStrip title="Banidos deste deck" characters={charsOf(seat, draft.bannedFrom[seat])} slots={cfg.bansPerPlayer} variant="ban" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">{order.map((seat) => <div key={seat}>{deckPanel(seat)}</div>)}</div>
    </div>
  );
}
