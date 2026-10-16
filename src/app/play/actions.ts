"use server";

import { requireUser } from "@/server/auth/next";
import { toErrorResult, type ActionResult } from "@/server/errors";
import { cancelInvite, challengePlayer, inviteToRoom, listInvites, respondInvite, searchPlayers, type InviteView } from "@/server/invites/service";
import { enforceRateLimit } from "@/server/rate-limit";

export async function challengeAction(input: { opponentId: string; deckId?: string }): Promise<ActionResult<{ code: string }>> {
  const user = await requireUser("/play");
  try {
    const { match } = await challengePlayer(user, input);
    return { ok: true, data: { code: match.code } };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function inviteToRoomAction(matchId: string, opponentId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await inviteToRoom(user, matchId, { opponentId });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function cancelInviteAction(inviteId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await cancelInvite(user, inviteId);
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function respondInviteAction(inviteId: string, accept: boolean): Promise<ActionResult<{ code: string }>> {
  const user = await requireUser();
  try {
    const invite = await respondInvite(user, inviteId, accept);
    return { ok: true, data: { code: invite.code } };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function listInvitesAction(): Promise<{ received: InviteView[]; sent: InviteView[] }> {
  const user = await requireUser();
  return listInvites(user.id);
}

export async function searchPlayersAction(query: string): Promise<{ id: string; nickname: string }[]> {
  const user = await requireUser();
  try {
    enforceRateLimit("matchAction", user.id);
    return await searchPlayers(user, String(query ?? ""));
  } catch {
    return [];
  }
}
