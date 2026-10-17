/**
 * Seed idempotente.
 *  - Conta ADMIN a partir de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NICKNAME (nunca fixa no código).
 *  - Catálogo de personagens (API pública; snapshot local como último recurso).
 *  - Tabela de preços inicial da Abyss Cup (prisma/data/abyss-cup-prices.json), com os valores da planilha
 *    e o custo de cada constelação; publicada como v1. Bancos que ainda só têm preços provisórios
 *    recebem essa tabela como nova versão. Tabelas já revisadas por um admin não são tocadas.
 *  - Ciclo do Abismo vigente (andar 12, 3 câmaras × 2 metades).
 *  - SEED_DEMO_DATA=true: jogadores, decks e partidas de demonstração criados pelos fluxos reais.
 */
import "dotenv/config";
import { abyssResetAt, cycleKeysAround } from "@/domain/abyss-wiki";
import { DEFAULT_RULES, LEGACY_DEFAULT_RULES } from "@/server/abyss/service";
import { syncAbyss } from "@/server/abyss/sync";
import { hashPassword } from "@/server/auth/password";
import { JmpCatalogProvider } from "@/server/catalog/jmp";
import { SnapshotCatalogProvider } from "@/server/catalog/snapshot";
import { syncCatalog } from "@/server/catalog/sync";
import { YattaCatalogProvider } from "@/server/catalog/yatta";
import { prisma } from "@/server/db";
import { INITIAL_TABLE_SCALE, scalePriceTable } from "@/domain/price-table";
import { loadAbyssCupTable } from "@/server/pricing/import";
import { publishInitialPriceVersion, publishProvisionalTable, type TablePrice } from "@/server/pricing/service";
import { ensureDemoAccounts, seedDemoData } from "./seed-demo";

/** Custos base (C0) provisórios para o orçamento de 1000 — não representam balanceamento validado. */
export function provisionalCost(c: { slug: string; rarity: number }) {
  if (c.slug.startsWith("traveler-")) return 40;
  return c.rarity === 5 ? 100 : 40;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const nickname = process.env.ADMIN_NICKNAME?.trim() || "Admin";
  if (!email || !password) {
    console.warn("[seed] ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhuma conta administrativa criada.");
    return null;
  }
  if (password.length < 8) throw new Error("ADMIN_PASSWORD precisa de ao menos 8 caracteres");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const data: { role: "ADMIN"; passwordHash?: string } = { role: "ADMIN" };
    if (process.env.ADMIN_RESET_PASSWORD === "true") data.passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log(`[seed] admin existente garantido: ${email}`);
    return existing.id;
  }
  const admin = await prisma.user.create({
    data: { email, nickname, nicknameKey: nickname.toLowerCase(), passwordHash: await hashPassword(password), role: "ADMIN" },
  });
  console.log(`[seed] admin criado: ${email}`);
  return admin.id;
}

async function seedCatalog() {
  const count = await prisma.character.count();
  if (count > 0 && process.env.SEED_SYNC_CATALOG !== "true") {
    console.log(`[seed] catálogo já possui ${count} personagens (SEED_SYNC_CATALOG=true para sincronizar).`);
    return;
  }
  const providers =
    process.env.SEED_OFFLINE === "true"
      ? [new SnapshotCatalogProvider()]
      : [new YattaCatalogProvider(), new JmpCatalogProvider(), new SnapshotCatalogProvider()];
  const report = await syncCatalog({ providers });
  console.log(`[seed] catálogo: fonte=${report.source} novos=${report.created} atualizados=${report.updated}`);
  if (report.attempts.length) console.log("[seed] fontes que falharam:", report.attempts);
}

const INITIAL_LABEL = "Tabela inicial (Abyss Cup)";

/**
 * Tabela inicial: custos da Abyss Cup com os valores da planilha, incluindo o custo de cada constelação.
 * Personagens fora da tabela recebem o preço provisório por raridade.
 */
function initialTable(characters: { id: string; slug: string; rarity: number }[]): TablePrice[] {
  const source = loadAbyssCupTable();
  const bySlug = new Map(scalePriceTable(source, INITIAL_TABLE_SCALE).map((p) => [p.slug, p]));
  const justification = "Tabela inicial importada da Abyss Cup (valores da planilha)";
  return characters.map((c) => {
    const p = bySlug.get(c.slug);
    return p
      ? { characterId: c.id, cost: p.cost, overrides: p.overrides, provisional: false, justification }
      : { characterId: c.id, cost: provisionalCost(c), provisional: true, justification: "Fora da tabela da Abyss Cup: preço provisório por raridade" };
  });
}

