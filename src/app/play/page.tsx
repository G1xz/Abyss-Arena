import type { Metadata } from "next";
import { Swords as SwordsIcon } from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { describeDraftFormat } from "@/domain/draft";
import { formatDate } from "@/lib/utils";
import { getCurrentCycle, halfLabel, toChallengeView } from "@/server/abyss/service";
import { requireUser } from "@/server/auth/next";
import { listUserDecks } from "@/server/decks/service";
import { getPlayableContacts, listInvites } from "@/server/invites/service";
import { getSettings } from "@/server/settings";
import { AbyssFloorView } from "@/components/abyss-view";
import { PlayPanel } from "./play-panel";

export const metadata: Metadata = { title: "Jogar" };

export default async function PlayPage() {
  const user = await requireUser("/play");
  const [decks, cycle, settings, contacts, invites] = await Promise.all([
    listUserDecks(user.id),
    getCurrentCycle(),
    getSettings("competitive"),
    getPlayableContacts(user),
    listInvites(user.id),
  ]);
  const valid = decks.filter((d) => d.evaluation.valid);
  const challenges = cycle?.challenges.filter((c) => c.enabled) ?? [];

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader icon={SwordsIcon} eyebrow="X1" title="Desafiar jogador" description="Escolha o oponente pelo nickname: ele recebe o convite na hora e, ao aceitar, os dois caem na mesma sala." />
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-4">
          {valid.length === 0 && (
            <Alert variant="warning">
              Você ainda não tem um deck válido.{" "}
              <Link href="/roster" className="underline">
                Importe seus personagens
              </Link>{" "}
              e{" "}
              <Link href="/decks/new" className="underline">
                monte um deck
              </Link>{" "}
              (dá para escolher o deck depois, dentro da sala).
            </Alert>
          )}
          {!cycle ? (
            <Alert variant="warning">Nenhum ciclo do Abismo vigente. Um administrador precisa configurar o ciclo atual.</Alert>
          ) : (
            <PlayPanel
              decks={valid.map((d) => ({ id: d.id, name: d.name, totalCost: d.evaluation.totalCost }))}
              defaultDeckId={valid.find((d) => d.isDefault)?.id}
              online={contacts.online}
              recent={contacts.recent.map((r) => ({ ...r, online: contacts.onlineIds.has(r.id) }))}
              sent={invites.sent}
            />
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Formato atual</CardTitle>
            <CardDescription>Congelado na sala no momento da criação.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">Orçamento:</span> {settings.deckBudget} pontos · deck mínimo de{" "}
              {settings.draft.picksPerPlayer + settings.draft.bansPerPlayer} personagens
            </p>
            <ul className="grid gap-1.5" data-testid="draft-format">
              {describeDraftFormat(settings.draft).map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
                  {line}
                </li>
              ))}
            </ul>
            {cycle && (
              <p>
                <span className="text-muted-foreground">Abismo:</span> {cycle.name} ({formatDate(cycle.startsAt, false)} – {formatDate(cycle.endsAt, false)})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {cycle && (
        <Card className="mt-6" data-testid="abyss-current">
          <CardHeader>
            <CardTitle>Abismo vigente · andar 12</CardTitle>
            <CardDescription>
              {cycle.name}. Metades marcadas como válidas pela administração; a sala congela essas regras quando é criada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {challenges.some((c) => Array.isArray(c.enemies) && c.enemies.length) ? (
              <AbyssFloorView challenges={challenges.map(toChallengeView)} />
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {challenges.map((c) => (
                  <li key={c.id} className="rounded border bg-background/50 px-2 py-0.5 text-xs">
                    {c.floor}-{c.chamber} · {halfLabel(c.half)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
