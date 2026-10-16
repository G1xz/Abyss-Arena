import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/next";
import { isEmailConfigured } from "@/server/mailer";
import { safeNextPath } from "@/lib/action-state";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect(safeNextPath(params.next));
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Entrar</CardTitle>
          <CardDescription>Acesse sua conta para montar decks e disputar partidas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {params.reset && <p className="rounded-md bg-success/10 p-3 text-sm text-success">Senha redefinida. Entre com a nova senha.</p>}
          <LoginForm next={params.next} emailEnabled={isEmailConfigured()} />
        </CardContent>
      </Card>
    </div>
  );
}
