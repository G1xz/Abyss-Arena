"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Swords, X } from "lucide-react";
import { listInvitesAction, respondInviteAction } from "@/app/play/actions";
import { getSocket } from "@/lib/use-match-room";
import type { InviteView } from "@/server/invites/service";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/overlays";

/** Convites de partida em tempo real (canal pessoal do Socket.IO), visível em todas as páginas. */
export function InviteInbox() {
  const router = useRouter();
  const [received, setReceived] = useState<InviteView[]>([]);
  const [open, setOpen] = useState(false);
  const respondingRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      setReceived((await listInvitesAction()).received);
    } catch {
      /* sessão expirada ou servidor indisponível: o próximo evento tenta de novo */
    }
  }, []);

  const respond = useCallback(
    async (invite: InviteView, accept: boolean) => {
      if (respondingRef.current.has(invite.id)) return;
      respondingRef.current.add(invite.id);
      setOpen(false);
      const r = await respondInviteAction(invite.id, accept);
      respondingRef.current.delete(invite.id);
      toast.dismiss(`invite-${invite.id}`);
      if (!r.ok) toast.error(r.error);
      else if (accept) router.push(`/rooms/${r.data.code}`);
      void refresh();
    },
    [refresh, router],
  );

  useEffect(() => {
    const s = getSocket();
    const onNew = (invite: InviteView) => {
      void refresh();
      toast(`${invite.from.nickname} te desafiou para um X1`, {
        id: `invite-${invite.id}`,
        icon: <Swords className="size-4" />,
        duration: 30_000,
        action: { label: "Aceitar", onClick: () => void respond(invite, true) },
        cancel: { label: "Recusar", onClick: () => void respond(invite, false) },
      });
    };
    const onUpdated = (update: Partial<InviteView> & { id: string; status: string }) => {
      void refresh();
      toast.dismiss(`invite-${update.id}`);
      if (update.to && update.status === "DECLINED") toast.warning(`${update.to.nickname} recusou o convite`);
      if (update.to && update.status === "ACCEPTED") toast.success(`${update.to.nickname} aceitou o convite`);
    };
    s.on("invite:new", onNew);
    s.on("invite:updated", onUpdated);
    s.on("connect", refresh);
    if (!s.connected) s.connect();
    void refresh();
    return () => {
      s.off("invite:new", onNew);
      s.off("invite:updated", onUpdated);
      s.off("connect", refresh);
    };
  }, [refresh, respond]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Convites (${received.length})`} data-testid="invite-inbox">
          <Bell />
          {received.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-white" data-testid="invite-count">
              {received.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Convites</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {received.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nenhum convite pendente.</p>
        ) : (
          <ul className="grid gap-1 p-1">
            {received.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" data-testid="invite-item">
                <Swords className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{i.from.nickname}</span> te desafiou
                </span>
                <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Recusar" onClick={() => void respond(i, false)}>
                  <X />
                </Button>
                <Button size="icon" className="size-7" aria-label="Aceitar" onClick={() => void respond(i, true)} data-testid="invite-accept">
                  <Check />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
