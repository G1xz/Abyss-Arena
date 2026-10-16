"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Loader2, Save, Search, X } from "lucide-react";
import { CharacterCard, CharacterIcon, CostPill, ElementDot } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, NativeSelect } from "@/components/ui/misc";
import { ELEMENT_META, ELEMENTS, WEAPON_LABEL, WEAPONS } from "@/domain/catalog";
import { evaluateDeck } from "@/domain/deck";
import { effectiveCost, type ConstellationOverrides, type CostRules } from "@/domain/pricing";
import { cn } from "@/lib/utils";
import { saveDeckAction } from "./actions";

export interface BuilderCharacter {
  id: string;
  name: string;
  element: string;
  weaponType: string;
  rarity: number;
  iconUrl: string | null;
  baseCost: number | null;
  overrides: ConstellationOverrides;
  isProvisional: boolean;
  /** Liberado para competição, com preço e presente na conta do jogador. */
  available: boolean;
  owned: boolean;
  constellation: number | null;
  level: number | null;
}

type SortKey = "cost-desc" | "cost-asc" | "name";

export function DeckBuilder({
  characters,
  rules,
  costRules,
  initial,
  versionLabel,
}: {
  characters: BuilderCharacter[];
  rules: { budget: number; minSize: number };
  costRules: CostRules;
  initial: { id?: string; name: string; characterIds: string[] };
  versionLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [selected, setSelected] = useState<string[]>(initial.characterIds);
  const [query, setQuery] = useState("");
  const [element, setElement] = useState("");
  const [weapon, setWeapon] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<SortKey>("cost-desc");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [pending, startTransition] = useTransition();

  // Custo efetivo com a constelação/nível da conta do jogador (o servidor recalcula ao salvar).
  const withCost = useMemo(
    () =>
      characters.map((c) => ({
        ...c,
        cost:
          c.baseCost === null || c.constellation === null || c.level === null
            ? null
            : effectiveCost({ baseCost: c.baseCost, rarity: c.rarity, constellation: c.constellation, level: c.level, overrides: c.overrides }, costRules),
      })),
    [characters, costRules],
  );
  const byId = useMemo(() => new Map(withCost.map((c) => [c.id, c])), [withCost]);
  const prices = useMemo(() => new Map(withCost.filter((c) => c.available && c.cost !== null).map((c) => [c.id, c.cost!])), [withCost]);
  const owned = useMemo(() => new Set(withCost.filter((c) => c.owned).map((c) => c.id)), [withCost]);
  const evaluation = evaluateDeck(selected, prices, rules, owned);
  const unavailableSelected = new Set(evaluation.issues.filter((i) => i.code === "UNAVAILABLE" || i.code === "NOT_OWNED").flatMap((i) => i.characterIds ?? []));
  const hasProvisional = characters.some((c) => c.isProvisional);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = withCost.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q)) &&
        (!element || c.element === element) &&
        (!weapon || c.weaponType === weapon) &&
        (!rarity || String(c.rarity) === rarity) &&
        (!onlyAvailable || c.available),
    );
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const diff = (a.cost ?? 0) - (b.cost ?? 0);
      return (sort === "cost-asc" ? diff : -diff) || a.name.localeCompare(b.name);
    });
    return list;
  }, [withCost, query, element, weapon, rarity, sort, onlyAvailable]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = () =>
    startTransition(async () => {
      const result = await saveDeckAction({ deckId: initial.id, name, characterIds: selected });
      if (result.ok) {
        toast.success("Deck salvo");
        router.push("/decks");
      } else {
        toast.error(result.error);
      }
    });

  const usedPct = Math.min(100, (evaluation.totalCost / rules.budget) * 100);
  const over = evaluation.excess > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Catálogo de personagens" className="min-w-0">
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_0.8fr_1fr]">
          <label className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <span className="sr-only">Buscar personagem</span>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome" className="pl-8" data-testid="deck-search" />
          </label>
          <NativeSelect value={element} onChange={(e) => setElement(e.target.value)} aria-label="Filtrar por elemento">
            <option value="">Todos os elementos</option>
            {ELEMENTS.map((e) => (
              <option key={e} value={e}>
                {ELEMENT_META[e].label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={weapon} onChange={(e) => setWeapon(e.target.value)} aria-label="Filtrar por arma">
            <option value="">Todas as armas</option>
            {WEAPONS.map((w) => (
              <option key={w} value={w}>
                {WEAPON_LABEL[w]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Filtrar por raridade">
            <option value="">★ Todas</option>
            <option value="5">5★</option>
            <option value="4">4★</option>
          </NativeSelect>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
            <option value="cost-desc">Maior preço</option>
            <option value="cost-asc">Menor preço</option>
            <option value="name">Nome</option>
          </NativeSelect>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="accent-[var(--primary)]" />
            Somente disponíveis (liberados e na sua conta)
          </label>
          <span>{visible.length} personagens</span>
          <span className="flex items-center gap-1">
            {sort === "cost-asc" ? <ArrowUpNarrowWide className="size-3.5" /> : <ArrowDownWideNarrow className="size-3.5" />} preços da tabela {versionLabel}
          </span>
          {hasProvisional && <span className="text-gold/80">* preço provisório (ainda não validado por dados competitivos)</span>}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7">
          {visible.map((c) => {
            const isSelected = selected.includes(c.id);
            return (
              <CharacterCard
                key={c.id}
                testId={`builder-char-${c.id}`}
                character={c}
                provisional={c.isProvisional}
                state={isSelected ? "selected" : c.available ? "default" : "disabled"}
                disabled={!c.available && !isSelected}
                onClick={() => toggle(c.id)}
              />
            );
          })}
        </div>
      </section>

      <aside className="lg:sticky lg:top-20 lg:h-fit" aria-label="Resumo do deck">
        <div className="rounded-xl border bg-card/90 p-4 shadow-lg backdrop-blur">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Nome do deck</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex.: Hiperbloom" data-testid="deck-name" />
          </label>

          <div className="mt-4" data-testid="deck-budget">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Orçamento</span>
              <span className={cn("font-display text-xl font-bold tabular", over ? "text-destructive" : "text-gold")}>
                {evaluation.totalCost}
                <span className="text-sm text-muted-foreground">/{rules.budget}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={evaluation.totalCost} aria-valuemax={rules.budget}>
              <div className={cn("h-full transition-all", over ? "bg-destructive" : "bg-gold")} style={{ width: `${usedPct}%` }} />
            </div>
            <p className={cn("mt-1 text-xs", over ? "text-destructive" : "text-muted-foreground")} data-testid="deck-remaining">
              {over ? `Excedido em ${evaluation.excess} ponto(s)` : `${evaluation.remaining} ponto(s) restantes`}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Personagens</span>
            <span className={cn("tabular", evaluation.size < rules.minSize ? "text-warning" : "text-foreground")}>
              {evaluation.size} <span className="text-muted-foreground">(mín. {rules.minSize})</span>
            </span>
          </div>

          <ul className="mt-3 grid max-h-80 gap-1.5 overflow-y-auto pr-1" data-testid="deck-selected">
            {selected.length === 0 && <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Clique nos personagens para adicioná-los.</li>}
            {selected.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <li key={id} className={cn("flex items-center gap-2 rounded-md border bg-background/40 p-1.5", unavailableSelected.has(id) && "border-destructive/50")}>
                  <CharacterIcon character={c} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {c.constellation !== null && <span className="text-[10px] text-muted-foreground">C{c.constellation}</span>}
                  <ElementDot element={c.element} className="size-2" />
                  {unavailableSelected.has(id) ? <Badge variant="destructive">indisponível</Badge> : <CostPill cost={c.cost} />}
                  <button type="button" onClick={() => toggle(id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remover ${c.name}`}>
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          {evaluation.issues.length > 0 && selected.length > 0 && (
            <ul className="mt-3 grid gap-1">
              {evaluation.issues.map((issue) => (
                <li key={issue.code} className="flex gap-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {issue.message}
                </li>
              ))}
            </ul>
          )}

          <Button className="mt-4 w-full" onClick={save} disabled={pending || !evaluation.valid || !name.trim()} data-testid="deck-save">
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar deck
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">O servidor revalida o deck ao salvar.</p>
        </div>
      </aside>
    </div>
  );
}
