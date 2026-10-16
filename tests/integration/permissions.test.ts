import { beforeEach, describe, expect, it } from "vitest";
import { addChallenge, createCycle, setChallengeEnabled, updateCycle } from "@/server/abyss/service";
import { approveProposal, rejectProposal, runBalanceAnalysis } from "@/server/balance/service";
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
import { prisma } from "@/server/db";
import { createUser, resetDb, seedWorld } from "../support/factories";

describe("permissões administrativas", () => {
  let world: Awaited<ReturnType<typeof seedWorld>>;
  beforeEach(async () => {
    await resetDb();
    world = await seedWorld();
  });

  it("todas as operações administrativas exigem papel ADMIN", async () => {
    const user = await createUser();
    const charId = world.characters[0]!.id;
    const calls: [string, () => Promise<unknown>][] = [
      ["setDraftPrice", () => setDraftPrice(user, { characterId: charId, cost: 12, justification: "hack" })],
      ["revertDraftPrice", () => revertDraftPrice(user, charId)],
      ["publishDraft", () => publishDraft(user, {})],
      ["cancelScheduledVersion", () => cancelScheduledVersion(user)],
      ["discardDraft", () => discardDraft(user)],
      ["setCharacterCompetitive", () => setCharacterCompetitive(user, charId, false)],
      ["setCharacterBalanceLock", () => setCharacterBalanceLock(user, charId, true, null)],
      ["approveProposal", () => approveProposal(user, "x", { note: "abc" })],
      ["rejectProposal", () => rejectProposal(user, "x", { note: "abc" })],
      ["runBalanceAnalysis", () => runBalanceAnalysis({ kind: "MANUAL", generateProposals: true, actor: user })],
      ["resolveDispute", () => resolveDispute(user, "x", { resolution: "DRAW", note: "abcdef" })],
      ["createCycle", () => createCycle(user, { name: "X", startsAt: new Date(), endsAt: new Date(Date.now() + 1000), rules: "regras de teste" })],
      ["updateCycle", () => updateCycle(user, world.cycle.id, {})],
      ["setChallengeEnabled", () => setChallengeEnabled(user, "x", false)],
      ["addChallenge", () => addChallenge(user, world.cycle.id, { floor: 12, chamber: 1, half: "SECOND" })],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // Nada foi alterado.
    expect(await prisma.priceVersion.count()).toBe(1);
    expect(await prisma.adminAuditLog.count({ where: { adminId: user.id } })).toBe(0);
  });

  it("operações administrativas sem sessão exigem login", async () => {
    await expect(publishDraft(null as never, {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("administrador consegue executar e cada ação gera auditoria", async () => {
    await setDraftPrice(world.admin, { characterId: world.characters[0]!.id, cost: 12, justification: "Ajuste auditado" });
    await publishDraft(world.admin, {});
    const actions = (await prisma.adminAuditLog.findMany({ where: { adminId: world.admin.id } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["PRICE_SET_MANUAL", "PRICE_VERSION_PUBLISHED"]));
  });
});
