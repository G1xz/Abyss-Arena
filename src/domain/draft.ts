/**
 * Motor de draft orientado por configuração (regras em docs/REGRAS-COMPETITIVAS.md). Funções puras:
 * o servidor reconstrói o estado a partir do snapshot dos decks + ações persistidas e valida cada
 * nova ação antes de gravá-la.
 *
 * Fluxo: imunidade (condicional) → bans → picks.
 *  - IMUNIDADE: só ocorre se os decks tiverem ao menos `minEligible` personagens em comum com a mesma
 *    constelação. Cada jogador declara um imune (A e depois B), diferentes entre si. Imunes não podem
 *    ser banidos e ficam disponíveis para os dois jogadores, mas só no 4º e no 8º pick individual.
 *  - BAN: o alvo precisa estar no deck do oponente; o efeito é universal (some para os dois).
 *  - PICK: do próprio deck. Personagens não imunes são exclusivos: escolhidos por um, somem para o outro.
 *  - Passar: só quando o jogador não tem nenhuma opção válida no turno (evita travar o draft).
 */

export type Seat = "A" | "B";
export type DraftStepKind = "IMMUNE" | "BAN" | "PICK";
/** Tipo gravado em cada ação: o passo executado ou SKIP (sem opções válidas). */
export type DraftActionKind = DraftStepKind | "SKIP";

export interface DraftStep {
  type: DraftStepKind;
  actor: Seat;
}

export interface ImmunityConfig {
  enabled: boolean;
  /** Picks individuais (1 = primeiro pick do jogador) em que um imune pode ser escolhido. */
  pickSlots: number[];
  /** Personagens em comum (mesma constelação) necessários para haver a fase. */
  minEligible: number;
}

export interface DraftConfig {
  bansPerPlayer: number;
  picksPerPlayer: number;
  /** Bans e picks; a fase de imunidade é acrescentada no início quando se aplica. */
  sequence: DraftStep[];
  immunity?: ImmunityConfig | null;
  /** Tempo de cada jogador para todo o draft (relógio de xadrez). Null = sem relógio. */
  clockSeconds?: number | null;
  /** Quantos "desfazer" cada jogador tem na partida. */
  undoPerPlayer?: number;
}

export interface DraftDecks {
  A: string[];
  B: string[];
}

/** Constelação de cada personagem no deck de cada jogador (define a elegibilidade da imunidade). */
export type DraftCopies = Record<Seat, Record<string, number>>;

export interface DraftActionRecord {
  stepIndex: number;
  type: DraftActionKind;
  actorSeat: Seat;
  targetSeat: Seat;
  /** Null nas ações SKIP. */
  characterId: string | null;
}

export const SEATS: readonly Seat[] = ["A", "B"];

export function opponentOf(seat: Seat): Seat {
  return seat === "A" ? "B" : "A";
}

export const DEFAULT_IMMUNITY: ImmunityConfig = { enabled: true, pickSlots: [4, 8], minEligible: 2 };

export const DRAFT_PRESETS = {
  /**
   * Padrão competitivo, em duas fases: bans A-B-B-A, metade dos picks em serpente (A-BB-AA-BB-A),
   * mais um ban de cada (A-B) e a outra metade dos picks na mesma serpente.
   */
  SPLIT_SNAKE: "Duas fases: bans A-B-B-A, picks em serpente, bans A-B, picks em serpente",
  /** Todos os bans em serpente (A-B-B-A-A-B…) e depois todos os picks em serpente. */
  BANS_FIRST_SNAKE: "Bans e picks em serpente (todos os bans primeiro)",
  /** Bans em serpente, depois picks alternados A-B-A-B... */
  BANS_FIRST_ALTERNATE: "Bans em serpente e picks alternados",
  /** Metade dos bans, metade dos picks, restante dos bans e picks. */
  INTERLEAVED: "Intercalado (fase de bans e picks em duas rodadas)",
} as const;

export type DraftPreset = keyof typeof DRAFT_PRESETS;

function alternate(type: DraftStepKind, perPlayer: number, start: Seat = "A"): DraftStep[] {
  const out: DraftStep[] = [];
  for (let i = 0; i < perPlayer * 2; i++) out.push({ type, actor: i % 2 === 0 ? start : opponentOf(start) });
  return out;
}

/** A-B-B-A-A-B-B-A... */
function snake(type: DraftStepKind, perPlayer: number, start: Seat = "A"): DraftStep[] {
  const out: DraftStep[] = [];
  for (let i = 0; i < perPlayer * 2; i++) {
    const block = Math.floor((i + 1) / 2) % 2; // 0,1,1,0,0,1,1,...
    out.push({ type, actor: block === 0 ? start : opponentOf(start) });
  }
  return out;
}

