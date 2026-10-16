import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createSession, invalidateSession, SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session";

/** Usuário da requisição atual (memoizado por requisição). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return validateSessionToken(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

/** Páginas administrativas: não revela a existência da rota para não administradores. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") notFound();
  return user;
}

function secureCookies() {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE === "true";
  return process.env.NODE_ENV === "production";
}

export async function startSession(userId: string) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(userId, ua);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  store.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
