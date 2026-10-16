import { PageContainer, PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/misc";
import { getDeckRules } from "@/server/decks/service";
import { getCatalogWithActivePrices } from "@/server/pricing/service";
import { DeckBuilder } from "./deck-builder";

/** Página compartilhada por "novo deck" e "editar deck". */
export async function BuilderPage({ initial, title, welcome }: { initial: { id?: string; name: string; characterIds: string[] }; title: string; welcome?: boolean }) {
  const [{ version, characters }, rules] = await Promise.all([getCatalogWithActivePrices(), getDeckRules()]);
  return (
    <PageContainer className="max-w-[1400px]">
      <PageHeader
        eyebrow="Construtor de decks"
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
      ) : (
        <DeckBuilder
          characters={characters.map((c) => ({
            id: c.id,
            name: c.name,
            element: c.element,
            weaponType: c.weaponType,
            rarity: c.rarity,
            iconUrl: c.iconUrl,
            cost: c.cost,
            isProvisional: c.isProvisional,
            available: c.available,
          }))}
          rules={rules}
          initial={initial}
          versionLabel={`v${version.number}`}
        />
      )}
    </PageContainer>
  );
}
