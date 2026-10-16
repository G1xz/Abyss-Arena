"use server";

import { revalidatePath } from "next/cache";
import { parseSequence, buildSequence, type DraftPreset } from "@/domain/draft";
import { parseDuration } from "@/domain/results";
import { addChallenge, createCycle, setChallengeEnabled, updateCycle } from "@/server/abyss/service";
import { writeAuditLog } from "@/server/audit";
import { assertAdmin } from "@/server/auth/accounts";
import { getCurrentUser } from "@/server/auth/next";
import type { SessionUser } from "@/server/auth/session";
import { approveProposal, rejectProposal, runBalanceAnalysis } from "@/server/balance/service";
import { syncCatalog } from "@/server/catalog/sync";
import { prisma } from "@/server/db";
import { AppError, toErrorResult, type ActionResult } from "@/server/errors";
import { resolveDispute } from "@/server/matches/results";
import {
  cancelScheduledVersion,
  discardDraft,
  publishDraft,
  revertDraftPrice,
  setCharacterBalanceLock,
  setCharacterCompetitive,
  setDraftPrice,
} from "@/server/pricing/service";
import { enforceRateLimit } from "@/server/rate-limit";
import { balanceSettingsSchema, competitiveSettingsSchema, getSettings, saveSettings } from "@/server/settings";

async function admin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  assertAdmin(user);
  enforceRateLimit("adminAction", user.id);
  return user;
}

async function run<T>(fn: (user: SessionUser) => Promise<T>, paths: string[] = ["/admin"]): Promise<ActionResult<T extends void ? undefined : T>> {
  try {
    const user = await admin();
    const data = await fn(user);
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data } as ActionResult<T extends void ? undefined : T>;
  } catch (err) {
    return toErrorResult(err);
  }
}

// ── Preços ──────────────────────────────────────────────────────────────

export async function setPriceAction(input: { characterId: string; cost: number; overrides?: Record<string, number>; justification: string }) {
  return run(async (u) => {
    await setDraftPrice(u, input);
  });
}

export async function revertPriceAction(characterId: string) {
  return run((u) => revertDraftPrice(u, characterId));
}

export async function publishDraftAction(input: { notes?: string; label?: string; scheduledFor?: string }) {
  return run(async (u) => {
    const v = await publishDraft(u, input);
    return { status: v.status, number: v.number };
  }, ["/"]);
}

export async function cancelScheduleAction() {
  return run((u) => cancelScheduledVersion(u));
}

export async function discardDraftAction() {
  return run((u) => discardDraft(u));
}

export async function approveProposalAction(proposalId: string, input: { cost?: number; note: string }) {
  return run(async (u) => {
    await approveProposal(u, proposalId, input);
  });
}

export async function rejectProposalAction(proposalId: string, input: { note: string }) {
  return run(async (u) => {
    await rejectProposal(u, proposalId, input);
  });
}

export async function setCompetitiveAction(characterId: string, enabled: boolean) {
  return run((u) => setCharacterCompetitive(u, characterId, enabled), ["/"]);
}

export async function setBalanceLockAction(characterId: string, locked: boolean, reason: string) {
  return run((u) => setCharacterBalanceLock(u, characterId, locked, reason || null));
}

// ── Balanceamento e catálogo ────────────────────────────────────────────

export async function runAnalysisAction(kind: "MANUAL" | "EXTRAORDINARY", generateProposals: boolean) {
  return run((u) => runBalanceAnalysis({ kind, generateProposals, actor: u }));
}

export async function syncCatalogAction() {
  return run(async (u) => {
    try {
      const report = await syncCatalog();
      await writeAuditLog(prisma, {
        adminId: u.id,
        action: "CATALOG_SYNC_MANUAL",
        entityType: "Character",
        after: { ...report, createdSlugs: report.createdSlugs.slice(0, 50) },
      });
      return report;
    } catch (err) {
      if (err instanceof Error && err.name === "CatalogUnavailableError") throw new AppError("UNAVAILABLE", err.message);
      throw err;
    }
  });
}

// ── Configurações ──────────────────────────────────────────────────────

