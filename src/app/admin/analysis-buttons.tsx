"use client";

import { Activity, RefreshCw, Zap } from "lucide-react";
import { runAnalysisAction, syncCatalogAction } from "./actions";
import { ActionButton } from "./admin-ui";

export function AnalysisButtons({ showSync = false }: { showSync?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        size="sm"
        action={() => runAnalysisAction("MANUAL", true)}
        success={(d) => `Análise concluída: ${(d as { proposalsCreated: number }).proposalsCreated} proposta(s) gerada(s)`}
        data-testid="run-analysis"
      >
        <Activity /> Gerar propostas agora
      </ActionButton>
      <ActionButton
        size="sm"
        variant="outline"
        action={() => runAnalysisAction("EXTRAORDINARY", true)}
        confirmText="Executar uma revisão extraordinária (ex.: após mudança do Abismo)? As propostas pendentes serão substituídas."
        success="Revisão extraordinária registrada"
      >
        <Zap /> Revisão extraordinária
      </ActionButton>
      {showSync && (
        <ActionButton
          size="sm"
          variant="outline"
          action={syncCatalogAction}
          success={(d) => {
            const r = d as { source: string; created: number; updated: number; markedMissing: number };
            return `Catálogo (${r.source}): ${r.created} novo(s), ${r.updated} atualizado(s), ${r.markedMissing} ausente(s)`;
          }}
          data-testid="sync-catalog"
        >
          <RefreshCw /> Sincronizar catálogo
        </ActionButton>
      )}
    </div>
  );
}
