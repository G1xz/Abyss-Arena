/**
 * Dados de demonstração (apenas desenvolvimento; ative com SEED_DEMO_DATA=true).
 * Jogadores, decks e partidas são criados pelos MESMOS serviços usados pela aplicação,
 * garantindo que tudo respeite as regras (orçamento, turnos, confirmação bilateral).
 * Metade das partidas é movida para o mês anterior (fora do ciclo vigente) para alimentar o histórico.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { createDeck, getActiveUserCosts, getDeckRules, listUserDecks } from "@/server/decks/service";
import { confirmOpponentResult, submitResult } from "@/server/matches/results";
import { createRoom, joinRoom, performDraftAction, setReady, startDraft } from "@/server/matches/service";
import { getMatchView } from "@/server/matches/view";
import { getActivePriceVersion, getCompetitivePriceMap } from "@/server/pricing/service";
import { getCurrentCycle } from "@/server/abyss/service";

const DEMO_PLAYERS = ["Kaeyaenjoyer", "PyroMain", "Speedrunner", "AbyssDiver", "HydroQueen", "GeoTank"];
/** Personagens "fortes" na simulação, para gerar sinais visíveis no balanceamento. */
const META = ["neuvillette", "furina", "nahida", "raiden-shogun", "kaedehara-kazuha", "xianyun", "mavuika", "citlali", "bennett", "xingqiu"];

/** Conta de demonstração: todos os personagens liberados, 4★ com constelações altas, 5★ em geral C0–C2. */
async function giveDemoRoster(userId: string, characters: { id: string; rarity: number }[], rand: () => number) {
  await prisma.ownedCharacter.createMany({
    data: characters.map((c) => ({
      userId,
      characterId: c.id,
      constellation: c.rarity === 4 ? 2 + Math.floor(rand() * 5) : rand() < 0.7 ? 0 : 1 + Math.floor(rand() * 2),
      level: c.rarity === 5 && rand() < 0.2 ? (rand() < 0.5 ? 95 : 100) : 90,
    })),
    skipDuplicates: true,
  });
}

/** Deck dentro do orçamento: 2 "meta" + 5★ aleatórios + 4★ até completar, usando o custo efetivo da conta. */
async function buildDemoDeck(user: SessionUser, characters: { id: string; slug: string; rarity: number }[], rand: () => number, name: string) {
  const [{ prices }, rules] = await Promise.all([getActiveUserCosts(user.id), getDeckRules()]);
  const bySlug = new Map(characters.map((c) => [c.slug, c]));
  const chosen = new Set<string>();
  let total = 0;
  const add = (id: string) => {
    const cost = prices.get(id);
    if (cost === undefined || chosen.has(id) || total + cost > rules.budget) return false;
    chosen.add(id);
    total += cost;
    return true;
  };
  const metaPool = META.map((s) => bySlug.get(s)).filter(Boolean).sort(() => rand() - 0.5);
  for (const c of metaPool.slice(0, 2)) add(c!.id);
  const pool = [...characters].sort(() => rand() - 0.5);
  for (const c of pool.filter((c) => c.rarity === 5 && !c.slug.startsWith("traveler")).slice(0, 3)) add(c.id);
  for (const c of pool.filter((c) => c.rarity === 4)) {
    if (chosen.size >= rules.minSize + 2) break;
    add(c.id);
  }
  return createDeck(user, { name, characterIds: [...chosen] });
}

/**
 * Bancos criados antes de "Meus personagens": garante conta de personagens e um deck válido
 * no formato atual para cada jogador de demonstração.
 */
