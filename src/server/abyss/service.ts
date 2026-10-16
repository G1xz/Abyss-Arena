import { z } from "zod";
import type { ChamberHalf } from "@/generated/prisma/client";
import { writeAuditLog } from "../audit";
import { assertAdmin } from "../auth/accounts";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { parseInput } from "../validation";

export interface AbyssRulesSnapshot {
  cycleId: string;
  cycleName: string;
  rules: string;
  startsAt: string;
  endsAt: string;
  challenges: {
    floor: number;
    chamber: number;
    half: ChamberHalf;
    enemyLevel?: number | null;
    target?: string | null;
    leyLineDisorder?: string | null;
    enemies?: { name: string; nameEn: string; count: number | null; wave: number; image: string | null }[] | null;
  }[];
}

/** Ciclo vigente: ativo e dentro do intervalo de datas. */
export async function getCurrentCycle(db: Tx = prisma, now = new Date()) {
  return db.abyssCycle.findFirst({
    where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "desc" },
    include: { challenges: { orderBy: [{ floor: "asc" }, { chamber: "asc" }, { half: "asc" }] } },
  });
}

export function toRulesSnapshot(cycle: NonNullable<Awaited<ReturnType<typeof getCurrentCycle>>>): AbyssRulesSnapshot {
  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    rules: cycle.rules,
    startsAt: cycle.startsAt.toISOString(),
    endsAt: cycle.endsAt.toISOString(),
    challenges: cycle.challenges
      .filter((c) => c.enabled)
      .map((c) => ({
        floor: c.floor,
        chamber: c.chamber,
        half: c.half,
        enemyLevel: c.enemyLevel,
        target: c.target,
        leyLineDisorder: c.leyLineDisorder,
        enemies: (c.enemies as AbyssRulesSnapshot["challenges"][number]["enemies"]) ?? null,
      })),
  };
}

/** Texto padrão anterior (formato de 4 picks); ciclos que ainda o usam sem alteração são atualizados pelo seed. */
export const LEGACY_DEFAULT_RULES = [
  "Speedrun das câmaras selecionadas do Abismo Espiral, usando apenas os 4 personagens escolhidos no draft.",
  "Some o tempo de todas as metades válidas (tempo do cronômetro do jogo). Menor tempo total vence.",
  "Cada metade deve ser concluída com 3 estrelas; caso contrário, o resultado é inválido.",
  "Evidências (vídeo ou capturas) são opcionais, mas podem ser exigidas em caso de contestação.",
].join("\n");

export const DEFAULT_RULES = [
  "Speedrun das câmaras selecionadas do Abismo Espiral, usando apenas os personagens escolhidos no draft: um time de 4 em cada metade (8 no total).",
  "Some o tempo de todas as metades válidas (tempo do cronômetro do jogo). Menor tempo total vence.",
  "Cada metade deve ser concluída com 3 estrelas; caso contrário, o resultado é inválido.",
  "Evidências (vídeo ou capturas) são opcionais, mas podem ser exigidas em caso de contestação.",
].join("\n");

const dateSchema = z.coerce.date({ error: "Data inválida" });

export const cycleInputSchema = z
  .object({
    name: z.string().trim().min(3, "Nome muito curto").max(80),
    startsAt: dateSchema,
    endsAt: dateSchema,
    rules: z.string().trim().min(10, "Descreva as regras competitivas").max(4000),
    floor: z.coerce.number().int().min(1).max(12).default(12),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "O encerramento deve ser após o início", path: ["endsAt"] });

export async function listCycles(db: Tx = prisma) {
  return db.abyssCycle.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      challenges: { orderBy: [{ floor: "asc" }, { chamber: "asc" }, { half: "asc" }] },
      _count: { select: { matches: true } },
    },
  });
}

export async function createCycle(admin: SessionUser, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(cycleInputSchema, input);
  return db.$transaction(async (tx) => {
    const cycle = await tx.abyssCycle.create({
      data: {
        name: data.name,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        rules: data.rules,
        challenges: {
          create: [1, 2, 3].flatMap((chamber) =>
            (["FIRST", "SECOND"] as const).map((half) => ({ floor: data.floor, chamber, half, enabled: true })),
          ),
        },
      },
    });
    await writeAuditLog(tx, { adminId: admin.id, action: "ABYSS_CYCLE_CREATED", entityType: "AbyssCycle", entityId: cycle.id, after: data });
    return cycle;
  });
}

export async function updateCycle(admin: SessionUser, cycleId: string, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(cycleInputSchema.and(z.object({ status: z.enum(["ACTIVE", "ENDED"]) })), input);
  return db.$transaction(async (tx) => {
    const before = await tx.abyssCycle.findUnique({ where: { id: cycleId } });
    if (!before) throw new AppError("NOT_FOUND", "Ciclo não encontrado");
    const cycle = await tx.abyssCycle.update({
      where: { id: cycleId },
      data: { name: data.name, startsAt: data.startsAt, endsAt: data.endsAt, rules: data.rules, status: data.status },
    });
    await writeAuditLog(tx, { adminId: admin.id, action: "ABYSS_CYCLE_UPDATED", entityType: "AbyssCycle", entityId: cycleId, before, after: data });
    return cycle;
  });
}

export const challengeInputSchema = z.object({
  floor: z.coerce.number().int().min(1).max(12),
  chamber: z.coerce.number().int().min(1).max(3),
  half: z.enum(["FIRST", "SECOND"]),
});

export async function addChallenge(admin: SessionUser, cycleId: string, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(challengeInputSchema, input);
  return db.$transaction(async (tx) => {
    const challenge = await tx.abyssChallenge.upsert({
      where: { cycleId_floor_chamber_half: { cycleId, ...data } },
      create: { cycleId, ...data, enabled: true },
      update: { enabled: true },
    });
    await writeAuditLog(tx, { adminId: admin.id, action: "ABYSS_CHALLENGE_ADDED", entityType: "AbyssCycle", entityId: cycleId, after: data });
    return challenge;
  });
}

/** Define quais salas são válidas para o formato. Partidas já criadas mantêm suas regras congeladas. */
export async function setChallengeEnabled(admin: SessionUser, challengeId: string, enabled: boolean, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    const challenge = await tx.abyssChallenge.update({ where: { id: challengeId }, data: { enabled } });
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: enabled ? "ABYSS_CHALLENGE_ENABLED" : "ABYSS_CHALLENGE_DISABLED",
      entityType: "AbyssCycle",
      entityId: challenge.cycleId,
      after: { challengeId, enabled },
    });
    return challenge;
  });
}

export function halfLabel(half: ChamberHalf) {
  return half === "FIRST" ? "1ª metade" : "2ª metade";
}
