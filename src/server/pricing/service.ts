import { z } from "zod";
import { effectiveCost, parseOverrides, type ConstellationOverrides, type CostRules } from "@/domain/pricing";
import { Prisma, type PriceChangeSource } from "@/generated/prisma/client";
import { writeAuditLog } from "../audit";
import { assertAdmin } from "../auth/accounts";
import type { SessionUser } from "../auth/session";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";
import { getSettings } from "../settings";
import { parseInput } from "../validation";

export async function getActivePriceVersion(db: Tx = prisma) {
  return db.priceVersion.findFirst({ where: { status: "ACTIVE" } });
}

export async function requireActivePriceVersion(db: Tx = prisma) {
  const version = await getActivePriceVersion(db);
  if (!version) throw new AppError("UNAVAILABLE", "Nenhuma tabela de preços publicada ainda.");
  return version;
}

/** Preços de personagens disponíveis para competição (habilitados) em uma versão. */
export async function getCompetitivePriceMap(priceVersionId: string, db: Tx = prisma): Promise<Map<string, number>> {
  const prices = await db.characterPrice.findMany({
    where: { priceVersionId, character: { competitiveEnabled: true } },
    select: { characterId: true, cost: true },
  });
  return new Map(prices.map((p) => [p.characterId, p.cost]));
}

export interface UserCostMap {
  /** Custo efetivo (constelação/nível do jogador) dos personagens que ele tem e que estão liberados com preço. */
  prices: Map<string, number>;
  /** Personagens declarados na conta. */
  owned: Set<string>;
  details: Map<string, { constellation: number; level: number; baseCost: number; cost: number }>;
}

/** Custos efetivos para um jogador, a partir da conta dele (Meus personagens) e de uma versão da tabela. */
export async function getUserCostMap(userId: string, priceVersionId: string, rules: CostRules, db: Tx = prisma): Promise<UserCostMap> {
  // Sequencial: pode rodar dentro de uma transação (uma única conexão).
  const roster = await db.ownedCharacter.findMany({ where: { userId }, include: { character: { select: { rarity: true, competitiveEnabled: true } } } });
  const prices = await db.characterPrice.findMany({ where: { priceVersionId }, select: { characterId: true, cost: true, constellationOverrides: true } });
  const priceById = new Map(prices.map((p) => [p.characterId, p]));
  const result: UserCostMap = { prices: new Map(), owned: new Set(), details: new Map() };
  for (const owned of roster) {
    result.owned.add(owned.characterId);
    const price = priceById.get(owned.characterId);
    if (!price || !owned.character.competitiveEnabled) continue;
    const cost = effectiveCost(
      { baseCost: price.cost, rarity: owned.character.rarity, constellation: owned.constellation, level: owned.level, overrides: parseOverrides(price.constellationOverrides) },
      rules,
    );
    result.prices.set(owned.characterId, cost);
    result.details.set(owned.characterId, { constellation: owned.constellation, level: owned.level, baseCost: price.cost, cost });
  }
  return result;
}

/** Catálogo com custo na tabela vigente — base do construtor de decks. */
export async function getCatalogWithActivePrices(db: Tx = prisma) {
  const version = await getActivePriceVersion(db);
  const characters = await db.character.findMany({
    orderBy: [{ rarity: "desc" }, { name: "asc" }],
    include: version ? { prices: { where: { priceVersionId: version.id } } } : undefined,
  });
  return {
    version,
    characters: characters.map((c) => {
      const price = (c as typeof c & { prices?: { cost: number; isProvisional: boolean; constellationOverrides: Prisma.JsonValue }[] }).prices?.[0];
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        element: c.element,
        weaponType: c.weaponType,
        rarity: c.rarity,
        iconUrl: c.iconUrl,
        competitiveEnabled: c.competitiveEnabled,
        missingFromSource: c.missingFromSource,
        balanceLocked: c.balanceLocked,
        cost: price?.cost ?? null,
        overrides: parseOverrides(price?.constellationOverrides),
        isProvisional: price?.isProvisional ?? false,
        available: c.competitiveEnabled && price !== undefined,
      };
    }),
  };
}