export function buildSequence(preset: DraftPreset, bansPerPlayer: number, picksPerPlayer: number): DraftStep[] {
  switch (preset) {
    case "SPLIT_SNAKE": {
      // A ordem dos bans (A-B-B-A-A-B) e dos picks (serpente) é a mesma; os picks entram no meio dos bans.
      const bans = snake("BAN", bansPerPlayer);
      const picks = snake("PICK", picksPerPlayer);
      const banCut = 2 * Math.ceil(bansPerPlayer / 2);
      const pickCut = 2 * Math.ceil(picksPerPlayer / 2);
      return [...bans.slice(0, banCut), ...picks.slice(0, pickCut), ...bans.slice(banCut), ...picks.slice(pickCut)];
    }
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
    return { type: m[1] as DraftStepKind, actor: m[2] as Seat };
  });
}

export function formatSequence(steps: DraftStep[]): string {
  return steps.map((s) => `${s.type}_PLAYER_${s.actor}`).join(", ");
}

/** Ordem compacta para leitura: "A → B → B → A". */
export function formatOrder(steps: DraftStep[]): string {
  return steps.map((s) => s.actor).join(" → ");
}

/** Agrupa passos seguidos do mesmo tipo (fases) ou do mesmo jogador (vezes): A-B-B-A → "A → BB → A". */
function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && key(last[0]!) === key(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

/** Ordem por vezes: "A → BB → AA → BB → A". */
export function formatTurns(steps: DraftStep[]): string {
  return groupBy(steps, (s) => s.actor)
    .map((g) => g.map((s) => s.actor).join(""))
    .join(" → ");
}

/** Resumo do formato para jogadores (página Jogar, lobby). */
export function describeDraftFormat(config: DraftConfig): string[] {
  const lines: string[] = [];
  const immunity = config.immunity;
  if (immunity?.enabled) {
    lines.push(
      `Imunidade (A → B), se os decks tiverem ${immunity.minEligible}+ personagens em comum com a mesma constelação. Imunes só no ${immunity.pickSlots.map((n) => `${n}º`).join(" ou ")} pick.`,
    );
  }
  lines.push(`${config.bansPerPlayer} bans por jogador (universais) e ${config.picksPerPlayer} picks por jogador (exclusivos).`);
  const phases = groupBy(config.sequence, (s) => s.type).map((g) => `${g[0]!.type === "BAN" ? "bans" : "picks"} ${formatTurns(g)}`);
  lines.push(`Ordem: ${phases.join(" · ")}. Na vez dupla, os dois personagens são escolhidos de uma vez.`);
  const extras = [
    config.clockSeconds ? `${config.clockSeconds} s de relógio por jogador (continua negativo)` : null,
    config.undoPerPlayer ? `${config.undoPerPlayer} desfazer por jogador` : null,
  ].filter(Boolean);
  if (extras.length) lines.push(`${extras.join(" · ")}.`);
  return lines;
}

export function validateDraftConfig(config: DraftConfig): string[] {
  const errors: string[] = [];
  const { bansPerPlayer, picksPerPlayer, sequence } = config;
  if (!Number.isInteger(bansPerPlayer) || bansPerPlayer < 0 || bansPerPlayer > 10) errors.push("Bans por jogador deve estar entre 0 e 10.");
  if (!Number.isInteger(picksPerPlayer) || picksPerPlayer < 1 || picksPerPlayer > 12) errors.push("Picks por jogador deve estar entre 1 e 12.");
  if (sequence.some((s) => s.type === "IMMUNE")) errors.push("A fase de imunidade é automática; não a coloque na sequência.");
  const count = (type: DraftStepKind, actor: Seat) => sequence.filter((s) => s.type === type && s.actor === actor).length;
  for (const seat of SEATS) {
    if (count("BAN", seat) !== bansPerPlayer) errors.push(`A sequência deve ter exatamente ${bansPerPlayer} ban(s) do jogador ${seat}.`);
    if (count("PICK", seat) !== picksPerPlayer) errors.push(`A sequência deve ter exatamente ${picksPerPlayer} pick(s) do jogador ${seat}.`);
  }
  if (sequence.length !== 2 * (bansPerPlayer + picksPerPlayer)) errors.push("A sequência contém passos extras.");
  const slots = config.immunity?.enabled ? config.immunity.pickSlots : [];
  if (slots.some((n) => !Number.isInteger(n) || n < 1 || n > picksPerPlayer)) errors.push(`Os picks dos imunes devem estar entre 1 e ${picksPerPlayer}.`);
  if (new Set(slots).size !== slots.length) errors.push("Picks dos imunes repetidos.");
  if (config.immunity?.enabled && slots.length === 0) errors.push("Informe em quais picks os imunes podem ser escolhidos.");
  return errors;
}

/** Tamanho mínimo do deck: picks próprios + bans que o oponente pode aplicar. */
export function minDeckSize(config: Pick<DraftConfig, "bansPerPlayer" | "picksPerPlayer">): number {
  return config.picksPerPlayer + config.bansPerPlayer;
}

/** Personagens elegíveis à imunidade: nos dois decks, com a mesma constelação (ordem do deck A). */
export function immunityEligible(decks: DraftDecks, copies?: DraftCopies): string[] {
  const inB = new Set(decks.B);
  return decks.A.filter((id) => inB.has(id) && (copies?.A[id] ?? 0) === (copies?.B[id] ?? 0));
}

/** Sequência efetiva da partida: imunidade (quando se aplica) + bans e picks configurados. */
export function effectiveSequence(config: DraftConfig, eligible: string[]): { sequence: DraftStep[]; immunityActive: boolean } {
  const immunity = config.immunity;
  const immunityActive = Boolean(immunity?.enabled && eligible.length >= Math.max(2, immunity.minEligible));
  const sequence: DraftStep[] = immunityActive
    ? [{ type: "IMMUNE", actor: "A" }, { type: "IMMUNE", actor: "B" }, ...config.sequence]
    : config.sequence;
  return { sequence, immunityActive };
}

export interface DraftState {
  sequence: DraftStep[];
  stepIndex: number;
  totalSteps: number;
  isComplete: boolean;
  currentStep: DraftStep | null;
  immunityActive: boolean;
  eligibleImmune: string[];
  /** Imune declarado por cada jogador. */
  immune: Record<Seat, string | null>;
  /** Bans feitos por cada jogador. */
  bans: Record<Seat, string[]>;
  /** Bans que atingiram o deck de cada jogador (feitos pelo oponente). */
  bannedFrom: Record<Seat, string[]>;
  /** Todos os banidos (o efeito é universal). */
  banned: string[];
  /** Personagens escolhidos por cada jogador, em ordem. */
  picks: Record<Seat, string[]>;
  /** Turnos passados por falta de opções. */
  skipped: Record<Seat, number>;
  /** Escolhas válidas para o passo atual (vazio = só resta passar). */
  options: string[];
  /** Número do pick individual do jogador da vez (1 = primeiro), quando o passo é um pick. */
  pickNumber: number | null;
  /**
   * Vez seguida do mesmo jogador com a mesma ação (ex.: B B): os passos podem ser confirmados de uma vez.
   * `options` reúne o que vale em qualquer um desses passos (ex.: o imune só no 4º pick).
   */
  run: { size: number; options: string[] };
}

function pickNumberAt(sequence: DraftStep[], stepIndex: number): number {
  const step = sequence[stepIndex]!;
  return sequence.slice(0, stepIndex).filter((s) => s.type === "PICK" && s.actor === step.actor).length + 1;
}

export function computeDraftState(config: DraftConfig, decks: DraftDecks, actions: DraftActionRecord[], copies?: DraftCopies): DraftState {
  const eligibleImmune = immunityEligible(decks, copies);
  const { sequence, immunityActive } = effectiveSequence(config, eligibleImmune);
  const ordered = [...actions].sort((a, b) => a.stepIndex - b.stepIndex);
  const immune: Record<Seat, string | null> = { A: null, B: null };
  const bans: Record<Seat, string[]> = { A: [], B: [] };
  const picks: Record<Seat, string[]> = { A: [], B: [] };
  const skipped: Record<Seat, number> = { A: 0, B: 0 };
  for (const action of ordered) {
    if (action.type === "SKIP" || !action.characterId) skipped[action.actorSeat]++;
    else if (action.type === "IMMUNE") immune[action.actorSeat] = action.characterId;
    else if (action.type === "BAN") bans[action.actorSeat].push(action.characterId);
    else picks[action.actorSeat].push(action.characterId);
  }
  const stepIndex = ordered.length;
  const isComplete = stepIndex >= sequence.length;
  const currentStep = isComplete ? null : sequence[stepIndex]!;
  const banned = [...bans.A, ...bans.B];
  const immuneSet = new Set([immune.A, immune.B].filter((id): id is string => Boolean(id)));
  const pickNumber = currentStep?.type === "PICK" ? pickNumberAt(sequence, stepIndex) : null;

  /** Opções do passo atual; nos picks, conforme o número do pick (o imune só vale nas janelas). */
  const optionsAt = (pickNo: number | null): string[] => {
    if (!currentStep) return [];
    const actor = currentStep.actor;
    const opp = opponentOf(actor);
    if (currentStep.type === "IMMUNE") return eligibleImmune.filter((id) => !immuneSet.has(id));
    if (currentStep.type === "BAN") {
      const taken = new Set([...banned, ...picks.A, ...picks.B]);
      return decks[opp].filter((id) => !immuneSet.has(id) && !taken.has(id));
    }
    const immuneSlot = immunityActive && (config.immunity?.pickSlots ?? []).includes(pickNo!);
    return decks[actor].filter((id) => {
      if (banned.includes(id) || picks[actor].includes(id)) return false;
      if (immuneSet.has(id)) return immuneSlot;
      return !picks[opp].includes(id);
    });
  };
  const options = optionsAt(pickNumber);

  let runSize = 0;
  while (currentStep && sequence[stepIndex + runSize]?.actor === currentStep.actor && sequence[stepIndex + runSize]?.type === currentStep.type) runSize++;
  const runOptions = new Set(options);
  if (currentStep?.type === "PICK") for (let j = 1; j < runSize; j++) for (const id of optionsAt(pickNumber! + j)) runOptions.add(id);

  return {
    sequence,
    stepIndex,
    totalSteps: sequence.length,
    isComplete,
    currentStep,
    immunityActive,
    eligibleImmune,
    immune,
    bans,
    bannedFrom: { A: bans.B, B: bans.A },
    banned,
    picks,
    skipped,
    options,
    pickNumber,
    run: { size: runSize, options: [...runOptions] },
  };
}

export type DraftErrorCode = "DRAFT_COMPLETE" | "STALE_ACTION" | "NOT_YOUR_TURN" | "ILLEGAL_ACTION";

export type DraftValidation =
  | { ok: true; type: DraftActionKind; step: DraftStep; targetSeat: Seat; state: DraftState }
  | { ok: false; code: DraftErrorCode; message: string };

/** Motivo de uma escolha inválida, para mensagens claras ao jogador. */
function illegalReason(config: DraftConfig, state: DraftState, decks: DraftDecks, step: DraftStep, characterId: string): string {
  const actor = step.actor;
  const opp = opponentOf(actor);
  const immune = [state.immune.A, state.immune.B];
  if (step.type === "IMMUNE") {
    if (!state.eligibleImmune.includes(characterId)) return "Só personagens dos dois decks com a mesma constelação podem ser imunes.";
    return "Esse personagem já foi declarado imune.";
  }
  if (step.type === "BAN") {
    if (!decks[opp].includes(characterId)) return "Esse personagem não está no deck do oponente.";
    if (immune.includes(characterId)) return "Personagens imunes não podem ser banidos.";
    if (state.banned.includes(characterId)) return "Esse personagem já foi banido.";
    return "Não é possível banir um personagem já escolhido.";
  }
  if (!decks[actor].includes(characterId)) return "Esse personagem não está no seu deck.";
  if (state.banned.includes(characterId)) return "Esse personagem foi banido.";
  if (state.picks[actor].includes(characterId)) return "Esse personagem já está no seu time.";
  if (immune.includes(characterId)) {
    const slots = (config.immunity?.pickSlots ?? []).map((n) => `${n}º`).join(" ou ");
    return `Imunes só podem ser escolhidos no ${slots} pick.`;
  }
  return "O oponente já escolheu esse personagem.";
}

export function validateDraftAction(
  config: DraftConfig,
  decks: DraftDecks,
  actions: DraftActionRecord[],
  input: { actorSeat: Seat; stepIndex: number; characterId: string | null },
  copies?: DraftCopies,
): DraftValidation {
  const state = computeDraftState(config, decks, actions, copies);
  if (state.isComplete) return { ok: false, code: "DRAFT_COMPLETE", message: "O draft já foi concluído." };
  if (input.stepIndex !== state.stepIndex) {
    return { ok: false, code: "STALE_ACTION", message: "Ação fora de sincronia com o turno atual. O estado foi atualizado." };
  }
  const step = state.currentStep!;
  if (step.actor !== input.actorSeat) return { ok: false, code: "NOT_YOUR_TURN", message: "Não é o seu turno." };
  const targetSeat = step.type === "BAN" ? opponentOf(step.actor) : step.actor;

  if (input.characterId === null) {
    if (state.options.length > 0) return { ok: false, code: "ILLEGAL_ACTION", message: "Você ainda tem opções válidas neste turno." };
    return { ok: true, type: "SKIP", step, targetSeat, state };
  }
  if (!state.options.includes(input.characterId)) {
    return { ok: false, code: "ILLEGAL_ACTION", message: illegalReason(config, state, decks, step, input.characterId) };
  }
  return { ok: true, type: step.type, step, targetSeat, state };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

export type DraftBatchPlan =
  | { ok: true; actions: DraftActionRecord[]; state: DraftState }
  | { ok: false; code: DraftErrorCode; message: string };

/**
 * Vez dupla confirmada de uma vez: distribui os personagens escolhidos pelos passos seguidos do jogador.
 * Tenta as ordens possíveis (ex.: imune + comum no 3º e 4º pick: o imune vai para o 4º). Um passo sem
 * nenhuma opção válida no meio da vez é passado, como no turno individual.
 */
export function planDraftBatch(
  config: DraftConfig,
  decks: DraftDecks,
  actions: DraftActionRecord[],
  input: { actorSeat: Seat; stepIndex: number; characterIds: string[] },
  copies?: DraftCopies,
): DraftBatchPlan {
  const state = computeDraftState(config, decks, actions, copies);
  if (state.isComplete) return { ok: false, code: "DRAFT_COMPLETE", message: "O draft já foi concluído." };
  if (input.stepIndex !== state.stepIndex) {
    return { ok: false, code: "STALE_ACTION", message: "Ação fora de sincronia com o turno atual. O estado foi atualizado." };
  }
  const step = state.currentStep!;
  if (step.actor !== input.actorSeat) return { ok: false, code: "NOT_YOUR_TURN", message: "Não é o seu turno." };
  const ids = [...new Set(input.characterIds)];
  if (ids.length === 0 || ids.length !== input.characterIds.length) return { ok: false, code: "ILLEGAL_ACTION", message: "Escolha personagens diferentes." };
  if (ids.length > state.run.size) {
    return { ok: false, code: "ILLEGAL_ACTION", message: `Nesta vez você escolhe ${state.run.size === 1 ? "um personagem" : `até ${state.run.size} personagens`}.` };
  }

  let firstError: string | null = null;
  for (const order of permutations(ids)) {
    const done = [...actions];
    const planned: DraftActionRecord[] = [];
    let next = 0;
    let error: string | null = null;
    while (next < order.length) {
      const current = computeDraftState(config, decks, done, copies);
      const index = current.stepIndex;
      const now = current.currentStep;
      if (!now || now.actor !== step.actor || now.type !== step.type || index >= input.stepIndex + state.run.size) {
        error = `Nesta vez você escolhe até ${state.run.size} personagens.`;
        break;
      }
      let record: DraftActionRecord;
      if (current.options.length === 0) {
        record = { stepIndex: index, type: "SKIP", actorSeat: step.actor, targetSeat: now.type === "BAN" ? opponentOf(step.actor) : step.actor, characterId: null };
      } else {
        const r = validateDraftAction(config, decks, done, { actorSeat: step.actor, stepIndex: index, characterId: order[next]! }, copies);
        if (!r.ok) {
          error = r.message;
          break;
        }
        record = { stepIndex: index, type: r.type, actorSeat: step.actor, targetSeat: r.targetSeat, characterId: order[next]! };
        next++;
      }
      done.push(record);
      planned.push(record);
    }
    if (!error) return { ok: true, actions: planned, state: computeDraftState(config, decks, done, copies) };
    firstError ??= error;
  }
  return { ok: false, code: "ILLEGAL_ACTION", message: firstError! };
}

/** Desfazer: só o último pick confirmado do jogador, enquanto ele for a última ação do draft. */
export function canUndo(config: DraftConfig, actions: DraftActionRecord[], seat: Seat, undosUsed: number): boolean {
  if (undosUsed >= (config.undoPerPlayer ?? 0)) return false;
  const last = actions.reduce<DraftActionRecord | null>((acc, a) => (!acc || a.stepIndex > acc.stepIndex ? a : acc), null);
  return Boolean(last && last.type === "PICK" && last.actorSeat === seat);
}

/** Tempo restante no relógio do jogador (pode ser negativo). */
export function clockRemainingMs(limitMs: number, usedMs: number, runningSince: number | null, now: number): number {
  return limitMs - usedMs - (runningSince === null ? 0 : Math.max(0, now - runningSince));
}

/** "4:59", "0:05", "-0:12"; a partir de uma hora, "-1:05:03". */
export function formatClock(ms: number): string {
  const negative = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000) + (negative && Math.abs(ms) % 1000 ? 1 : 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  const sign = negative ? "-" : "";
  return hours ? `${sign}${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${sign}${minutes}:${seconds}`;
}
