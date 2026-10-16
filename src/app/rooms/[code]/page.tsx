import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { listUserDecks } from "@/server/decks/service";
import { getMatchView } from "@/server/matches/view";
import { InviteResponse } from "./invite-response";
import { MatchRoom } from "./match-room";

export const metadata: Metadata = { title: "Sala" };

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  const user = await requireUser(`/rooms/${normalized}`);
  const match = await prisma.match.findUnique({ where: { code: normalized }, include: { players: { include: { user: { select: { nickname: true } } } } } });
  if (!match) notFound();

  const isParticipant = match.players.some((p) => p.userId === user.id);
  if (!isParticipant && user.role !== "ADMIN") {
    if (match.status === "COMPLETED") redirect(`/matches/${match.id}`);
    const invite = await prisma.matchInvite.findFirst({
      where: { matchId: match.id, toUserId: user.id, status: "PENDING", expiresAt: { gt: new Date() } },
      include: { fromUser: { select: { nickname: true } } },
    });
    return (
      <PageContainer className="max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sala privada</CardTitle>
            <CardDescription>
              {invite ? `${invite.fromUser.nickname} te desafiou para um X1.` : "Só é possível entrar nesta sala por convite do anfitrião."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invite ? (
              <InviteResponse inviteId={invite.id} />
            ) : (
              <Button asChild variant="outline">
                <Link href="/play">Desafiar alguém</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const [view, decks] = await Promise.all([getMatchView(match.id, user), listUserDecks(user.id)]);
  return (
    <MatchRoom
      initial={view}
      me={{ id: user.id, nickname: user.nickname }}
      decks={decks.map((d) => ({ id: d.id, name: d.name, totalCost: d.evaluation.totalCost, valid: d.evaluation.valid, size: d.evaluation.size }))}
    />
  );
}
