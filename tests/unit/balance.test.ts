import { describe, expect, it } from "vitest";
import { aggregateMetrics, computeProposal, cycleMaturity, smoothWinRate, type BalanceParams, type MatchSample } from "@/domain/balance";

const params: BalanceParams = {
  minSampleGames: 10,
  minSampleOpportunities: 10,
  priorGames: 20,
  weightWin: 0.5,
  weightPick: 0.25,
  weightBan: 0.25,
  historyWeight: 0.3,
  cycleMaturityMatches: 30,
  maxStep: 3,
  actionThreshold: 0.2,
};

let n = 0;
function match(a: { deck: string[]; bans?: string[]; picks: string[] }, b: { deck: string[]; bans?: string[]; picks: string[] }, winner: "A" | "B" | null): MatchSample {
  return {
    matchId: `m${++n}`,
    completedAt: new Date(),
    cycleId: "c1",
    seats: {
      A: { deck: a.deck, bannedFrom: a.bans ?? [], picks: a.picks },
      B: { deck: b.deck, bannedFrom: b.bans ?? [], picks: b.picks },
    },
    winnerSeat: winner,
    isDraw: winner === null,
  };
}

describe("cálculo de métricas", () => {
  const samples = [
    // "x" está no deck de A, é banido; "y" está no deck mas não é escolhido; "z" é escolhido e vence.
    match({ deck: ["x", "y", "z", "w"], bans: ["x"], picks: ["z", "w"] }, { deck: ["z", "k", "j"], picks: ["k", "j"] }, "A"),
    match({ deck: ["x", "y", "z", "w"], picks: ["x", "z"] }, { deck: ["k", "j"], picks: ["k", "j"] }, "B"),
  ];
  const { metrics, baselines } = aggregateMetrics(samples, 0);

  it("presença no deck não conta como pick", () => {
    const y = metrics.get("y")!;
    expect(y.deckAppearances).toBe(2);
    expect(y.picks).toBe(0);
    expect(y.pickRate).toBe(0);
  });

  it("oportunidades de pick excluem as vezes em que o personagem foi banido", () => {
    const x = metrics.get("x")!;
    expect(x).toMatchObject({ deckAppearances: 2, bans: 1, pickOpportunities: 1, picks: 1, banRate: 0.5, pickRate: 1 });
  });

  it("win rate considera vitórias e derrotas apenas de quem foi escolhido", () => {
    const z = metrics.get("z")!;
    // z: no deck de A nas duas partidas (escolhido nas duas: 1 vitória, 1 derrota) e no deck de B na 1ª (não escolhido).
    expect(z).toMatchObject({ deckAppearances: 3, picks: 2, games: 2, wins: 1, losses: 1, winRate: 0.5, matches: 2 });
  });

  it("linhas de base agregam todos os personagens", () => {
    const totalPicks = 8;
    expect(baselines.pickRate).toBeCloseTo(totalPicks / (13 - 1));
    expect(baselines.banRate).toBeCloseTo(1 / 13);
  });

  it("suavização puxa amostras pequenas para 50%", () => {
    expect(smoothWinRate(3, 0, 3, 20)).toBeCloseTo(13 / 23);
    expect(smoothWinRate(3, 0, 3, 0)).toBe(1);
    expect(smoothWinRate(0, 0, 0, 20)).toBe(0.5);
  });
});

const base = { pickRate: 0.5, banRate: 0.2, matches: 100 };
function metric(over: Partial<ReturnType<typeof aggregateMetrics>["metrics"] extends Map<string, infer M> ? M : never>) {
  const m = { matches: 0, deckAppearances: 0, bans: 0, pickOpportunities: 0, picks: 0, games: 0, wins: 0, losses: 0, draws: 0, pickRate: 0, banRate: 0, winRate: null, ...over };
  return { ...m, smoothedWinRate: smoothWinRate(m.wins, m.draws, m.games, params.priorGames) };
}

