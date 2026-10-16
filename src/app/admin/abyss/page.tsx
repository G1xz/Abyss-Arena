import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { DEFAULT_RULES, getCurrentCycle, listCycles } from "@/server/abyss/service";
import type { AbyssEnemyView } from "@/components/abyss-view";
import { CycleCard, NewCycleForm, SyncAbyssButton } from "./abyss-ui";

export const metadata: Metadata = { title: "Ciclos do Abismo" };

export default async function AdminAbyssPage() {
  const [cycles, current] = await Promise.all([listCycles(), getCurrentCycle()]);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Ciclos do Abismo"
        description="O andar 12 de cada ciclo é sincronizado automaticamente da wiki do Fandom e entra em vigor na virada do Abismo (04:00 do servidor América). Aqui você escolhe quais metades valem e pode cadastrar ciclos à mão. Cada partida congela as regras ao criar a sala."
        actions={<SyncAbyssButton />}
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
              source: c.source,
              syncedAt: c.syncedAt?.toISOString() ?? null,
              challenges: c.challenges.map((ch) => ({
                id: ch.id,
                floor: ch.floor,
                chamber: ch.chamber,
                half: ch.half,
                enabled: ch.enabled,
                enemyLevel: ch.enemyLevel,
                target: ch.target,
                leyLineDisorder: ch.leyLineDisorder,
                enemies: ch.enemies as AbyssEnemyView[] | null,
              })),
            }}
          />
        ))}
      </div>
    </div>
  );
}
