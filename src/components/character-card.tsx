import { Ban, Check, Lock, Star } from "lucide-react";
import { ELEMENT_META, type ElementKey } from "@/domain/catalog";
import { cn } from "@/lib/utils";

export type CharacterCardState = "default" | "selected" | "banned" | "picked" | "disabled" | "pickable" | "bannable";

export interface CharacterCardData {
  id: string;
  name: string;
  element: string;
  rarity: number;
  iconUrl: string | null;
  cost: number | null;
  /** Constelação e nível declarados pelo jogador (quando aplicável). */
  constellation?: number | null;
  level?: number | null;
}

/** Selo de constelação (C0–C6) e nível. Nível 95/100 em 5★ é destacado (afeta o custo). */
export function ConstellationBadge({ constellation, level, rarity, className }: { constellation?: number | null; level?: number | null; rarity?: number; className?: string }) {
  if (constellation === null || constellation === undefined) return null;
  const boosted = rarity === 5 && (level ?? 0) >= 95;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white ring-1 ring-white/15", className)}>
      <span className={constellation >= 6 ? "text-gold" : constellation > 0 ? "text-primary" : "text-muted-foreground"}>C{constellation}</span>
      {level !== null && level !== undefined && <span className={boosted ? "text-gold" : "font-normal text-white/70"}>Nv.{level}</span>}
    </span>
  );
}

export function ElementDot({ element, className }: { element: string; className?: string }) {
  const meta = ELEMENT_META[element as ElementKey];
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: meta?.color ?? "#888", boxShadow: `0 0 8px ${meta?.color ?? "#888"}` }}
      title={meta?.label}
      aria-label={meta?.label}
    />
  );
}

export function CostPill({ cost, className, provisional }: { cost: number | null; className?: string; provisional?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 font-display text-xs font-bold text-gold tabular ring-1 ring-gold/30",
        className,
      )}
      title={provisional ? "Preço provisório" : "Custo em pontos"}
    >
      {cost ?? "—"}
      {provisional && <span className="text-[9px] font-normal text-gold/70">*</span>}
    </span>
  );
}

export function CharacterIcon({ character, size = 48, className }: { character: Pick<CharacterCardData, "iconUrl" | "name" | "rarity" | "element">; size?: number; className?: string }) {
  const meta = ELEMENT_META[character.element as ElementKey];
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-md", character.rarity === 5 ? "bg-gradient-to-b from-[#7a5a2a] to-[#3a2a1a]" : "bg-gradient-to-b from-[#5a4a8a] to-[#2a2440]", className)}
      style={{ width: size, height: size, boxShadow: `inset 0 -2px 0 ${meta?.color ?? "#888"}` }}
    >
      {character.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.iconUrl} alt={character.name} width={size} height={size} loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-xs">{character.name.slice(0, 2)}</span>
      )}
    </span>
  );
}

export function CharacterCard({
  character,
  state = "default",
  onClick,
  disabled,
  provisional,
  footer,
  compact,
  testId,
}: {
  character: CharacterCardData;
  state?: CharacterCardState;
  onClick?: () => void;
  disabled?: boolean;
  provisional?: boolean;
  footer?: React.ReactNode;
  compact?: boolean;
  testId?: string;
}) {
  const meta = ELEMENT_META[character.element as ElementKey];
  const interactive = Boolean(onClick) && !disabled;
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={onClick ? disabled : undefined}
      data-testid={testId}
      data-state={state}
      aria-pressed={onClick && (state === "selected" || state === "picked") ? true : undefined}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all",
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_6px_24px_-10px_var(--primary)]",
        state === "selected" && "border-primary ring-2 ring-primary/60",
        state === "picked" && "border-pick ring-2 ring-pick/60",
        state === "pickable" && "border-pick/40",
        state === "bannable" && "border-ban/40 hover:border-ban",
        state === "banned" && "opacity-45 grayscale",
        (state === "disabled" || disabled) && !["banned", "picked", "selected"].includes(state) && "opacity-40",
      )}
    >
      <div
        className={cn("relative aspect-square w-full", character.rarity === 5 ? "bg-gradient-to-b from-[#8a6530] to-[#3b2a19]" : "bg-gradient-to-b from-[#62509a] to-[#2a2442]")}
      >
        {character.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.iconUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center text-lg font-bold">{character.name.slice(0, 2)}</span>
        )}
        <CostPill cost={character.cost} provisional={provisional} className="absolute top-1.5 right-1.5" />
        <ConstellationBadge constellation={character.constellation} level={character.level} rarity={character.rarity} className="absolute bottom-1.5 left-1.5" />
        {state === "banned" && (
          <span className="absolute inset-0 grid place-items-center bg-ban/25">
            <Ban className="size-1/2 text-ban drop-shadow" strokeWidth={2.5} />
          </span>
        )}
        {(state === "selected" || state === "picked") && (
          <span className={cn("absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full", state === "picked" ? "bg-pick text-black" : "bg-primary text-white")}>
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
        {state === "disabled" && (
          <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-black/70">
            <Lock className="size-3" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: meta?.color }} />
      </div>
      <div className={cn("flex flex-col gap-0.5 px-2", compact ? "py-1" : "py-1.5")}>
        <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")} title={character.name}>
          {character.name}
        </span>
        {!compact && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ElementDot element={character.element} className="size-2" />
            {meta?.label}
            <span className="ml-auto flex items-center text-gold/80">
              {character.rarity}
              <Star className="size-3 fill-current" />
            </span>
          </span>
        )}
        {footer}
      </div>
    </Comp>
  );
}
