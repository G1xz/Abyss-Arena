import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const session = await requireUser("/profile");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id }, select: { nickname: true, genshinUid: true, bio: true, email: true } });
  return (
    <PageContainer className="max-w-xl">
      <PageHeader eyebrow="Conta" title="Editar perfil" description={`E-mail: ${user.email}`} />
      <Card>
        <CardContent>
          <ProfileForm initial={{ nickname: user.nickname, genshinUid: user.genshinUid ?? "", bio: user.bio ?? "" }} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
