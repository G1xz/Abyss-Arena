import { evaluateDeck } from "@/domain/deck";
import { computeDraftState, type Seat } from "@/domain/draft";
import type { AbyssRulesSnapshot } from "../abyss/service";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { DEFAULT_COST_RULES } from "@/domain/pricing";
import { getActivePriceVersion, getUserCostMap } from "../pricing/service";
import { loadDraftContext } from "./service";
import { readConfig } from "./common";
import type { MatchConfig } from "../settings";

export interface DraftCharacterView {
  characterId: string;
  name: string;
  element: string;
  weaponType: string;
  rarity: number;
  iconUrl: string | null;
  cost: number;
  constellation: number;
  level: number;
}

export interface MatchView {
  id: string;
  code: string;
  status: string;
  revision: number;
  currentStep: number;
  hostId: string;
  viewerSeat: Seat | null;
  viewerIsAdmin: boolean;
  createdAt: string;
  draftStartedAt: string | null;
  lockedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  config: MatchConfig;
  rules: AbyssRulesSnapshot | null;
  priceVersion: { id: string; number: number | null; label: string | null };
  players: Partial<
    Record<
      Seat,
      {
        userId: string;
        nickname: string;
        isReady: boolean;
        outcome: string | null;
        deck: { id: string; name: string; size: number; totalCost: number; valid: boolean; issue: string | null } | null;
      }
    >
  >;
  draft: null | {
    stepIndex: number;
    totalSteps: number;
    isComplete: boolean;
    currentStep: { type: "BAN" | "PICK"; actor: Seat } | null;
    decks: Record<Seat, DraftCharacterView[]>;
    deckNames: Record<Seat, string>;
    deckCosts: Record<Seat, number>;
    bannedFrom: Record<Seat, string[]>;
    picks: Record<Seat, string[]>;
  };
  results: Partial<
    Record<
      Seat,
      {
        timeMs: number;
        finalTimeMs: number | null;
        status: string;
        submittedAt: string;
        confirmedAt: string | null;
        evidence: string[];
      }
    >
  >;
  disputes: {
    id: string;
    againstSeat: Seat;
    reason: string;
    raisedBy: string;
    status: string;
    resolution: string | null;
    resolutionNote: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  winnerSeat: Seat | null;
  isDraw: boolean;
  resolvedBy: string | null;
  invites: { id: string; toUserId: string; toNickname: string; status: string; expiresAt: string; createdAt: string }[];
  events: { id: string; type: string; actor: string | null; payload: Record<string, unknown> | null; createdAt: string }[];
}

/**
 * Estado da partida para um espectador. Participantes e admins veem tudo;
 * antes do draft, a composição do deck do oponente não é revelada.
 */
export async function getMatchView(matchId: string, viewer: { id: string; role: string } | null, db: Tx = prisma): Promise<MatchView> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      players: {
        include: {
          user: { select: { id: true, nickname: true } },
          deck: { include: { characters: { select: { characterId: true } } } },
        },
      },
      priceVersion: { select: { id: true, number: true, label: true } },
      results: { include: { evidence: { orderBy: { createdAt: "asc" } } } },
      disputes: { orderBy: { createdAt: "asc" }, include: { raisedBy: { select: { nickname: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 60, include: { actorUser: { select: { nickname: true } } } },
      invites: { orderBy: { createdAt: "desc" }, take: 5, include: { toUser: { select: { nickname: true } } } },
    },
  });
  if (!match) throw new AppError("NOT_FOUND", "Partida não encontrada");

  const viewerSeat = (viewer && match.players.find((p) => p.userId === viewer.id)?.seat) ?? null;
  const viewerIsAdmin = viewer?.role === "ADMIN";
  const config = readConfig(match);

  // Avaliação dos decks selecionados (antes do snapshot): tabela vigente + conta de cada jogador.
  const lobby = match.status === "WAITING" || match.status === "READY";
  const active = lobby ? await getActivePriceVersion(db) : null;

