# Regras competitivas

Valores padrão; todos configuráveis em **Admin → Configurações**. Cada sala congela a configuração vigente no momento da criação.

## Personagens da conta

- Cada jogador declara em **Meus personagens** os personagens que tem, com **constelação** (C0–C6) e **nível**.
- Há duas formas de preencher: colar o texto da página de personagens do HoYoLAB (Ctrl+A, Ctrl+C), com nível e constelação lidos automaticamente, ou editar à mão (marcar quem tem, escolher constelação e nível).
- O Viajante aparece uma vez no HoYoLAB e é registrado em todas as variantes por elemento. Os Manequins são ignorados.
- A plataforma não verifica a conta do jogador: os dados são declarados.

## Personagens e preços

- A tabela de preços vigente define o **custo base (C0)** de cada personagem (padrão entre 0 e 400; personagens podem ser **gratuitos**).
- **Constelação:** o custo segue uma curva sobre o C0, configurável para 4★ e 5★. O padrão é C1 +15%, C2 +30%, C3 +40%, C4 +50%, C5 +60% e C6 +100%. O admin pode fixar o custo de constelações de um personagem específico (por exemplo, a C2 da Furina); o ajuste fixo vale no lugar da curva.
- **Nível:** nos 4★, não altera o custo. Nos 5★, nível 95 soma +5% e nível 100 soma +10% (configurável).
- Só entram em partidas personagens **liberados** pela administração **e** com preço na tabela vigente. Personagens novos do catálogo chegam desabilitados.
- A tabela inicial vem da **Abyss Cup** (x1 russo, `prisma/data/abyss-cup-prices.json`): o custo de cada personagem em **cada constelação** (C0 a C6), com os **valores da planilha**. O orçamento deles é de 500 pontos e o nosso é de 1000, então sobra o dobro de folga para montar o deck. O C0 vira o custo base e C1 a C6 viram ajustes fixos do personagem. Personagens fora dessa tabela recebem um preço provisório (5★ = 100, 4★ = 40), marcado com `*`.
- O balanceamento automático propõe mudanças no **C0**. Com as constelações fixadas pela tabela, ajustar C1 a C6 continua sendo decisão do admin.
- Preços mudam apenas por publicação de uma nova versão da tabela, manual ou agendada, sempre por um administrador.

## Decks

- Orçamento padrão: **1000 pontos**. Não há limite de quantidade além do orçamento.
- O deck só pode ter personagens da sua conta. O custo de cada um usa a sua constelação e o seu nível.
- Um personagem aparece no máximo uma vez por deck.
- **Tamanho mínimo do deck: em definição.** O valor deve garantir que os dois jogadores tenham opções válidas para concluir todos os bans e picks. Enquanto isso, o sistema exige picks + bans recebidos (8 + 3 = **11**).
- Decks são validados no servidor ao salvar, ao selecionar na sala, ao confirmar prontidão e no início do draft.
- Se uma nova tabela, ou uma constelação nova na sua conta, deixar um deck acima do orçamento, ele **não é apagado**: a biblioteca mostra o excesso e o jogador ajusta.

## Sala X1

Estados: `WAITING → READY → BANNING/PICKING → LOCKED → AWAITING_RESULTS → COMPLETED`, com os desvios `DISPUTED` e `CANCELLED`.

1. O anfitrião desafia o oponente pelo nickname, em **Jogar**. A sala é criada e o convite chega na hora (sino no topo da página). Convites expiram em 10 minutos.
2. O convidado aceita e entra na sala. O deck padrão dele é selecionado automaticamente se for válido. Se ele recusar, o anfitrião pode convidar outra pessoa para a mesma sala. Só se entra numa sala por convite.
3. Os dois escolhem um deck válido e confirmam prontidão. Trocar de deck desfaz a prontidão.
4. Antes de iniciar o draft, os jogadores definem por **acordo** quem será **Jogador A** e quem será **Jogador B**. Não há sorteio nem prioridade automática do anfitrião. Na sala, qualquer um dos dois pode **Trocar lados**; a troca desfaz a prontidão, e confirmar de novo é o aceite.
5. O anfitrião inicia o draft. Nesse momento a tabela vigente é fixada e os dois decks viram **snapshots imutáveis**.
6. O anfitrião pode cancelar, e o convidado pode sair, apenas antes do início do draft.

