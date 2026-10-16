import type { Metadata } from "next";
import { PageHeader } from "@/components/page";
import { formatSequence } from "@/domain/draft";
import { getSettings } from "@/server/settings";
import { BalanceSettingsForm, CompetitiveSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Configurações" };

export default async function AdminSettingsPage() {
  const [competitive, balance] = await Promise.all([getSettings("competitive"), getSettings("balance")]);
  return (
    <div className="grid gap-6">
      <PageHeader title="Configurações" description="Mudanças valem para salas criadas depois; partidas existentes mantêm a configuração congelada." />
      <CompetitiveSettingsForm
        initial={{
          deckBudget: competitive.deckBudget,
          minCharacterCost: competitive.minCharacterCost,
          maxCharacterCost: competitive.maxCharacterCost,
          bansPerPlayer: competitive.draft.bansPerPlayer,
          picksPerPlayer: competitive.draft.picksPerPlayer,
          draftPreset: competitive.draftPreset,
          customSequence: formatSequence(competitive.draft.sequence),
          tiePolicy: competitive.tiePolicy,
          minResultSeconds: competitive.minResultSeconds,
          maxResultSeconds: competitive.maxResultSeconds,
        }}
      />
      <BalanceSettingsForm initial={balance} />
    </div>
  );
}
