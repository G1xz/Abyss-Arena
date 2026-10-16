import type { Metadata } from "next";
import { Swords as SwordsIcon } from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { formatSequence } from "@/domain/draft";
import { formatDate } from "@/lib/utils";
import { getCurrentCycle, halfLabel } from "@/server/abyss/service";
import { requireUser } from "@/server/auth/next";
import { listUserDecks } from "@/server/decks/service";
import { getPlayableContacts, listInvites } from "@/server/invites/service";
import { getSettings } from "@/server/settings";
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
            <p>
              <span className="text-muted-foreground">Draft:</span> {settings.draft.bansPerPlayer} bans e {settings.draft.picksPerPlayer} picks por jogador
            </p>
            <p className="font-mono text-xs break-words text-muted-foreground">{formatSequence(settings.draft.sequence)}</p>
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
