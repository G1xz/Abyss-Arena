"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, Label, NativeSelect, Textarea } from "@/components/ui/misc";
import { Switch } from "@/components/ui/overlays";
import { cn, formatDate } from "@/lib/utils";
import { addChallengeAction, createCycleAction, toggleChallengeAction, updateCycleAction } from "../actions";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NewCycleForm({ defaultRules }: { defaultRules: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", startsAt: "", endsAt: "", rules: defaultRules, floor: 12 });
  if (!open)
    return (
      <Button className="w-fit" onClick={() => setOpen(true)}>
        <Plus /> Novo ciclo
      </Button>
    );
  const submit = () =>
    start(async () => {
      const r = await createCycleAction({
        ...form,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : "",
      });
      if (r.ok) {
        toast.success("Ciclo criado com as 6 metades do andar habilitadas");
        setOpen(false);
      } else toast.error(r.error);
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo ciclo</CardTitle>
        <CardDescription>Ao mudar o Abismo, considere executar uma revisão extraordinária de balanceamento.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="c-name">Nome</Label>
          <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Abismo 2026-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-start">Início</Label>
          <Input id="c-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-end">Encerramento</Label>
          <Input id="c-end" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-floor">Andar</Label>
          <Input id="c-floor" type="number" min={1} max={12} value={form.floor} onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1.5 md:col-span-4">
          <Label htmlFor="c-rules">Regras competitivas</Label>
          <Textarea id="c-rules" rows={4} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
        </div>
        <div className="flex gap-2 md:col-span-4">
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Criar ciclo
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface CycleData {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  rules: string;
  status: "ACTIVE" | "ENDED";
  matches: number;
  challenges: { id: string; floor: number; chamber: number; half: "FIRST" | "SECOND"; enabled: boolean }[];
}

export function CycleCard({ cycle, current }: { cycle: CycleData; current: boolean }) {
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: cycle.name, startsAt: toLocalInput(cycle.startsAt), endsAt: toLocalInput(cycle.endsAt), rules: cycle.rules, status: cycle.status });
  const [add, setAdd] = useState({ floor: 12, chamber: 1, half: "FIRST" as "FIRST" | "SECOND" });

  const exec = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        after?.();
      } else toast.error(r.error);
    });

  return (
    <Card className={cn(current && "border-primary/50")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {cycle.name}
          {current && <Badge>vigente</Badge>}
          <Badge variant={cycle.status === "ACTIVE" ? "success" : "secondary"}>{cycle.status === "ACTIVE" ? "ativo" : "encerrado"}</Badge>
        </CardTitle>
        <CardDescription>
          {formatDate(cycle.startsAt)} → {formatDate(cycle.endsAt)} · {cycle.matches} partida(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">Salas válidas para o formato</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cycle.challenges.map((ch) => (
              <label key={ch.id} className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-sm">
                <span>
                  Andar {ch.floor} · Câmara {ch.chamber} · {ch.half === "FIRST" ? "1ª" : "2ª"} metade
                </span>
                <Switch checked={ch.enabled} disabled={pending} onCheckedChange={(v) => exec(() => toggleChallengeAction(ch.id, v), v ? "Sala habilitada" : "Sala desabilitada")} />
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input type="number" min={1} max={12} className="w-20" aria-label="Andar" value={add.floor} onChange={(e) => setAdd({ ...add, floor: Number(e.target.value) })} />
            <Input type="number" min={1} max={3} className="w-20" aria-label="Câmara" value={add.chamber} onChange={(e) => setAdd({ ...add, chamber: Number(e.target.value) })} />
            <NativeSelect className="w-36" aria-label="Metade" value={add.half} onChange={(e) => setAdd({ ...add, half: e.target.value as "FIRST" | "SECOND" })}>
              <option value="FIRST">1ª metade</option>
              <option value="SECOND">2ª metade</option>
            </NativeSelect>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => addChallengeAction(cycle.id, add), "Sala adicionada")}>
              <Plus /> Adicionar sala
            </Button>
          </div>
        </div>
        {edit ? (
          <div className="grid gap-3 md:grid-cols-4">
            <Input className="md:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nome" />
            <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} aria-label="Início" />
            <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} aria-label="Encerramento" />
            <Textarea className="md:col-span-3" rows={4} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} aria-label="Regras" />
            <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "ENDED" })} aria-label="Status">
              <option value="ACTIVE">Ativo</option>
              <option value="ENDED">Encerrado</option>
            </NativeSelect>
            <div className="flex gap-2 md:col-span-4">
              <Button
                disabled={pending}
                onClick={() =>
                  exec(
                    () => updateCycleAction(cycle.id, { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }),
                    "Ciclo atualizado",
                    () => setEdit(false),
                  )
                }
              >
                <Save /> Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEdit(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-xs whitespace-pre-line text-muted-foreground">{cycle.rules}</p>
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
              Editar ciclo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
