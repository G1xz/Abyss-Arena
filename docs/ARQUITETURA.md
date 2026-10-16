# Arquitetura

Monólito modular em TypeScript. Um único processo Node atende HTTP (Next.js), WebSocket (Socket.IO) e executa os jobs periódicos. O **PostgreSQL é a fonte da verdade**: nenhuma informação competitiva vive apenas no React ou na memória do Socket.IO.

```
            navegador
   ┌────────────┴─────────────┐
   │ HTTP (páginas, actions)  │ WebSocket (/socket.io)
   ▼                          ▼
┌──────────────────────── server.ts ────────────────────────┐
│  Next.js App Router        Socket.IO        Agendador     │
│  (RSC + Server Actions)    (salas/draft)    (jobs)        │
│            └────────────┬──────┴──────────────┘           │
│                 src/server/* (serviços)                   │
│                 src/domain/* (regras puras)               │
└────────────────────────────┬──────────────────────────────┘
                             ▼
                        PostgreSQL
```

## Camadas

| Pasta | Responsabilidade | Depende de |
|---|---|---|
| `src/domain` | Regras puras e determinísticas: motor de draft, avaliação de deck, vencedor, BalanceEngine. Sem I/O; usadas no servidor **e** no cliente (pré-visualização). | nada |
| `src/server` | Casos de uso com banco, autorização, transações, auditoria e rate limit. Toda regra competitiva é reaplicada aqui. | domain, Prisma |
| `src/app` | Páginas (Server Components) e Server Actions finas, que validam a sessão e delegam aos serviços. | server |
| `server.ts` | Processo persistente: Next + Socket.IO + jobs. | server |

Os serviços recebem o usuário (`SessionUser`) explicitamente e checam permissões por conta própria (`assertAdmin`, `requireSeat`). A UI nunca é tratada como barreira de segurança.

## Módulos