export type CatalogEntry = Awaited<ReturnType<typeof getCatalogWithActivePrices>>["characters"][number];

async function lockPricing(tx: Tx) {
  // Serializa operações de escrita na tabela de preços.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('abyss-pricing'))`;
}

/** Rascunho da próxima tabela; criado clonando a vigente. */
export async function ensureDraft(tx: Tx, adminId: string | null) {
  const draft = await tx.priceVersion.findFirst({ where: { status: "DRAFT" }, include: { prices: true } });
  if (draft) return draft;
  const scheduled = await tx.priceVersion.findFirst({ where: { status: "SCHEDULED" } });
  if (scheduled) {
    throw new AppError("INVALID_STATE", "Há uma tabela agendada para publicação. Cancele o agendamento para editar preços.");
  }
  const active = await tx.priceVersion.findFirst({ where: { status: "ACTIVE" }, include: { prices: true } });
  const created = await tx.priceVersion.create({
    data: {
      status: "DRAFT",
      basedOnId: active?.id ?? null,
      createdById: adminId,
      prices: active
        ? {
            create: active.prices.map((p) => ({
              characterId: p.characterId,
              cost: p.cost,
              constellationOverrides: (p.constellationOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
              isProvisional: p.isProvisional,
            })),
          }
        : undefined,
    },
    include: { prices: true },
  });
  return created;
}

const overrideValue = z.coerce.number().int("Ajustes devem ser inteiros").nonnegative("Ajustes não podem ser negativos").max(10_000);
export const setPriceSchema = z.object({
  characterId: z.string().min(1).max(64),
  cost: z.coerce.number().int("O preço deve ser inteiro"),
  /** Ajustes absolutos por constelação (C1..C6). Ausente = mantém os atuais; objeto vazio = remove todos. */
  overrides: z.partialRecord(z.enum(["1", "2", "3", "4", "5", "6"]), overrideValue).optional(),
  justification: z.string().trim().min(3, "Informe uma justificativa").max(500),
});

/**
 * Define o preço de um personagem no rascunho. Uma alteração por personagem por versão;
 * o preço anterior registrado é o da tabela vigente (base do rascunho).
 */
export async function setDraftPriceTx(
  tx: Tx,
  admin: SessionUser,
  input: { characterId: string; cost: number; justification: string; overrides?: ConstellationOverrides },
  source: PriceChangeSource,
  proposalId: string | null = null,
) {
  const settings = await getSettings("competitive", tx);
  if (input.cost < settings.minCharacterCost || input.cost > settings.maxCharacterCost) {
    throw new AppError(
      "VALIDATION",
      `O preço deve ficar entre ${settings.minCharacterCost} e ${settings.maxCharacterCost} pontos.`,
    );
  }
  const character = await tx.character.findUnique({ where: { id: input.characterId } });
  if (!character) throw new AppError("NOT_FOUND", "Personagem não encontrado");

  await lockPricing(tx);
  const draft = await ensureDraft(tx, admin.id);
  const basePrice = draft.basedOnId
    ? await tx.characterPrice.findUnique({ where: { priceVersionId_characterId: { priceVersionId: draft.basedOnId, characterId: input.characterId } } })
    : null;
  const draftPrice = draft.prices.find((p) => p.characterId === input.characterId);
  const before = draftPrice?.cost ?? null;
  const overrides = input.overrides ?? parseOverrides(draftPrice?.constellationOverrides);
  const overridesJson = (Object.keys(overrides).length ? overrides : undefined) as Prisma.InputJsonValue | undefined;

  await tx.characterPrice.upsert({
    where: { priceVersionId_characterId: { priceVersionId: draft.id, characterId: input.characterId } },
    create: { priceVersionId: draft.id, characterId: input.characterId, cost: input.cost, constellationOverrides: overridesJson, isProvisional: false },
    update: { cost: input.cost, constellationOverrides: overridesJson ?? Prisma.DbNull, isProvisional: false },
  });

  // Se havia uma proposta vinculada a uma alteração anterior deste personagem, ela é substituída.
  const change = await tx.priceChange.upsert({
    where: { priceVersionId_characterId: { priceVersionId: draft.id, characterId: input.characterId } },
    create: {
      priceVersionId: draft.id,
      characterId: input.characterId,
      previousCost: basePrice?.cost ?? null,
      newCost: input.cost,
      previousOverrides: (basePrice?.constellationOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
      newOverrides: overridesJson,
      source,
      justification: input.justification,
      adminId: admin.id,
      proposalId,
    },
    update: {
      newCost: input.cost,
      newOverrides: overridesJson ?? Prisma.DbNull,
      source,
      justification: input.justification,
      adminId: admin.id,
      proposalId,
      approvedAt: new Date(),
    },
  });

  await writeAuditLog(tx, {
    adminId: admin.id,
    action: source === "SUGGESTED" ? "PRICE_SUGGESTION_APPROVED" : "PRICE_SET_MANUAL",
    entityType: "Character",
    entityId: input.characterId,
    reason: input.justification,
    before: { cost: before, overrides: draftPrice?.constellationOverrides ?? null, draftVersionId: draft.id },
    after: { cost: input.cost, overrides: overridesJson ?? null, draftVersionId: draft.id, proposalId },
  });
  return { draftId: draft.id, change };
}

export async function setDraftPrice(admin: SessionUser, input: unknown, db: Db = prisma) {
  assertAdmin(admin);
  const data = parseInput(setPriceSchema, input);
  return db.$transaction((tx) => setDraftPriceTx(tx, admin, data, "MANUAL"));
}

/** Desfaz a alteração de um personagem no rascunho, voltando ao preço da base. */
export async function revertDraftPrice(admin: SessionUser, characterId: string, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    await lockPricing(tx);
    const draft = await tx.priceVersion.findFirst({ where: { status: "DRAFT" } });
    if (!draft) throw new AppError("NOT_FOUND", "Não há rascunho de preços");
    const change = await tx.priceChange.findUnique({ where: { priceVersionId_characterId: { priceVersionId: draft.id, characterId } } });
    if (!change) return;
    const base = draft.basedOnId
      ? await tx.characterPrice.findUnique({ where: { priceVersionId_characterId: { priceVersionId: draft.basedOnId, characterId } } })
      : null;
    if (base) {
      await tx.characterPrice.update({
        where: { priceVersionId_characterId: { priceVersionId: draft.id, characterId } },
        data: { cost: base.cost, constellationOverrides: (base.constellationOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue, isProvisional: base.isProvisional },
      });
    } else {
      await tx.characterPrice.deleteMany({ where: { priceVersionId: draft.id, characterId } });
    }
    await tx.priceChange.delete({ where: { id: change.id } });
    if (change.proposalId) {
      await tx.balanceProposal.update({
        where: { id: change.proposalId },
        data: { status: "PENDING", approvedCost: null, reviewedAt: null, reviewedById: null, reviewNote: null },
      });
    }
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: "PRICE_CHANGE_REVERTED",
      entityType: "Character",
      entityId: characterId,
      before: { cost: change.newCost },
      after: { cost: base?.cost ?? null },
    });
  });
}

