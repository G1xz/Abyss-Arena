/**
 * Motor de draft genérico, orientado por configuração. Funções puras: o servidor
 * reconstrói o estado a partir do snapshot dos decks + ações persistidas e valida
 * cada nova ação antes de gravá-la.
 *
 * Semântica:
 *  - BAN de A remove um personagem do deck de B (e vice-versa).
 *  - PICK de A escolhe um personagem do próprio deck de A, ainda não banido nem escolhido.
 *  - Os dois times podem conter o mesmo personagem (cada jogador usa a própria conta);
 *    o mesmo personagem não pode aparecer duas vezes no mesmo time.
 *  - A sequência é declarativa e pode intercalar bans e picks.
 */

export type Seat = "A" | "B";
export type DraftActionKind = "BAN" | "PICK";

export interface DraftStep {
  type: DraftActionKind;
  actor: Seat;
}

export interface DraftConfig {
  bansPerPlayer: number;
  picksPerPlayer: number;
  sequence: DraftStep[];
  /** Reservado para timer por turno (não aplicado no MVP). */
  turnTimeoutSeconds?: number | null;
}

export interface DraftDecks {
  A: string[];
  B: string[];
}

export interface DraftActionRecord {
  stepIndex: number;
  type: DraftActionKind;
  actorSeat: Seat;
  targetSeat: Seat;
  characterId: string;
}

export const SEATS: readonly Seat[] = ["A", "B"];

export function opponentOf(seat: Seat): Seat {
  return seat === "A" ? "B" : "A";
}

export const DRAFT_PRESETS = {
  /** Bans A-B-B-A, depois picks alternados A-B-A-B... */
  BANS_FIRST_ALTERNATE: "Bans primeiro (A-B-B-A) e picks alternados",
  /** Bans A-B-B-A, depois picks em serpente A-B-B-A-A-B... */
  BANS_FIRST_SNAKE: "Bans primeiro (A-B-B-A) e picks em serpente",
  /** Metade dos bans, metade dos picks, restante dos bans e picks. */
  INTERLEAVED: "Intercalado (fase de bans e picks em duas rodadas)",
} as const;

export type DraftPreset = keyof typeof DRAFT_PRESETS;

function alternate(type: DraftActionKind, perPlayer: number, start: Seat = "A"): DraftStep[] {
  const out: DraftStep[] = [];
  for (let i = 0; i < perPlayer * 2; i++) out.push({ type, actor: i % 2 === 0 ? start : opponentOf(start) });
  return out;
}

/** A-B-B-A-A-B-B-A... */
function snake(type: DraftActionKind, perPlayer: number, start: Seat = "A"): DraftStep[] {
  const out: DraftStep[] = [];
  for (let i = 0; i < perPlayer * 2; i++) {
    const block = Math.floor((i + 1) / 2) % 2; // 0,1,1,0,0,1,1,...
    out.push({ type, actor: block === 0 ? start : opponentOf(start) });
  }
  return out;
}

export function buildSequence(preset: DraftPreset, bansPerPlayer: number, picksPerPlayer: number): DraftStep[] {
  switch (preset) {
    case "BANS_FIRST_ALTERNATE":
      return [...snake("BAN", bansPerPlayer), ...alternate("PICK", picksPerPlayer)];
    case "BANS_FIRST_SNAKE":
      return [...snake("BAN", bansPerPlayer), ...snake("PICK", picksPerPlayer)];
    case "INTERLEAVED": {
      const firstBans = Math.ceil(bansPerPlayer / 2);
      const firstPicks = Math.ceil(picksPerPlayer / 2);
      return [
        ...snake("BAN", firstBans),
        ...alternate("PICK", firstPicks),
        ...snake("BAN", bansPerPlayer - firstBans, "B"),
        ...alternate("PICK", picksPerPlayer - firstPicks, "B"),
      ];
    }
  }
}

const STEP_RE = /^(BAN|PICK)_(?:PLAYER_)?(A|B)$/;

/** Aceita "BAN_A, BAN_B, PICK_A" ou "BAN_PLAYER_A ..." separados por vírgula, espaço ou quebra de linha. */
export function parseSequence(text: string): DraftStep[] {
  const tokens = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.map((token) => {
    const m = STEP_RE.exec(token);
    if (!m) throw new Error(`Passo inválido na sequência: "${token}"`);
    return { type: m[1] as DraftActionKind, actor: m[2] as Seat };
  });
}

export function formatSequence(steps: DraftStep[]): string {
  return steps.map((s) => `${s.type}_PLAYER_${s.actor}`).join(", ");
}

