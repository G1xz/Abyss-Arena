import { z } from "zod";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { createRoom, joinMatchTx } from "../matches/service";
import { getOnlineUserIds, notifyMatchChanged, notifyUser } from "../realtime/notify";
import { idSchema, parseInput } from "../validation";

/** Convites expiram se não forem respondidos neste prazo. */
export const INVITE_TTL_MS = 10 * 60 * 1000;

export interface InviteView {
  id: string;
  matchId: string;
  code: string;
  status: string;
  from: { id: string; nickname: string };
  to: { id: string; nickname: string };
  createdAt: string;
  expiresAt: string;
}

const inviteInclude = {
  match: { select: { code: true } },
  fromUser: { select: { id: true, nickname: true } },
  toUser: { select: { id: true, nickname: true } },
} as const;

type InviteRow = Awaited<ReturnType<typeof loadInvite>>;

async function loadInvite(db: Tx, id: string) {
  return db.matchInvite.findUniqueOrThrow({ where: { id }, include: inviteInclude });
}

function toView(i: NonNullable<InviteRow>): InviteView {
  return {
    id: i.id,
    matchId: i.matchId,
    code: i.match.code,
    status: i.status,
    from: i.fromUser,
    to: i.toUser,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
  };
}

async function findOpponent(db: Tx, user: SessionUser, opponentId: string) {
  if (opponentId === user.id) throw new AppError("VALIDATION", "Você não pode desafiar a si mesmo");
  const opponent = await db.user.findUnique({ where: { id: opponentId }, select: { id: true, nickname: true } });
  if (!opponent) throw new AppError("NOT_FOUND", "Jogador não encontrado");
  return opponent;
}

async function createInviteTx(tx: Tx, matchId: string, fromUserId: string, toUserId: string) {
  // Convites pendentes expirados não bloqueiam um novo convite.
  await tx.matchInvite.updateMany({ where: { matchId, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
  const pending = await tx.matchInvite.findFirst({ where: { matchId, status: "PENDING" } });
  if (pending) throw new AppError("CONFLICT", "Já existe um convite pendente nesta sala. Cancele-o para convidar outra pessoa.");
  const invite = await tx.matchInvite.create({
    data: { matchId, fromUserId, toUserId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    include: inviteInclude,
  });
  return toView(invite);
}

export const challengeSchema = z.object({
  opponentId: idSchema,
  deckId: idSchema.optional().or(z.literal("").transform(() => undefined)),
});

/** Cria a sala e convida o oponente diretamente pela conta. */
export async function challengePlayer(user: SessionUser, input: unknown, db: Db = prisma) {
  const data = parseInput(challengeSchema, input);
  await findOpponent(db, user, data.opponentId);
  const match = await createRoom(user, { deckId: data.deckId }, db);
  const invite = await db.$transaction((tx) => createInviteTx(tx, match.id, user.id, data.opponentId));
  notifyUser(data.opponentId, "invite:new", invite);
  notifyMatchChanged(match.id);
  return { match, invite };
}

/** Convida alguém para a vaga livre de uma sala existente (ex.: depois de uma recusa). */
export async function inviteToRoom(user: SessionUser, matchId: string, input: unknown, db: Db = prisma) {
  const { opponentId } = parseInput(z.object({ opponentId: idSchema }), input);
  await findOpponent(db, user, opponentId);
  const invite = await db.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { players: true } });
    if (!match) throw new AppError("NOT_FOUND", "Sala não encontrada");
    if (match.hostId !== user.id) throw new AppError("FORBIDDEN", "Apenas o anfitrião convida jogadores");
    if (match.status !== "WAITING" || match.players.length >= 2) throw new AppError("INVALID_STATE", "A sala não tem vaga para convite");
    return createInviteTx(tx, matchId, user.id, opponentId);
  });
  notifyUser(opponentId, "invite:new", invite);
  notifyMatchChanged(matchId);
  return invite;
}

