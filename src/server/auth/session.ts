import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "../db";

export const SESSION_COOKIE = "aa_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  nickname: string;
  role: Role;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  return { token, expiresAt };
}

/** Valida o token do cookie. Renova a expiração (sliding) no máximo uma vez por dia. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, nickname: true, role: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastUsedAt.getTime() > REFRESH_AFTER_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } })
      .catch(() => {});
  }
  return session.user;
}

export async function invalidateSession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function invalidateUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}
