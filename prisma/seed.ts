/**
 * Seed idempotente.
 *  - Conta ADMIN a partir de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NICKNAME (nunca fixa no código).
 *  - Catálogo de personagens (API pública; snapshot local como último recurso).
 *  - Tabela de preços inicial PROVISÓRIA por raridade (custo base C0), publicada como v1.
 *    Bancos com a escala antiga (orçamento 100) recebem uma nova versão provisória na escala de 1000.
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
import { publishInitialPriceVersion, publishProvisionalTable } from "@/server/pricing/service";
import { getSettings } from "@/server/settings";
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

async function seedPrices(adminId: string | null) {
  const characters = await prisma.character.findMany();
  const published = await publishInitialPriceVersion(
    characters.map((c) => ({ characterId: c.id, cost: provisionalCost(c) })),
    { adminId },
  );
  if (published) {
    await prisma.character.updateMany({ data: { competitiveEnabled: true } });
    console.log(`[seed] tabela v${published.number} publicada com ${characters.length} preços provisórios; personagens liberados.`);
    return;
  }
  // Escala antiga (orçamento 100, 5★ = 18): publica uma nova versão provisória mantendo o histórico.
  const budget = (await getSettings("competitive")).deckBudget;
  const active = await prisma.priceVersion.findFirst({ where: { status: "ACTIVE" }, include: { prices: true } });
  const maxCost = Math.max(0, ...(active?.prices.map((p) => p.cost) ?? []));
  if (active && budget >= 500 && maxCost <= 40 && active.prices.every((p) => p.isProvisional)) {
    const rescaled = await publishProvisionalTable(
      characters.map((c) => ({ characterId: c.id, cost: provisionalCost(c) })),
      { adminId, label: "Escala de 1000 pontos (provisória)", justification: "Reescala para o orçamento de 1000 pontos" },
    );
    console.log(`[seed] tabela v${rescaled.number} publicada na escala de 1000 pontos (v${active.number} preservada no histórico).`);
  } else {
    console.log("[seed] já existe tabela vigente; preços mantidos.");
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
async function seedCycle() {
  const { start, end } = currentCycleWindow(new Date());
  const next = new Date(end);
  next.setUTCMonth(next.getUTCMonth() + 1);
  for (const [startsAt, endsAt] of [
    [start, end],
    [end, next],
  ] as const) {
    const exists = await prisma.abyssCycle.findFirst({ where: { status: "ACTIVE", startsAt: { lte: startsAt }, endsAt: { gt: startsAt } } });
    if (exists) continue;
    const name = `Abismo ${startsAt.toISOString().slice(0, 7)}`;
    await prisma.abyssCycle.create({
      data: {
        name,
        startsAt,
        endsAt,
        rules: DEFAULT_RULES,
        challenges: {
          create: [1, 2, 3].flatMap((chamber) => (["FIRST", "SECOND"] as const).map((half) => ({ floor: 12, chamber, half, enabled: true }))),
        },
      },
    });
    console.log(`[seed] ciclo criado: ${name}`);
  }
}

async function main() {
  const adminId = await seedAdmin();
  await seedCatalog();
  await seedPrices(adminId);
  await seedCycle();
  await seedAbyssFromWiki();
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
