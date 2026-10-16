"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondInviteAction } from "@/app/play/actions";

export function InviteResponse({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const respond = (accept: boolean) =>
    start(async () => {
      const r = await respondInviteAction(inviteId, accept);
      if (!r.ok) return void toast.error(r.error);
      if (accept) router.refresh();
      else router.push("/play");
    });
  return (
    <div className="flex gap-2">
      <Button variant="outline" disabled={pending} onClick={() => respond(false)}>
        <X /> Recusar
      </Button>
      <Button disabled={pending} onClick={() => respond(true)} data-testid="invite-accept-page">
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Aceitar desafio
      </Button>
    </div>
  );
}