export function validateDraftConfig(config: DraftConfig): string[] {
  const errors: string[] = [];
  const { bansPerPlayer, picksPerPlayer, sequence } = config;
  if (!Number.isInteger(bansPerPlayer) || bansPerPlayer < 0 || bansPerPlayer > 10) errors.push("Bans por jogador deve estar entre 0 e 10.");
  if (!Number.isInteger(picksPerPlayer) || picksPerPlayer < 1 || picksPerPlayer > 8) errors.push("Picks por jogador deve estar entre 1 e 8.");
  const count = (type: DraftActionKind, actor: Seat) => sequence.filter((s) => s.type === type && s.actor === actor).length;
  for (const seat of SEATS) {
    if (count("BAN", seat) !== bansPerPlayer) errors.push(`A sequência deve ter exatamente ${bansPerPlayer} ban(s) do jogador ${seat}.`);
    if (count("PICK", seat) !== picksPerPlayer) errors.push(`A sequência deve ter exatamente ${picksPerPlayer} pick(s) do jogador ${seat}.`);
  }
  if (sequence.length !== 2 * (bansPerPlayer + picksPerPlayer)) errors.push("A sequência contém passos extras.");
  return errors;
}

/** Tamanho mínimo do deck: picks próprios + bans que o oponente pode aplicar. */
export function minDeckSize(config: Pick<DraftConfig, "bansPerPlayer" | "picksPerPlayer">): number {
  return config.picksPerPlayer + config.bansPerPlayer;
}

export interface DraftState {
  stepIndex: number;
  totalSteps: number;
  isComplete: boolean;
  currentStep: DraftStep | null;
  /** Personagens banidos do deck de cada jogador. */
  bannedFrom: Record<Seat, string[]>;
  /** Time de cada jogador. */
  picks: Record<Seat, string[]>;
  /** O que cada jogador ainda pode escolher. */
  pickable: Record<Seat, string[]>;
  /** O que cada jogador ainda pode banir (do deck do oponente). */
  bannable: Record<Seat, string[]>;
}

export function computeDraftState(config: DraftConfig, decks: DraftDecks, actions: DraftActionRecord[]): DraftState {
  const ordered = [...actions].sort((a, b) => a.stepIndex - b.stepIndex);
  const bannedFrom: Record<Seat, string[]> = { A: [], B: [] };
  const picks: Record<Seat, string[]> = { A: [], B: [] };
  for (const action of ordered) {
    if (action.type === "BAN") bannedFrom[action.targetSeat].push(action.characterId);
    else picks[action.targetSeat].push(action.characterId);
  }
  const remaining = (seat: Seat) => decks[seat].filter((id) => !bannedFrom[seat].includes(id) && !picks[seat].includes(id));
  const stepIndex = ordered.length;
  const isComplete = stepIndex >= config.sequence.length;
  return {
    stepIndex,
    totalSteps: config.sequence.length,
    isComplete,
    currentStep: isComplete ? null : config.sequence[stepIndex]!,
    bannedFrom,
    picks,
    pickable: { A: remaining("A"), B: remaining("B") },
    bannable: { A: remaining("B"), B: remaining("A") },
  };
}

export type DraftValidation =
  | { ok: true; step: DraftStep; targetSeat: Seat; state: DraftState }
  | { ok: false; code: "DRAFT_COMPLETE" | "STALE_ACTION" | "NOT_YOUR_TURN" | "ILLEGAL_ACTION"; message: string };

export function validateDraftAction(
  config: DraftConfig,
  decks: DraftDecks,
  actions: DraftActionRecord[],
  input: { actorSeat: Seat; stepIndex: number; characterId: string },
): DraftValidation {
  const state = computeDraftState(config, decks, actions);
  if (state.isComplete) return { ok: false, code: "DRAFT_COMPLETE", message: "O draft já foi concluído." };
  if (input.stepIndex !== state.stepIndex) {
    return { ok: false, code: "STALE_ACTION", message: "Ação fora de sincronia com o turno atual. O estado foi atualizado." };
  }
  const step = state.currentStep!;
  if (step.actor !== input.actorSeat) return { ok: false, code: "NOT_YOUR_TURN", message: "Não é o seu turno." };

  if (step.type === "BAN") {
    const target = opponentOf(input.actorSeat);
    if (!decks[target].includes(input.characterId)) {
      return { ok: false, code: "ILLEGAL_ACTION", message: "Esse personagem não está no deck do oponente." };
    }
    if (!state.bannable[input.actorSeat].includes(input.characterId)) {
      return { ok: false, code: "ILLEGAL_ACTION", message: "Esse personagem já foi banido ou escolhido." };
    }
    return { ok: true, step, targetSeat: target, state };
  }

  if (!decks[input.actorSeat].includes(input.characterId)) {
    return { ok: false, code: "ILLEGAL_ACTION", message: "Esse personagem não está no seu deck." };
  }
  if (state.bannedFrom[input.actorSeat].includes(input.characterId)) {
    return { ok: false, code: "ILLEGAL_ACTION", message: "Esse personagem foi banido pelo oponente." };
  }
  if (state.picks[input.actorSeat].includes(input.characterId)) {
    return { ok: false, code: "ILLEGAL_ACTION", message: "Esse personagem já está no seu time." };
  }
  return { ok: true, step, targetSeat: input.actorSeat, state };
}
