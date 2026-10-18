# Draft: regras e contrato de interação

Especificação consolidada em 17/10/2026 a partir das decisões de produto e do protótipo `abyss-arena-draft-revisao-4.html`. Nome do produto ainda em decisão: Abyss Arena / Arena Espiral.

## 1. Escopo e precedência

Este documento complementa `REGRAS-COMPETITIVAS.md` e orienta a interface desenvolvida em paralelo. Em divergências sobre o draft, usar as decisões explícitas aqui consolidadas; não converter comportamentos acidentais do HTML em regras. As seções abaixo distinguem decisões fechadas, referências visuais, recomendações de implementação e pendências.

Este commit adiciona somente documentação. Não instala o HTML na aplicação, não altera componentes, serviços, banco ou motor do draft e não comprova implementação em produção. A interface paralela deve incorporar o comportamento, sem obrigação de copiar o layout ou os valores de CSS do protótipo.

## 2. Fluxo e informação pública

- A/B são definidos por acordo entre os jogadores, sem prioridade automática do anfitrião.
- Fluxo: imunidade, quando elegível; bans; picks; armas simultâneas; preparação e apresentação dos times.
- Tudo é público para jogadores e espectadores; não há escolhas ocultas. Diferenciar visualmente seleção provisória de ação confirmada.
- Cada jogador aplica 3 bans e escolhe 8 personagens do próprio deck.
- A ordem de picks não define times, salas ou posições.

## 3. Imunidade

- Só é elegível um personagem presente nos dois decks com o mesmo custo de personagem.
- Para personagens limitados, o custo considera cópias: C0=1, C1=2, C2=3, C3=4, C4=5, C5=6 e C6=7. Armas não entram na comparação.
- Não extrapolar essa escala para categorias ainda não definidas nem substituir a economia antiga de decks por inferência.
- Com menos de 2 elegíveis, pular toda a fase; com 2 ou mais, A declara 1 imune e B declara outro, distinto.
- Os dois imunes são protegidos contra ban e ficam disponíveis para ambos os jogadores, não apenas para quem os declarou.
- Só podem ser escolhidos no 4º e no 8º pick individual de cada jogador. A escolha é opcional nessas janelas.
- Cada jogador pode escolher os dois, um em cada janela, sem repetir personagem no próprio conjunto. A escolha de um imune por A não o bloqueia para B.
- Sem fase de imunidade, picks 4 e 8 são escolhas normais.

## 4. Bans: ordem e confirmação em lote

Ordem individual: `A-B-B-A-A-B`. Cada jogador aplica exatamente 3 bans. O alvo deve estar no deck adversário, não estar imune nem já banido. O ban é universal: remove o personagem da disponibilidade dos dois lados.

| Lote | Jogador | Quantidade | Ações globais |
| --- | --- | --- | --- |
| 1 | A | 1 | 1 |
| 2 | B | 2 | 2 e 3 |
| 3 | A | 2 | 4 e 5 |
| 4 | B | 1 | 6 |

Nos lotes duplos, selecionar os dois alvos antes de apertar Confirmar. O primeiro clique não aplica um ban. Confirmar exige lote completo e válido, sem repetição interna. A confirmação conjunta otimiza a interação, mas não altera a ordem competitiva nem permite um sétimo ban.

## 5. Picks: ordem e confirmação em lote

Ordem individual: `A-B-B-A` repetida quatro vezes, sem reiniciar o agrupamento nas fronteiras dos blocos. Um não imune escolhido bloqueia esse personagem para o adversário; imunes seguem a regra compartilhada. Personagens banidos ou já escolhidos pelo próprio jogador são inválidos.

| Lote | Jogador | Picks individuais desse jogador |
| --- | --- | --- |
| 1 | A | 1 |
| 2 | B | 1 e 2 |
| 3 | A | 2 e 3 |
| 4 | B | 3 e 4 |
| 5 | A | 4 e 5 |
| 6 | B | 5 e 6 |
| 7 | A | 6 e 7 |
| 8 | B | 7 e 8 |
| 9 | A | 8 |

### Contrato de seleção e confirmação

