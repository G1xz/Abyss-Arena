# Balanceamento orgânico supervisionado

O `BalanceEngine` (`src/domain/balance.ts`) é um modelo estatístico **determinístico e auditável**: as mesmas entradas sempre geram a mesma saída. Não usa LLM nem IA generativa. Ele **nunca altera preços**: produz propostas que um administrador aprova, rejeita ou edita. Os preços aprovados vão para o **rascunho** da próxima tabela, que só passa a valer depois da publicação.

## Dados de entrada

Só entram partidas **validadas**: status `COMPLETED`, confirmadas pelos dois jogadores ou resolvidas pela administração. Partidas em andamento, contestadas ou anuladas são ignoradas em todas as métricas, não só no win rate. Isso evita que partidas forjadas manipulem a popularidade.

Para cada partida, o motor usa o snapshot dos decks, os bans e os picks.

## Definições

Para um personagem *c*:

| Termo | Definição |
|---|---|
| **Presença no deck** | *c* está no snapshot do deck de um jogador. Não conta como pick. |
| **Oportunidade de ban** | Cada presença no deck: o oponente poderia ter banido *c*. |
| **Disponível** | *c* está no deck e não foi banido pelo oponente. |
| **Oportunidade de pick** | Cada situação "disponível". |
| **Escolhido (pick)** | *c* entrou no time final. |
| **Efetivamente utilizado (jogo)** | Pick numa partida com resultado validado. Como só partidas validadas entram, jogo = pick. |

## Métricas

```
Pick Rate  = picks / oportunidades de pick
Ban Rate   = bans / oportunidades de ban
Win Rate   = (vitórias + 0,5·empates) / jogos
Win Rate suavizado = (vitórias + 0,5·empates + k·0,5) / (jogos + k)      k = priorGames (padrão 20)
Sample Size = partidas, oportunidades e jogos (todos armazenados em BalanceMetric)
```

A **suavização bayesiana** puxa amostras pequenas para 50%. Por exemplo, 3 vitórias em 3 jogos dão 56,5%, e não 100%.

**Linhas de base** do escopo: `picks totais / oportunidades totais` e `bans totais / oportunidades totais`. Popularidade e bans são medidos em relação a elas.

## Escopos

Cada execução grava métricas em três escopos:

- `CURRENT_CYCLE`: partidas do ciclo do Abismo vigente.
- `HISTORICAL`: partidas fora do ciclo vigente, dentro da janela histórica (`historyDays`, padrão 90).
- `OVERALL`: as duas juntas, usado nos painéis.

Os históricos anteriores ficam disponíveis: cada `BalanceRun` e suas métricas são preservadas.

## Score por escopo

Cada sinal fica em [-1, 1] e é multiplicado pela confiança amostral `n / (n + amostra mínima)`:

```
vitória     = clamp((WR_suavizado − 0,5) / 0,15, −1, 1) · conf(jogos)          exige jogos ≥ minSampleGames
popularidade= clamp((pickRate − base) / base, −1, 1) · conf(oport. de pick)     exige oport. ≥ minSampleOpportunities
bans        = clamp((banRate − base') / base', 0, 1) · conf(oport. de ban)      base' = max(base, 0,05); só pressiona para cima

score_escopo = Σ peso_i · sinal_i / Σ peso_i (apenas sinais com amostra suficiente)
```

Pesos padrão: vitória 0,5, popularidade 0,25, bans 0,25. Um sinal sem amostra suficiente não entra na conta. Assim, um sinal forte e bem amostrado (por exemplo, um personagem banido em quase toda oportunidade) não é diluído por sinais que ainda não têm dados.

## Ciclo atual × histórico

```
maturidade m = min(1, partidas do ciclo atual / cycleMaturityMatches)      (padrão 30)
λ (peso do ciclo atual) = (1 − historyWeight) · m     se há histórico      (historyWeight padrão 0,3)
                        = m                           sem histórico
score = λ · score_ciclo + (1 − λ) · score_histórico
```

- Quando o Abismo muda, o ciclo novo começa com peso 0 e ganha peso conforme acumula amostra.
- **Conservadorismo no início do ciclo**: o limiar vira `actionThreshold · (2 − m)` (até o dobro) e o passo máximo vira `maxStep · (0,5 + 0,5·m)`.