async function publishVersionTx(tx: Tx, versionId: string, publisherId: string | null, now: Date) {
  await lockPricing(tx);
  const version = await tx.priceVersion.findUnique({ where: { id: versionId }, include: { prices: true } });
  if (!version || (version.status !== "DRAFT" && version.status !== "SCHEDULED")) {
    throw new AppError("INVALID_STATE", "Esta versão não pode ser publicada.");
  }
  const settings = await getSettings("competitive", tx);
  const outOfRange = version.prices.filter((p) => p.cost < settings.minCharacterCost || p.cost > settings.maxCharacterCost);
  if (outOfRange.length) {
    throw new AppError("VALIDATION", `${outOfRange.length} preço(s) fora do intervalo permitido. Ajuste antes de publicar.`);
  }
  const last = await tx.priceVersion.aggregate({ _max: { number: true } });
  const number = (last._max.number ?? 0) + 1;
  const previous = await tx.priceVersion.findFirst({ where: { status: "ACTIVE" } });
  if (previous) await tx.priceVersion.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } });
  const published = await tx.priceVersion.update({
    where: { id: version.id },
    data: { status: "ACTIVE", number, publishedAt: now, publishedById: publisherId, scheduledFor: null },
  });
  await tx.priceChange.updateMany({ where: { priceVersionId: version.id }, data: { effectiveAt: now } });
  await writeAuditLog(tx, {
    adminId: publisherId,
    action: "PRICE_VERSION_PUBLISHED",
    entityType: "PriceVersion",
    entityId: version.id,
    before: { activeVersionId: previous?.id ?? null, activeNumber: previous?.number ?? null },
    after: { number, publishedAt: now.toISOString() },
  });
  return published;
}

