"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Gavel, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, NativeSelect, Textarea } from "@/components/ui/misc";
import { formatDuration } from "@/domain/results";
import { resolveDisputeAction } from "../actions";

type Resolution = "ACCEPT_TIMES" | "FORCE_WINNER" | "DRAW" | "VOID";

export function ResolveDisputeForm({ disputeId, names, times }: { disputeId: string; names: { A: string; B: string }; times: { A: number | null; B: number | null } }) {
  const [resolution, setResolution] = useState<Resolution>("ACCEPT_TIMES");
  const [timeA, setTimeA] = useState(times.A ? formatDuration(times.A).replace(/s$/, "") : "");
  const [timeB, setTimeB] = useState(times.B ? formatDuration(times.B).replace(/s$/, "") : "");
  const [winner, setWinner] = useState<"A" | "B">("A");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await resolveDisputeAction(disputeId, {
        resolution,
        timeA: resolution === "ACCEPT_TIMES" ? timeA : undefined,
        timeB: resolution === "ACCEPT_TIMES" ? timeB : undefined,
        winnerSeat: resolution === "FORCE_WINNER" ? winner : undefined,
        note,
      });
      if (r.ok) toast.success("Disputa resolvida");
      else toast.error(r.error);
    });

  return (
    <div className="grid gap-3 rounded-lg border bg-background/40 p-3">
      <p className="flex items-center gap-2 font-medium">
        <Gavel className="size-4" /> Decisão
      </p>
      <NativeSelect value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)} aria-label="Tipo de resolução">
        <option value="ACCEPT_TIMES">Aceitar/ajustar tempos (vencedor calculado)</option>
        <option value="FORCE_WINNER">Definir vencedor (ex.: resultado inválido)</option>
        <option value="DRAW">Declarar empate</option>
        <option value="VOID">Anular partida (não conta para nada)</option>
      </NativeSelect>
      {resolution === "ACCEPT_TIMES" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Tempo final de {names.A} (A)</Label>
            <Input value={timeA} onChange={(e) => setTimeA(e.target.value)} className="font-mono" />
          </div>
          <div className="grid gap-1.5">
            <Label>Tempo final de {names.B} (B)</Label>
            <Input value={timeB} onChange={(e) => setTimeB(e.target.value)} className="font-mono" />
          </div>
        </div>
      )}
      {resolution === "FORCE_WINNER" && (
        <NativeSelect value={winner} onChange={(e) => setWinner(e.target.value as "A" | "B")} aria-label="Vencedor">
          <option value="A">{names.A} (A)</option>
          <option value="B">{names.B} (B)</option>
        </NativeSelect>
      )}
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Justificativa da decisão (fica registrada e visível na partida)" />
      <Button className="w-fit" disabled={pending || note.trim().length < 5} onClick={submit}>
        {pending && <Loader2 className="animate-spin" />} Registrar decisão
      </Button>
    </div>
  );
}