- **Catálogo** (`server/catalog`): interface `CharacterCatalogProvider` com três implementações. `YattaCatalogProvider` é a primária (nomes em PT). `JmpCatalogProvider` é a alternativa. `SnapshotCatalogProvider` é o último recurso, usado só pelo seed. A normalização gera um slug canônico a partir do nome em inglês (comum entre as fontes), consolida as variantes do Viajante, descarta não jogáveis (sem elemento), não lançados e versões beta. A sincronização nunca apaga personagens nem preços: ausências viram `missingFromSource`, e respostas suspeitas de serem parciais não marcam ausências. Personagens novos entram com `competitiveEnabled = false`.
- **Preços** (`server/pricing`): `PriceVersion` com estados `DRAFT → (SCHEDULED) → ACTIVE → ARCHIVED`. Um índice único parcial no banco garante no máximo um rascunho, um agendamento e uma tabela vigente. Toda escrita passa por um *advisory lock*. Cada alteração gera um `PriceChange` (anterior, novo, origem MANUAL/SUGGESTED/INITIAL, justificativa, admin, aprovação e vigência) e um `AdminAuditLog`.
- **Conta do jogador** (`server/roster`, `domain/roster-import.ts`): `OwnedCharacter` guarda constelação e nível de cada personagem que o jogador tem. A importação lê o texto copiado do HoYoLAB (`Nv.90`, linha opcional de constelação, nome), casa os nomes com o catálogo e aceita substituir ou mesclar. A edição manual salva alterações em lote numa transação.
- **Custo efetivo** (`domain/pricing.ts`): custo base (C0) da tabela vigente + curva de constelação por raridade + ajustes do admin por constelação + bônus de nível 95/100 só para 5★. É calculado igual no cliente (prévia) e no servidor (validação).
- **Decks** (`server/decks`): validação no servidor contra a tabela vigente e a conta do jogador. Um deck que fica inválido (nova tabela ou constelação nova) é mantido e mostra o excesso.
- **Convites** (`server/invites`): `MatchInvite` com estados PENDING/ACCEPTED/DECLINED/CANCELLED/EXPIRED (expiração de 10 min). Um índice único parcial garante no máximo um convite pendente por sala. Aceitar ocupa o assento B na mesma transação que trava o convite.
- **Partidas** (`server/matches`): salas, motor de draft e resultados. Cada partida congela a configuração (`Match.config`, incluindo as regras de custo), as regras do Abismo (`Match.rules`) e, no início do draft, os decks em `MatchDeckSnapshot` + `MatchDeckSnapshotEntry` (custo efetivo, constelação, nível, nome, elemento, ícone). Mudanças posteriores de catálogo, preço ou deck não alteram partidas já iniciadas.
- **Ciclos do Abismo** (`domain/abyss-wiki.ts`, `server/abyss/sync.ts`): o andar 12 de cada ciclo vem da wiki do Fandom (página `Spiral_Abyss/Floors/<data>`, lida pela API do MediaWiki): datas, nível e meta de cada câmara, perturbação da linha ley por metade (traduzida por padrões de frase) e inimigos por onda. Nomes em português e ícones vêm do catálogo de inimigos da yatta.moe; quando a yatta não tem o inimigo, a imagem da página dele na wiki é baixada e guardada em `AbyssImage` (a CDN da wiki não permite exibição direta) e servida por `/api/abyss/images/<id>`. O ciclo é identificado pela data (`externalKey`), começa às 04:00 do servidor configurado e entra em vigor sozinho. Um ciclo cadastrado à mão para o mesmo período é vinculado em vez de duplicado, e as metades desligadas pelo admin são preservadas. Cada sala congela os dados do andar em `Match.rules`.
- **HP e resistências dos inimigos** (`domain/abyss-enemy.ts`): a sincronização guarda, por inimigo, o HP de mundo aberto no nível da câmara (HP inicial × curva `monsterCurve` da yatta, versão principal do inimigo), as resistências e as dicas de combate. O Abismo multiplica esse HP por um fator que nenhuma fonte pública traz (4,75 na 12-1 de 2026-10, conferido com o jogo). O admin informa o multiplicador de cada metade (`AbyssChallenge.hpMultiplier`) ou o HP exato de um inimigo (`hpOverrides`, prioridade sobre o multiplicador), e a sincronização nunca sobrescreve esses campos. Variantes "Battle-Hardened" e inimigos fora da yatta ficam sem HP base, porque os atributos do inimigo comum não valem para elas. Sem multiplicador, a tela mostra o HP de mundo aberto com asterisco e aviso. A sala congela o HP já resolvido.
- **Balanceamento** (`domain/balance.ts` + `server/balance`): ver [BALANCEAMENTO.md](BALANCEAMENTO.md).
- **Jobs** (`server/jobs/scheduler.ts`): a cada 10 min verifica publicações agendadas, métricas diárias, propostas semanais, a sincronização diária do catálogo e a do Abismo (de hora em hora enquanto faltar o ciclo vigente, ou o próximo nos 3 dias antes da virada; senão, uma vez por dia). A tabela `JobRun` (chave única `job + período`) garante execução única por período, mesmo após reinícios. Falhas são re-tentadas após 1 h.

## Tempo real

- O Socket.IO compartilha o servidor HTTP do Next (`destroyUpgrade: false`, para não interferir no HMR do Next em desenvolvimento).
- **Autenticação do socket**: o handshake lê o mesmo cookie de sessão do site. A sessão é revalidada em cada ação, então logout ou mudança de papel valem na hora.
- **Fluxo**: o cliente emite `match:*` com ack; o serviço valida e persiste numa transação; depois do commit, `notifyMatchChanged` publica um `match:state` para cada socket da sala, montado por espectador.
- **Reconexão e atualização da página**: o estado inicial vem do servidor no render da página. A cada (re)conexão o cliente reemite `match:subscribe` e recebe o estado completo do banco. O cliente descarta estados com `revision` menor que o atual, o que evita aplicar mensagens fora de ordem.
- **Canal pessoal**: cada conexão entra em `user:<id>`, por onde chegam os convites (`invite:new`, `invite:updated`). O sino do cabeçalho mantém a conexão aberta em todas as páginas.
- **Presença** (quem está conectado, global e por sala) fica em memória: é informação não crítica. Para várias instâncias, troque por um adapter Redis do Socket.IO.