export const publishSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  label: z.string().trim().max(80).optional(),
  scheduledFor: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const date = new Date(v);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: "custom", message: "Data de agendamento inválida" });
        return z.NEVER;
      }
      return date;
    }),
});

/** Publica o rascunho agora ou agenda a publicação. Exige ação de um administrador. */
export async function publishDraft(admin: SessionUser, input: unknown, db: Db = prisma, now = new Date()) {
  assertAdmin(admin);
  const data = parseInput(publishSchema, input);
  return db.$transaction(async (tx) => {
    const draft = await tx.priceVersion.findFirst({ where: { status: "DRAFT" } });
    if (!draft) throw new AppError("NOT_FOUND", "Não há rascunho de preços para publicar");
    await tx.priceVersion.update({
      where: { id: draft.id },
      data: { notes: data.notes ?? draft.notes, label: data.label ?? draft.label },
    });
    if (data.scheduledFor && data.scheduledFor.getTime() > now.getTime()) {
      await lockPricing(tx);
      const scheduled = await tx.priceVersion.update({
        where: { id: draft.id },
        data: { status: "SCHEDULED", scheduledFor: data.scheduledFor },
      });
      await writeAuditLog(tx, {
        adminId: admin.id,
        action: "PRICE_VERSION_SCHEDULED",
        entityType: "PriceVersion",
        entityId: draft.id,
        after: { scheduledFor: data.scheduledFor.toISOString() },
      });
      return scheduled;
    }
    return publishVersionTx(tx, draft.id, admin.id, now);
  });
}

export async function cancelScheduledVersion(admin: SessionUser, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    await lockPricing(tx);
    const scheduled = await tx.priceVersion.findFirst({ where: { status: "SCHEDULED" } });
    if (!scheduled) throw new AppError("NOT_FOUND", "Não há publicação agendada");
    const existingDraft = await tx.priceVersion.findFirst({ where: { status: "DRAFT" } });
    if (existingDraft) throw new AppError("CONFLICT", "Já existe um rascunho em edição");
    await tx.priceVersion.update({ where: { id: scheduled.id }, data: { status: "DRAFT", scheduledFor: null } });
    await writeAuditLog(tx, { adminId: admin.id, action: "PRICE_VERSION_UNSCHEDULED", entityType: "PriceVersion", entityId: scheduled.id });
  });
}

