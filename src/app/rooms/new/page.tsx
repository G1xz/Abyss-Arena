import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { formatSequence } from "@/domain/draft";
import { formatDate } from "@/lib/utils";
import { getCurrentCycle, halfLabel } from "@/server/abyss/service";
import { requireUser } from "@/server/auth/next";
import { listUserDecks } from "@/server/decks/service";
import { getSettings } from "@/server/settings";
import { CreateRoomForm } from "../forms";

export const metadata: Metadata = { title: "Criar sala" };

export default async function NewRoomPage() {
  const user = await requireUser("/rooms/new");
  const [decks, cycle, settings] = await Promise.all([listUserDecks(user.id), getCurrentCycle(), getSettings("competitive")]);
  const valid = decks.filter((d) => d.evaluation.valid);
  const challenges = cycle?.challenges.filter((c) => c.enabled) ?? [];

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="X1 privado"
        title="Criar sala"
        description="Crie a sala, envie o código ao oponente e façam o draft em tempo real."
        actions={
          <Button asChild variant="outline">
            <Link href="/rooms/join">Tenho um código</Link>
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Nova sala</CardTitle>
            <CardDescription>Você será o jogador A (anfitrião).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {valid.length === 0 && (
              <Alert variant="warning">
                Você não tem decks válidos para a tabela vigente.{" "}
                <Link href="/decks/new" className="underline">
                  Monte um deck
                </Link>{" "}
                antes de iniciar o draft.
              </Alert>
            )}
            {!cycle ? (
              <Alert variant="warning">Nenhum ciclo do Abismo vigente. Um administrador precisa configurar o ciclo atual.</Alert>
            ) : (
              <CreateRoomForm
                decks={valid.map((d) => ({ id: d.id, name: d.name, totalCost: d.evaluation.totalCost }))}
                defaultDeckId={valid.find((d) => d.isDefault)?.id}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Formato atual</CardTitle>
            <CardDescription>Congelado na sala no momento da criação.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">Orçamento:</span> {settings.deckBudget} pontos
            </p>
            <p>
              <span className="text-muted-foreground">Draft:</span> {settings.draft.bansPerPlayer} bans e {settings.draft.picksPerPlayer} picks por jogador
            </p>
            <p className="font-mono text-xs break-words text-muted-foreground">{formatSequence(settings.draft.sequence)}</p>
            <p>
              <span className="text-muted-foreground">Empate exato:</span> {settings.tiePolicy === "DRAW" ? "registra empate" : "vence quem enviou primeiro"}
            </p>
            {cycle && (
              <div>
                <p className="font-medium">{cycle.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(cycle.startsAt, false)} – {formatDate(cycle.endsAt, false)}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {challenges.map((c) => (
                    <li key={c.id} className="rounded border bg-background/50 px-2 py-0.5 text-xs">
                      {c.floor}-{c.chamber} · {halfLabel(c.half)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