## Concorrência e integridade

- Toda mutação de partida roda numa transação que começa com `SELECT ... FOR UPDATE` na linha da partida, o que serializa ações concorrentes.
- O motor de draft valida participante, turno, passo esperado (`stepIndex`: rejeita ações atrasadas e duplicadas), propriedade do personagem e disponibilidade.
- Segunda barreira no banco: `DraftAction @@unique([matchId, stepIndex])` e `@@unique([matchId, type, targetSeat, characterId])`.
- `CHECK (cost > 0)` e `CHECK (timeMs > 0)`; pontos sempre inteiros.
- O teste `concorrência: ações simultâneas no mesmo turno…` dispara 4 ações paralelas e verifica que só uma é gravada.

## Autenticação

Usamos autenticação própria em vez do Auth.js. O provider de credenciais do Auth.js só funciona com sessões JWT, e o servidor Socket.IO precisa validar a mesma sessão no handshake e revogá-la na hora. A solução:

- **Senha**: scrypt (Node `crypto`), N=2¹⁵, r=8, p=3 (parâmetros da OWASP), com sal por usuário e os parâmetros gravados no hash.
- **Sessões**: token aleatório de 256 bits no cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção. O banco guarda só o SHA-256 do token. Validade de 30 dias, renovada (sliding) no máximo uma vez por dia.
- **Recuperação de acesso**: token de uso único com validade de 1 h, enviado por SMTP. Fica desabilitada se o SMTP não estiver configurado. A resposta não revela se o e-mail existe.
- **Papéis**: `USER` e `ADMIN`. Rotas `/admin/*` respondem 404 para quem não é admin, e todas as funções administrativas checam o papel no servidor.

## Segurança

- Zod em todas as entradas: Server Actions, eventos Socket.IO e serviços.
- Rate limiting em memória (janela deslizante) para login, cadastro, recuperação, criação de sala, ações de draft, envio de resultados e ações administrativas.
- Erros de domínio (`AppError`) têm mensagens seguras. Os demais viram "Erro interno" e o detalhe só vai para o log do servidor.
- Proteções básicas contra fraude: não é possível jogar contra si mesmo; limite de 3 partidas ativas por jogador; tempo dentro de limites configuráveis; confirmação bilateral; contestação com decisão administrativa auditada; só resultados validados contam para ranking e balanceamento.
- Cabeçalhos: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Server Actions têm checagem de CSRF por Origin/Host feita pelo Next.

## Modelo de dados (resumo)

`User`, `Session`, `PasswordResetToken`, `OwnedCharacter` · `MatchInvite` · `Character`, `PriceVersion`, `CharacterPrice`, `PriceChange` · `Deck`, `DeckCharacter` · `AbyssCycle`, `AbyssChallenge` · `Match`, `MatchPlayer`, `MatchDeckSnapshot`, `MatchDeckSnapshotEntry`, `DraftAction`, `MatchEvent` · `MatchResult`, `ResultEvidence`, `MatchDispute` · `BalanceRun`, `BalanceMetric`, `BalanceProposal` · `AdminAuditLog`, `SystemSetting`, `JobRun`.

Detalhes em [`prisma/schema.prisma`](../prisma/schema.prisma).

## Pontos de extensão previstos

- **Timer por turno**: `DraftConfig.turnTimeoutSeconds` já existe na configuração congelada. Basta um job que aplique a ação padrão ao expirar.
- **ELO/MMR**: `User.rating` está reservado. O ranking atual usa vitórias, taxa e derrotas.
- **Drafts intercalados**: a sequência é declarativa (`BAN_PLAYER_A, PICK_PLAYER_B, ...`), e o preset `INTERLEAVED` já existe.
- **Escala horizontal**: troque o rate limit e a presença em memória por Redis e use `@socket.io/redis-adapter`. Defina `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