Cada jogador pode ter no máximo 3 partidas ativas ao mesmo tempo.

## Draft de personagens

O draft é totalmente público: imunidades, bans, picks, armas e consumo de orçamento são visíveis em tempo real para os dois jogadores e espectadores. Não existe escolha oculta.

### Ordem e quantidade

- Cada jogador faz **3 bans** e **8 picks**, em duas fases:
  1. **Bans, fase 1:** `A → B → B → A` (2 de cada).
  2. **Picks, fase 1:** serpentine `A → BB → AA → BB → A` (4 de cada).
  3. **Bans, fase 2:** `A → B` (mais 1 de cada, total de 6).
  4. **Picks, fase 2:** de novo `A → BB → AA → BB → A` (mais 4 de cada).
- Quando há fase de imunidade, ela ocorre antes dos bans: cada jogador declara um personagem imune, na ordem `A → B`.
- **Vez dupla** (ex.: `BB`): o jogador seleciona os dois personagens e confirma uma vez só. Se um deles for imune, ele entra no pick que aceita imune (4º ou 8º).
- Fluxo completo: **imunidade → bans → picks → bans → picks → armas → preparação → organização de times**.

### Imunidade

- A fase de imunidade só ocorre se os decks tiverem **pelo menos dois personagens em comum com o mesmo custo de personagem**.
- O custo do personagem considera apenas as cópias possuídas: C0 = 1, C1 = 2, C2 = 3, C3 = 4, C4 = 5, C5 = 6 e C6 = 7.
- O custo de armas **não entra** nesta comparação.
- Cada jogador declara **um** personagem imune, e as duas declarações devem ser de personagens diferentes.
- O primeiro imune declarado fica indisponível para a declaração do segundo jogador.
- Os dois personagens imunes ficam disponíveis para **ambos** os jogadores.
- Um imune só pode ser escolhido no **4º ou no 8º pick individual** do jogador.
- Um jogador pode terminar com os dois imunes: escolhendo um no 4º pick e o outro no 8º.
- Se um jogador não escolher imune no 4º pick, ainda poderá escolher um no 8º.
- Personagens imunes não podem ser banidos.
- Se houver menos de dois personagens elegíveis, a fase de imunidade é pulada e o draft começa pelos bans. Nesse caso, os picks 4 e 8 são escolhas normais.

### Bans

- Cada jogador aplica **3 bans**.
- O alvo do ban precisa estar presente no **deck adversário**.
- O efeito do ban é **universal**: o personagem banido fica indisponível para os dois jogadores.
- Personagens imunes não podem ser banidos.
- Um personagem já banido não pode receber outro ban.
- Não é possível banir um personagem que o oponente já escolheu.

### Picks

- Cada jogador escolhe **8 personagens** do próprio deck.
- Personagens não imunes são exclusivos: quando escolhidos, ficam indisponíveis para o adversário.
- Personagens imunes permanecem disponíveis para ambos, somente nas janelas do 4º e do 8º pick individual.
- Os picks definem apenas o conjunto de oito personagens disponíveis; **não definem times, salas ou posições**.
- A seleção de um personagem não é aplicada imediatamente: o jogador seleciona e aperta **Confirmar**.
- Antes de confirmar, o jogador pode trocar a seleção sem consumir o undo.
- Cada jogador tem **um undo**, utilizável uma única vez na partida.
- O undo desfaz apenas o **último pick confirmado** daquele jogador; não desfaz imunidade nem ban.
- O undo é público: o personagem volta a ficar disponível para ambos e o turno retorna ao jogador que o utilizou.

### Timer de bans e picks

- Cada jogador tem **300 segundos independentes** para toda a fase de bans e picks.
- O cronômetro desconta apenas durante o turno do respectivo jogador.
- A contagem vai de 300 a 0 e, após zerar, continua negativa: -1s, -2s, -3s e assim por diante.
- O tempo negativo cresce indefinidamente até o final do draft.
- Não há ação automática, pulo de turno nem encerramento por tempo.
- A penalidade para tempo negativo será definida posteriormente.

### Como o sistema aplica os pontos em aberto

