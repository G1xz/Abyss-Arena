/**
 * BalanceEngine — modelo estatístico determinístico e auditável (sem IA).
 * Documentação completa: docs/BALANCEAMENTO.md.
 *
 * Definições (por personagem c, sobre partidas VALIDADAS — status COMPLETED):
 *  - Presença no deck:      c está no snapshot do deck de um jogador.        (não conta como pick)
 *  - Oportunidade de ban:   cada presença no deck (o oponente pôde banir c).
 *  - Disponível:            c no deck e não banido pelo oponente.
 *  - Oportunidade de pick:  cada situação "disponível".
 *  - Escolhido (pick):      c entrou no time final.
 *  - Utilizado (jogo):      pick em partida com resultado validado (= pick, pois só partidas validadas entram).
 *
 *  Pick Rate = picks / oportunidades de pick
 *  Ban Rate  = bans / oportunidades de ban
 *  Win Rate  = (vitórias + 0,5·empates) / jogos
 *  Win Rate suavizado = (vitórias + 0,5·empates + k·0,5) / (jogos + k), k = priorGames
 */

export type SeatKey = "A" | "B";

export interface SeatSample {
  deck: string[];
  bannedFrom: string[];
  picks: string[];
}

export interface MatchSample {
  matchId: string;
  completedAt: Date;
  cycleId: string | null;
  seats: Record<SeatKey, SeatSample>;
  winnerSeat: SeatKey | null;
  isDraw: boolean;
}

export interface CharacterMetrics {
  matches: number;
  deckAppearances: number;
  bans: number;
  pickOpportunities: number;
  picks: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pickRate: number;
  banRate: number;
  winRate: number | null;
  smoothedWinRate: number;
}

export interface Baselines {
  pickRate: number;
  banRate: number;
  matches: number;
}

export interface BalanceParams {
  minSampleGames: number;
  minSampleOpportunities: number;
  priorGames: number;
  weightWin: number;
  weightPick: number;
  weightBan: number;
  historyWeight: number;
  cycleMaturityMatches: number;
  maxStep: number;
  actionThreshold: number;
}

const emptyCounts = () => ({ matches: 0, deckAppearances: 0, bans: 0, pickOpportunities: 0, picks: 0, games: 0, wins: 0, losses: 0, draws: 0 });

export function smoothWinRate(wins: number, draws: number, games: number, priorGames: number): number {
  return (wins + 0.5 * draws + priorGames * 0.5) / (games + priorGames || 1);
}

