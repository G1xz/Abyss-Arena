"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, NativeSelect, Textarea } from "@/components/ui/misc";
import { buildSequence, DRAFT_PRESETS, formatSequence, type DraftPreset } from "@/domain/draft";
import { saveBalanceSettingsAction, saveCompetitiveSettingsAction } from "../actions";

function NumberField({ label, value, onChange, step = 1, hint, id }: { label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string; id: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Competitive = {
  deckBudget: number;
  minCharacterCost: number;
  maxCharacterCost: number;
  bansPerPlayer: number;
  picksPerPlayer: number;
  draftPreset: string;
  customSequence: string;
  tiePolicy: "DRAW" | "FIRST_SUBMITTED_WINS";
  minResultSeconds: number;
  maxResultSeconds: number;
};

export function CompetitiveSettingsForm({ initial }: { initial: Competitive }) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof Competitive>(k: K, v: Competitive[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const preview = f.draftPreset === "CUSTOM" ? f.customSequence : formatSequence(buildSequence(f.draftPreset as DraftPreset, f.bansPerPlayer, f.picksPerPlayer));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formato competitivo</CardTitle>
        <CardDescription>Orçamento, limites de preço, sequência do draft e política de empate.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <NumberField id="budget" label="Orçamento do deck" value={f.deckBudget} onChange={(v) => set("deckBudget", v)} />
        <NumberField id="minc" label="Preço mínimo" value={f.minCharacterCost} onChange={(v) => set("minCharacterCost", v)} />
        <NumberField id="maxc" label="Preço máximo" value={f.maxCharacterCost} onChange={(v) => set("maxCharacterCost", v)} />
        <NumberField id="bans" label="Bans por jogador" value={f.bansPerPlayer} onChange={(v) => set("bansPerPlayer", v)} />
        <NumberField id="picks" label="Picks por jogador" value={f.picksPerPlayer} onChange={(v) => set("picksPerPlayer", v)} />
        <div className="grid gap-1.5">
          <Label htmlFor="preset">Sequência do draft</Label>
          <NativeSelect id="preset" value={f.draftPreset} onChange={(e) => set("draftPreset", e.target.value)}>
            {Object.entries(DRAFT_PRESETS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
            <option value="CUSTOM">Personalizada</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5 md:col-span-3">
          <Label htmlFor="seq">{f.draftPreset === "CUSTOM" ? "Sequência personalizada" : "Pré-visualização"}</Label>
          <Textarea
            id="seq"
            rows={2}
            className="font-mono text-xs"
            readOnly={f.draftPreset !== "CUSTOM"}
            value={preview}
            onChange={(e) => set("customSequence", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Formato: BAN_PLAYER_A, PICK_PLAYER_B, ... O servidor valida a quantidade exata de bans e picks de cada jogador.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tie">Empate exato</Label>
          <NativeSelect id="tie" value={f.tiePolicy} onChange={(e) => set("tiePolicy", e.target.value as Competitive["tiePolicy"])}>
            <option value="DRAW">Registrar empate</option>
            <option value="FIRST_SUBMITTED_WINS">Vence quem enviou primeiro</option>
          </NativeSelect>
        </div>
        <NumberField id="mint" label="Tempo mínimo (s)" value={f.minResultSeconds} onChange={(v) => set("minResultSeconds", v)} />
        <NumberField id="maxt" label="Tempo máximo (s)" value={f.maxResultSeconds} onChange={(v) => set("maxResultSeconds", v)} />
        <Button
          className="w-fit"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCompetitiveSettingsAction(f);
              if (r.ok) toast.success("Formato salvo");
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar formato
        </Button>
      </CardContent>
    </Card>
  );
}

const BALANCE_FIELDS: { key: string; label: string; step?: number; hint: string }[] = [
  { key: "minSampleGames", label: "Amostra mínima (jogos)", hint: "Jogos validados para o sinal de vitória contar" },
  { key: "minSampleOpportunities", label: "Amostra mínima (oportunidades)", hint: "Para os sinais de pick e ban" },
  { key: "priorGames", label: "Força do prior (jogos)", hint: "Suavização: jogos virtuais a 50%" },
  { key: "weightWin", label: "Peso das vitórias", step: 0.05, hint: "0 a 1" },
  { key: "weightPick", label: "Peso da popularidade", step: 0.05, hint: "0 a 1" },
  { key: "weightBan", label: "Peso dos bans", step: 0.05, hint: "0 a 1" },
  { key: "historyWeight", label: "Peso dos dados históricos", step: 0.05, hint: "Com o ciclo atual já maduro" },
  { key: "cycleMaturityMatches", label: "Partidas p/ ciclo maduro", hint: "Abaixo disso, conservadorismo" },
  { key: "maxStep", label: "Variação máx. por atualização", hint: "Em pontos" },
  { key: "actionThreshold", label: "Limiar de ação", step: 0.01, hint: "|score| mínimo para propor" },
  { key: "historyDays", label: "Janela histórica (dias)", hint: "Dados anteriores considerados" },
  { key: "proposalWeekday", label: "Dia das propostas (0=dom)", hint: "Janela semanal de revisão" },
];

export function BalanceSettingsForm({ initial }: { initial: Record<string, number> }) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parâmetros do balanceamento</CardTitle>
        <CardDescription>
          Usados pelo BalanceEngine (determinístico). Preço mínimo e máximo vêm do formato competitivo. Detalhes em docs/BALANCEAMENTO.md.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {BALANCE_FIELDS.map((field) => (
          <NumberField
            key={field.key}
            id={`b-${field.key}`}
            label={field.label}
            step={field.step}
            hint={field.hint}
            value={f[field.key] ?? 0}
            onChange={(v) => setF({ ...f, [field.key]: v })}
          />
        ))}
        <Button
          className="w-fit"
          disabled={pending}
          data-testid="save-balance-settings"
          onClick={() =>
            start(async () => {
              const r = await saveBalanceSettingsAction(f);
              if (r.ok) toast.success("Parâmetros salvos");
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Salvar parâmetros
        </Button>
      </CardContent>
    </Card>
  );
}