const INITIAL_NOTES =
  "Custos por constelação da Abyss Cup (x1 russo), com os valores da planilha (o formato original usa orçamento de 500). Personagens marcados com * estão fora da tabela e têm preço provisório.";

async function seedPrices(adminId: string | null) {
  const characters = await prisma.character.findMany();
  const table = initialTable(characters);
  const fromCup = table.filter((p) => p.provisional === false).length;
  const published = await publishInitialPriceVersion(table, { adminId, label: INITIAL_LABEL, notes: INITIAL_NOTES });
  if (published) {
    await prisma.character.updateMany({ data: { competitiveEnabled: true } });
    console.log(`[seed] tabela v${published.number} publicada: ${fromCup} preços da Abyss Cup, ${characters.length - fromCup} provisórios; personagens liberados.`);
    return;
  }
  // Tabela vigente ainda toda provisória (nunca revisada por um admin): publica a tabela inicial como nova versão.
  const active = await prisma.priceVersion.findFirst({ where: { status: "ACTIVE" }, include: { prices: true } });
  if (active && active.prices.every((p) => p.isProvisional)) {
    try {
      const next = await publishProvisionalTable(table, { adminId, label: INITIAL_LABEL, notes: INITIAL_NOTES, justification: "Tabela inicial da Abyss Cup" });
      console.log(`[seed] tabela v${next.number} publicada com os preços da Abyss Cup (v${active.number} preservada no histórico).`);
    } catch (err) {
      console.warn(`[seed] tabela da Abyss Cup não publicada: ${(err as Error).message}`);
    }
  } else {
    console.log("[seed] já existe tabela vigente revisada; preços mantidos (use npm run prices:import para levar a tabela da Abyss Cup ao rascunho).");
  }
}

/** Ciclos do Abismo renovam no dia 16 de cada mês, às 04:00 do servidor (padrão: América, UTC-5). */
export function currentCycleWindow(now = new Date()) {
  const offset = Number(process.env.ABYSS_SERVER_UTC_OFFSET ?? -5);
  const { current, next } = cycleKeysAround(now, offset);
  return { start: abyssResetAt(current, offset), end: abyssResetAt(next, offset) };
}

/** Tenta preencher o andar 12 a partir da wiki (inimigos, perturbações). Sem internet, segue com o ciclo manual. */
async function seedAbyssFromWiki() {
  const updated = await prisma.abyssCycle.updateMany({ where: { rules: LEGACY_DEFAULT_RULES }, data: { rules: DEFAULT_RULES } });
  if (updated.count) console.log(`[seed] regras padrão atualizadas para o formato de 8 picks em ${updated.count} ciclo(s).`);
  if (process.env.SEED_OFFLINE === "true" || process.env.ABYSS_SYNC_ENABLED === "false") return;
  try {
    const results = await syncAbyss();
    console.log(`[seed] Abismo (wiki): ${results.map((r) => `${r.key} ${r.status}`).join(", ")}`);
  } catch (err) {
    console.warn("[seed] não foi possível sincronizar o Abismo com a wiki:", (err as Error).message);
  }
}

/** Garante o ciclo vigente e o seguinte (que assume automaticamente quando sua data chega). */
/**
 * Reserva: só cria o ciclo vigente à mão quando a wiki não trouxe nenhum (sem internet, testes).
 * Os ciclos seguintes chegam sozinhos pela sincronização com a wiki.
 */
async function seedCycleFallback() {
  const { start, end } = currentCycleWindow(new Date());
  const exists = await prisma.abyssCycle.findFirst({ where: { status: "ACTIVE", startsAt: { lte: start }, endsAt: { gt: start } } });
  if (exists) return;
  const name = `Abismo ${start.toISOString().slice(0, 7)}`;
  await prisma.abyssCycle.create({
    data: {
      name,
      startsAt: start,
      endsAt: end,
      rules: DEFAULT_RULES,
      challenges: {
        create: [1, 2, 3].flatMap((chamber) => (["FIRST", "SECOND"] as const).map((half) => ({ floor: 12, chamber, half, enabled: true }))),
      },
    },
  });
  console.log(`[seed] ciclo criado à mão (wiki indisponível): ${name}`);
}

async function main() {
  const adminId = await seedAdmin();
  await seedCatalog();
  await seedPrices(adminId);
  await seedAbyssFromWiki();
  await seedCycleFallback();
  if (process.env.SEED_DEMO_DATA === "true") {
    await seedDemoData();
    await ensureDemoAccounts();
  }
  console.log("[seed] concluído.");
}

main()
  .catch((err) => {
    console.error("[seed] falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
