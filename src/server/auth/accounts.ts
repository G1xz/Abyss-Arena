import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { AppError } from "../errors";
import { isEmailConfigured, sendMail } from "../mailer";
import { parseInput } from "../validation";
import { hashPassword, verifyPassword } from "./password";
import { generateToken, hashToken, invalidateUserSessions, type SessionUser } from "./session";

export const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(254);
export const nicknameSchema = z
  .string()
  .trim()
  .min(3, "O nickname precisa de ao menos 3 caracteres")
  .max(20, "O nickname pode ter no máximo 20 caracteres")
  .regex(/^[A-Za-z0-9_.-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado");
export const passwordSchema = z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(128, "Senha muito longa");
export const genshinUidSchema = z
  .string()
  .trim()
  .regex(/^\d{9,10}$/, "UID deve ter 9 ou 10 dígitos")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const registerSchema = z.object({
  email: emailSchema,
  nickname: nicknameSchema,
  password: passwordSchema,
  genshinUid: genshinUidSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha").max(128),
});

export async function registerUser(input: unknown): Promise<SessionUser> {
  const data = parseInput(registerSchema, input);
  const nicknameKey = data.nickname.toLowerCase();

  const [emailTaken, nickTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { nicknameKey }, select: { id: true } }),
  ]);
  const fieldErrors: Record<string, string[]> = {};
  if (emailTaken) fieldErrors.email = ["Este e-mail já está cadastrado"];
  if (nickTaken) fieldErrors.nickname = ["Este nickname já está em uso"];
  if (Object.keys(fieldErrors).length) throw new AppError("CONFLICT", Object.values(fieldErrors)[0]![0]!, { fieldErrors });

  try {
    return await prisma.user.create({
      data: {
        email: data.email,
        nickname: data.nickname,
        nicknameKey,
        passwordHash: await hashPassword(data.password),
        genshinUid: data.genshinUid ?? null,
      },
      select: { id: true, email: true, nickname: true, role: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("CONFLICT", "E-mail ou nickname já cadastrado");
    }
    throw err;
  }
}

// Hash fixo usado para equalizar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

export async function authenticate(input: unknown): Promise<SessionUser> {
  const data = parseInput(loginSchema, input);
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, nickname: true, role: true, passwordHash: true },
  });
  if (!user) {
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(data.password, await dummyHash);
    throw new AppError("UNAUTHENTICATED", "E-mail ou senha inválidos");
  }
  if (!(await verifyPassword(data.password, user.passwordHash))) {
    throw new AppError("UNAUTHENTICATED", "E-mail ou senha inválidos");
  }
  const { passwordHash: _omit, ...sessionUser } = user;
  return sessionUser;
}

const RESET_TTL_MS = 60 * 60 * 1000;

/** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
export async function requestPasswordReset(input: unknown, appUrl: string): Promise<void> {
  if (!isEmailConfigured()) throw new AppError("UNAVAILABLE", "Recuperação por e-mail não está configurada neste servidor.");
  const email = parseInput(emailSchema, (input as { email?: unknown })?.email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;
  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${appUrl.replace(/\/$/, "")}/reset-password/${token}`;
  await sendMail(
    user.email,
    "Abyss Arena — redefinição de senha",
    `Recebemos um pedido para redefinir sua senha.\n\nAcesse: ${link}\n\nO link expira em 1 hora. Se não foi você, ignore este e-mail.`,
  );
}

export async function resetPassword(input: unknown): Promise<void> {
  const data = parseInput(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), input);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(data.token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError("VALIDATION", "Link de redefinição inválido ou expirado");
  }
  const passwordHash = await hashPassword(data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await invalidateUserSessions(record.userId);
}

export const profileSchema = z.object({
  nickname: nicknameSchema,
  genshinUid: genshinUidSchema,
  bio: z
    .string()
    .trim()
    .max(280, "A bio pode ter no máximo 280 caracteres")
    .optional()
    .transform((v) => v || undefined),
});

export async function updateProfile(userId: string, input: unknown) {
  const data = parseInput(profileSchema, input);
  const nicknameKey = data.nickname.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { nicknameKey, NOT: { id: userId } }, select: { id: true } });
  if (clash) throw new AppError("CONFLICT", "Este nickname já está em uso", { fieldErrors: { nickname: ["Este nickname já está em uso"] } });
  return prisma.user.update({
    where: { id: userId },
    data: { nickname: data.nickname, nicknameKey, genshinUid: data.genshinUid ?? null, bio: data.bio ?? null },
    select: { id: true, nickname: true },
  });
}

export function assertAdmin(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new AppError("UNAUTHENTICATED", "Faça login para continuar");
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Acesso restrito a administradores");
}

export function assertUser(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new AppError("UNAUTHENTICATED", "Faça login para continuar");
}