export async function ensureDemoAccounts() {
  process.env.RATE_LIMIT_DISABLED = "true";
  const rand = rng(7);
  const version = await getActivePriceVersion();
  if (!version) return;
  const prices = await getCompetitivePriceMap(version.id);
  const characters = await prisma.character.findMany({ where: { id: { in: [...prices.keys()] } } });
  const players = await prisma.user.findMany({ where: { email: { endsWith: "@demo.local" } }, select: { id: true, email: true, nickname: true, role: true } });
  let updated = 0;
  for (const user of players) {
    if ((await prisma.ownedCharacter.count({ where: { userId: user.id } })) === 0) await giveDemoRoster(user.id, characters, rand);
    const decks = await listUserDecks(user.id);
    if (!decks.some((d) => d.evaluation.valid)) {
      const deck = await buildDemoDeck(user, characters, rand, `Deck de ${user.nickname} (1000)`);
      await prisma.user.update({ where: { id: user.id }, data: { defaultDeckId: deck.id } });
      updated++;
    }
  }
  if (updated) console.log(`[seed:demo] ${updated} jogador(es) de demonstração receberam conta de personagens e deck no formato atual.`);
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoData() {
  if (await prisma.user.count({ where: { email: { endsWith: "@demo.local" } } })) {
    console.log("[seed:demo] dados de demonstração já existem.");
    return;
  }
  process.env.RATE_LIMIT_DISABLED = "true";
  const rand = rng(42);
  const password = process.env.DEMO_PASSWORD || randomBytes(9).toString("base64url");

  const version = await getActivePriceVersion();
  if (!version) throw new Error("Sem tabela vigente para criar decks de demonstração");
  const prices = await getCompetitivePriceMap(version.id);
  const characters = await prisma.character.findMany({ where: { id: { in: [...prices.keys()] } } });
  const power = new Map(characters.map((c) => [c.id, (META.includes(c.slug) ? 3 : 0) + c.rarity - 4 + rand()]));

  const players: SessionUser[] = [];
  const passwordHash = await hashPassword(password);
  for (const nick of DEMO_PLAYERS) {
    const user = await prisma.user.create({
      data: { email: `${nick.toLowerCase()}@demo.local`, nickname: nick, nicknameKey: nick.toLowerCase(), passwordHash },
      select: { id: true, email: true, nickname: true, role: true },
    });
    players.push(user);
    await giveDemoRoster(user.id, characters, rand);
    await buildDemoDeck(user, characters, rand, `Deck de ${nick}`);
  }

  const matchIds: string[] = [];
  const TOTAL = 48;
  for (let i = 0; i < TOTAL; i++) {
    const a = players[Math.floor(rand() * players.length)]!;
    let b = players[Math.floor(rand() * players.length)]!;
    while (b.id === a.id) b = players[Math.floor(rand() * players.length)]!;

    const room = await createRoom(a, {});
    const hostDeck = await prisma.deck.findFirst({ where: { userId: a.id } });
    await prisma.matchPlayer.update({ where: { matchId_seat: { matchId: room.id, seat: "A" } }, data: { deckId: hostDeck!.id } });
    await joinRoom(b, room.code);
    await setReady(a, room.id, true);
    await setReady(b, room.id, true);
    await startDraft(a, room.id);

    for (;;) {
      const view = await getMatchView(room.id, a);
      const d = view.draft!;
      if (d.isComplete) break;
      const step = d.currentStep!;
      const actor = step.actor === "A" ? a : b;
      const own = step.actor;
      const opp = own === "A" ? "B" : "A";
      const candidates =
        step.type === "BAN"
          ? d.decks[opp].filter((c) => !d.bannedFrom[opp].includes(c.characterId) && !d.picks[opp].includes(c.characterId))
          : d.decks[own].filter((c) => !d.bannedFrom[own].includes(c.characterId) && !d.picks[own].includes(c.characterId));
      // Bane/escolhe preferencialmente os mais fortes, com bastante ruído (nem todo meta é banido).
      candidates.sort((x, y) => power.get(y.characterId)! + rand() * 4 - (power.get(x.characterId)! + rand() * 4));
      const pick = step.type === "BAN" ? candidates[Math.floor(rand() * Math.min(3, candidates.length))]! : candidates[0]!;
      await performDraftAction(actor, room.id, { stepIndex: d.stepIndex, characterId: pick.characterId });
    }

    const view = await getMatchView(room.id, a);
    const teamPower = (seat: "A" | "B") => view.draft!.picks[seat].reduce((s, id) => s + power.get(id)!, 0);
    const time = (seat: "A" | "B") => Math.round((420 - teamPower(seat) * 9 + rand() * 60) * 1000);
    await submitResult(a, room.id, { timeMs: time("A"), evidenceUrls: [] });
    await submitResult(b, room.id, { timeMs: time("B"), evidenceUrls: [] });
    await confirmOpponentResult(a, room.id);
    await confirmOpponentResult(b, room.id);
    matchIds.push(room.id);
  }

  // A primeira metade das partidas vai para o mês anterior, fora do ciclo vigente (alimenta o histórico).
  const current = await getCurrentCycle();
  if (current) {
    const prevStart = new Date(current.startsAt);
    prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
    const old = matchIds.slice(0, TOTAL / 2);
    const spacing = (current.startsAt.getTime() - prevStart.getTime()) / (old.length + 1);
    for (const [i, id] of old.entries()) {
      const when = new Date(prevStart.getTime() + (i + 1) * spacing);
      await prisma.match.update({
        where: { id },
        data: { abyssCycleId: null, createdAt: when, draftStartedAt: when, lockedAt: when, completedAt: when },
      });
    }
  }

  console.log(`[seed:demo] ${players.length} jogadores (@demo.local) e ${TOTAL} partidas concluídas.`);
  if (!process.env.DEMO_PASSWORD) console.log(`[seed:demo] senha gerada para os jogadores de demonstração: ${password}`);
}
