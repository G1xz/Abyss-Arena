import type { Metadata } from "next";
import { Users as UsersIcon } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/next";
import { getDeckRules } from "@/server/decks/service";
import { getCatalogWithActivePrices } from "@/server/pricing/service";
import { getRoster } from "@/server/roster/service";
import { RosterManager } from "./roster-manager";

export const metadata: Metadata = { title: "Meus personagens" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser("/roster");
  const { welcome } = await searchParams;
  const [roster, { characters }, rules] = await Promise.all([getRoster(user.id), getCatalogWithActivePrices(), getDeckRules()]);
  return (
    <PageContainer>
      <PageHeader
        icon={UsersIcon} eyebrow="Conta"
        title="Meus personagens"
        description="Os decks são montados só com os personagens da sua conta. O custo de cada um depende da constelação e, nos 5★, do nível (95 e 100 custam um pouco mais)."
      />
      {welcome && (
        <Alert variant="info" className="mb-4">
          Conta criada! Importe seus personagens do HoYoLAB ou adicione-os manualmente para começar a montar decks.
        </Alert>
      )}
      <RosterManager
        catalog={characters.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          element: c.element,
          rarity: c.rarity,
          iconUrl: c.iconUrl,
          baseCost: c.cost,
          overrides: c.overrides,
          available: c.available,
        }))}
        roster={roster.map((o) => ({ characterId: o.characterId, constellation: o.constellation, level: o.level }))}
        costRules={rules.costRules}
      />
    </PageContainer>
  );
}
