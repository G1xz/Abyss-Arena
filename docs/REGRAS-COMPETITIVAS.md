# Regras competitivas

Valores padrão; todos configuráveis em **Admin → Configurações**. Cada sala congela a configuração vigente no momento da criação.

## Personagens da conta

- Cada jogador declara em **Meus personagens** os personagens que tem, com **constelação** (C0–C6) e **nível**.
- Há duas formas de preencher: colar o texto da página de personagens do HoYoLAB (Ctrl+A, Ctrl+C), com nível e constelação lidos automaticamente, ou editar à mão (marcar quem tem, escolher constelação e nível).
- O Viajante aparece uma vez no HoYoLAB e é registrado em todas as variantes por elemento. Os Manequins são ignorados.
- A plataforma não verifica a conta do jogador: os dados são declarados.

## Personagens e preços

- A tabela de preços vigente define o **custo base (C0)** de cada personagem (padrão entre 10 e 400).
- **Constelação:** o custo segue uma curva sobre o C0, configurável para 4★ e 5★. O padrão é C1 +15%, C2 +30%, C3 +40%, C4 +50%, C5 +60% e C6 +100%. O admin pode fixar o custo de constelações-chave de um personagem específico (por exemplo, a C2 da Furina).
- **Nível:** nos 4★, não altera o custo. Nos 5★, nível 95 soma +5% e nível 100 soma +10% (configurável).
- Só entram em partidas personagens **liberados** pela administração **e** com preço na tabela vigente. Personagens novos do catálogo chegam desabilitados.
- A tabela inicial é **provisória** (C0: 5★ = 100, 4★ = 40, Viajante = 40) e aparece marcada com `*`.
- Preços mudam apenas por publicação de uma nova versão da tabela, manual ou agendada, sempre por um administrador.

## Decks

- Orçamento padrão: **1000 pontos**. Não há limite de quantidade além do orçamento.
- O deck só pode ter personagens da sua conta. O custo de cada um usa a sua constelação e o seu nível.
- Um personagem aparece no máximo uma vez por deck.
- Tamanho mínimo = picks por jogador + bans que o oponente pode aplicar (padrão 8 + 2 = **10**).
- Decks são validados no servidor ao salvar, ao selecionar na sala, ao confirmar prontidão e no início do draft.
- Se uma nova tabela, ou uma constelação nova na sua conta, deixar um deck acima do orçamento, ele **não é apagado**: a biblioteca mostra o excesso e o jogador ajusta.

## Sala X1

Estados: `WAITING → READY → BANNING/PICKING → LOCKED → AWAITING_RESULTS → COMPLETED`, com os desvios `DISPUTED` e `CANCELLED`.

1. O anfitrião (jogador A) desafia o oponente pelo nickname, em **Jogar**. A sala é criada e o convite chega na hora (sino no topo da página). Convites expiram em 10 minutos.
2. O convidado (jogador B) aceita e entra na sala. O deck padrão dele é selecionado automaticamente se for válido. Se ele recusar, o anfitrião pode convidar outra pessoa para a mesma sala. Só se entra numa sala por convite.
3. Os dois escolhem um deck válido e confirmam prontidão. Trocar de deck desfaz a prontidão.
4. O anfitrião inicia o draft. Nesse momento a tabela vigente é fixada e os dois decks viram **snapshots imutáveis**.
5. O anfitrião pode cancelar, e o convidado pode sair, apenas antes do início do draft.

Cada jogador pode ter no máximo 3 partidas ativas ao mesmo tempo.

## Draft

- Padrão: **2 bans e 8 picks por jogador** (dois times de 4, para a metade de cima e a de baixo da câmara), em **serpente**:
  `BAN A, BAN B, BAN B, BAN A, PICK A, PICK B, PICK B, PICK A, PICK A, PICK B, PICK B, PICK A, …` (20 passos).
- No draft, cada card mostra a constelação e o nível declarados, e o custo congelado.
- **Ban**: remove um personagem do deck **do oponente**.
- **Pick**: escolhe um personagem do **próprio** deck que não tenha sido banido.
- Os dois times podem ter o mesmo personagem, porque cada jogador usa a própria conta. O mesmo personagem não aparece duas vezes no mesmo time.
- Não é possível banir um personagem que o oponente já escolheu. Isso importa em drafts intercalados.
- A sequência é configurável: presets *Bans primeiro + picks alternados*, *Bans primeiro + picks em serpente*, *Intercalado* ou uma sequência personalizada. O servidor exige o número exato de bans e picks de cada jogador.
- Ações fora do turno, atrasadas, duplicadas ou ilegais são rejeitadas pelo servidor.

## Partida no Abismo

- O administrador define o **ciclo do Abismo** (nome, datas, andar, regras) e quais **câmaras e metades** valem para o formato. A sala congela essas regras na criação.
- Os dois jogadores fazem a mesma seleção de desafios no Genshin, usando apenas os 8 personagens escolhidos no draft (4 em cada metade).
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
