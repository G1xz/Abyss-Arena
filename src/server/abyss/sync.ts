/**
 * Sincronização automática dos ciclos do Abismo (andar 12) a partir da wiki do Fandom.
 * - Estrutura do ciclo: página "Spiral_Abyss/Floors/<data>" (MediaWiki API).
 * - Nomes em português e ícones: catálogo de inimigos da yatta.moe.
 * - Inimigos que a yatta não tem: imagem da página do inimigo na wiki, baixada e guardada no banco
 *   (a CDN da wiki não permite exibição direta em outros sites).
 * O ciclo novo entra em vigor sozinho na virada do Abismo (startsAt). Falhas não alteram nada.
 */
import {
  abyssResetAt,
  cycleKeysAround,
  parseWikiCycle,
  translateDisorder,
  translateTarget,
  type WikiCycle,
} from "@/domain/abyss-wiki";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "../audit";
import { prisma, type Db } from "../db";
import { DEFAULT_RULES } from "./service";

const UA = "AbyssArena/0.1 (+abyss-sync)";
const WIKI_API = "https://genshin-impact.fandom.com/api.php";

export interface Monster {
  name: string;
  route: string;
  icon: string;
}

export interface AbyssSources {
  fetchCycleWikitext(key: string): Promise<string | null>;
  fetchMonsters(): Promise<Monster[]>;
  /** Imagem principal da página de cada inimigo (seguindo redirecionamentos). */
  fetchWikiImages(namesEn: string[]): Promise<Map<string, string | null>>;
  downloadImage(url: string): Promise<{ contentType: string; data: Uint8Array } | null>;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

export function defaultAbyssSources(): AbyssSources {
  return {
    async fetchCycleWikitext(key) {
      const data = (await getJson(`${WIKI_API}?action=parse&page=${encodeURIComponent(`Spiral_Abyss/Floors/${key}`)}&prop=wikitext&format=json`)) as {
        parse?: { wikitext?: { "*": string } };
        error?: { code: string };
      };
      if (data.error?.code === "missingtitle") return null;
      return data.parse?.wikitext?.["*"] ?? null;
    },
    async fetchMonsters() {
      const data = (await getJson("https://gi.yatta.moe/api/v2/pt/monster")) as { data: { items: Record<string, Monster> } };
      return Object.values(data.data.items).filter((m) => m.route && m.icon);
    },
    async fetchWikiImages(namesEn) {
      const result = new Map<string, string | null>();
      for (let i = 0; i < namesEn.length; i += 40) {
        const chunk = namesEn.slice(i, i + 40);
        const data = (await getJson(
          `${WIKI_API}?action=query&prop=pageimages&piprop=original&redirects=1&format=json&titles=${encodeURIComponent(chunk.join("|"))}`,
        )) as { query: { redirects?: { from: string; to: string }[]; normalized?: { from: string; to: string }[]; pages: Record<string, { title: string; original?: { source: string } }> } };
        const alias = new Map<string, string>();
        for (const r of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) alias.set(r.from, r.to);
        const byTitle = new Map(Object.values(data.query.pages).map((p) => [p.title, p.original?.source ?? null]));
        for (const name of chunk) {
          let title = name;
          for (let hop = 0; hop < 3 && alias.has(title); hop++) title = alias.get(title)!;
          result.set(name, byTitle.get(title) ?? null);
        }
      }
      return result;
    },
    async downloadImage(url) {
      // A CDN da wiki exige um Referer; sem ele responde 403.
      const res = await fetch(url, { headers: { "user-agent": UA, referer: "https://genshin-impact.fandom.com/" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "image/png";
      if (!contentType.startsWith("image/")) return null;
      return { contentType, data: new Uint8Array(await res.arrayBuffer()) };
    },
  };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Casa o nome em inglês da wiki com o catálogo da yatta (nome PT + ícone). */
export function matchMonster(nameEn: string, monsters: Monster[]): Monster | null {
  const byRoute = new Map(monsters.map((m) => [norm(m.route), m]));
  const base = nameEn.replace(/^Battle-Hardened\s+/i, "");
  const exact = byRoute.get(norm(nameEn)) ?? byRoute.get(norm(base));
  if (exact) return exact;
  // Nomes compostos ("Iniquitous Baptist - Caller of ...") casam pelo começo, preferindo a rota mais longa.
  const target = norm(base);
  let best: Monster | null = null;
  for (const m of monsters) {
    const r = norm(m.route);
    if (r.length > 8 && target.startsWith(r) && (!best || r.length > norm(best.route).length)) best = m;
  }
  return best;
}

export interface EnemyView {
  name: string;
  nameEn: string;
  count: number | null;
  wave: number;
  image: string | null;
}

async function resolveEnemies(cycle: WikiCycle, sources: AbyssSources, db: Db): Promise<Map<string, { name: string; image: string | null }>> {
  const names = [...new Set(cycle.floor12.flatMap((c) => c.halves.flatMap((h) => h.enemies.map((e) => e.nameEn))))];
  const monsters = await sources.fetchMonsters().catch(() => [] as Monster[]);
  const resolved = new Map<string, { name: string; image: string | null }>();
  const missing: string[] = [];
  for (const nameEn of names) {
    const m = matchMonster(nameEn, monsters);
    if (m) resolved.set(nameEn, { name: m.name, image: `https://gi.yatta.moe/assets/UI/monster/${m.icon}.png` });
    else missing.push(nameEn);
  }
  if (missing.length) {
    const wikiImages = await sources.fetchWikiImages(missing).catch(() => new Map<string, string | null>());
    for (const nameEn of missing) {
      const url = wikiImages.get(nameEn) ?? null;
      let image: string | null = null;
      if (url) {
        const existing = await db.abyssImage.findUnique({ where: { sourceUrl: url }, select: { id: true } });
        if (existing) image = `/api/abyss/images/${existing.id}`;
        else {
          const file = await sources.downloadImage(url).catch(() => null);
          if (file) {
            const saved = await db.abyssImage.create({ data: { sourceUrl: url, contentType: file.contentType, data: Buffer.from(file.data) }, select: { id: true } });
            image = `/api/abyss/images/${saved.id}`;
          }
        }
      }
      resolved.set(nameEn, { name: nameEn, image });
    }
  }
  return resolved;
}

export interface SyncCycleResult {
  key: string;
  status: "created" | "updated" | "adopted" | "missing";
  cycleId?: string;
}

const serverOffset = () => Number(process.env.ABYSS_SERVER_UTC_OFFSET ?? -5);

function cycleName(key: string) {
  return `Abismo ${key.slice(0, 7)}`;
}

/** Sincroniza um ciclo pela chave da wiki (data de início, ex.: "2026-11-16"). */
export async function syncAbyssCycle(
  key: string,
  options: { sources?: AbyssSources; db?: Db; actorId?: string | null } = {},
): Promise<SyncCycleResult> {
  const sources = options.sources ?? defaultAbyssSources();
  const db = options.db ?? prisma;
  const wikitext = await sources.fetchCycleWikitext(key);
  const parsed = wikitext ? parseWikiCycle(wikitext) : null;
  if (!parsed) return { key, status: "missing" };

  const offset = serverOffset();
  const startsAt = abyssResetAt(parsed.start, offset);
  const nextKey = parsed.next ?? `${new Date(Date.UTC(Number(parsed.start.slice(0, 4)), Number(parsed.start.slice(5, 7)), 16)).toISOString().slice(0, 10)}`;
  const endsAt = abyssResetAt(nextKey, offset);
  const enemies = await resolveEnemies(parsed, sources, db);

  const challenges = parsed.floor12.flatMap((c) =>
    c.halves.map((h) => {
      const translated = h.disorderEn.map(translateDisorder);
      return {
        chamber: c.chamber,
        half: h.half === 1 ? ("FIRST" as const) : ("SECOND" as const),
        enemyLevel: c.level,
        target: translateTarget(c.targetEn),
        leyLineDisorder: translated.map((t) => t.pt).join(" · ") || null,
        leyLineDisorderEn: h.disorderEn.join(" · ") || null,
        enemies: h.enemies.map<EnemyView>((e) => ({ ...e, name: enemies.get(e.nameEn)?.name ?? e.nameEn, image: enemies.get(e.nameEn)?.image ?? null })),
      };
    }),
  );

  return db.$transaction(async (tx) => {
    let cycle = await tx.abyssCycle.findUnique({ where: { externalKey: parsed.start } });
    let status: SyncCycleResult["status"] = cycle ? "updated" : "created";
    if (!cycle) {
      // Aproveita um ciclo cadastrado à mão para o mesmo período (ex.: criado pelo seed).
      const window = 36 * 3600_000;
      cycle = await tx.abyssCycle.findFirst({
        where: { externalKey: null, startsAt: { gte: new Date(startsAt.getTime() - window), lte: new Date(startsAt.getTime() + window) } },
        orderBy: { startsAt: "asc" },
      });
      if (cycle) status = "adopted";
    }
    const data = { startsAt, endsAt, source: "WIKI" as const, externalKey: parsed.start, nextKey, syncedAt: new Date() };
    cycle = cycle
      ? await tx.abyssCycle.update({ where: { id: cycle.id }, data })
      : await tx.abyssCycle.create({ data: { ...data, name: cycleName(parsed.start), rules: DEFAULT_RULES } });

    for (const c of challenges) {
      const fields = {
        enemyLevel: c.enemyLevel,
        target: c.target,
        leyLineDisorder: c.leyLineDisorder,
        leyLineDisorderEn: c.leyLineDisorderEn,
        enemies: c.enemies as unknown as Prisma.InputJsonValue,
      };
      await tx.abyssChallenge.upsert({
        where: { cycleId_floor_chamber_half: { cycleId: cycle.id, floor: 12, chamber: c.chamber, half: c.half } },
        // Novas metades entram válidas; em atualizações, a escolha do admin (enabled) é preservada.
        create: { cycleId: cycle.id, floor: 12, chamber: c.chamber, half: c.half, enabled: true, ...fields },
        update: fields,
      });
    }
    if (status !== "updated") {
      await writeAuditLog(tx, {
        adminId: options.actorId ?? null,
        action: status === "adopted" ? "ABYSS_CYCLE_SYNC_ADOPTED" : "ABYSS_CYCLE_SYNC_CREATED",
        entityType: "AbyssCycle",
        entityId: cycle.id,
        after: { key: parsed.start, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      });
    }
    return { key, status, cycleId: cycle.id };
  });
}

/** Sincroniza o ciclo vigente e o próximo (se a wiki já tiver publicado). */
export async function syncAbyss(options: { now?: Date; sources?: AbyssSources; db?: Db; actorId?: string | null } = {}) {
  const now = options.now ?? new Date();
  const { current, next } = cycleKeysAround(now, serverOffset());
  const results: SyncCycleResult[] = [];
  for (const key of [current, next]) results.push(await syncAbyssCycle(key, options));
  return results;
}

/** Job: tenta de hora em hora enquanto faltar o ciclo vigente ou o próximo (nos 3 dias antes da virada); senão, uma vez por dia. */
export async function abyssSyncPeriod(now: Date, db: Db = prisma): Promise<string> {
  const offset = serverOffset();
  const { current, next } = cycleKeysAround(now, offset);
  const [hasCurrent, hasNext] = await Promise.all([
    db.abyssCycle.count({ where: { externalKey: current } }),
    db.abyssCycle.count({ where: { externalKey: next } }),
  ]);
  const nearNext = now.getTime() >= abyssResetAt(next, offset).getTime() - 3 * 24 * 3600_000;
  return !hasCurrent || (!hasNext && nearNext) ? now.toISOString().slice(0, 13) : now.toISOString().slice(0, 10);
}