- Selecionar não aplica a ação. Em lote duplo, selecionar 2 personagens e confirmar ambos juntos, em vez de selecionar/confirmar duas vezes.
- Numerar as seleções: a ordem interna corresponde aos picks individuais.
- Validar a segunda seleção considerando a primeira como provisória, sem registrá-la antecipadamente.
- Habilitar Confirmar somente com todas as escolhas necessárias e válidas; revalidar o lote inteiro ao confirmar.
- Não aceitar repetição dentro do lote, confirmação parcial ou picks extras.
- Alterar ou limpar a seleção antes de confirmar não consome undo.
- A referência da revisão 4 remove uma seleção e as posteriores quando ela é clicada novamente. A interface paralela pode adotar outra edição, desde que revalide a ordem e não deixe um imune em posição inválida.
- Mudar de página do deck não aplica a ação nem apaga a seleção.

### Janelas de imunidade dentro de um par

Calcular a posição individual como: picks já confirmados daquele jogador + seleções anteriores no lote + 1. Não usar o número global da ação nem o número do lote.

- B nos picks 3 e 4: imune inválido na primeira seleção; após selecionar o pick 3, liberar imunes elegíveis para a segunda seleção.
- A nos picks 4 e 5: imune pode ocupar a primeira seleção, não a segunda.
- B nos picks 7 e 8: imune pode ocupar a segunda seleção, não a primeira.
- A no pick 8 isolado: liberar imunes ainda não escolhidos por A.
- Ambos podem escolher os mesmos dois imunes nas suas próprias janelas, mas nunca repetir um no próprio conjunto.

## 6. Apresentação dos personagens e paginação

### Requisitos de informação

Em cada painel de jogador, apresentar nesta ordem:

1. Nome, timer compacto ao lado e indicador de vez.
2. Imunes compartilhados, com retratos, em uma linha acima dos bans. Exibir os dois imunes nos dois painéis.
3. Bans recebidos, com retratos e indicação de quem os aplicou.
4. Picks confirmados daquele jogador, com retratos.

Os 3 bans aplicados por A aparecem sob o nome de B; os 3 aplicados por B aparecem sob o nome de A. A posição identifica o deck alvo, não muda o efeito universal. Usar rótulos como 'Bans de Jogador A' no painel B para não confundir autoria.

### Referência visual, sem impor uma segunda interface

- Na revisão 4, retratos de imunes, bans e picks chegam a 72 px, 1,5x os 48 px anteriores, reduzindo para 60/54 px em telas menores.
- Imagens dos decks são menores: 58 px de altura, ou 48 px em telas estreitas. Esses números são referência do HTML, não regra competitiva.
- Priorizar visibilidade e legibilidade do deck. Quando não couber no contêiner, oferecer Anterior/Próxima, página atual e quantidade total, com paginação independente por jogador.
- Nas janelas 4 e 8, tornar os imunes elegíveis fáceis de encontrar; a revisão 4 navega automaticamente à página de um deles.
- Preservar identificação por nome e fallback se imagens externas falharem. Não depender só de cores para comunicar seleção ou indisponibilidade.
- Testar o espaço vertical real, inclusive com 8 picks no painel; a paginação do HTML é uma aproximação por largura e faixas de altura, não garantia de que toda a tela cabe em qualquer viewport.

O palco de ação deve indicar fase, jogador ativo, posição ou intervalo individual, quantidade selecionada/necessária, ordem das seleções e botão Confirmar. Nas janelas 4/8, informar que imunes são opcionais.

## 7. Timer e undo

- Cada jogador tem 300 segundos próprios, descontados apenas no seu turno, incluindo a seleção e confirmação do lote. Não reiniciar o orçamento a cada escolha.
- Após zero, seguir -1s, -2s etc., sem limite e sem ação automática, pulo ou encerramento. Penalidade por tempo negativo permanece em aberto.
- Ainda precisa ser decidido se a declaração de imunidade usa esses mesmos 300 segundos. O HTML desconta nessa fase, mas isso não fecha a regra.
- Cada jogador tem 1 undo, somente para pick confirmado, com reversão pública. Não desfaz ban ou declaração de imunidade.
- Janela após ações posteriores do adversário, restauração de turno e comportamento diante de lote duplo precisam de definição conjunta. Não afirmar que desfazer o lote inteiro foi aprovado.
- A função undo da revisão 4 remove o último pick próprio e registra a reversão, mas não recalcula adequadamente a sequência. Não transplantá-la como comportamento pronto para partidas reais.