- **Undo:** vale enquanto o pick for a **última ação do draft**, ou seja, antes de o oponente agir. Também vale logo depois do último pick, enquanto ninguém enviou resultado. O tempo de quem estava com a vez é descontado até o momento do undo.
- **Sem opções válidas:** se bans, picks exclusivos e imunes fora da janela deixarem o jogador sem nenhuma escolha, ele **passa a vez** (botão "Passar a vez"; o servidor só aceita quando não há opção). Sem isso, o draft travaria; isso não é um pulo por tempo.
- **Imunidade:** "mesmo custo de personagem" é tratado como a mesma constelação nos dois decks. A fase usa o estado `BANNING` (a tela mostra "Imunidade").
- O relógio vale para imunidade, bans e picks. Cada jogador vê os dois relógios em tempo real.

## Fase de armas

> **Ainda não implementada.** Falta definir a tabela de custo de cada arma por refino e a duração da janela. Hoje o draft termina nos picks e a partida vai direto para os resultados.

- A escolha de armas ocorre **simultaneamente**, após os picks e antes da preparação para o confronto.
- Cada jogador recebe **100 pontos** exclusivos para armas.
- O custo é definido por arma, considerando raridade, se é assinatura e nível de refino.
- Cada arma possui sua própria escala de custo por refino; não há fórmula universal de R1 a R5.
- Entram apenas armas obtidas por **gacha ou passe de batalha**.
- Uma arma pode ser atribuída a mais de um personagem somente se o jogador possuir cópias suficientes.
- Cada atribuição consome o custo da arma separadamente.
- As escolhas permanecem **editáveis até o fim do cronômetro**; não há confirmação antecipada.
- Ao encerrar o cronômetro, a configuração final é travada.
- A duração da janela de armas fica **em aberto** e será calibrada após testes de ritmo.
- Armas, refinos e orçamento restante ficam visíveis em tempo real para jogadores e espectadores.

## Organização dos times

> **Ainda não implementada**: depende da fase de armas.

- A organização dos times é liberada somente **depois da fase de armas**.
- Os jogadores organizam composições no site para exibição ao público antes do duelo.
- Essa organização é informativa e não trava a configuração dentro do Genshin Impact.
- Durante o confronto, cada jogador continua livre para configurar seus times para cada sala do Abismo.

## Partida no Abismo

- O **ciclo do Abismo** é sincronizado automaticamente da wiki do Fandom: andar 12 com inimigos, nível, meta e perturbação de cada metade. O ciclo novo entra em vigor sozinho na virada do Abismo (dia 16, 04:00 do servidor América, 06:00 de Brasília).
- O administrador escolhe quais **câmaras e metades** valem para o formato e pode cadastrar ciclos à mão. A sala congela essas regras e os dados do andar na criação.
- Os dois jogadores fazem a mesma seleção de desafios no Genshin, usando apenas os 8 personagens escolhidos no draft.
- Cada jogador registra o **tempo total**, em `m:ss.mmm` ou segundos com decimais, e opcionalmente até 5 links de evidência.
- O tempo precisa estar dentro dos limites configurados (padrão: 5 s a 60 min).

## Resultado

- Vence o **menor tempo válido**.
- **Empate exato**: pela política padrão, registra empate. A alternativa configurável é "vence quem enviou primeiro".
- A partida só é concluída quando:
  1. os dois enviaram os tempos **e** cada um confirmou o tempo do oponente; **ou**
  2. um administrador resolveu a disputa.
- Depois que o oponente confirma, o seu tempo não pode mais ser alterado. Antes disso, você pode corrigir.

## Contestação

- Enquanto o tempo do oponente aguarda confirmação, você pode **contestá-lo** com uma justificativa (mínimo de 10 caracteres). A partida vai para `DISPUTED`.
- Um administrador analisa os tempos e os links e decide:
  - **Aceitar/ajustar tempos**: o vencedor é recalculado com os tempos finais.
  - **Definir vencedor**: por exemplo, quando um resultado é inválido.
  - **Empate**.
  - **Anular**: a partida é cancelada e não conta para nada.
- A decisão e a justificativa ficam registradas na partida e na auditoria.
- Capturas e vídeos **não** são verificados automaticamente.

## Ranking

Só contam partidas **concluídas com resultado validado**. Ordem:

1. Mais vitórias
2. Maior taxa de vitória: (vitórias + 0,5 × empates) ÷ partidas
3. Menos derrotas
4. Nickname, apenas para ordenação estável

O campo `rating` está reservado para um ELO/MMR futuro.
