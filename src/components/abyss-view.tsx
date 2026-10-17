import { Sparkles } from "lucide-react";
import { hasAbyssHp, notableResistances, RESISTANCE_LABEL, totalHp, type HpSource, type ResistanceKey, type ResolvedAbyssEnemy } from "@/domain/abyss-enemy";
import { ELEMENT_META } from "@/domain/catalog";
import { cn } from "@/lib/utils";

export type AbyssEnemyView = ResolvedAbyssEnemy;

export interface AbyssChallengeView {
  floor: number;
  chamber: number;
  half: "FIRST" | "SECOND";
  enabled?: boolean;
  enemyLevel?: number | null;
  target?: string | null;
  leyLineDisorder?: string | null;
  hpMultiplier?: number | null;
  enemies?: AbyssEnemyView[] | null;
}

export const formatHp = (hp: number) => hp.toLocaleString("pt-BR");

const HP_SOURCE_LABEL: Record<HpSource, string> = {
  abyss: "HP no Abismo (HP base × multiplicador da metade)",
  manual: "HP no Abismo informado pela administração",
};

const resistanceColor = (key: ResistanceKey) => (key === "PHYSICAL" ? "#c9c3d6" : ELEMENT_META[key].color);

function Enemy({ enemy, size }: { enemy: AbyssEnemyView; size: number }) {
  const resistances = notableResistances(enemy.resistances);
  return (
    <figure className="flex flex-col items-center gap-1 text-center" style={{ width: size + 52 }} title={enemy.name !== enemy.nameEn ? `${enemy.name} (${enemy.nameEn})` : enemy.name}>
      <span className="relative grid place-items-center overflow-hidden rounded-xl bg-gradient-to-b from-[#2c2440] to-[#1b1830]" style={{ width: size, height: size }}>
        {enemy.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enemy.image} alt="" loading="lazy" className="size-full object-contain object-top" />
        ) : (
          <span className="text-xs text-muted-foreground">?</span>
        )}
        {enemy.count && enemy.count > 1 && (
          <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 text-[10px] font-bold text-white">×{enemy.count}</span>
        )}
      </span>
      <figcaption className="line-clamp-3 text-[11px] leading-tight">{enemy.name}</figcaption>
      {hasAbyssHp(enemy) && (
        <span className="text-[11px] font-semibold text-success tabular-nums" title={HP_SOURCE_LABEL[enemy.hpSource!]} data-testid="enemy-hp">
          {formatHp(enemy.hp)}
        </span>
      )}
      {resistances.length > 0 && (
        <span className="flex flex-wrap justify-center gap-0.5" title="Resistências fora do padrão de 10%">
          {resistances.map(([key, value]) => (
            <span key={key} className="rounded px-1 text-[9px] leading-4 font-semibold" style={{ color: resistanceColor(key), backgroundColor: `${resistanceColor(key)}1f` }}>
              {RESISTANCE_LABEL[key]} {value >= 1000 ? "imune" : `${value}%`}
            </span>
          ))}
        </span>
      )}
    </figure>
  );
}

function HalfView({ challenge, compact }: { challenge: AbyssChallengeView; compact?: boolean }) {
  const enemies = challenge.enemies ?? [];
  const waves = [...new Set(enemies.map((e) => e.wave))].sort((a, b) => a - b);
  const off = challenge.enabled === false;
  const total = totalHp(enemies);
  const mechanics = [...new Map(enemies.filter((e) => e.mechanics?.length).map((e) => [e.nameEn, e])).values()];
  return (
    <div className={cn("grid content-start gap-2 rounded-xl border border-border/70 bg-background/40 p-3", off && "opacity-45")}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-primary uppercase">{challenge.half === "FIRST" ? "1ª metade" : "2ª metade"}</span>
        {off && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">fora do formato</span>}
      </div>
      {challenge.leyLineDisorder && (
        <p className="flex gap-1.5 text-xs text-gold">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          {challenge.leyLineDisorder}
        </p>
      )}
      {enemies.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inimigos não informados.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {waves.map((wave, i) => (
            <div key={wave} className="flex items-start gap-2">
              {i > 0 && <span className="self-center text-[10px] text-muted-foreground">→</span>}
              {enemies
                .filter((e) => e.wave === wave)
                .map((e) => (
                  <Enemy key={`${wave}-${e.nameEn}`} enemy={e} size={compact ? 44 : 56} />
                ))}
            </div>
          ))}
        </div>
      )}
      {total !== null && (
        <p className="text-xs" data-testid="half-total-hp">
          <span className="text-muted-foreground">HP total: </span>
          <span className="font-semibold text-success tabular-nums">{formatHp(total)}</span>
        </p>
      )}
      {mechanics.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Mecânicas</summary>
          <div className="mt-1.5 grid gap-1.5">
            {mechanics.map((e) => (
              <p key={e.nameEn} className="whitespace-pre-line text-muted-foreground">
                <span className="font-medium text-foreground">{e.name}:</span> {e.mechanics!.join("\n")}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Câmaras do andar com as duas metades lado a lado (só as metades informadas). */
export function AbyssFloorView({ challenges, compact }: { challenges: AbyssChallengeView[]; compact?: boolean }) {
  const chambers = [...new Set(challenges.map((c) => `${c.floor}-${c.chamber}`))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <div className="grid gap-3">
      {chambers.map((key) => {
        const halves = challenges.filter((c) => `${c.floor}-${c.chamber}` === key).sort((a, b) => (a.half === "FIRST" ? -1 : 1) - (b.half === "FIRST" ? -1 : 1));
        const first = halves[0]!;
        return (
          <section key={key} className="grid gap-2">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-display font-semibold">
                Câmara {first.floor}-{first.chamber}
              </span>
              {first.enemyLevel && <span className="text-xs text-muted-foreground">Nível {first.enemyLevel}</span>}
              {first.target && <span className="text-xs text-muted-foreground">· {first.target}</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {halves.map((h) => (
                <HalfView key={h.half} challenge={h} compact={compact} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
