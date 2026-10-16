import type { Metadata } from "next";
import { MatchList } from "@/components/match-list";
import { PageContainer, PageHeader } from "@/components/page";
import { requireUser } from "@/server/auth/next";
import { getPlayerMatches } from "@/server/stats/service";

export const metadata: Metadata = { title: "Histórico de partidas" };

export default async function HistoryPage() {
  const user = await requireUser("/history");
  const matches = await getPlayerMatches(user.id, undefined, 200);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader eyebrow="Suas partidas" title="Histórico" description="Todas as salas em que você participou, incluindo canceladas e em andamento." />
      <MatchList matches={matches} userId={user.id} />
    </PageContainer>
  );
}
