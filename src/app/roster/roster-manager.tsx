"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ClipboardPaste, LayoutGrid, Loader2, PencilLine, Search, Trash2, Undo2, Upload } from "lucide-react";
import { CharacterCard, CharacterIcon, CostPill, ElementDot } from "@/components/character-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Label, NativeSelect, Textarea } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { ELEMENT_META, ELEMENTS } from "@/domain/catalog";
import { effectiveCost, type ConstellationOverrides, type CostRules } from "@/domain/pricing";
import { parseRosterText } from "@/domain/roster-import";
import { cn } from "@/lib/utils";
import { importRosterAction, removeOwnedCharacterAction, saveOwnedCharacterAction, saveRosterChangesAction } from "./actions";

export interface RosterCatalogItem {
  id: string;
  slug: string;
  name: string;
  element: string;
  rarity: number;
  iconUrl: string | null;
  baseCost: number | null;
  overrides: ConstellationOverrides;
  available: boolean;
}

interface Owned {
  characterId: string;
  constellation: number;
  level: number;
}

const LEVELS = [1, 20, 40, 50, 60, 70, 80, 90, 95, 100];

function costOf(c: RosterCatalogItem, constellation: number, level: number, rules: CostRules) {
  return c.baseCost === null ? null : effectiveCost({ baseCost: c.baseCost, rarity: c.rarity, constellation, level, overrides: c.overrides }, rules);
}

// ── Importar ────────────────────────────────────────────────────────────

