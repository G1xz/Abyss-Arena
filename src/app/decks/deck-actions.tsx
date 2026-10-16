"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlays";
import { deleteDeckAction, duplicateDeckAction, setDefaultDeckAction } from "./actions";

export function DeckActions({ deckId, deckName, isDefault }: { deckId: string; deckName: string; isDefault: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error(r.error);
    });

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button asChild size="sm" variant="secondary">
        <Link href={`/decks/${deckId}`}>
          <Pencil /> Editar
        </Link>
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => duplicateDeckAction(deckId), "Deck duplicado")}>
        <Copy /> Duplicar
      </Button>
      {!isDefault && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setDefaultDeckAction(deckId), "Deck padrão definido")}>
          <Star /> Padrão
        </Button>
      )}
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}>
            <Trash2 /> Excluir
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir “{deckName}”?</DialogTitle>
            <DialogDescription>Partidas já jogadas com este deck não são afetadas (os decks ficam congelados nelas).</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="destructive" onClick={() => run(() => deleteDeckAction(deckId), "Deck excluído")}>
                Excluir
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