describe("sugestões de balanceamento", () => {
  const common = { baseCurrent: base, baseHistory: base, params, minCost: 3, maxCost: 40 };

  it("não aumenta preço por alta vitória em poucas partidas", () => {
    const hot = metric({ games: 4, wins: 4, picks: 4, pickOpportunities: 5, deckAppearances: 5, pickRate: 0.8, winRate: 1 });
    const r = computeProposal({ ...common, currentCost: 18, current: hot, history: undefined, maturity: 1 });
    expect(r.delta).toBe(0);
    expect(r.signals.map((s) => s.code)).toContain("LOW_SAMPLE");
  });

  it("aumenta preço com popularidade e desempenho acima do esperado e amostra suficiente", () => {
    const strong = metric({ games: 60, wins: 45, losses: 15, picks: 60, pickOpportunities: 70, deckAppearances: 120, bans: 50, pickRate: 60 / 70, banRate: 50 / 120, winRate: 0.75 });
    const r = computeProposal({ ...common, currentCost: 18, current: strong, history: strong, maturity: 1 });
    expect(r.delta).toBeGreaterThan(0);
    expect(r.delta).toBeLessThanOrEqual(params.maxStep);
    expect(r.signals.map((s) => s.code)).toEqual(expect.arrayContaining(["HIGH_POPULARITY_HIGH_PERFORMANCE", "HIGH_BAN_RATE"]));
  });

  it("não reduz agressivamente apenas por baixa escolha", () => {
    const ignored = metric({ games: 2, wins: 1, losses: 1, picks: 2, pickOpportunities: 80, deckAppearances: 80, pickRate: 2 / 80, banRate: 0, winRate: 0.5 });
    const r = computeProposal({ ...common, currentCost: 18, current: ignored, history: ignored, maturity: 1 });
    expect(r.delta).toBe(-1);
    expect(r.signals.map((s) => s.code)).toContain("PERSISTENT_LOW_USAGE");

    // Só com o sinal de popularidade, o score pediria -3; sem evidência de derrota, a redução é limitada a 1.
    const onlyPick = computeProposal({ ...common, params: { ...params, weightBan: 0 }, currentCost: 18, current: ignored, history: ignored, maturity: 1 });
    expect(onlyPick.delta).toBe(-1);
    expect(onlyPick.signals.map((s) => s.code)).toContain("DECREASE_CAPPED");
  });

  it("reduz com baixo desempenho comprovado", () => {
    const weak = metric({ games: 80, wins: 10, losses: 70, picks: 80, pickOpportunities: 267, deckAppearances: 267, pickRate: 0.3, banRate: 0, winRate: 0.125 });
    const r = computeProposal({ ...common, currentCost: 18, current: weak, history: weak, maturity: 1 });
    expect(r.delta).toBeLessThan(-1);
    expect(r.signals.map((s) => s.code)).toContain("LOW_PERFORMANCE");
  });

  it("respeita preço mínimo e máximo", () => {
    const strong = metric({ games: 60, wins: 50, losses: 10, picks: 60, pickOpportunities: 60, deckAppearances: 100, bans: 40, pickRate: 1, banRate: 0.4, winRate: 0.83 });
    expect(computeProposal({ ...common, currentCost: 39, current: strong, history: strong, maturity: 1 }).suggestedCost).toBe(40);
    const weak = metric({ games: 80, wins: 10, losses: 70, picks: 80, pickOpportunities: 90, deckAppearances: 90, pickRate: 0.9, winRate: 0.125 });
    expect(computeProposal({ ...common, currentCost: 4, current: weak, history: weak, maturity: 1 }).suggestedCost).toBe(3);
  });

  it("início de ciclo: mais peso no histórico e limiar mais conservador", () => {
    const strongNow = metric({ games: 30, wins: 25, losses: 5, picks: 30, pickOpportunities: 35, deckAppearances: 40, pickRate: 30 / 35, winRate: 0.83 });
    const neutralBefore = metric({ games: 100, wins: 50, losses: 50, picks: 100, pickOpportunities: 200, deckAppearances: 200, pickRate: 0.5, winRate: 0.5 });
    const early = computeProposal({ ...common, currentCost: 18, current: strongNow, history: neutralBefore, maturity: 0.1 });
    const mature = computeProposal({ ...common, currentCost: 18, current: strongNow, history: neutralBefore, maturity: 1 });
    expect(early.lambda).toBeLessThan(mature.lambda);
    expect(early.threshold).toBeGreaterThan(mature.threshold);
    expect(early.delta).toBe(0);
    expect(mature.delta).toBeGreaterThan(0);
    expect(early.signals.map((s) => s.code)).toContain("EARLY_CYCLE");
  });

  it("detecta mudança relevante em relação ao ciclo anterior", () => {
    const now = metric({ games: 40, wins: 30, losses: 10, picks: 40, pickOpportunities: 45, deckAppearances: 50, pickRate: 40 / 45, winRate: 0.75 });
    const before = metric({ games: 40, wins: 18, losses: 22, picks: 40, pickOpportunities: 100, deckAppearances: 100, pickRate: 0.4, winRate: 0.45 });
    const r = computeProposal({ ...common, currentCost: 18, current: now, history: before, maturity: 1 });
    expect(r.signals.map((s) => s.code)).toContain("TREND_UP");
  });

  it("maturidade do ciclo cresce com a amostra", () => {
    expect(cycleMaturity(0, 30)).toBe(0);
    expect(cycleMaturity(15, 30)).toBe(0.5);
    expect(cycleMaturity(90, 30)).toBe(1);
  });

  it("resultado é determinístico", () => {
    const m = metric({ games: 50, wins: 35, losses: 15, picks: 50, pickOpportunities: 60, deckAppearances: 70, bans: 10, pickRate: 50 / 60, banRate: 10 / 70, winRate: 0.7 });
    const a = computeProposal({ ...common, currentCost: 18, current: m, history: m, maturity: 0.7 });
    const b = computeProposal({ ...common, currentCost: 18, current: m, history: m, maturity: 0.7 });
    expect(a).toEqual(b);
  });
});
