/**
 * Leitura das páginas de ciclo do Abismo Espiral da wiki do Fandom
 * (ex.: "Spiral_Abyss/Floors/2026-10-16"), apenas o andar 12.
 *
 * Formato (wikitext):
 *   {{Abyssal Moon Spire |start = 2026-10-16 |end = 2026-11-15 |next = 2026-11-16 ...}}
 *   ===Floor 12===
 *   ** {{Color|menu|First Half}}: Characters' Stellar Glimmer reaction DMG increased by 75%.
 *   {{Domain Enemies |level1 = 95 |target1 = ... |enemies1_1 = A*2// B; C |enemies1_2 = ... }}
 * Ondas são separadas por "//", inimigos da mesma onda por ";", quantidade por "*N".
 */
import type { ElementKey } from "./catalog";

export interface WikiEnemy {
  nameEn: string;
  /** Quantidade (null quando a wiki não informa ou usa "?"). */
  count: number | null;
  wave: number;
}

export interface WikiHalf {
  half: 1 | 2;
  enemies: WikiEnemy[];
  disorderEn: string[];
}

export interface WikiChamber {
  chamber: number;
  level: number | null;
  targetEn: string | null;
  halves: WikiHalf[];
}

export interface WikiCycle {
  start: string;
  end: string | null;
  next: string | null;
  floor12: WikiChamber[];
}

function templateParam(block: string, key: string): string | null {
  const m = new RegExp(`\\|\\s*${key}\\s*=([^\\n|]*)`).exec(block);
  const value = m?.[1]?.trim();
  return value ? value : null;
}

function stripMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{Color\|[^|}]*\|([^}]*)\}\}/g, "$1")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/g, " ")
    .trim();
}

export function parseEnemyList(value: string | null): WikiEnemy[] {
  if (!value) return [];
  const enemies: WikiEnemy[] = [];
  stripMarkup(value)
    .split("//")
    .forEach((wave, waveIndex) => {
      for (const raw of wave.split(";")) {
        const m = /^(.*?)\s*(?:\*\s*(\d+|\?)\s*\??)?\s*$/.exec(raw.trim());
        const nameEn = (m?.[1] ?? raw).replace(/\*/g, "").trim();
        if (!nameEn) continue;
        const count = m?.[2] && m[2] !== "?" ? Number(m[2]) : null;
        enemies.push({ nameEn, count, wave: waveIndex + 1 });
      }
    });
  return enemies;
}

/** Lê a página de um ciclo. Retorna null se o andar 12 não estiver presente. */
export function parseWikiCycle(wikitext: string): WikiCycle | null {
  const header = /\{\{[^{}|]*\n?((?:\|[^\n]*\n?)+)\}\}/.exec(wikitext)?.[0] ?? "";
  const start = templateParam(header, "start");
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  const at = wikitext.indexOf("===Floor 12===");
  if (at === -1) return null;
  const rest = wikitext.slice(at + "===Floor 12===".length);
  const nextHeading = rest.search(/\n==[^=]/);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

  const disorders: { half: 1 | 2 | null; text: string }[] = [];
  for (const line of section.split("\n")) {
    const m = /^\*\*\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const text = stripMarkup(m[1]!);
    const halfMatch = /^(First|Second) Half\s*:\s*(.+)$/i.exec(text);
    if (halfMatch) disorders.push({ half: halfMatch[1]!.toLowerCase() === "first" ? 1 : 2, text: halfMatch[2]!.trim() });
    else disorders.push({ half: null, text });
  }

  const enemiesBlock = /\{\{Domain Enemies([\s\S]*?)\n\}\}/.exec(section)?.[1] ?? "";
  const floor12: WikiChamber[] = [1, 2, 3].map((chamber) => {
    const level = templateParam(enemiesBlock, `level${chamber}`);
    return {
      chamber,
      level: level && /^\d+$/.test(level) ? Number(level) : null,
      targetEn: templateParam(enemiesBlock, `target${chamber}`),
      halves: ([1, 2] as const).map((half) => ({
        half,
        enemies: parseEnemyList(templateParam(enemiesBlock, `enemies${chamber}_${half}`)),
        disorderEn: disorders.filter((d) => d.half === null || d.half === half).map((d) => d.text),
      })),
    };
  });
  if (floor12.every((c) => c.halves.every((h) => h.enemies.length === 0))) return null;

  return { start, end: templateParam(header, "end"), next: templateParam(header, "next"), floor12 };
}