export async function saveCompetitiveSettingsAction(input: {
  deckBudget: number;
  minCharacterCost: number;
  maxCharacterCost: number;
  bansPerPlayer: number;
  picksPerPlayer: number;
  draftPreset: string;
  customSequence: string;
  tiePolicy: "DRAW" | "FIRST_SUBMITTED_WINS";
  minResultSeconds: number;
  maxResultSeconds: number;
  curveFourStar: number[];
  curveFiveStar: number[];
  level95Bonus: number;
  level100Bonus: number;
}) {
  return run(async (u) => {
    const sequence =
      input.draftPreset === "CUSTOM"
        ? (() => {
            try {
              return parseSequence(input.customSequence);
            } catch (err) {
              throw new AppError("VALIDATION", (err as Error).message);
            }
          })()
        : buildSequence(input.draftPreset as DraftPreset, input.bansPerPlayer, input.picksPerPlayer);
    const before = await getSettings("competitive");
    const candidate = {
      deckBudget: input.deckBudget,
      minCharacterCost: input.minCharacterCost,
      maxCharacterCost: input.maxCharacterCost,
      constellationCurve: { fourStar: input.curveFourStar, fiveStar: input.curveFiveStar },
      levelBonus: { level95: input.level95Bonus, level100: input.level100Bonus },
      draftPreset: input.draftPreset,
      draft: { bansPerPlayer: input.bansPerPlayer, picksPerPlayer: input.picksPerPlayer, sequence, turnTimeoutSeconds: null },
      tiePolicy: input.tiePolicy,
      minResultSeconds: input.minResultSeconds,
      maxResultSeconds: input.maxResultSeconds,
    };
    const parsed = competitiveSettingsSchema.safeParse(candidate);
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Configuração inválida");
    await saveSettings("competitive", parsed.data, u.id);
    await writeAuditLog(prisma, { adminId: u.id, action: "SETTINGS_COMPETITIVE_UPDATED", entityType: "SystemSetting", entityId: "competitive", before, after: parsed.data });
  });
}

export async function saveBalanceSettingsAction(input: Record<string, number>) {
  return run(async (u) => {
    const parsed = balanceSettingsSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Parâmetros inválidos");
    const before = await getSettings("balance");
    await saveSettings("balance", parsed.data, u.id);
    await writeAuditLog(prisma, { adminId: u.id, action: "SETTINGS_BALANCE_UPDATED", entityType: "SystemSetting", entityId: "balance", before, after: parsed.data });
  });
}

// ── Abismo ─────────────────────────────────────────────────────────────

export async function createCycleAction(input: { name: string; startsAt: string; endsAt: string; rules: string; floor: number }) {
  return run(async (u) => {
    await createCycle(u, input);
  });
}

export async function updateCycleAction(cycleId: string, input: { name: string; startsAt: string; endsAt: string; rules: string; status: "ACTIVE" | "ENDED" }) {
  return run(async (u) => {
    await updateCycle(u, cycleId, input);
  });
}

export async function toggleChallengeAction(challengeId: string, enabled: boolean) {
  return run(async (u) => {
    await setChallengeEnabled(u, challengeId, enabled);
  });
}

export async function addChallengeAction(cycleId: string, input: { floor: number; chamber: number; half: "FIRST" | "SECOND" }) {
  return run(async (u) => {
    await addChallenge(u, cycleId, input);
  });
}

// ── Disputas ───────────────────────────────────────────────────────────

export async function resolveDisputeAction(
  disputeId: string,
  input: { resolution: "ACCEPT_TIMES" | "FORCE_WINNER" | "DRAW" | "VOID"; timeA?: string; timeB?: string; winnerSeat?: "A" | "B"; note: string },
) {
  return run(async (u) => {
    const timeAMs = input.timeA ? parseDuration(input.timeA) : undefined;
    const timeBMs = input.timeB ? parseDuration(input.timeB) : undefined;
    if (timeAMs === null || timeBMs === null) throw new AppError("VALIDATION", "Tempo inválido. Use m:ss.mmm");
    await resolveDispute(u, disputeId, {
      resolution: input.resolution,
      timeAMs: timeAMs ?? undefined,
      timeBMs: timeBMs ?? undefined,
      winnerSeat: input.winnerSeat,
      note: input.note,
    });
  }, ["/"]);
}
