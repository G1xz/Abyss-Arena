import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Role } from "@/generated/prisma/client";
import type { SessionUser } from "@/server/auth/session";
import type { CatalogCharacter } from "@/server/catalog/provider";
import { prisma } from "@/server/db";
import { createDeck } from "@/server/decks/service";
import { getMatchView } from "@/server/matches/view";
import { confirmOpponentResult, submitResult } from "@/server/matches/results";
import { createRoom, joinRoom, performDraftAction, setReady, startDraft } from "@/server/matches/service";
import { publishInitialPriceVersion } from "@/server/pricing/service";
import { resetRateLimits } from "@/server/rate-limit";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Apaga todos os dados (mantém o schema/migrations). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  resetRateLimits();
}

export function snapshotCharacters(): CatalogCharacter[] {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "prisma/data/characters-snapshot.json"), "utf8")) as {
    characters: (CatalogCharacter & { releasedAt: string | null })[];
  };
  return raw.characters.map((c) => ({ ...c, releasedAt: c.releasedAt ? new Date(c.releasedAt) : null }));
}

let counter = 0;
export async function createUser(nickname?: string, role: Role = "USER"): Promise<SessionUser> {
  const nick = nickname ?? `player${++counter}${Date.now() % 10000}`;
  return prisma.user.create({
    data: { email: `${nick.toLowerCase()}@test.local`, nickname: nick, nicknameKey: nick.toLowerCase(), passwordHash: "scrypt$test", role },
    select: { id: true, email: true, nickname: true, role: true },
  });
}

/**
 * Catálogo pequeno e determinístico + tabela v1 publicada + ciclo vigente.
 * Custos: 5★ = 18, 4★ = 10.
 */
export async function seedWorld(options: { characters?: number } = {}) {
  const chars = snapshotCharacters()
    .filter((c) => !c.slug.startsWith("traveler-"))
    .slice(0, options.characters ?? 24);
  const created = [];
  for (const c of chars) {
    created.push(
      await prisma.character.create({
        data: {
          slug: c.slug,
          name: c.name,
          element: c.element,
          weaponType: c.weaponType,
          rarity: c.rarity,
          iconUrl: c.iconUrl,
          externalSource: "yatta",
          externalId: c.externalId,
          releasedAt: c.releasedAt,
          competitiveEnabled: true,
        },
      }),
    );
  }
  const admin = await createUser("admin", "ADMIN");
  const version = await publishInitialPriceVersion(
    created.map((c) => ({ characterId: c.id, cost: c.rarity === 5 ? 18 : 10 })),
    { adminId: admin.id },
  );
  const now = Date.now();
  const cycle = await prisma.abyssCycle.create({
    data: {
      name: "Ciclo de teste",
      startsAt: new Date(now - 24 * 3600_000),
      endsAt: new Date(now + 30 * 24 * 3600_000),
      rules: "Regras de teste para o speedrun.",
      challenges: { create: [1, 2, 3].map((chamber) => ({ floor: 12, chamber, half: "FIRST" as const, enabled: true })) },
    },
  });
  const fourStars = created.filter((c) => c.rarity === 4);
  const fiveStars = created.filter((c) => c.rarity === 5);
  return { admin, characters: created, fourStars, fiveStars, version: version!, cycle };
}

/** Deck válido: 6 personagens (2× 5★ + 4× 4★ = 76 pontos). */
export async function createValidDeck(user: SessionUser, world: Awaited<ReturnType<typeof seedWorld>>, offset = 0) {
  const ids = [...world.fiveStars.slice(offset, offset + 2), ...world.fourStars.slice(offset, offset + 4)].map((c) => c.id);
  return createDeck(user, { name: `Deck ${user.nickname}`, characterIds: ids });
}

/** Sala com os dois jogadores prontos e draft iniciado. */
export async function startedMatch(world: Awaited<ReturnType<typeof seedWorld>>) {
  const a = await createUser();
  const b = await createUser();
  const deckA = await createValidDeck(a, world, 0);
  const deckB = await createValidDeck(b, world, 1);
  const room = await createRoom(a, { deckId: deckA.id });
  await joinRoom(b, room.code);
  await prisma.matchPlayer.update({ where: { matchId_seat: { matchId: room.id, seat: "B" } }, data: { deckId: deckB.id } });
  await setReady(a, room.id, true);
  await setReady(b, room.id, true);
  await startDraft(a, room.id);
  return { a, b, deckA, deckB, matchId: room.id, code: room.code };
}

/** Executa o draft inteiro escolhendo sempre o primeiro personagem disponível. */
export async function completeDraft(matchId: string, a: SessionUser, b: SessionUser) {
  for (;;) {
    const view = await getMatchView(matchId, a);
    const d = view.draft!;
    if (d.isComplete) return view;
    const step = d.currentStep!;
    const actor = step.actor === "A" ? a : b;
    const own = step.actor;
    const opp = own === "A" ? "B" : "A";
    const target = step.type === "BAN" ? opp : own;
    const candidate = d.decks[target].find((c) => !d.bannedFrom[target].includes(c.characterId) && !d.picks[target].includes(c.characterId))!;
    await performDraftAction(actor, matchId, { stepIndex: d.stepIndex, characterId: candidate.characterId });
  }
}

/** Partida completa e validada: A vence com tempo menor. */
export async function playCompletedMatch(world: Awaited<ReturnType<typeof seedWorld>>, times = { A: 300_000, B: 330_000 }) {
  const m = await startedMatch(world);
  await completeDraft(m.matchId, m.a, m.b);
  await submitResult(m.a, m.matchId, { timeMs: times.A, evidenceUrls: [] });
  await submitResult(m.b, m.matchId, { timeMs: times.B, evidenceUrls: [] });
  await confirmOpponentResult(m.a, m.matchId);
  await confirmOpponentResult(m.b, m.matchId);
  return m;
}