  const players: MatchView["players"] = {};
  for (const p of match.players) {
    let deck: NonNullable<MatchView["players"]["A"]>["deck"] = null;
    if (p.deck) {
      const ids = p.deck.characters.map((c) => c.characterId);
      const costs = lobby && active ? await getUserCostMap(p.userId, active.id, config.costRules ?? DEFAULT_COST_RULES, db) : null;
      const evaluation = lobby
        ? evaluateDeck(ids, costs?.prices ?? new Map(), { budget: config.deckBudget, minSize: config.minDeckSize }, costs?.owned)
        : null;
      deck = {
        id: p.deck.id,
        name: p.deck.name,
        size: ids.length,
        totalCost: evaluation?.totalCost ?? 0,
        valid: evaluation?.valid ?? true,
        issue: evaluation?.issues[0]?.message ?? null,
      };
    }
    players[p.seat] = { userId: p.userId, nickname: p.user.nickname, isReady: p.isReady, outcome: p.outcome, deck };
  }

  let draft: MatchView["draft"] = null;
  if (match.draftStartedAt) {
    const ctx = await loadDraftContext(db, match.id);
    const state = computeDraftState(config.draft, ctx.decks, ctx.actions);
    const decks = { A: [], B: [] } as Record<Seat, DraftCharacterView[]>;
    const deckNames = { A: "", B: "" } as Record<Seat, string>;
    const deckCosts = { A: 0, B: 0 } as Record<Seat, number>;
    for (const s of ctx.snapshots) {
      deckNames[s.seat] = s.deckName;
      deckCosts[s.seat] = s.totalCost;
      decks[s.seat] = s.entries
        .map((e) => ({
          characterId: e.characterId,
          name: e.name,
          element: e.element,
          weaponType: e.weaponType,
          rarity: e.rarity,
          iconUrl: e.iconUrl,
          cost: e.cost,
          constellation: e.constellation,
          level: e.level,
        }))
        .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
    }
    draft = {
      stepIndex: state.stepIndex,
      totalSteps: state.totalSteps,
      isComplete: state.isComplete,
      currentStep: state.currentStep,
      decks,
      deckNames,
      deckCosts,
      bannedFrom: state.bannedFrom,
      picks: state.picks,
    };
  }

  const results: MatchView["results"] = {};
  for (const r of match.results) {
    results[r.seat] = {
      timeMs: r.timeMs,
      finalTimeMs: r.finalTimeMs,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      evidence: r.evidence.map((e) => e.url),
    };
  }

  return {
    id: match.id,
    code: match.code,
    status: match.status,
    revision: match.revision,
    currentStep: match.currentStep,
    hostId: match.hostId,
    viewerSeat,
    viewerIsAdmin,
    createdAt: match.createdAt.toISOString(),
    draftStartedAt: match.draftStartedAt?.toISOString() ?? null,
    lockedAt: match.lockedAt?.toISOString() ?? null,
    completedAt: match.completedAt?.toISOString() ?? null,
    cancelReason: match.cancelReason,
    config,
    rules: (match.rules as unknown as AbyssRulesSnapshot | null) ?? null,
    priceVersion: match.priceVersion,
    players,
    draft,
    results,
    disputes: match.disputes.map((d) => ({
      id: d.id,
      againstSeat: d.againstSeat,
      reason: d.reason,
      raisedBy: d.raisedBy.nickname,
      status: d.status,
      resolution: d.resolution,
      resolutionNote: d.resolutionNote,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
    })),
    winnerSeat: match.winnerSeat,
    isDraw: match.isDraw,
    resolvedBy: match.resolvedBy,
    invites: match.invites.map((i) => ({
      id: i.id,
      toUserId: i.toUserId,
      toNickname: i.toUser.nickname,
      status: i.status === "PENDING" && i.expiresAt.getTime() <= Date.now() ? "EXPIRED" : i.status,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    events: match.events.map((e) => ({
      id: e.id,
      type: e.type,
      actor: e.actorUser?.nickname ?? null,
      payload: (e.payload as Record<string, unknown> | null) ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/** Participantes e administradores acompanham a sala em tempo real. */
export async function canWatchMatch(matchId: string, viewer: { id: string; role: string }, db: Tx = prisma) {
  if (viewer.role === "ADMIN") return true;
  const seat = await db.matchPlayer.findUnique({ where: { matchId_userId: { matchId, userId: viewer.id } }, select: { id: true } });
  return Boolean(seat);
}
