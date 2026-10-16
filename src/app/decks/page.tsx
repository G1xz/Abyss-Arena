import type { Metadata } from "next";
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
        eyebrow="Biblioteca"
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
            <article key={deck.id} className="rounded-xl border bg-card/80 p-4" data-testid="deck-card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-lg font-semibold">{deck.name}</h2>
                {deck.isDefault && <Badge variant="secondary">padrão</Badge>}
                {deck.evaluation.valid ? <Badge variant="success">válido</Badge> : <Badge variant="destructive">inválido</Badge>}
                <span className="ml-auto font-display text-lg font-bold text-gold tabular">
                  {deck.evaluation.totalCost}
                  <span className="text-sm text-muted-foreground">/{deck.evaluation.budget}</span>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {deck.characters.map((c) => (
                  <CharacterIcon key={c.characterId} character={c.character} size={40} />
                ))}
              </div>
              {!deck.evaluation.valid && (
                <ul className="mt-3 grid gap-1 text-xs text-warning">
                  {deck.evaluation.issues.map((i) => (
                    <li key={i.code} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
