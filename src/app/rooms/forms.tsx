"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/common";
import { Label, NativeSelect } from "@/components/ui/misc";
import { initialFormState } from "@/lib/action-state";
import { createRoomAction, joinRoomAction } from "./actions";

export function CreateRoomForm({ decks, defaultDeckId }: { decks: { id: string; name: string; totalCost: number }[]; defaultDeckId?: string }) {
  const [state, action] = useActionState(createRoomAction, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="deckId">Deck para esta partida</Label>
        <NativeSelect id="deckId" name="deckId" defaultValue={defaultDeckId ?? ""} data-testid="create-room-deck">
          <option value="">Escolher depois, na sala</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.totalCost} pts)
            </option>
          ))}
        </NativeSelect>
      </div>
      <FormError error={state.error} />
      <SubmitButton size="lg" pendingText="Criando sala..." data-testid="create-room-submit">
        Criar sala privada
      </SubmitButton>
    </form>
  );
}

export function JoinRoomForm({ code }: { code?: string }) {
  const [state, action] = useActionState(joinRoomAction, initialFormState);
  return (
    <form action={action} className="grid gap-4">
      <Field
        label="Código da sala"
        name="code"
        required
        autoComplete="off"
        defaultValue={state.values?.code ?? code}
        placeholder="Ex.: K7Q2XM"
        className="[&_input]:font-mono [&_input]:text-lg [&_input]:tracking-[0.3em] [&_input]:uppercase"
        errors={state.fieldErrors?.["_"]}
        data-testid="join-room-code"
      />
      <FormError error={state.error} />
      <SubmitButton size="lg" pendingText="Entrando..." data-testid="join-room-submit">
        Entrar na sala
      </SubmitButton>
    </form>
  );
}
