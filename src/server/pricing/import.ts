import { readFileSync } from "node:fs";
import path from "node:path";
import { scalePriceTable, validatePriceTable, type PriceTableSource } from "@/domain/price-table";
import { writeAuditLog } from "../audit";
import { assertAdmin } from "../auth/accounts";
import type { SessionUser } from "../auth/session";
import { prisma, type Db } from "../db";
import { AppError } from "../errors";
import { getSettings, saveSettings } from "../settings";
import { setDraftPriceTx } from "./service";

/** Tabela inicial: custos da Abyss Cup (orçamento 500), em prisma/data/abyss-cup-prices.json. */
export function loadAbyssCupTable(): PriceTableSource {
  const file = path.join(process.cwd(), "prisma/data/abyss-cup-prices.json");
  const table = JSON.parse(readFileSync(file, "utf8")) as PriceTableSource;
  const errors = validatePriceTable(table);
  if (errors.length) throw new Error(`Tabela de preços inválida: ${errors[0]}`);
  return table;
}

export interface ImportReport {
  draftId: string;
  applied: number;
  /** Personagens da tabela que não existem no catálogo. */
  missing: string[];
  /** Personagens do catálogo fora da tabela (mantêm o preço atual). */
  untouched: string[];
  /** Limites de custo base ampliados para caber a tabela. */
  bounds: { min: number; max: number } | null;
}

/**
 * Grava a tabela escalada no rascunho de preços (custo base + ajustes de C1 a C6 por personagem).
 * Nada muda para os jogadores até um administrador publicar o rascunho.
 */
export async function importPriceTableToDraft(admin: SessionUser, table: PriceTableSource, options: { justification: string; db?: Db }): Promise<ImportReport> {
  assertAdmin(admin);
  const errors = validatePriceTable(table);
  if (errors.length) throw new AppError("VALIDATION", errors[0]!);
  const db = options.db ?? prisma;
  return db.$transaction(
    async (tx) => {
      const settings = await getSettings("competitive", tx);
      const prices = scalePriceTable(table, settings.deckBudget);
      const characters = await tx.character.findMany({ select: { id: true, slug: true, name: true } });
      const bySlug = new Map(characters.map((c) => [c.slug, c]));

      // A tabela manda nos limites do custo base: amplia o intervalo das configurações se preciso.
      const costs = prices.filter((p) => bySlug.has(p.slug)).map((p) => p.cost);
      const min = Math.min(settings.minCharacterCost, ...costs);
      const max = Math.max(settings.maxCharacterCost, ...costs);
      let bounds: ImportReport["bounds"] = null;
      if (min !== settings.minCharacterCost || max !== settings.maxCharacterCost) {
        const after = { ...settings, minCharacterCost: min, maxCharacterCost: max };
        await saveSettings("competitive", after, admin.id, tx);
        await writeAuditLog(tx, {
          adminId: admin.id,
          action: "SETTINGS_COMPETITIVE_UPDATED",
          entityType: "SystemSetting",
          entityId: "competitive",
          reason: `Limites de custo ampliados para a tabela importada (${table.source})`,
          before: { minCharacterCost: settings.minCharacterCost, maxCharacterCost: settings.maxCharacterCost },
          after: { minCharacterCost: min, maxCharacterCost: max },
        });
        bounds = { min, max };
      }

      let draftId = "";
      let applied = 0;
      for (const p of prices) {
        const character = bySlug.get(p.slug);
        if (!character) continue;
        const result = await setDraftPriceTx(tx, admin, { characterId: character.id, cost: p.cost, overrides: p.overrides, justification: options.justification }, "MANUAL");
        draftId = result.draftId;
        applied++;
      }
      const inTable = new Set(prices.map((p) => p.slug));
      return {
        draftId,
        applied,
        missing: prices.filter((p) => !bySlug.has(p.slug)).map((p) => p.slug),
        untouched: characters.filter((c) => !inTable.has(c.slug)).map((c) => c.name),
        bounds,
      };
    },
    { timeout: 120_000 },
  );
}
