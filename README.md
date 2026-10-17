<p align="center"><img src="src/assets/brand/logo.webp" alt="Genshin Draft Arena" width="560"></p>

# Genshin Draft Arena

Plataforma competitiva de **draft de Genshin Impact**: importe os personagens da sua conta (com constelação e nível), monte decks com orçamento de 1000 pontos, desafie jogadores pelo nickname, faça bans e picks em tempo real, dispute speedruns do Abismo Espiral com confirmação bilateral de tempos e acompanhe ranking, estatísticas e o **balanceamento orgânico supervisionado** de preços.

O combate acontece dentro do Genshin. A plataforma coordena o draft, registra os resultados e administra o ambiente competitivo. Ela não acessa contas, não automatiza partidas e não consulta tempos do jogo.

## Stack

| Camada | Tecnologia |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, componentes shadcn/ui (Radix) |
| Tempo real | Socket.IO no mesmo processo Node do Next (servidor customizado persistente, sem serverless) |
| Dados | PostgreSQL + Prisma 7 (adapter `pg`), migrations versionadas |
| Validação | Zod em todas as entradas (server actions, Socket.IO, serviços) |
| Autenticação | Própria: senha com scrypt + sessões no banco em cookie httpOnly (ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md#autenticação)) |
| Testes | Vitest (unitários + integração com PostgreSQL real e Socket.IO) e Playwright (E2E com 2 navegadores) |
| Deploy | Docker Compose (PostgreSQL + app + Caddy opcional), amd64/arm64 |

## Início rápido (desenvolvimento, sem Docker)

Requisitos: Node.js 20.19+ (testado com 24) e npm.

```bash
npm install
cp .env.example .env            # ajuste ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:local                # terminal 1: PostgreSQL embutido em localhost:5433 (deixe rodando)
npm run db:migrate              # terminal 2: aplica as migrations
npm run db:seed                 # admin, catálogo, tabela de preços inicial (Abyss Cup), ciclos do Abismo
npm run dev                     # http://localhost:3000
```

Com `SEED_DEMO_DATA=true` no `.env`, o seed também cria 6 jogadores `@demo.local`, decks e 48 partidas concluídas pelos fluxos reais, o que deixa estatísticas e propostas de balanceamento visíveis. A senha dos jogadores de demo vem de `DEMO_PASSWORD`; se estiver vazia, é gerada e exibida no console.

Para jogar sozinho localmente, abra duas janelas (uma anônima) com contas diferentes: importe os personagens em **Personagens** (colando o texto do HoYoLAB ou à mão), monte um deck e desafie a outra conta em **Jogar**. O convite aparece no sino da outra janela.

## Início rápido com Docker

```bash
cp .env.example .env            # defina POSTGRES_PASSWORD, ADMIN_EMAIL e ADMIN_PASSWORD
docker compose up -d --build    # migrations são aplicadas automaticamente na subida
docker compose exec app npm run db:seed
```

A aplicação fica em `http://localhost:3000`. Para colocar em produção numa VPS com HTTPS, siga [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Next + Socket.IO + jobs) |
| `npm run build` | `prisma generate` + `next build` + bundle do servidor em `dist/server.js` |
| `npm start` | Servidor de produção (`node dist/server.js`) |
| `npm run db:local` | PostgreSQL embutido para desenvolvimento sem Docker |
| `npm run db:migrate` / `db:migrate:dev` | Aplica / cria migrations |
| `npm run db:seed` | Seed idempotente |
| `npm run catalog:sync` | Sincroniza personagens com a API comunitária |
| `npm run balance:run [-- --proposals]` | Calcula métricas (e opcionalmente propostas) sem alterar preços |
| `npm run abyss:sync` | Sincroniza o ciclo vigente e o próximo do Abismo com a wiki |
| `npm run prices:import` | Leva a tabela da Abyss Cup (×2) ao rascunho de preços; `-- --publish` publica em seguida |
| `node scripts/brand-assets.mjs` | Gera logo, ícones e imagem de compartilhamento a partir de `assets/brand/logo-original.png` |
| `npm test` | Testes unitários e de integração (sobe PostgreSQL embutido sozinho) |
| `npm run test:e2e` | E2E com Playwright (exige `npm run build` antes) |
| `npm run typecheck` | TypeScript sem emitir arquivos |

## Testes

```bash
npm test                          # unitários + integração (PostgreSQL real, Socket.IO real)
npx playwright install chromium   # primeira vez
npm run build && npm run test:e2e # fluxo completo com 2 jogadores + admin em navegadores distintos
```

Sem `TEST_DATABASE_URL`, os testes sobem um PostgreSQL embutido em `.local/test-pgdata` (porta 54329) e recriam os bancos `abyss_arena_test` e `abyss_arena_e2e` a cada execução. Em CI, aponte `TEST_DATABASE_URL` para um servidor PostgreSQL.

## Documentação

- [Arquitetura](docs/ARQUITETURA.md): módulos, fluxo de dados, tempo real, concorrência, segurança
- [Regras competitivas](docs/REGRAS-COMPETITIVAS.md): decks, draft, partidas, resultados, disputas, ranking
- [Algoritmo de balanceamento](docs/BALANCEAMENTO.md): métricas, fórmulas, parâmetros e ciclos
- [Deploy em VPS](docs/DEPLOY-VPS.md): Ubuntu amd64/arm64 com Docker Compose e HTTPS

## Estrutura

```
server.ts                 servidor Node: Next.js + Socket.IO + agendador de jobs
prisma/                   schema, migrations, seed (+ snapshot offline do catálogo)
scripts/                  banco local, sincronização do catálogo, análise de balanceamento
src/domain/               regras puras (draft, deck, resultados, BalanceEngine) — sem I/O
src/server/               serviços com banco: auth, catálogo, preços, decks, partidas, balanceamento, jobs, realtime
src/app/                  páginas e server actions (App Router)
src/components/           UI compartilhada (shadcn/ui + componentes do jogo)
tests/                    unit/, integration/, e2e/, support/
deploy/Caddyfile          proxy reverso com HTTPS automático
```

## Avisos

- A tabela de preços inicial vem da Abyss Cup (x1 russo): custo por constelação, escalado ×2 para o orçamento de 1000 (`prisma/data/abyss-cup-prices.json`). Personagens fora dela recebem preço provisório (5★ = 100, 4★ = 40), marcado com `*`. Bancos que ainda só têm preços provisórios recebem essa tabela ao rodar o seed; em bancos com preços revisados, use `npm run prices:import`, que leva a tabela ao rascunho para o admin publicar.
- Constelação e nível dos personagens são **declarados** pelo jogador (importados do HoYoLAB ou editados à mão), sem verificação.
- O UID do Genshin informado no perfil é exibido como **não verificado**.
- Links de evidência são apenas informativos e não são verificados automaticamente.
- Dados de personagens e inimigos: [Project Amber / yatta.moe](https://gi.yatta.moe), com [genshin.jmp.blue](https://genshin.jmp.blue) como alternativa. Ciclos do Abismo: [Genshin Impact Wiki (Fandom)](https://genshin-impact.fandom.com/wiki/Spiral_Abyss), conteúdo sob CC BY-SA. Projeto de fãs, sem afiliação com a HoYoverse.