/** Descarta o rascunho atual (alterações não publicadas). Propostas aprovadas voltam a pendentes. */
export async function discardDraft(admin: SessionUser, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    await lockPricing(tx);
    const draft = await tx.priceVersion.findFirst({ where: { status: "DRAFT" }, include: { changes: true } });
    if (!draft) return;
    const proposalIds = draft.changes.map((c) => c.proposalId).filter((id): id is string => Boolean(id));
    if (proposalIds.length) {
      await tx.balanceProposal.updateMany({
        where: { id: { in: proposalIds } },
        data: { status: "PENDING", approvedCost: null, reviewedAt: null, reviewedById: null, reviewNote: null },
      });
    }
    await tx.priceVersion.delete({ where: { id: draft.id } });
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: "PRICE_DRAFT_DISCARDED",
      entityType: "PriceVersion",
      entityId: draft.id,
      before: { changes: draft.changes.length },
    });
  });
}

/** Job: publica versões agendadas cuja data chegou. */
export async function publishDueScheduledVersions(db: Db = prisma, now = new Date()) {
  const due = await db.priceVersion.findFirst({ where: { status: "SCHEDULED", scheduledFor: { lte: now } } });
  if (!due) return null;
  return db.$transaction((tx) => publishVersionTx(tx, due.id, due.createdById, now));
}

/** Preço de uma tabela completa publicada pelo seed. Sem `provisional`, o preço é marcado como provisório. */
export interface TablePrice {
  characterId: string;
  cost: number;
  overrides?: ConstellationOverrides;
  provisional?: boolean;
  justification?: string;
}

const PROVISIONAL_NOTES = "Preços provisórios por raridade. Não representam balanceamento competitivo validado.";

function tablePriceRows(prices: TablePrice[]) {
  return prices.map((p) => ({
    characterId: p.characterId,
    cost: p.cost,
    constellationOverrides: p.overrides && Object.keys(p.overrides).length ? (p.overrides as Prisma.InputJsonValue) : undefined,
    isProvisional: p.provisional ?? true,
  }));
}

/** Cria e publica a primeira tabela (seed). Ignorado se já houver tabela vigente. */
export async function publishInitialPriceVersion(
  prices: TablePrice[],
  options: { adminId: string | null; label?: string; notes?: string; db?: Db; now?: Date },
) {
  const db = options.db ?? prisma;
  return db.$transaction(async (tx) => {
    await lockPricing(tx);
    if (await tx.priceVersion.findFirst({ where: { status: "ACTIVE" } })) return null;
    await tx.priceVersion.deleteMany({ where: { status: { in: ["DRAFT", "SCHEDULED"] } } });
    const version = await tx.priceVersion.create({
      data: {
        status: "DRAFT",
        label: options.label ?? "Tabela inicial (provisória)",
        notes: options.notes ?? PROVISIONAL_NOTES,
        createdById: options.adminId,
        prices: { create: tablePriceRows(prices) },
        changes: {
          create: prices.map((p) => ({
            characterId: p.characterId,
            previousCost: null,
            newCost: p.cost,
            newOverrides: p.overrides && Object.keys(p.overrides).length ? (p.overrides as Prisma.InputJsonValue) : undefined,
            source: "INITIAL" as const,
            justification: p.justification ?? "Preço inicial provisório",
            adminId: options.adminId,
          })),
        },
      },
    });
    return publishVersionTx(tx, version.id, options.adminId, options.now ?? new Date());
  });
}

/**
 * Publica uma nova tabela completa enquanto a vigente ainda é toda provisória (ex.: mudança de escala do
 * orçamento ou tabela inicial importada), preservando as versões anteriores no histórico.
 * Usada pelo seed; exige que não haja rascunho/agendamento aberto.
 */