function ImportPanel({ catalog, onDone }: { catalog: RosterCatalogItem[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [pending, start] = useTransition();
  const preview = useMemo(() => (text.trim() ? parseRosterText(text, catalog) : null), [text, catalog]);

  const submit = () =>
    start(async () => {
      const r = await importRosterAction({ text, mode });
      if (!r.ok) return void toast.error(r.error);
      const d = r.data;
      toast.success(`${d.recognized} personagens reconhecidos: ${d.created} novos, ${d.updated} atualizados${d.removed ? `, ${d.removed} removidos` : ""}.`);
      if (d.unknown.length) toast.warning(`Não reconhecidos: ${d.unknown.join(", ")}`);
      setText("");
      onDone();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"Cole aqui o texto copiado do HoYoLAB…\n\nNv.95\n6\nFurina\n\nNv.90\nOdette"}
          className="font-mono text-xs"
          data-testid="roster-paste"
        />
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect className="w-auto" value={mode} onChange={(e) => setMode(e.target.value as "replace" | "merge")} aria-label="Modo de importação">
            <option value="replace">Substituir minha lista pela colada</option>
            <option value="merge">Só adicionar/atualizar os colados</option>
          </NativeSelect>
          <Button onClick={submit} disabled={pending || !preview?.entries.length} data-testid="roster-import">
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} Importar {preview?.entries.length ? `(${preview.entries.length})` : ""}
          </Button>
        </div>
      </div>
      <aside className="grid h-fit gap-3 rounded-xl border bg-background/40 p-4 text-sm">
        <p className="font-medium">Como copiar</p>
        <ol className="grid list-decimal gap-1 pl-4 text-muted-foreground">
          <li>Abra o HoYoLAB → Battle Chronicle → Personagens.</li>
          <li>
            Pressione <kbd className="rounded border px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border px-1 text-xs">A</kbd> e depois{" "}
            <kbd className="rounded border px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border px-1 text-xs">C</kbd>.
          </li>
          <li>Cole ao lado. Nível e constelação são lidos automaticamente.</li>
        </ol>
        {preview && (
          <div className="grid gap-2 border-t pt-3" data-testid="roster-preview">
            <p>
              <span className="font-semibold text-success">{preview.entries.length}</span> personagens reconhecidos
              {preview.ignored.length > 0 && <span className="text-muted-foreground"> · {preview.ignored.length} ignorados (não jogáveis)</span>}
            </p>
            {preview.unknown.length > 0 && <p className="text-xs text-warning">Não encontrados: {preview.unknown.map((u) => u.name).join(", ")}</p>}
            <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {preview.entries.map((e) => (
                <Badge key={e.name} variant="secondary">
                  {e.name} · C{e.constellation} · Nv.{e.level}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Editar manualmente ──────────────────────────────────────────────────

interface Row {
  owned: boolean;
  constellation: number;
  level: number;
}

function ConstellationPicker({ value, onChange, disabled }: { value: number; onChange: (c: number) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md border bg-background/50 p-0.5" role="radiogroup" aria-label="Constelação">
      {[0, 1, 2, 3, 4, 5, 6].map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn(
            "h-7 w-7 rounded text-xs font-semibold tabular transition-colors disabled:opacity-40",
            value === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          C{c}
        </button>
      ))}
    </div>
  );
}

function ManualEditor({ catalog, roster, costRules }: { catalog: RosterCatalogItem[]; roster: Owned[]; costRules: CostRules }) {
  const original = useMemo(() => new Map(roster.map((o) => [o.characterId, o])), [roster]);
  const [edits, setEdits] = useState<Map<string, Row>>(new Map());
  const [query, setQuery] = useState("");
  const [element, setElement] = useState("");
  const [rarity, setRarity] = useState("");
  const [scope, setScope] = useState<"all" | "owned">("all");
  const [pending, start] = useTransition();

  const rowOf = (id: string): Row => {
    const edited = edits.get(id);
    if (edited) return edited;
    const o = original.get(id);
    return o ? { owned: true, constellation: o.constellation, level: o.level } : { owned: false, constellation: 0, level: 90 };
  };
  const update = (id: string, patch: Partial<Row>) =>
    setEdits((cur) => {
      const next = new Map(cur);
      const row = { ...rowOf(id), ...patch };
      const o = original.get(id);
      const unchanged = o ? row.owned && row.constellation === o.constellation && row.level === o.level : !row.owned;
      if (unchanged) next.delete(id);
      else next.set(id, row);
      return next;
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!element || c.element === element) && (!rarity || String(c.rarity) === rarity))
      .filter((c) => scope === "all" || rowOf(c.id).owned)
      .sort((a, b) => Number(rowOf(b.id).owned) - Number(rowOf(a.id).owned) || b.rarity - a.rarity || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query, element, rarity, scope, edits, original]);

  const save = () =>
    start(async () => {
      const upserts = [...edits].filter(([, r]) => r.owned).map(([characterId, r]) => ({ characterId, constellation: r.constellation, level: r.level }));
      const removals = [...edits].filter(([, r]) => !r.owned).map(([characterId]) => characterId);
      const res = await saveRosterChangesAction({ upserts, removals });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Conta atualizada: ${res.data.saved} salvo(s), ${res.data.removed} removido(s).`);
      setEdits(new Map());
    });

  const markVisible = (owned: boolean) => visible.forEach((c) => update(c.id, { owned }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <span className="sr-only">Buscar</span>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar personagem" className="w-52 pl-8" data-testid="manual-search" />
        </label>
        <div className="flex items-center gap-1 rounded-md border bg-background/40 p-1">
          {ELEMENTS.map((e) => (
            <button
              key={e}
              type="button"
              title={ELEMENT_META[e].label}
              aria-pressed={element === e}
              onClick={() => setElement(element === e ? "" : e)}
              className={cn("grid size-7 place-items-center rounded", element === e ? "bg-accent" : "hover:bg-accent/60")}
            >
              <ElementDot element={e} />
            </button>
          ))}
        </div>
        <NativeSelect className="w-28" value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Raridade">
          <option value="">★ Todas</option>
          <option value="5">5★</option>
          <option value="4">4★</option>
        </NativeSelect>
        <NativeSelect className="w-52" value={scope} onChange={(e) => setScope(e.target.value as "all" | "owned")} aria-label="Exibir">
          <option value="all">Todos os personagens</option>
          <option value="owned">Só os que tenho</option>
        </NativeSelect>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => markVisible(true)}>
            Marcar filtrados
          </Button>
          <Button size="sm" variant="ghost" onClick={() => markVisible(false)}>
            Desmarcar filtrados
          </Button>
        </div>
      </div>

      <ul className="grid gap-2 xl:grid-cols-2" data-testid="manual-list">
        {visible.map((c) => {
          const row = rowOf(c.id);
          const dirty = edits.has(c.id);
          const cost = row.owned ? costOf(c, row.constellation, row.level, costRules) : null;
          return (
            <li
              key={c.id}
              data-testid={`manual-row-${c.slug}`}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-3 py-2 transition-colors",
                row.owned ? "border-border" : "border-dashed opacity-70",
                dirty && "border-primary/60 bg-primary/5",
              )}
            >
              <CharacterIcon character={c} size={44} className={cn(!row.owned && "grayscale")} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ElementDot element={c.element} className="size-2" /> {ELEMENT_META[c.element as keyof typeof ELEMENT_META]?.label} · {c.rarity}★
                  {!c.available && <span className="text-warning">· fora da competição</span>}
                </p>
              </div>
              <ConstellationPicker value={row.constellation} disabled={!row.owned} onChange={(constellation) => update(c.id, { constellation })} />
              <NativeSelect
                className="h-8 w-24"
                value={row.level}
                disabled={!row.owned}
                onChange={(e) => update(c.id, { level: Number(e.target.value) })}
                aria-label={`Nível de ${c.name}`}
              >
                {[...new Set([...LEVELS, row.level])]
                  .sort((a, b) => b - a)
                  .map((l) => (
                    <option key={l} value={l}>
                      Nv.{l}
                    </option>
                  ))}
              </NativeSelect>
              <span className="w-12 text-right">{cost !== null ? <CostPill cost={cost} /> : <span className="text-xs text-muted-foreground">—</span>}</span>
              <Switch checked={row.owned} onCheckedChange={(owned) => update(c.id, { owned })} aria-label={`Tenho ${c.name}`} data-testid={`own-${c.slug}`} />
            </li>
          );
        })}
      </ul>

      {edits.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-primary/50 bg-popover/95 px-4 py-3 shadow-2xl backdrop-blur" data-testid="roster-dirty-bar">
          <PencilLine className="size-4 text-primary" />
          <p className="flex-1 text-sm">
            <span className="font-semibold">{edits.size}</span> alteração(ões) não salva(s)
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEdits(new Map())} disabled={pending}>
            <Undo2 /> Descartar
          </Button>
          <Button size="sm" onClick={save} disabled={pending} data-testid="roster-save">
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Minha conta (visão geral) ───────────────────────────────────────────

function EditDialog({ character, owned, onClose, costRules }: { character: RosterCatalogItem; owned: Owned; onClose: () => void; costRules: CostRules }) {
  const [constellation, setConstellation] = useState(owned.constellation);
  const [level, setLevel] = useState(owned.level);
  const [pending, start] = useTransition();
  const cost = costOf(character, constellation, level, costRules);
  const save = () =>
    start(async () => {
      const r = await saveOwnedCharacterAction({ characterId: character.id, constellation, level });
      if (r.ok) {
        toast.success(`${character.name} atualizado`);
        onClose();
      } else toast.error(r.error);
    });
  const remove = () =>
    start(async () => {
      const r = await removeOwnedCharacterAction(character.id);
      if (r.ok) {
        toast.success(`${character.name} removido da sua conta`);
        onClose();
      } else toast.error(r.error);
    });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CharacterIcon character={character} size={52} />
            <div>
              <DialogTitle>{character.name}</DialogTitle>
              <DialogDescription>Custo atual no seu deck: {cost ?? "—"} pontos</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Constelação</Label>
            <ConstellationPicker value={constellation} onChange={setConstellation} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lv">Nível</Label>
            <NativeSelect id="lv" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {[...new Set([...LEVELS, level])]
                .sort((a, b) => b - a)
                .map((l) => (
                  <option key={l} value={l}>
                    Nv.{l}
                  </option>
                ))}
            </NativeSelect>
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
            <Trash2 /> Remover
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RosterManager({ catalog, roster, costRules }: { catalog: RosterCatalogItem[]; roster: Owned[]; costRules: CostRules }) {
  const [tab, setTab] = useState(roster.length ? "account" : "import");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const ownedMap = useMemo(() => new Map(roster.map((o) => [o.characterId, o])), [roster]);

  const owned = roster
    .map((o) => ({ o, c: byId.get(o.characterId)! }))
    .filter(({ c }) => c && c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.c.rarity - a.c.rarity || b.o.level - a.o.level || a.c.name.localeCompare(b.c.name));
  const fives = roster.filter((o) => byId.get(o.characterId)?.rarity === 5).length;
  const editingChar = editing ? byId.get(editing) : null;

  return (
    <Tabs value={tab} onValueChange={setTab} className="grid gap-5">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="account">
          <LayoutGrid className="size-4" /> Minha conta
        </TabsTrigger>
        <TabsTrigger value="manual" data-testid="tab-manual">
          <PencilLine className="size-4" /> Editar manualmente
        </TabsTrigger>
        <TabsTrigger value="import" data-testid="tab-import">
          <ClipboardPaste className="size-4" /> Importar do HoYoLAB
        </TabsTrigger>
      </TabsList>

      <TabsContent value="account" className="grid gap-4">
        {roster.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
            <p className="font-display text-lg font-semibold">Sua conta ainda está vazia</p>
            <p className="max-w-md text-sm text-muted-foreground">Importe a lista do HoYoLAB ou adicione os personagens manualmente.</p>
            <div className="flex gap-2">
              <Button onClick={() => setTab("import")}>
                <ClipboardPaste /> Importar
              </Button>
              <Button variant="outline" onClick={() => setTab("manual")}>
                <PencilLine /> Adicionar manualmente
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{roster.length}</span> personagens · {fives} 5★ · {roster.length - fives} 4★
              </p>
              <label className="relative ml-auto">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <span className="sr-only">Buscar</span>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="w-48 pl-8" />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-8" data-testid="roster-grid">
              {owned.map(({ o, c }) => (
                <CharacterCard
                  key={c.id}
                  testId={`roster-char-${c.id}`}
                  character={{ ...c, cost: costOf(c, o.constellation, o.level, costRules), constellation: o.constellation, level: o.level }}
                  state={c.available ? "default" : "disabled"}
                  onClick={() => setEditing(c.id)}
                />
              ))}
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="manual">
        <ManualEditor key={roster.map((o) => `${o.characterId}:${o.constellation}:${o.level}`).join("|")} catalog={catalog} roster={roster} costRules={costRules} />
      </TabsContent>

      <TabsContent value="import">
        <ImportPanel catalog={catalog} onDone={() => setTab("account")} />
      </TabsContent>

      {editingChar && ownedMap.get(editingChar.id) && (
        <EditDialog key={editingChar.id} character={editingChar} owned={ownedMap.get(editingChar.id)!} costRules={costRules} onClose={() => setEditing(null)} />
      )}
    </Tabs>
  );
}
