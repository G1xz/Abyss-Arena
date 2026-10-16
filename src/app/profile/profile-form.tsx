"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/common";
import { Label, Textarea } from "@/components/ui/misc";
import { initialFormState } from "@/lib/action-state";
import { updateProfileAction } from "./actions";

export function ProfileForm({ initial }: { initial: { nickname: string; genshinUid: string; bio: string } }) {
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const values = state.values ?? initial;
  return (
    <form action={action} className="grid gap-4">
      <Field label="Nickname" name="nickname" defaultValue={values.nickname} required errors={state.fieldErrors?.nickname} />
      <Field
        label="UID do Genshin (opcional)"
        name="genshinUid"
        defaultValue={values.genshinUid}
        inputMode="numeric"
        hint="Exibido como “não verificado”: a plataforma não confirma a posse do UID."
        errors={state.fieldErrors?.genshinUid}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={values.bio} maxLength={280} rows={3} />
      </div>
      <FormError error={state.fieldErrors ? undefined : state.error} />
      {state.ok && <p className="text-sm text-success">Perfil atualizado.</p>}
      <SubmitButton pendingText="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