export async function publishProvisionalTable(
  prices: TablePrice[],
  options: { adminId: string | null; label: string; justification: string; notes?: string; db?: Db; now?: Date },
) {
  const db = options.db ?? prisma;
  return db.$transaction(async (tx) => {
    await lockPricing(tx);
    // Rascunho vazio (sem alterações) pode ser descartado; com alterações, a decisão é do admin.
    await tx.priceVersion.deleteMany({ where: { status: "DRAFT", changes: { none: {} } } });
    if (await tx.priceVersion.findFirst({ where: { status: { in: ["DRAFT", "SCHEDULED"] } } })) {
      throw new AppError("CONFLICT", "Há um rascunho ou agendamento aberto; publique ou descarte antes.");
    }
    const active = await tx.priceVersion.findFirst({ where: { status: "ACTIVE" }, include: { prices: true } });
    const previous = new Map(active?.prices.map((p) => [p.characterId, p.cost]) ?? []);
    const version = await tx.priceVersion.create({
      data: {
        status: "DRAFT",
        label: options.label,
        notes: options.notes ?? PROVISIONAL_NOTES,
        basedOnId: active?.id ?? null,
        createdById: options.adminId,
        prices: { create: tablePriceRows(prices) },
        changes: {
          create: prices.map((p) => ({
            characterId: p.characterId,
            previousCost: previous.get(p.characterId) ?? null,
            newCost: p.cost,
            newOverrides: p.overrides && Object.keys(p.overrides).length ? (p.overrides as Prisma.InputJsonValue) : undefined,
            source: "INITIAL" as const,
            justification: p.justification ?? options.justification,
            adminId: options.adminId,
          })),
        },
      },
    });
    return publishVersionTx(tx, version.id, options.adminId, options.now ?? new Date());
  });
}

export async function setCharacterCompetitive(admin: SessionUser, characterId: string, enabled: boolean, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    const character = await tx.character.findUnique({ where: { id: characterId } });
    if (!character) throw new AppError("NOT_FOUND", "Personagem não encontrado");
    if (enabled) {
      const active = await tx.priceVersion.findFirst({ where: { status: "ACTIVE" } });
      const price = active
        ? await tx.characterPrice.findUnique({ where: { priceVersionId_characterId: { priceVersionId: active.id, characterId } } })
        : null;
      if (!price) throw new AppError("INVALID_STATE", "Defina e publique um preço antes de liberar o personagem para competição.");
    }
    await tx.character.update({ where: { id: characterId }, data: { competitiveEnabled: enabled } });
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: enabled ? "CHARACTER_ENABLED" : "CHARACTER_DISABLED",
      entityType: "Character",
      entityId: characterId,
      before: { competitiveEnabled: character.competitiveEnabled },
      after: { competitiveEnabled: enabled },
    });
  });
}

export async function setCharacterBalanceLock(admin: SessionUser, characterId: string, locked: boolean, reason: string | null, db: Db = prisma) {
  assertAdmin(admin);
  return db.$transaction(async (tx) => {
    const character = await tx.character.findUnique({ where: { id: characterId } });
    if (!character) throw new AppError("NOT_FOUND", "Personagem não encontrado");
    await tx.character.update({
      where: { id: characterId },
      data: { balanceLocked: locked, balanceLockReason: locked ? reason : null },
    });
    if (locked) {
      await tx.balanceProposal.updateMany({ where: { characterId, status: "PENDING" }, data: { status: "SUPERSEDED", reviewNote: "Personagem bloqueado para sugestões" } });
    }
    await writeAuditLog(tx, {
      adminId: admin.id,
      action: locked ? "BALANCE_LOCKED" : "BALANCE_UNLOCKED",
      entityType: "Character",
      entityId: characterId,
      reason,
    });
  });
}

/** Histórico público de preços por versão publicada. */
export async function getPriceHistory(db: Tx = prisma) {
  const versions = await db.priceVersion.findMany({
    where: { status: { in: ["ACTIVE", "ARCHIVED"] } },
    orderBy: { number: "asc" },
    include: { prices: { select: { characterId: true, cost: true } } },
  });
  return versions.map((v) => ({
    id: v.id,
    number: v.number!,
    label: v.label,
    publishedAt: v.publishedAt!,
    status: v.status,
    costs: new Map(v.prices.map((p) => [p.characterId, p.cost])),
  }));
}
