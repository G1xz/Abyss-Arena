/**
 * Seed idempotente.
 *  - Conta ADMIN a partir de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NICKNAME (nunca fixa no código).
 *  - Catálogo de personagens (API pública; snapshot local como último recurso).
 *  - Tabela de preços inicial PROVISÓRIA por raridade, publicada como v1.
 *  - Ciclo do Abismo vigente (andar 12, 3 câmaras × 2 metades).
 *  - SEED_DEMO_DATA=true: jogadores, decks e partidas de demonstração criados pelos fluxos reais.
 */
import "dotenv/config";
import { DEFAULT_RULES } from "@/server/abyss/service";
import { hashPassword } from "@/server/auth/password";
import { JmpCatalogProvider } from "@/server/catalog/jmp";
import { SnapshotCatalogProvider } from "@/server/catalog/snapshot";
import { syncCatalog } from "@/server/catalog/sync";
import { YattaCatalogProvider } from "@/server/catalog/yatta";
import { prisma } from "@/server/db";
import { publishInitialPriceVersion } from "@/server/pricing/service";
import { seedDemoData } from "./seed-demo";

/** Custos provisórios — não representam balanceamento validado. */
export function provisionalCost(c: { slug: string; rarity: number }) {
  if (c.slug.startsWith("traveler-")) return 8;
  return c.rarity === 5 ? 18 : 10;
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
  } else {
    console.log("[seed] já existe tabela vigente; preços mantidos.");
  }
}

/** Ciclos do Abismo renovam no dia 16 de cada mês. */
export function currentCycleWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 16, 4));
  if (now < start) start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
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
  if (process.env.SEED_DEMO_DATA === "true") await seedDemoData();
  console.log("[seed] concluído.");
}

main()
  .catch((err) => {
    console.error("[seed] falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
