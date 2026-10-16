import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/next";
import { JoinRoomForm } from "../forms";

export const metadata: Metadata = { title: "Entrar em sala" };

export default async function JoinRoomPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireUser("/rooms/join");
  const { code } = await searchParams;
  return (
    <PageContainer className="max-w-md">
      <PageHeader eyebrow="X1 privado" title="Entrar em sala" description="Digite o código que o anfitrião compartilhou." />
      <Card>
        <CardContent>
          <JoinRoomForm code={code} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