export async function cancelInvite(user: SessionUser, inviteId: string, db: Db = prisma) {
  const invite = await db.matchInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.fromUserId !== user.id) throw new AppError("NOT_FOUND", "Convite não encontrado");
  const updated = await db.matchInvite.updateMany({ where: { id: inviteId, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
  if (updated.count) {
    notifyUser(invite.toUserId, "invite:updated", { id: inviteId, status: "CANCELLED" });
    notifyMatchChanged(invite.matchId);
  }
}

/** Aceitar ocupa a vaga B da sala na mesma transação; recusar apenas registra a resposta. */
export async function respondInvite(user: SessionUser, inviteId: string, accept: boolean, db: Db = prisma) {
  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "MatchInvite" WHERE id = ${inviteId} FOR UPDATE`;
    if (!rows.length) throw new AppError("NOT_FOUND", "Convite não encontrado");
    const invite = await loadInvite(tx, inviteId);
    if (invite.toUserId !== user.id) throw new AppError("NOT_FOUND", "Convite não encontrado");
    if (invite.status !== "PENDING") throw new AppError("INVALID_STATE", "Este convite não está mais disponível");
    if (invite.expiresAt.getTime() <= Date.now()) {
      // Grava a expiração (o erro é lançado depois do commit, senão o rollback a desfaria).
      const expired = await tx.matchInvite.update({ where: { id: inviteId }, data: { status: "EXPIRED" }, include: inviteInclude });
      return { ...toView(expired), expired: true };
    }
    if (accept) await joinMatchTx(tx, user, invite.matchId);
    const updated = await tx.matchInvite.update({
      where: { id: inviteId },
      data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
      include: inviteInclude,
    });
    return { ...toView(updated), expired: false };
  });
  if (result.expired) {
    notifyMatchChanged(result.matchId);
    throw new AppError("INVALID_STATE", "Este convite expirou");
  }
  notifyUser(result.from.id, "invite:updated", result);
  notifyMatchChanged(result.matchId);
  return result;
}

export async function listInvites(userId: string, db: Tx = prisma) {
  const now = new Date();
  const [received, sent] = await Promise.all([
    db.matchInvite.findMany({ where: { toUserId: userId, status: "PENDING", expiresAt: { gt: now } }, include: inviteInclude, orderBy: { createdAt: "desc" } }),
    db.matchInvite.findMany({ where: { fromUserId: userId, status: "PENDING", expiresAt: { gt: now } }, include: inviteInclude, orderBy: { createdAt: "desc" } }),
  ]);
  return { received: received.map(toView), sent: sent.map(toView) };
}

/** Jogadores para desafiar: busca por nickname, quem está online e oponentes recentes. */
export async function searchPlayers(user: SessionUser, query: string, db: Tx = prisma) {
  const q = query.trim().toLowerCase().slice(0, 20);
  if (q.length < 2) return [];
  return db.user.findMany({
    where: { nicknameKey: { contains: q }, NOT: { id: user.id } },
    select: { id: true, nickname: true },
    orderBy: { nicknameKey: "asc" },
    take: 8,
  });
}

export async function getPlayableContacts(user: SessionUser, db: Tx = prisma) {
  const onlineIds = getOnlineUserIds().filter((id) => id !== user.id);
  const [online, recentSeats] = await Promise.all([
    db.user.findMany({ where: { id: { in: onlineIds } }, select: { id: true, nickname: true }, orderBy: { nicknameKey: "asc" }, take: 30 }),
    db.matchPlayer.findMany({
      where: { match: { players: { some: { userId: user.id } } }, NOT: { userId: user.id } },
      orderBy: { joinedAt: "desc" },
      take: 30,
      select: { user: { select: { id: true, nickname: true } } },
    }),
  ]);
  const recent = new Map<string, { id: string; nickname: string }>();
  for (const s of recentSeats) if (!recent.has(s.user.id)) recent.set(s.user.id, s.user);
  return { online, recent: [...recent.values()].slice(0, 10), onlineIds: new Set(onlineIds) };
}
