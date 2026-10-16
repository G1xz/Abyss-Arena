"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/common";
import { initialFormState } from "@/lib/action-state";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "./actions";

export function LoginForm({ next, emailEnabled }: { next?: string; emailEnabled: boolean }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required errors={state.fieldErrors?.password} />
      <FormError error={state.fieldErrors ? undefined : state.error} />
      <SubmitButton pendingText="Entrando...">Entrar</SubmitButton>
      <div className="flex justify-between text-sm text-muted-foreground">
        <Link href="/register" className="hover:text-foreground">
          Criar conta
        </Link>
        {emailEnabled && (
          <Link href="/forgot-password" className="hover:text-foreground">
            Esqueci minha senha
          </Link>
        )}
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <Field label="E-mail" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
      <Field
        label="Nickname"
        name="nickname"
        defaultValue={state.values?.nickname}
        autoComplete="username"
        required
        minLength={3}
        maxLength={20}
        hint="3 a 20 caracteres: letras, números, ponto, hífen ou sublinhado. Será público."
        errors={state.fieldErrors?.nickname}
      />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Mínimo de 8 caracteres."
        errors={state.fieldErrors?.password}
      />
      <Field
        label="UID do Genshin (opcional)"
        name="genshinUid"
        inputMode="numeric"
        defaultValue={state.values?.genshinUid}
        hint="Informativo. A plataforma não verifica a posse do UID."
        errors={state.fieldErrors?.genshinUid}
      />
      <FormError error={state.fieldErrors ? undefined : state.error} />
      <SubmitButton pendingText="Criando conta...">Criar conta</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  if (state.ok) return <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">{state.message}</p>;
  return (
    <form action={action} className="grid gap-4">
      <Field label="E-mail da conta" name="email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <FormError error={state.fieldErrors ? undefined : state.error} />
      <SubmitButton pendingText="Enviando...">Enviar link de redefinição</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha" name="password" type="password" autoComplete="new-password" required minLength={8} errors={state.fieldErrors?.password} />
      <FormError error={state.fieldErrors?.password ? undefined : state.error} />
      <SubmitButton pendingText="Salvando...">Redefinir senha</SubmitButton>
    </form>
  );
}