## Da pontuação ao preço

```
se |score| < limiar  → sem proposta
delta = sinal(score) · max(1, round(|score| · passo máximo))
preço sugerido = clamp(preço atual + delta, preço mínimo, preço máximo)
```

Salvaguardas:

- **Não sobe preço por alta vitória em poucas partidas**: amostra mínima, suavização e confiança se combinam.
- **Não reduz agressivamente por baixa escolha**: sem evidência de desempenho ruim (sinal de vitória negativo com amostra suficiente), a redução fica limitada a 1 ponto. O sinal `DECREASE_CAPPED` aparece na proposta.
- Ser pouco banido nunca reduz preço.
- Personagens **bloqueados** pelo admin não recebem sugestões.
- Personagens desabilitados para competição são ignorados.

## Sinais detectados (explicação na proposta)

| Código | Condição |
|---|---|
| `HIGH_POPULARITY_HIGH_PERFORMANCE` | pick rate ≥ 1,25 × base **e** WR suavizado ≥ 55%, com amostra |
| `HIGH_BAN_RATE` | ban rate ≥ max(1,5 × base, 25%), com amostra |
| `PERSISTENT_LOW_USAGE` | pick rate ≤ 0,5 × base no ciclo atual **e** no histórico |
| `LOW_PERFORMANCE` | WR suavizado ≤ 45% com amostra |
| `TREND_UP` / `TREND_DOWN` | variação ≥ 15 p.p. no pick rate ou ≥ 8 p.p. no WR em relação ao histórico |
| `LOW_SAMPLE`, `EARLY_CYCLE`, `DECREASE_CAPPED` | avisos de cautela |

Cada proposta guarda o score, a confiança, os componentes por escopo, o peso λ, os sinais e um texto explicativo.

## Frequência

| Quando | O quê |
|---|---|
| Diariamente (job) | Calcula e grava métricas. Não gera propostas. |
| Semanalmente (job, dia configurável em `proposalWeekday`, padrão segunda) | Gera propostas; as pendentes anteriores viram `SUPERSEDED`. |
| A qualquer momento (admin) | "Gerar propostas agora" ou **"Revisão extraordinária"** (por exemplo, após a mudança do Abismo). |
| Publicação | Manual ("Publicar agora") ou agendada. Um job publica tabelas agendadas quando a data chega. |

O balanceamento não está atrelado a ciclos de 30 dias: a janela histórica e a maturidade do ciclo são independentes.

## Fluxo administrativo

1. Revisar as propostas pendentes em **Admin → Preços e propostas** (métricas, sinais, explicação).
2. **Aprovar** (com o preço sugerido ou editado) ou **rejeitar**. A justificativa é obrigatória.
3. Opcional: definir preços manualmente, liberar personagens e bloquear sugestões.
4. **Publicar** a nova versão agora ou agendar. A versão recebe número sequencial; a anterior é arquivada.
5. Partidas já iniciadas continuam com os custos dos seus snapshots.

Se a tabela vigente mudar depois de uma análise, propostas antigas não podem mais ser aprovadas. É preciso gerar uma nova análise.

## Parâmetros (Admin → Configurações)

| Parâmetro | Padrão | Efeito |
|---|---|---|
| `minSampleGames` | 10 | Jogos mínimos para o sinal de vitória |
| `minSampleOpportunities` | 10 | Oportunidades mínimas para popularidade e bans |
| `priorGames` | 20 | Força da suavização |
| `weightWin` / `weightPick` / `weightBan` | 0,5 / 0,25 / 0,25 | Pesos dos sinais |
| `historyWeight` | 0,3 | Peso do histórico com o ciclo maduro |
| `cycleMaturityMatches` | 30 | Partidas para o ciclo atingir maturidade |
| `maxStep` | 3 | Variação máxima por atualização (pontos) |
| `actionThreshold` | 0,2 | Score mínimo para propor |
| `historyDays` | 90 | Janela histórica |
| `proposalWeekday` | 1 | Dia da geração regular (0 = domingo) |
| Preço mínimo/máximo | 3 / 40 | Vêm do formato competitivo |
