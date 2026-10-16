import type { Metadata } from "next";
import { Layers as LayersIcon } from "lucide-react";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { CharacterIcon } from "@/components/character-card";
import { EmptyState, PageContainer, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { requireUser } from "@/server/auth/next";
import { listUserDecks } from "@/server/decks/service";
import { DeckActions } from "./deck-actions";

export const metadata: Metadata = { title: "Meus decks" };

export default async function DecksPage() {
  const user = await requireUser("/decks");
  const decks = await listUserDecks(user.id);
  return (
    <PageContainer>
      <PageHeader
        icon={LayersIcon} eyebrow="Biblioteca"
        title="Meus decks"
        description="Decks são avaliados sempre com a tabela de preços vigente. Se uma atualização deixar um deck acima do orçamento, ele é mantido e você pode ajustá-lo."
        actions={
          <Button asChild>
            <Link href="/decks/new">
              <Plus /> Novo deck
            </Link>
          </Button>
        }
      />
      {decks.length === 0 ? (
        <EmptyState
          title="Nenhum deck ainda"
          description="Monte um deck dentro do orçamento para poder criar ou entrar em salas."
          action={
            <Button asChild>
              <Link href="/decks/new">Montar primeiro deck</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {decks.map((deck) => (
            <article key={deck.id} className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-5" data-testid="deck-card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-lg font-semibold">{deck.name}</h2>
                {deck.isDefault && <Badge variant="secondary">padrão</Badge>}
                {deck.evaluation.valid ? <Badge variant="success">válido</Badge> : <Badge variant="destructive">inválido</Badge>}
                <span className="ml-auto font-display text-lg font-bold text-gold tabular">
                  {deck.evaluation.totalCost}
                  <span className="text-sm text-muted-foreground">/{deck.evaluation.budget}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={deck.evaluation.excess > 0 ? "h-full bg-destructive" : "h-full bg-gold"}
                  style={{ width: `${Math.min(100, (deck.evaluation.totalCost / deck.evaluation.budget) * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {deck.characters.map((c) => (
                  <span key={c.characterId} className="relative">
                    <CharacterIcon character={c.character} size={44} className={c.owned ? "" : "opacity-40 grayscale"} />
                    {c.owned && (
                      <span className="absolute right-0 bottom-0 rounded-tl-md bg-black/75 px-1 text-[9px] font-bold text-white">C{c.owned.constellation}</span>
                    )}
                  </span>
                ))}
              </div>
              {!deck.evaluation.valid && (
                <ul className="grid gap-1 text-xs text-warning">
                  {deck.evaluation.issues.map((i) => (
                    <li key={i.code} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <span className="text-xs text-muted-foreground">
                  {deck.evaluation.size} personagens · atualizado em {formatDate(deck.updatedAt)}
                </span>
                <DeckActions deckId={deck.id} deckName={deck.name} isDefault={deck.isDefault} />
              </div>
            </article>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
