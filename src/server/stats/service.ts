import { aggregateMetrics } from "@/domain/balance";
import { prisma, type Tx } from "../db";
import { loadMatchSamples } from "../balance/service";
import { getSettings } from "../settings";
import { getPriceHistory } from "../pricing/service";

export interface PlayerRecord {
  userId: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  winRate: number;
}

/**
 * Ranking do MVP. Critérios, em ordem:
 *  1. Mais vitórias
 *  2. Maior taxa de vitória ((V + 0,5·E) / partidas)
 *  3. Menos derrotas
 *  4. Nickname (ordem alfabética, apenas para estabilidade)
 * Apenas partidas concluídas com resultado validado contam. O campo `rating` do usuário fica
 * reservado para um futuro ELO/MMR.
 */
export async function getRanking(db: Tx = prisma, limit = 100): Promise<PlayerRecord[]> {
  const grouped = await db.matchPlayer.groupBy({
    by: ["userId", "outcome"],
    where: { outcome: { not: null }, match: { status: "COMPLETED" } },
    _count: { _all: true },
  });
  const byUser = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const g of grouped) {
    const rec = byUser.get(g.userId) ?? { wins: 0, losses: 0, draws: 0 };
    if (g.outcome === "WIN") rec.wins += g._count._all;
    else if (g.outcome === "LOSS") rec.losses += g._count._all;
    else rec.draws += g._count._all;
    byUser.set(g.userId, rec);
  }
  const users = await db.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, nickname: true } });
  const records = users.map((u) => {
    const r = byUser.get(u.id)!;
    const games = r.wins + r.losses + r.draws;
    return { userId: u.id, nickname: u.nickname, ...r, games, winRate: games ? (r.wins + 0.5 * r.draws) / games : 0 };
  });
  records.sort(
    (a, b) => b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses || a.nickname.localeCompare(b.nickname),
  );
  return records.slice(0, limit);
}

export async function getPlayerRecord(userId: string, db: Tx = prisma) {
  const ranking = await getRanking(db, 100_000);
  const index = ranking.findIndex((r) => r.userId === userId);
  const record = index >= 0 ? ranking[index]! : null;
  return { position: index >= 0 ? index + 1 : null, record };
}

export async function getPlayerMatches(userId: string, db: Tx = prisma, take = 50) {
  return db.match.findMany({
    where: { players: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      players: { include: { user: { select: { nickname: true } } } },
      results: { select: { seat: true, timeMs: true, finalTimeMs: true } },
      abyssCycle: { select: { name: true } },
    },
  });
}

/** Estatísticas públicas dos personagens, calculadas sobre todas as partidas validadas. */
export async function getCharacterStats(db: Tx = prisma) {
  const settings = await getSettings("balance", db);
  const samples = await loadMatchSamples({}, db);
  const { metrics, baselines } = aggregateMetrics(samples, settings.priorGames);
  const characters = await db.character.findMany({
    select: { id: true, name: true, element: true, rarity: true, iconUrl: true, weaponType: true },
  });
  const history = await getPriceHistory(db);
  const first = history[0];
  const active = history[history.length - 1];
  const rows = characters.map((c) => {
    const m = metrics.get(c.id);
    const currentCost = active?.costs.get(c.id) ?? null;
    const firstCost = history.find((v) => v.costs.has(c.id))?.costs.get(c.id) ?? null;
    return {
      ...c,
      metrics: m ?? null,
      currentCost,
      costChange: currentCost !== null && firstCost !== null ? currentCost - firstCost : 0,
      /** Amostra suficiente para exibir taxas como representativas. */
      reliable: (m?.games ?? 0) >= settings.minSampleGames,
    };
  });
  return {
    totalMatches: samples.length,
    baselines,
    minSampleGames: settings.minSampleGames,
    rows,
    history: history.map((v) => ({ number: v.number, label: v.label, publishedAt: v.publishedAt, costs: Object.fromEntries(v.costs) })),
    firstVersion: first?.number ?? null,
  };
}