// ── Tradução das perturbações e metas ────────────────────────────────────

const ELEMENTS_EN: Record<string, ElementKey> = {
  pyro: "PYRO",
  hydro: "HYDRO",
  anemo: "ANEMO",
  electro: "ELECTRO",
  dendro: "DENDRO",
  cryo: "CRYO",
  geo: "GEO",
};

const REACTIONS_PT: Record<string, string> = {
  overloaded: "Sobrecarregado",
  "electro-charged": "Eletricamente Carregado",
  superconduct: "Supercondução",
  swirl: "Redemoinho",
  crystallize: "Cristalização",
  bloom: "Florescimento",
  hyperbloom: "Hiperflorescimento",
  burgeon: "Germinação",
  burning: "Queima",
  shatter: "Estilhaçamento",
  "lunar-charged": "Carga Lunar",
  "lunar-bloom": "Florescimento Lunar",
  "lunar-crystallize": "Cristalização Lunar",
  vaporize: "Vaporização",
  melt: "Derretimento",
  quicken: "Catálise",
  aggravate: "Agravamento",
  spread: "Propagação",
};

const ATTACKS_PT: Record<string, string> = {
  "normal attack": "Ataque Normal",
  "charged attack": "Ataque Carregado",
  "plunging attack": "Ataque Imersivo",
  "elemental skill": "Habilidade Elemental",
  "elemental burst": "Supremo Elemental",
};

/** Traduz os padrões mais comuns; o que não for reconhecido fica no original. */
export function translateDisorder(en: string): { pt: string; elements: ElementKey[] } {
  const text = en.trim().replace(/\.$/, "");
  const elements = [...new Set(Object.entries(ELEMENTS_EN).filter(([k]) => new RegExp(`\\b${k}\\b`, "i").test(text)).map(([, v]) => v))];

  let m = /^All party members gain an? (\d+)% (\w+) DMG Bonus$/i.exec(text);
  if (m) {
    const el = m[2]!.toLowerCase() === "physical" ? "Físico" : m[2]!;
    return { pt: `Todos os membros da equipe recebem ${m[1]}% de Bônus de Dano ${el}.`, elements };
  }
  m = /^(?:Characters'|Character|All party members'?)\s+(.+?)\s+(?:reaction\s+)?DMG (?:is )?increased by (\d+)%$/i.exec(text);
  if (m) {
    const key = m[1]!.toLowerCase();
    const name = ATTACKS_PT[key] ? `de ${ATTACKS_PT[key]}` : REACTIONS_PT[key] ? `da reação ${REACTIONS_PT[key]}` : `da reação ${m[1]}`;
    return { pt: `Dano ${name} dos personagens aumentado em ${m[2]}%.`, elements };
  }
  m = /^(.+?) DMG (?:is )?increased by (\d+)%$/i.exec(text);
  if (m) {
    const key = m[1]!.toLowerCase();
    const name = ATTACKS_PT[key] ?? (REACTIONS_PT[key] ? `da reação ${REACTIONS_PT[key]}` : m[1]!);
    return { pt: `Dano ${ATTACKS_PT[key] ? `de ${name}` : name} aumentado em ${m[2]}%.`, elements };
  }
  return { pt: en.trim(), elements };
}

export function translateTarget(en: string | null): string | null {
  if (!en) return null;
  const time = /Remaining challenge time longer than \(?([\d/]+)\)? sec/i.exec(en);
  if (time) return `Tempo restante maior que ${time[1]} s`;
  const defense = /Target defense progress greater than \(?([\d/]+)\)?%/i.exec(en);
  if (defense) return `Progresso de defesa do alvo maior que ${defense[1]}%`;
  return en;
}

// ── Datas ────────────────────────────────────────────────────────────────

/**
 * O Abismo vira às 04:00 do horário do servidor. Padrão: servidor América (UTC-5),
 * o mesmo dos jogadores do Brasil (06:00 de Brasília).
 */
export function abyssResetAt(dateKey: string, serverUtcOffsetHours = -5): Date {
  const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, 4 - serverUtcOffsetHours));
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ciclos começam no dia 16 de cada mês: chave do ciclo vigente e do próximo. */
export function cycleKeysAround(now: Date, serverUtcOffsetHours = -5): { current: string; next: string } {
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-16`;
  const started = abyssResetAt(thisMonth, serverUtcOffsetHours) <= now;
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (started ? 0 : -1), 16));
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 16));
  return { current: toDateKey(base), next: toDateKey(next) };
}
