# Regras competitivas

Valores padrão; todos configuráveis em **Admin → Configurações**. Cada sala congela a configuração vigente no momento da criação.

## Personagens e preços

- Cada personagem tem um custo inteiro em pontos, definido na **tabela de preços vigente** (entre o preço mínimo e o máximo; padrão 3–40).
- Só entram em partidas personagens **liberados** pela administração **e** com preço na tabela vigente. Personagens novos do catálogo chegam desabilitados.
- A tabela inicial é **provisória** (5★ = 18, 4★ = 10, Viajante = 8) e aparece marcada com `*`.
- Preços mudam apenas por publicação de uma nova versão da tabela, manual ou agendada, sempre por um administrador.

## Decks

- Orçamento padrão: **100 pontos**. Não há limite de quantidade além do orçamento.
- Um personagem aparece no máximo uma vez por deck.
- Tamanho mínimo = picks por jogador + bans que o oponente pode aplicar (padrão 4 + 2 = **6**).
- Decks são validados no servidor ao salvar, ao selecionar na sala, ao confirmar prontidão e no início do draft.
- Se uma nova tabela deixar um deck acima do orçamento, ele **não é apagado**: a biblioteca mostra o excesso e o jogador ajusta.

## Sala X1

Estados: `WAITING → READY → BANNING/PICKING → LOCKED → AWAITING_RESULTS → COMPLETED`, com os desvios `DISPUTED` e `CANCELLED`.

1. O anfitrião (jogador A) cria a sala e compartilha o código ou o link.
2. O convidado (jogador B) entra. O deck padrão dele é selecionado automaticamente se for válido.
3. Os dois escolhem um deck válido e confirmam prontidão. Trocar de deck desfaz a prontidão.
4. O anfitrião inicia o draft. Nesse momento a tabela vigente é fixada e os dois decks viram **snapshots imutáveis**.
5. O anfitrião pode cancelar, e o convidado pode sair, apenas antes do início do draft.

Cada jogador pode ter no máximo 3 partidas ativas ao mesmo tempo.

## Draft

- Padrão: **2 bans e 4 picks por jogador**, na sequência:
  `BAN A, BAN B, BAN B, BAN A, PICK A, PICK B, PICK A, PICK B, PICK A, PICK B, PICK A, PICK B`.
- **Ban**: remove um personagem do deck **do oponente**.
- **Pick**: escolhe um personagem do **próprio** deck que não tenha sido banido.
- Os dois times podem ter o mesmo personagem, porque cada jogador usa a própria conta. O mesmo personagem não aparece duas vezes no mesmo time.
- Não é possível banir um personagem que o oponente já escolheu. Isso importa em drafts intercalados.
- A sequência é configurável: presets *Bans primeiro + picks alternados*, *Bans primeiro + picks em serpente*, *Intercalado* ou uma sequência personalizada. O servidor exige o número exato de bans e picks de cada jogador.
- Ações fora do turno, atrasadas, duplicadas ou ilegais são rejeitadas pelo servidor.

## Partida no Abismo

- O administrador define o **ciclo do Abismo** (nome, datas, andar, regras) e quais **câmaras e metades** valem para o formato. A sala congela essas regras na criação.
- Os dois jogadores fazem a mesma seleção de desafios no Genshin, usando apenas os 4 personagens do próprio time.
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