## 8. Armas e times

- Armas: fase simultânea após picks, antes da preparação; orçamento separado de 100 pontos por jogador.
- Cada arma tem preços próprios por refino; não existe fórmula universal. Cópias separadas permitem atribuições da mesma arma a personagens diferentes; cobrar cada atribuição.
- Gacha e passe de batalha são as origens discutidas para cobrança. O tratamento de outras origens permanece aberto: não presumir proibição.
- Atribuições editáveis até o fim do cronômetro, sem travamento por confirmação antecipada. Duração da janela ainda depende de testes de ritmo. Tudo permanece público.
- Organização dos times no site só depois de personagens e armas, para apresentar estratégias ao público. Não vincular picks 1–4 ou 5–8 a times específicos.
- Os jogadores continuam livres para reorganizar os times no Genshin para cada sala.

## 9. Pendências e divergências com a documentação antiga

- Custos antigos percentuais/base e orçamento de deck ainda aparecem em REGRAS-COMPETITIVAS.md. A comparação de cópias de limitados para imunidade não autoriza migrar toda essa economia. Custos das demais categorias precisam de definição.
- A restrição de armas a gacha/passe escrita no documento antigo não deve ser interpretada como decisão fechada sobre outras origens.
- O documento antigo descreve retorno de turno no undo, mas a janela após ações posteriores e o efeito sobre lotes continuam pendentes.
- Mínimo de personagens por deck e critérios de viabilidade diante da sobreposição continuam abertos. Os 30 personagens por deck do HTML são dados de teste, não mínimo obrigatório.
- Também seguem abertas a penalidade por tempo negativo, a cobrança de tempo na imunidade e a duração das armas.

## 10. Critérios de aceite e integração futura

### Comportamento e interface

- [ ] Com 0/1 elegível, nenhuma declaração de imunidade; com 2+, A e B declaram personagens diferentes.
- [ ] Ban universal; imunes protegidos; não imunes exclusivos; sem repetição no próprio conjunto.
- [ ] Exatamente 6 bans e 16 picks, com 3/8 por jogador e lotes conforme as tabelas.
- [ ] Nenhuma ação aplicada antes de Confirmar; lotes incompletos, repetidos ou inválidos recusados.
- [ ] Imunes habilitados nos picks individuais 4/8, inclusive dentro dos pares 3–4, 4–5 e 7–8; bloqueados nas demais posições.
- [ ] Os dois jogadores conseguem escolher os mesmos dois imunes sem duplicá-los no próprio conjunto.
- [ ] Imunes acima dos bans; bans de A no painel B e vice-versa; autoria explícita.
- [ ] Paginação independente preserva seleção; falha de imagem não bloqueia ações.
- [ ] Timer só do jogador ativo; contagem negativa sem automação; não presumir decisão sobre imunidade.

### Recomendações técnicas para a aplicação, não implementadas por este documento

- [ ] Validar ator, fase, turno, disponibilidade e lote completo no servidor; aplicar a confirmação como uma operação atômica.
- [ ] Proteger contra confirmações duplicadas/concorrentes e rejeitar o lote inteiro se inválido, sem aplicar só o primeiro personagem.
- [ ] Sincronizar estado público, seleções provisórias e confirmações distinguindo seus estados; reconexão não pode criar ações extras.
- [ ] Usar tempo autoritativo do servidor, não relógios independentes dos navegadores.
- [ ] Fechar a política de undo e testar sua consistência antes de usá-la em partidas reais.

## 11. Limites da referência

O HTML revisão 4 é local, com decks fictícios e custos de teste. Termina após os personagens e não implementa armas, preparação, organização de times, persistência ou multiplayer. A documentação de uma funcionalidade não significa que ela já funciona no protótipo ou na aplicação.

SHA-256 do HTML recebido, preservado como identificação da referência: `43e6518e69e1864c58ec6fc235f27c75d408c65427672929dd80923203166760`.
