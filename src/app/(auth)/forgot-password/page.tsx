import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isEmailConfigured } from "@/server/mailer";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Recuperar acesso" };

export default function ForgotPasswordPage() {
  const enabled = isEmailConfigured();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Recuperar acesso</CardTitle>
          <CardDescription>
            {enabled
              ? "Informe o e-mail da conta para receber um link de redefinição."
              : "A recuperação por e-mail não está configurada neste servidor. Fale com um administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {enabled && <ForgotPasswordForm />}
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar ao login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
