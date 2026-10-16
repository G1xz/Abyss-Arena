/** Regras de deck (puras): custo, orçamento e composição mínima. */

export type DeckIssueCode = "DUPLICATE" | "OVER_BUDGET" | "TOO_FEW" | "UNAVAILABLE" | "EMPTY_NAME";

export interface DeckIssue {
  code: DeckIssueCode;
  message: string;
  characterIds?: string[];
}

export interface DeckEvaluation {
  valid: boolean;
  totalCost: number;
  budget: number;
  remaining: number;
  /** Pontos acima do orçamento (0 quando dentro). */
  excess: number;
  size: number;
  minSize: number;
  issues: DeckIssue[];
}

export interface DeckRules {
  budget: number;
  minSize: number;
}

/**
 * Avalia um deck contra uma tabela de preços.
 * `prices` contém apenas personagens disponíveis para competição (habilitados e com preço).
 */
export function evaluateDeck(characterIds: string[], prices: ReadonlyMap<string, number>, rules: DeckRules): DeckEvaluation {
  const issues: DeckIssue[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of characterIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    issues.push({ code: "DUPLICATE", message: "Um personagem só pode aparecer uma vez no deck.", characterIds: [...duplicates] });
  }

  const unavailable: string[] = [];
  let totalCost = 0;
  for (const id of seen) {
    const cost = prices.get(id);
    if (cost === undefined) unavailable.push(id);
    else totalCost += cost;
  }
  if (unavailable.length > 0) {
    issues.push({
      code: "UNAVAILABLE",
      message: "Há personagens indisponíveis para partidas competitivas na tabela vigente.",
      characterIds: unavailable,
    });
  }

  const excess = Math.max(0, totalCost - rules.budget);
  if (excess > 0) {
    issues.push({ code: "OVER_BUDGET", message: `O deck excede o orçamento em ${excess} ponto(s).` });
  }
  if (seen.size < rules.minSize) {
    issues.push({ code: "TOO_FEW", message: `O deck precisa de pelo menos ${rules.minSize} personagens para o formato atual.` });
  }

  return {
    valid: issues.length === 0,
    totalCost,
    budget: rules.budget,
    remaining: rules.budget - totalCost,
    excess,
    size: seen.size,
    minSize: rules.minSize,
    issues,
  };
}
