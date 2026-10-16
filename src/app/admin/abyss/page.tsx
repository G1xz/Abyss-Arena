import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { DEFAULT_RULES, getCurrentCycle, listCycles } from "@/server/abyss/service";
import { CycleCard, NewCycleForm } from "./abyss-ui";

export const metadata: Metadata = { title: "Ciclos do Abismo" };

export default async function AdminAbyssPage() {
  const [cycles, current] = await Promise.all([listCycles(), getCurrentCycle()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Ciclos do Abismo"
        description="Defina os ciclos e quais salas valem para o formato competitivo. Cada partida congela as regras no momento da criação da sala."
      />
      <NewCycleForm defaultRules={DEFAULT_RULES} />
      <div className="grid gap-4">
        {cycles.map((c) => (
          <CycleCard
            key={c.id}
            current={c.id === current?.id}
            cycle={{
              id: c.id,
              name: c.name,
              startsAt: c.startsAt.toISOString(),
              endsAt: c.endsAt.toISOString(),
              rules: c.rules,
              status: c.status,
              matches: c._count.matches,
              challenges: c.challenges.map((ch) => ({ id: ch.id, floor: ch.floor, chamber: ch.chamber, half: ch.half, enabled: ch.enabled })),
            }}
          />
        ))}
      </div>
    </div>
  );
}
