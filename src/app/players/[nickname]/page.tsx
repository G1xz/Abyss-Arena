import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MatchList } from "@/components/match-list";
import { PageContainer, PageHeader, Stat } from "@/components/page";
import { Badge } from "@/components/ui/misc";
import { formatDate, formatPercent } from "@/lib/utils";
import { prisma } from "@/server/db";
import { getPlayerMatches, getPlayerRecord } from "@/server/stats/service";

export async function generateMetadata({ params }: { params: Promise<{ nickname: string }> }): Promise<Metadata> {
  const { nickname } = await params;
  return { title: decodeURIComponent(nickname) };
}

export default async function PlayerPage({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params;
  const user = await prisma.user.findUnique({
    where: { nicknameKey: decodeURIComponent(nickname).toLowerCase() },
    select: { id: true, nickname: true, genshinUid: true, bio: true, createdAt: true, role: true },
  });
  if (!user) notFound();
  const [{ position, record }, matches] = await Promise.all([getPlayerRecord(user.id), getPlayerMatches(user.id, undefined, 30)]);
  const completed = matches.filter((m) => m.status === "COMPLETED");

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="Perfil público"
        title={
          <span className="flex items-center gap-3">
            {user.nickname}
            {user.role === "ADMIN" && <Badge>admin</Badge>}
          </span>
        }
        description={user.bio ?? `Membro desde ${formatDate(user.createdAt, false)}`}
      />
      {user.genshinUid && (
        <p className="mb-4 text-sm text-muted-foreground">
          UID informado: <span className="font-mono text-foreground">{user.genshinUid}</span>{" "}
          <Badge variant="secondary">não verificado</Badge>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Ranking" value={position ? `#${position}` : "—"} />
        <Stat label="Vitórias" value={record?.wins ?? 0} />
        <Stat label="Derrotas" value={record?.losses ?? 0} hint={`${record?.draws ?? 0} empates`} />
        <Stat label="Taxa de vitória" value={formatPercent(record?.winRate ?? null)} />
      </div>
      <h2 className="mt-8 mb-3 text-lg font-semibold">Partidas recentes</h2>
      <MatchList matches={completed} userId={user.id} />
    </PageContainer>
  );
}