export function aggregateMetrics(samples: MatchSample[], priorGames: number): { metrics: Map<string, CharacterMetrics>; baselines: Baselines } {
  const counts = new Map<string, ReturnType<typeof emptyCounts>>();
  const get = (id: string) => {
    let c = counts.get(id);
    if (!c) counts.set(id, (c = emptyCounts()));
    return c;
  };
  let totalPicks = 0;
  let totalPickOpp = 0;
  let totalBans = 0;
  let totalBanOpp = 0;

  for (const match of samples) {
    const inMatch = new Set<string>();
    for (const seat of ["A", "B"] as SeatKey[]) {
      const s = match.seats[seat];
      const banned = new Set(s.bannedFrom);
      const picked = new Set(s.picks);
      const outcome = match.isDraw ? "draw" : match.winnerSeat === seat ? "win" : "loss";
      for (const id of new Set(s.deck)) {
        const c = get(id);
        inMatch.add(id);
        c.deckAppearances++;
        totalBanOpp++;
        if (banned.has(id)) {
          c.bans++;
          totalBans++;
        } else {
          c.pickOpportunities++;
          totalPickOpp++;
        }
        if (picked.has(id)) {
          c.picks++;
          c.games++;
          totalPicks++;
          if (outcome === "win") c.wins++;
          else if (outcome === "loss") c.losses++;
          else c.draws++;
        }
      }
    }
    for (const id of inMatch) get(id).matches++;
  }

  const metrics = new Map<string, CharacterMetrics>();
  for (const [id, c] of counts) {
    metrics.set(id, {
      ...c,
      pickRate: c.pickOpportunities ? c.picks / c.pickOpportunities : 0,
      banRate: c.deckAppearances ? c.bans / c.deckAppearances : 0,
      winRate: c.games ? (c.wins + 0.5 * c.draws) / c.games : null,
      smoothedWinRate: smoothWinRate(c.wins, c.draws, c.games, priorGames),
    });
  }
  return {
    metrics,
    baselines: {
      pickRate: totalPickOpp ? totalPicks / totalPickOpp : 0,
      banRate: totalBanOpp ? totalBans / totalBanOpp : 0,
      matches: samples.length,
    },
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface ScoreBreakdown {
  /** Score combinado em [-1, 1]. Positivo = pressão para aumentar o preço. */
  score: number;
  win: number;
  pick: number;
  ban: number;
  /** Confiança amostral [0,1]. */
  confidence: number;
  sufficient: { win: boolean; pick: boolean; ban: boolean };
}

/** Score de um escopo (ciclo atual ou histórico) contra a linha de base do próprio escopo. */
export function scoreScope(m: CharacterMetrics | undefined, base: Baselines, p: BalanceParams): ScoreBreakdown {
  const zero: ScoreBreakdown = { score: 0, win: 0, pick: 0, ban: 0, confidence: 0, sufficient: { win: false, pick: false, ban: false } };
  if (!m) return zero;
  const sufficient = {
    win: m.games >= p.minSampleGames,
    pick: m.pickOpportunities >= p.minSampleOpportunities && base.pickRate > 0,
    ban: m.deckAppearances >= p.minSampleOpportunities,
  };
  const confGames = m.games / (m.games + p.minSampleGames);
  const confPick = m.pickOpportunities / (m.pickOpportunities + p.minSampleOpportunities);
  const confBan = m.deckAppearances / (m.deckAppearances + p.minSampleOpportunities);

  // 15 p.p. acima de 50% (já suavizado) = pressão máxima.
  const win = sufficient.win ? clamp((m.smoothedWinRate - 0.5) / 0.15, -1, 1) * confGames : 0;
  const pick = sufficient.pick ? clamp((m.pickRate - base.pickRate) / base.pickRate, -1, 1) * confPick : 0;
  // Bans só pressionam para cima: ser pouco banido não justifica reduzir preço.
  const banBase = Math.max(base.banRate, 0.05);
  const ban = sufficient.ban ? clamp((m.banRate - banBase) / banBase, 0, 1) * confBan : 0;

  // Normaliza apenas pelos sinais com amostra suficiente: um sinal forte e bem amostrado
  // (ex.: banido em quase toda oportunidade) não é diluído por sinais ainda sem dados.
  const usedWeight =
    (sufficient.win ? p.weightWin : 0) + (sufficient.pick ? p.weightPick : 0) + (sufficient.ban ? p.weightBan : 0);
  if (usedWeight === 0) return { ...zero, sufficient };
  const score = (p.weightWin * win + p.weightPick * pick + p.weightBan * ban) / usedWeight;
  const confidence =
    ((sufficient.win ? p.weightWin * confGames : 0) + (sufficient.pick ? p.weightPick * confPick : 0) + (sufficient.ban ? p.weightBan * confBan : 0)) /
    usedWeight;
  return { score, win, pick, ban, confidence, sufficient };
}

export interface Signal {
  code:
    | "HIGH_POPULARITY_HIGH_PERFORMANCE"
    | "HIGH_BAN_RATE"
    | "PERSISTENT_LOW_USAGE"
    | "LOW_PERFORMANCE"
    | "TREND_UP"
    | "TREND_DOWN"
    | "LOW_SAMPLE"
    | "EARLY_CYCLE"
    | "DECREASE_CAPPED";
  label: string;
  detail: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function detectSignals(
  cur: CharacterMetrics | undefined,
  hist: CharacterMetrics | undefined,
  baseCur: Baselines,
  baseHist: Baselines,
  maturity: number,
  p: BalanceParams,
): Signal[] {
  const signals: Signal[] = [];
  const main = cur && cur.games >= p.minSampleGames ? cur : hist;
  const mainBase = main === cur ? baseCur : baseHist;

  if (main && main.games >= p.minSampleGames && main.pickRate >= mainBase.pickRate * 1.25 && main.smoothedWinRate >= 0.55) {
    signals.push({
      code: "HIGH_POPULARITY_HIGH_PERFORMANCE",
      label: "Popular e acima do esperado",
      detail: `Pick rate ${pct(main.pickRate)} (base ${pct(mainBase.pickRate)}) com win rate suavizado ${pct(main.smoothedWinRate)} em ${main.games} jogos.`,
    });
  }
  if (main && main.deckAppearances >= p.minSampleOpportunities && main.banRate >= Math.max(mainBase.banRate * 1.5, 0.25)) {
    signals.push({
      code: "HIGH_BAN_RATE",
      label: "Alta taxa de banimento",
      detail: `Ban rate ${pct(main.banRate)} (base ${pct(mainBase.banRate)}) em ${main.deckAppearances} oportunidades.`,
    });
  }
  const lowUsage = (m: CharacterMetrics | undefined, b: Baselines) =>
    m !== undefined && m.pickOpportunities >= p.minSampleOpportunities && m.pickRate <= b.pickRate * 0.5;
  if (lowUsage(cur, baseCur) && lowUsage(hist, baseHist)) {
    signals.push({
      code: "PERSISTENT_LOW_USAGE",
      label: "Baixa utilização persistente",
      detail: `Pick rate ${pct(cur!.pickRate)} no ciclo atual e ${pct(hist!.pickRate)} no histórico, abaixo da metade da base.`,
    });
  }
  if (main && main.games >= p.minSampleGames && main.smoothedWinRate <= 0.45) {
    signals.push({
      code: "LOW_PERFORMANCE",
      label: "Baixo desempenho",
      detail: `Win rate suavizado ${pct(main.smoothedWinRate)} em ${main.games} jogos.`,
    });
  }
  if (cur && hist && cur.games >= p.minSampleGames && hist.games >= p.minSampleGames) {
    const dPick = cur.pickRate - hist.pickRate;
    const dWin = cur.smoothedWinRate - hist.smoothedWinRate;
    if (dPick >= 0.15 || dWin >= 0.08) {
      signals.push({
        code: "TREND_UP",
        label: "Alta em relação ao ciclo anterior",
        detail: `Pick rate ${dPick >= 0 ? "+" : ""}${(dPick * 100).toFixed(1)} p.p., win rate ${dWin >= 0 ? "+" : ""}${(dWin * 100).toFixed(1)} p.p.`,
      });
    } else if (dPick <= -0.15 || dWin <= -0.08) {
      signals.push({
        code: "TREND_DOWN",
        label: "Queda em relação ao ciclo anterior",
        detail: `Pick rate ${(dPick * 100).toFixed(1)} p.p., win rate ${(dWin * 100).toFixed(1)} p.p.`,
      });
    }
  }
  const games = (cur?.games ?? 0) + (hist?.games ?? 0);
  if (games < p.minSampleGames) {
    signals.push({ code: "LOW_SAMPLE", label: "Amostra pequena", detail: `${games} jogos validados (mínimo ${p.minSampleGames}).` });
  }
  if (maturity < 1) {
    signals.push({
      code: "EARLY_CYCLE",
      label: "Início de ciclo",
      detail: `Ciclo atual com ${pct(maturity)} da amostra de referência; dados históricos têm mais peso e os limites são mais conservadores.`,
    });
  }
  return signals;
}

export interface ProposalComputation {
  currentCost: number;
  suggestedCost: number;
  delta: number;
  score: number;
  confidence: number;
  lambda: number;
  threshold: number;
  maxStep: number;
  current: ScoreBreakdown;
  history: ScoreBreakdown;
  signals: Signal[];
  explanation: string;
}

/**
 * Calcula a proposta de preço de um personagem.
 * Retorna delta = 0 quando não há evidência suficiente para mudar.
 */
export function computeProposal(input: {
  currentCost: number;
  current: CharacterMetrics | undefined;
  history: CharacterMetrics | undefined;
  baseCurrent: Baselines;
  baseHistory: Baselines;
  maturity: number;
  params: BalanceParams;
  minCost: number;
  maxCost: number;
}): ProposalComputation {
  const { params: p, maturity } = input;
  const cur = scoreScope(input.current, input.baseCurrent, p);
  const hist = scoreScope(input.history, input.baseHistory, p);
  const hasHistory = hist.sufficient.win || hist.sufficient.pick || hist.sufficient.ban;

  // Peso do ciclo atual cresce com a maturidade; sem histórico, o ciclo é amortecido pela maturidade.
  const lambda = hasHistory ? (1 - p.historyWeight) * maturity : maturity;
  const score = hasHistory ? lambda * cur.score + (1 - lambda) * hist.score : lambda * cur.score;
  const confidence = hasHistory ? lambda * cur.confidence + (1 - lambda) * hist.confidence : lambda * cur.confidence;

  // Conservadorismo no início do ciclo: limiar maior e passo menor.
  const threshold = p.actionThreshold * (2 - maturity);
  const maxStep = Math.max(1, Math.round(p.maxStep * (0.5 + 0.5 * maturity)));

  const signals = detectSignals(input.current, input.history, input.baseCurrent, input.baseHistory, maturity, p);

  let delta = 0;
  if (Math.abs(score) >= threshold) {
    delta = Math.sign(score) * Math.max(1, Math.round(Math.abs(score) * maxStep));
    // Redução forte só com evidência de desempenho baixo (não apenas por pouca escolha).
    const winEvidence = (cur.sufficient.win && cur.win < 0) || (hist.sufficient.win && hist.win < 0);
    if (delta < -1 && !winEvidence) {
      delta = -1;
      signals.push({ code: "DECREASE_CAPPED", label: "Redução limitada", detail: "Sem evidência de desempenho baixo, a redução foi limitada a 1 ponto." });
    }
  }
  const suggestedCost = clamp(input.currentCost + delta, input.minCost, input.maxCost);
  delta = suggestedCost - input.currentCost;

  const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const explanation = [
    `Score ${fmt(score)} (limiar ±${threshold.toFixed(2)}).`,
    `Ciclo atual: vitória ${fmt(cur.win)}, popularidade ${fmt(cur.pick)}, bans ${fmt(cur.ban)} → ${fmt(cur.score)}.`,
    `Histórico: vitória ${fmt(hist.win)}, popularidade ${fmt(hist.pick)}, bans ${fmt(hist.ban)} → ${fmt(hist.score)}.`,
    `Peso do ciclo atual ${(lambda * 100).toFixed(0)}% (maturidade ${(maturity * 100).toFixed(0)}%).`,
    delta === 0 ? "Sem alteração sugerida." : `Sugestão ${delta > 0 ? "+" : ""}${delta} ponto(s), limite por atualização ${maxStep}.`,
  ].join(" ");

  return {
    currentCost: input.currentCost,
    suggestedCost,
    delta,
    score,
    confidence,
    lambda,
    threshold,
    maxStep,
    current: cur,
    history: hist,
    signals,
    explanation,
  };
}

export function cycleMaturity(currentCycleMatches: number, maturityMatches: number): number {
  return clamp(currentCycleMatches / Math.max(1, maturityMatches), 0, 1);
}
