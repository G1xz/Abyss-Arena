/**
 * Dados de demonstração (apenas desenvolvimento; ative com SEED_DEMO_DATA=true).
 * Jogadores, decks e partidas são criados pelos MESMOS serviços usados pela aplicação,
 * garantindo que tudo respeite as regras (orçamento, turnos, confirmação bilateral).
 * Metade das partidas é movida para um ciclo anterior para alimentar o histórico.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { createDeck } from "@/server/decks/service";
import { confirmOpponentResult, submitResult } from "@/server/matches/results";
import { createRoom, joinRoom, performDraftAction, setReady, startDraft } from "@/server/matches/service";
import { getMatchView } from "@/server/matches/view";
import { getActivePriceVersion, getCompetitivePriceMap } from "@/server/pricing/service";
import { DEFAULT_RULES, getCurrentCycle } from "@/server/abyss/service";

const DEMO_PLAYERS = ["Kaeyaenjoyer", "PyroMain", "Speedrunner", "AbyssDiver", "HydroQueen", "GeoTank"];
/** Personagens "fortes" na simulação, para gerar sinais visíveis no balanceamento. */
const META = ["neuvillette", "furina", "nahida", "raiden-shogun", "kaedehara-kazuha", "xianyun", "mavuika", "citlali", "bennett", "xingqiu"];

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
  const bySlug = new Map(characters.map((c) => [c.slug, c]));
  const power = new Map(characters.map((c) => [c.id, (META.includes(c.slug) ? 3 : 0) + c.rarity - 4 + rand()]));

  const players: SessionUser[] = [];
  const passwordHash = await hashPassword(password);
  for (const nick of DEMO_PLAYERS) {
    const user = await prisma.user.create({
      data: { email: `${nick.toLowerCase()}@demo.local`, nickname: nick, nicknameKey: nick.toLowerCase(), passwordHash },
      select: { id: true, email: true, nickname: true, role: true },
    });
    players.push(user);

    // Deck: 2 personagens "meta" + um 5★ qualquer + 4★ até o orçamento (7–8 personagens).
    const chosen = new Set<string>();
    const metaPool = META.map((s) => bySlug.get(s)).filter(Boolean).sort(() => rand() - 0.5);
    for (const c of metaPool.slice(0, 2)) chosen.add(c!.id);
    const pool = [...characters].sort(() => rand() - 0.5);
    const extraFive = pool.find((c) => c.rarity === 5 && !chosen.has(c.id) && !c.slug.startsWith("traveler"));
    if (extraFive) chosen.add(extraFive.id);
    let total = [...chosen].reduce((sum, id) => sum + prices.get(id)!, 0);
    for (const c of pool) {
      const cost = prices.get(c.id)!;
      if (chosen.has(c.id) || c.rarity !== 4 || total + cost > 100) continue;
      chosen.add(c.id);
      total += cost;
    }
    await createDeck(user, { name: `Deck de ${nick}`, characterIds: [...chosen] });
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

  // Move a primeira metade das partidas para um ciclo anterior (histórico).
  const current = await getCurrentCycle();
  if (current) {
    const prevStart = new Date(current.startsAt);
    prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
    const previous = await prisma.abyssCycle.create({
      data: {
        name: `Abismo ${prevStart.toISOString().slice(0, 7)} (demo)`,
        startsAt: prevStart,
        endsAt: current.startsAt,
        rules: DEFAULT_RULES,
        status: "ENDED",
        challenges: {
          create: [1, 2, 3].flatMap((chamber) => (["FIRST", "SECOND"] as const).map((half) => ({ floor: 12, chamber, half, enabled: true }))),
        },
      },
    });
    const old = matchIds.slice(0, TOTAL / 2);
    const spacing = (current.startsAt.getTime() - prevStart.getTime()) / (old.length + 1);
    for (const [i, id] of old.entries()) {
      const when = new Date(prevStart.getTime() + (i + 1) * spacing);
      await prisma.match.update({
        where: { id },
        data: { abyssCycleId: previous.id, createdAt: when, draftStartedAt: when, lockedAt: when, completedAt: when },
      });
    }
  }

  console.log(`[seed:demo] ${players.length} jogadores (@demo.local) e ${TOTAL} partidas concluídas.`);
  if (!process.env.DEMO_PASSWORD) console.log(`[seed:demo] senha gerada para os jogadores de demonstração: ${password}`);
}
