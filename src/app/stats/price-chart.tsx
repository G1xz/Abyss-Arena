"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { NativeSelect } from "@/components/ui/misc";

/** Paleta categórica validada para a superfície escura do app (4 séries no máximo). */
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"];
const MAX_SERIES = 4;

export interface PricePoint {
  number: number;
  publishedAt: string;
  costs: Record<string, number>;
}

export function PriceEvolutionChart({
  versions,
  characters,
  initialIds,
}: {
  versions: PricePoint[];
  characters: { id: string; name: string }[];
  initialIds: string[];
}) {
  const [ids, setIds] = useState<string[]>(initialIds.slice(0, MAX_SERIES));
  const [hover, setHover] = useState<number | null>(null);
  const names = useMemo(() => new Map(characters.map((c) => [c.id, c.name])), [characters]);

  const W = 720;
  const H = 280;
  const M = { top: 16, right: 120, bottom: 32, left: 40 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const values = ids.flatMap((id) => versions.map((v) => v.costs[id]).filter((x): x is number => x !== undefined));
  const lo = Math.max(0, Math.min(...values, 10) - 2);
  const hi = Math.max(...values, 20) + 2;
  const x = (i: number) => M.left + (versions.length <= 1 ? iw / 2 : (i / (versions.length - 1)) * iw);
  const y = (v: number) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 4));

  if (versions.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma tabela publicada ainda.</p>;

  const hv = hover !== null ? versions[hover] : null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {ids.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
            <span className="size-2.5 rounded-full" style={{ background: SERIES[i] }} />
            {names.get(id)}
            <button type="button" aria-label={`Remover ${names.get(id)}`} onClick={() => setIds(ids.filter((x) => x !== id))} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {ids.length < MAX_SERIES && (
          <NativeSelect
            className="h-8 w-56"
            value=""
            onChange={(e) => e.target.value && setIds([...ids, e.target.value])}
            aria-label="Adicionar personagem ao gráfico"
          >
            <option value="">+ Comparar personagem</option>
            {characters
              .filter((c) => !ids.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </NativeSelect>
        )}
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px]"
          role="img"
          aria-label="Evolução de preços por versão da tabela"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeOpacity={0.5} />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px]">
                {t}
              </text>
            </g>
          ))}
          {versions.map((v, i) => (
            <text key={v.number} x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              v{v.number}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
          {ids.map((id, si) => {
            const pts = versions.map((v, i) => (v.costs[id] !== undefined ? { i, v: v.costs[id]! } : null)).filter((p): p is { i: number; v: number } => p !== null);
            if (!pts.length) return null;
            const last = pts[pts.length - 1]!;
            return (
              <g key={id}>
                <polyline fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
                {pts.map((p) => (
                  <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 5 : 4} fill={SERIES[si]} stroke="var(--card)" strokeWidth={2} />
                ))}
                <text x={x(last.i) + 10} y={y(last.v)} dominantBaseline="middle" className="fill-foreground text-[11px]">
                  {names.get(id)} · {last.v}
                </text>
              </g>
            );
          })}
          {versions.map((_, i) => (
            <rect
              key={i}
              x={x(i) - (versions.length > 1 ? iw / (versions.length - 1) / 2 : iw / 2)}
              y={M.top}
              width={versions.length > 1 ? iw / (versions.length - 1) : iw}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hv && (
          <div className="pointer-events-none absolute top-2 left-12 rounded-md border bg-popover/95 px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold">
              Tabela v{hv.number} · {new Date(hv.publishedAt).toLocaleDateString("pt-BR")}
            </p>
            {ids.map((id, si) => (
              <p key={id} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: SERIES[si] }} />
                <span className="text-muted-foreground">{names.get(id)}</span>
                <span className="ml-auto font-semibold tabular">{hv.costs[id] ?? "—"}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
