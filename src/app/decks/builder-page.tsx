import { PageContainer, PageHeader } from "@/components/page";
import { Layers as LayersIcon } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/next";
import { getRoster } from "@/server/roster/service";
import { getDeckRules } from "@/server/decks/service";
import { getCatalogWithActivePrices } from "@/server/pricing/service";
import { DeckBuilder } from "./deck-builder";

/** Página compartilhada por "novo deck" e "editar deck". */
export async function BuilderPage({ initial, title, welcome }: { initial: { id?: string; name: string; characterIds: string[] }; title: string; welcome?: boolean }) {
  const user = await requireUser();
  const [{ version, characters }, rules, roster] = await Promise.all([getCatalogWithActivePrices(), getDeckRules(), getRoster(user.id)]);
  const owned = new Map(roster.map((o) => [o.characterId, o]));
  return (
    <PageContainer>
      <PageHeader
        icon={LayersIcon} eyebrow="Construtor de decks"
        title={title}
        description={`Orçamento de ${rules.budget} pontos e no mínimo ${rules.minSize} personagens (picks do time + bans que o oponente pode aplicar).`}
      />
      {welcome && (
        <Alert variant="info" className="mb-4">
          Conta criada! Monte seu primeiro deck para poder entrar em partidas.
        </Alert>
      )}
      {!version ? (
        <Alert variant="warning">Nenhuma tabela de preços foi publicada ainda. Aguarde um administrador.</Alert>
      ) : roster.length === 0 ? (
        <Alert variant="warning">
          Primeiro importe os personagens da sua conta em{" "}
          <Link href="/roster" className="underline">
            Meus personagens
          </Link>
          . O deck usa a constelação e o nível de cada um.
        </Alert>
      ) : (
        <DeckBuilder
          characters={characters
            .filter((c) => owned.has(c.id) || initial.characterIds.includes(c.id))
            .map((c) => ({
              id: c.id,
              name: c.name,
              element: c.element,
              weaponType: c.weaponType,
              rarity: c.rarity,
              iconUrl: c.iconUrl,
              baseCost: c.cost,
              overrides: c.overrides,
              isProvisional: c.isProvisional,
              available: c.available && owned.has(c.id),
              owned: owned.has(c.id),
              constellation: owned.get(c.id)?.constellation ?? null,
              level: owned.get(c.id)?.level ?? null,
            }))}
          rules={{ budget: rules.budget, minSize: rules.minSize }}
          costRules={rules.costRules}
          initial={initial}
          versionLabel={`v${version.number}`}
        />
      )}
    </PageContainer>
  );
}
