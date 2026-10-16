import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { buildSequence, DRAFT_PRESETS, validateDraftConfig, type DraftConfig } from "@/domain/draft";
import { prisma, type Tx } from "./db";

const draftStepSchema = z.object({ type: z.enum(["BAN", "PICK"]), actor: z.enum(["A", "B"]) });

export const competitiveSettingsSchema = z
  .object({
    deckBudget: z.number().int().min(10).max(1000),
    minCharacterCost: z.number().int().min(1).max(100),
    maxCharacterCost: z.number().int().min(1).max(200),
    draftPreset: z.enum(Object.keys(DRAFT_PRESETS) as [keyof typeof DRAFT_PRESETS, ...(keyof typeof DRAFT_PRESETS)[]]).or(z.literal("CUSTOM")),
    draft: z.object({
      bansPerPlayer: z.number().int().min(0).max(10),
      picksPerPlayer: z.number().int().min(1).max(8),
      sequence: z.array(draftStepSchema).min(1).max(40),
      turnTimeoutSeconds: z.number().int().positive().nullable().optional(),
    }),
    tiePolicy: z.enum(["DRAW", "FIRST_SUBMITTED_WINS"]),
    minResultSeconds: z.number().min(1).max(3600),
    maxResultSeconds: z.number().min(10).max(4 * 3600),
  })
  .superRefine((value, ctx) => {
    if (value.minCharacterCost > value.maxCharacterCost) {
      ctx.addIssue({ code: "custom", message: "Preço mínimo maior que o máximo.", path: ["minCharacterCost"] });
    }
    if (value.minResultSeconds >= value.maxResultSeconds) {
      ctx.addIssue({ code: "custom", message: "Tempo mínimo deve ser menor que o máximo.", path: ["minResultSeconds"] });
    }
    for (const message of validateDraftConfig(value.draft)) ctx.addIssue({ code: "custom", message, path: ["draft"] });
  });

export type CompetitiveSettings = z.infer<typeof competitiveSettingsSchema>;

export const DEFAULT_COMPETITIVE_SETTINGS: CompetitiveSettings = {
  deckBudget: 100,
  minCharacterCost: 3,
  maxCharacterCost: 40,
  draftPreset: "BANS_FIRST_ALTERNATE",
  draft: {
    bansPerPlayer: 2,
    picksPerPlayer: 4,
    sequence: buildSequence("BANS_FIRST_ALTERNATE", 2, 4),
    turnTimeoutSeconds: null,
  },
  tiePolicy: "DRAW",
  minResultSeconds: 5,
  maxResultSeconds: 3600,
};

export const balanceSettingsSchema = z.object({
  /** Aparições mínimas (jogos com resultado validado) para o sinal de vitória contar. */
  minSampleGames: z.number().int().min(1).max(10_000),
  /** Oportunidades mínimas de pick/ban para os sinais de popularidade contarem. */
  minSampleOpportunities: z.number().int().min(1).max(10_000),
  /** Força do prior bayesiano (jogos "virtuais" a 50%). */
  priorGames: z.number().min(0).max(1000),
  weightWin: z.number().min(0).max(1),
  weightPick: z.number().min(0).max(1),
  weightBan: z.number().min(0).max(1),
  /** Peso dos dados históricos quando o ciclo atual já tem amostra completa. */
  historyWeight: z.number().min(0).max(1),
  /** Partidas no ciclo atual necessárias para considerá-lo maduro. */
  cycleMaturityMatches: z.number().int().min(1).max(10_000),
  /** Variação máxima de preço (pontos) por atualização. */
  maxStep: z.number().int().min(1).max(20),
  /** |score| mínimo para gerar proposta. */
  actionThreshold: z.number().min(0.01).max(1),
  /** Janela dos dados históricos, em dias. */
  historyDays: z.number().int().min(7).max(730),
  /** Dia da semana (0=domingo) da geração regular de propostas. */
  proposalWeekday: z.number().int().min(0).max(6),
});

export type BalanceSettings = z.infer<typeof balanceSettingsSchema>;

export const DEFAULT_BALANCE_SETTINGS: BalanceSettings = {
  minSampleGames: 10,
  minSampleOpportunities: 10,
  priorGames: 20,
  weightWin: 0.5,
  weightPick: 0.25,
  weightBan: 0.25,
  historyWeight: 0.3,
  cycleMaturityMatches: 30,
  maxStep: 3,
  actionThreshold: 0.2,
  historyDays: 90,
  proposalWeekday: 1,
};

const SETTINGS = {
  competitive: { schema: competitiveSettingsSchema, defaults: DEFAULT_COMPETITIVE_SETTINGS },
  balance: { schema: balanceSettingsSchema, defaults: DEFAULT_BALANCE_SETTINGS },
} as const;

type SettingKey = keyof typeof SETTINGS;
type SettingValue<K extends SettingKey> = K extends "competitive" ? CompetitiveSettings : BalanceSettings;

export async function getSettings<K extends SettingKey>(key: K, db: Tx = prisma): Promise<SettingValue<K>> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  const { schema, defaults } = SETTINGS[key];
  if (!row) return defaults as SettingValue<K>;
  const merged = { ...(defaults as object), ...(row.value as object) };
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    console.warn(`[settings] valor inválido para "${key}", usando padrão`, parsed.error.issues[0]?.message);
    return defaults as SettingValue<K>;
  }
  return parsed.data as SettingValue<K>;
}

export async function saveSettings<K extends SettingKey>(key: K, value: SettingValue<K>, updatedById: string | null, db: Tx = prisma) {
  const parsed = SETTINGS[key].schema.parse(value);
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue, updatedById },
    update: { value: parsed as Prisma.InputJsonValue, updatedById },
  });
  return parsed as SettingValue<K>;
}

/** Configuração congelada em cada partida. */
export interface MatchConfig {
  deckBudget: number;
  minDeckSize: number;
  draft: DraftConfig;
  tiePolicy: CompetitiveSettings["tiePolicy"];
  minResultSeconds: number;
  maxResultSeconds: number;
}

export function toMatchConfig(settings: CompetitiveSettings): MatchConfig {
  return {
    deckBudget: settings.deckBudget,
    minDeckSize: settings.draft.picksPerPlayer + settings.draft.bansPerPlayer,
    draft: settings.draft,
    tiePolicy: settings.tiePolicy,
    minResultSeconds: settings.minResultSeconds,
    maxResultSeconds: settings.maxResultSeconds,
  };
}
