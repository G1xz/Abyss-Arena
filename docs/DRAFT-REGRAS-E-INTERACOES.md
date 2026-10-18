# Guia de construção e comportamento da tela de draft

Projeto: Abyss Arena / Arena Espiral — nome em decisão.
Atualização: 18/10/2026.
Status: proposta documental preparada para revisão antes de commit. Não comprova implementação na aplicação.
Referências: decisões desta conversa, HTML revisão 4 e novo modelo visual enviado em 18/10/2026.

## 1. Objetivo, escopo e precedência

A tela deve permitir que dois jogadores e espectadores entendam quem age, quais personagens estão disponíveis, quais escolhas são provisórias e quais ações já foram confirmadas. Deve reduzir confirmações repetitivas sem alterar a ordem competitiva.

Este guia especifica estrutura de informação, regras e comportamento para a interface desenvolvida em paralelo. Não exige copiar a paleta, tipografia ou todos os detalhes de CSS do HTML. A nova referência define o posicionamento central dos imunes e bans, substituindo a orientação anterior de exibi-los sob os nomes dos jogadores.

Para o draft, decisões explícitas consolidadas neste guia prevalecem sobre documentação legada e comportamentos acidentais do protótipo. Não migrar toda a economia, nem criar regras para resolver pendências, por inferência.

Escopo desta entrega: documentação local para revisão. Nenhuma alteração de código, HTML, banco ou GitHub é realizada por este documento. Os critérios técnicos propostos não significam funcionalidades já implementadas.

## 2. Estrutura da tela

### 2.1 Mapa das regiões

Na referência de desktop, A está à esquerda e B à direita.

```text
┌──────────────────────┬────────────────────────────┬──────────────────────┐
│ Jogador A · timer     │ Estado e orientação        │ timer · Jogador B    │
├──────────────────────┼────────────────────────────┼──────────────────────┤
│ Picks de A           │ IMUNES                     │ Picks de B           │
│ 8 posições           │ Par para A | Par para B    │ 8 posições           │
│                      │                            │                      │
│                      │ BANS                       │                      │
│                      │ Feitos por B | Feitos por A│                      │
│                      │ Contra A     | Contra B    │                      │
│                      │ 3 posições   | 3 posições  │                      │
├──────────────────────┼────────────────────────────┼──────────────────────┤
│ Deck de A            │ Ação atual e confirmação   │ Deck de B            │
│ Paginação própria    │ Seleções provisórias       │ Paginação própria    │
└──────────────────────┴────────────────────────────┴──────────────────────┘
```

O diagrama expressa hierarquia e associação, não coordenadas rígidas. Os controles de ação podem ocupar outra área central disponível, desde que não ocultem imunes, bans ou decks. Não transformar este diagrama em uma nova composição visual concorrente com a interface paralela.

### 2.2 Cabeçalhos dos jogadores

Cada cabeçalho deve conter nome, timer individual compacto ao lado e indicação inequívoca de turno ativo. Não depender apenas de cor para indicar a vez.

A/B são definidos por acordo, não automaticamente pelo anfitrião. O layout espelhado não pode trocar a identidade dos jogadores nem a autoria das ações.

### 2.3 Conjuntos laterais de picks

- Reservar 8 posições por jogador. A referência sugere duas fileiras de quatro; isso é organização visual, não divisão de times.
- Cada posição representa um pick individual confirmado, na ordem 1 a 8.
- Durante seleção provisória, mostrar uma prévia distinguível de um pick confirmado; não preencher uma posição como definitiva antes de Confirmar.
- Mostrar retrato e identificação acessível por nome. O texto pode ser compacto, mas deve continuar disponível sem depender exclusivamente de hover.
- Um imune efetivamente escolhido ocupa uma das 8 posições do jogador, como qualquer pick.
- Picks 1–4 não significam Time 1, nem 5–8 Time 2. Não atribuir times, salas ou posições a partir dessa organização.

### 2.4 Bloco central de imunes

- Fica acima do bloco central de bans, com título próprio.
- Representar o mesmo par compartilhado para cada lado: dois retratos associados a A e os mesmos dois associados a B, conforme a referência.
- São 2 personagens distintos compartilhados, não 4 declarações, 4 personagens imunes ou picks adicionais.
- Diferenciar declaração/proteção de escolha efetiva no conjunto de picks.
- Imunidade não implica posse exclusiva de quem declarou. Ambos podem escolher os dois, respeitando suas janelas individuais.
- Quando a fase for pulada por insuficiência de elegíveis, informar 'Sem fase de imunidade' ou equivalente; não sugerir que ainda faltam declarações.

### 2.5 Bloco central de bans

- Fica abaixo dos imunes, com 6 posições em dois grupos de 3.
- Metade esquerda, voltada para A: bans aplicados por B contra o deck de A.
- Metade direita, voltada para B: bans aplicados por A contra o deck de B.
- Não voltar a exibir os grupos sob os nomes dos jogadores.
- Identificar autor e alvo, por exemplo 'Bans de B · contra A' à esquerda e 'Bans de A · contra B' à direita. Evitar 'Bans de A' sem contexto se puder ser interpretado como bans recebidos por A.
- A associação espacial indica o alvo original, não limita o efeito. Todo ban continua universal e bloqueia o personagem nos dois decks.
- Usar retratos com tratamento de ban distinguível, sem depender somente de dessaturação ou de cor.
- Durante seleção, qualquer prévia deve ser explicitamente provisória. O grupo confirmado só muda depois da confirmação aceita.

### 2.6 Decks e navegação

- Deck A permanece associado a A, deck B a B. Não trocar fisicamente os decks quando muda o turno.
- Em imunidade, o ator seleciona um elegível em seu deck; nos bans, age no deck adversário; nos picks, no próprio deck.
- Realçar o deck alvo com instrução textual, por exemplo 'A bane aqui' no deck B.
- Cards devem priorizar nome, retrato e estado de disponibilidade. Constelação/custo só devem usar dados definidos e validados; os valores fictícios do HTML não são tabela competitiva.
- Compactar cards para manter as opções utilizáveis no espaço disponível.
- Se não couberem, oferecer paginação independente por deck: Anterior, Próxima, página atual/total e total de personagens.
- Trocar de página não aplica ações, não perde seleção nem reinicia o timer.
- Nas janelas de imunidade, garantir que os imunes elegíveis sejam fáceis de localizar. O HTML usa navegação automática à página de um deles; a interface paralela pode resolver a descoberta de outra forma explícita.
- Busca/filtros são opcionais de implementação, não substituem as regras de disponibilidade. Se existirem, não podem apagar seleções nem omitir que há escolhas selecionadas fora da página atual.

### 2.7 Área de ação

Deve mostrar fase, ator, deck alvo, posição individual ou intervalo, quantidade selecionada/necessária, seleções na ordem e Confirmar.

Exemplos de conteúdo funcional:

- 'Bans 2–3 de 6 · Jogador B · selecione 2 no deck de A'.
- 'Picks 3–4 de B · 1/2 selecionado · próxima escolha: 4º pick, imunes opcionais'.
- 'Picks 4–5 de A · o imune só pode ocupar a primeira escolha deste par'.

Não confundir número global de ação com posição individual do pick.

## 3. Regras do fluxo

### 3.1 Ordem geral e publicidade

Fluxo: imunidade quando elegível → bans → picks → armas simultâneas → preparação e apresentação dos times.

Tudo é público para jogadores e espectadores, sem escolhas ocultas. Distinguir visualmente seleção provisória de ação confirmada também na sincronização. O espectador acompanha e não pode agir.

A organização dos times no site só é liberada depois de personagens e armas e serve à apresentação das estratégias. Os jogadores continuam livres para reorganizar seus times no Genshin para cada sala.

### 3.2 Imunidade

- Elegível: personagem presente nos dois decks com o mesmo custo de personagem.
- Para limitados, comparar cópias: C0=1 até C6=7. Armas não entram.
- Não generalizar essa escala para categorias ainda não definidas nem migrar toda a economia antiga automaticamente.
- Com 0 ou 1 elegível, pular toda a fase, sem declaração parcial.
- Com 2 ou mais, A declara um e depois B declara outro, distinto.
- Os dois ficam protegidos contra ban e disponíveis para ambos.
- Imunes só podem ser escolhidos no 4º ou 8º pick individual. São opcionais nessas janelas.
- Um jogador pode escolher ambos, um por janela, sem repetir no próprio conjunto.
- Se não escolheu imune no 4º, ainda pode escolher um no 8º.
- A escolha de um imune por A não o bloqueia para B e vice-versa.

### 3.3 Bans e lotes

Cada jogador aplica exatamente 3 bans. Alvo no deck adversário, sem imunidade e sem ban anterior. Ban universal, sem repetição de alvo.

Ordem: `A-B-B-A-A-B`.

| Lote | Ator | Quantidade | Ações globais |
| --- | --- | --- | --- |
| 1 | A | 1 | 1 |
| 2 | B | 2 | 2 e 3 |
| 3 | A | 2 | 4 e 5 |
| 4 | B | 1 | 6 |

Nos lotes de 2, selecionar ambos antes de confirmar. Nenhum ban se aplica pelo primeiro clique. Não aceitar lote incompleto nem sétimo ban.

### 3.4 Picks e lotes

Cada jogador escolhe 8 personagens do próprio deck. Banidos são inválidos. Não repetir personagem no próprio conjunto. Não imunes escolhidos são exclusivos e bloqueiam o personagem para o adversário.

Ordem: `A-B-B-A` repetida quatro vezes, sem reiniciar o agrupamento nas fronteiras dos blocos.

| Lote | Ator | Picks individuais desse jogador |
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

A também tem pares consecutivos, não apenas B.

## 4. Seleção provisória, edição e confirmação

### 4.1 Comportamento obrigatório

1. Clique em alvo válido adiciona seleção provisória, não ação confirmada.
2. Numerar a ordem das seleções quando houver par.
3. Recalcular a validade da próxima escolha considerando as seleções provisórias anteriores.
4. Confirmar fica indisponível até haver exatamente a quantidade exigida e todo o lote ser válido.
5. Ao confirmar, revalidar o lote inteiro. Somente uma confirmação aceita altera bans/picks confirmados e avança o turno.
6. Trocar ou limpar seleções antes da confirmação não consome undo.
7. Não aceitar repetição interna, confirmação parcial ou escolhas além do lote.
8. Troca de turno limpa o lote confirmado da área provisória, sem apagar o histórico.

### 4.2 Edição da ordem

No HTML revisão 4, clicar novamente numa escolha remove ela e as posteriores. Exemplo: remover a primeira de duas limpa ambas. Isso evita deslocar um imune da posição 4 para 3.

A interface paralela pode adotar edição diferente, mas deve revalidar todas as posições afetadas, explicar a ordem final e impedir confirmação de lote inválido. Não cobrar undo para editar escolhas ainda provisórias.

### 4.3 Imunidade em pares

Posição individual = picks confirmados daquele jogador + seleções anteriores no lote + 1.

- B em 3–4: imune bloqueado para a primeira escolha; liberado para a segunda após selecionar o pick 3.
- A em 4–5: imune liberado para a primeira escolha, não para a segunda.
- B em 7–8: imune liberado para a segunda escolha, não para a primeira.
- A em 8 isolado: imune ainda não usado por A fica disponível.
- Imune escolhido pelo adversário continua elegível; imune já escolhido pelo próprio jogador não.

Não exigir imune nem selecionar automaticamente um. Sem elegíveis, picks 4/8 permanecem normais.

## 5. Estados de componentes e da tela

### 5.1 Cards de personagem

| Estado | Apresentação e interação esperadas |
| --- | --- |
| Disponível nesta posição | Clicável, identificado como válido |
| Selecionado provisoriamente | Destaque de seleção e número de ordem; não aparenta confirmação |
| Imune fora de janela | Continua visível, bloqueado para pick com motivo identificável |
| Imune dentro de janela | Clicável se não foi escolhido pelo próprio jogador |
| Banido | Bloqueado nos dois decks; status de ban |
| Já escolhido por você | Bloqueado para repetição |
| Não imune escolhido pelo adversário | Bloqueado por exclusividade |
| Deck fora do alvo atual | Visível, sem permitir ação pelo ator naquele deck |
| Imagem indisponível | Nome/fallback preservados; regra e seleção continuam funcionando |

O estado de imunidade não apaga outros estados: um imune pode estar protegido e já escolhido por A, continuando disponível para B. Não usar uma única etiqueta ambígua para representar todos os casos.

### 5.2 Estados da tela e recomendações técnicas

| Estado | Comportamento de interface |
| --- | --- |
| Inicializando | Carregar dados antes de habilitar ações; mostrar falha explícita se a inicialização falhar |
| Aguardando seleção | Mostrar ator, fase, alvo e quantidade necessária |
| Lote parcial | Mostrar ordem e posições restantes; Confirmar indisponível |
| Lote pronto | Confirmar disponível; ainda pode editar sem undo |
| Confirmação em envio | Prevenir clique duplicado; indicar envio sem simular aceite definitivo |
| Confirmação recusada | Explicar motivo, atualizar disponibilidade e permitir correção sem aplicar parcialmente o lote |
| Observando turno adversário | Estado público acompanha a partida; não permitir que o jogador confirme pelo outro |
| Reconectando | Informar desconexão; recuperar estado autoritativo antes de reabilitar ações |
| Sem alvo válido | Explicar bloqueio; não inventar pulo, pick automático ou encerramento. Política de resolução ainda não definida |
| Personagens concluídos | Mostrar 8 picks por jogador; não afirmar que armas e preparação também terminaram |

Esses estados são especificação/recomendação para a aplicação real. O HTML local não comprova multiplayer, reconexão, persistência ou validação autoritativa.

## 6. Timer, undo e histórico

### 6.1 Timer

- 300 segundos próprios por jogador para bans e picks, não por ação.
- Desconta apenas durante o turno ativo, inclusive enquanto seleciona e confirma um par.
- Após zero, continua -1s, -2s etc. indefinidamente, sem escolha automática, pulo ou encerramento.
- Penalidade por tempo negativo permanece aberta.
- Ainda não foi decidido se declarar imunidade consome esses mesmos 300 segundos. O HTML descontar nessa fase não fecha a regra.
- Em produção, usar tempo autoritativo do servidor e sincronizar exibição. Esse requisito técnico não significa que o protótipo já o faça.

### 6.2 Undo

- Um uso por jogador, apenas para pick confirmado; reversão pública.
- Nunca desfaz declaração de imunidade ou ban.
- Edição de seleção provisória não é undo.
- Janela após ações posteriores do adversário, restauração de turno e desfazer um pick versus lote inteiro ainda precisam de definição conjunta.
- Não habilitar uma interpretação nova por inferência a partir deste guia.
- O undo da revisão 4 remove o último pick próprio sem recalcular adequadamente a sequência. Não é referência pronta para partidas reais.

### 6.3 Histórico

Manter registro público compreensível de declarações, bans, picks e reversões, distinguindo ator, alvo e ordem. Recomenda-se que a aplicação preserve o evento original e registre a reversão como novo evento para auditoria; não confundir isso com regra de undo já fechada.

## 7. Armas e apresentação dos times

- Armas são escolhidas simultaneamente depois dos personagens e antes da preparação.
- Cada jogador tem orçamento separado de 100 pontos para armas.
- Cada arma tem seus próprios preços por refino, sem fórmula universal.
- Cópias separadas permitem equipar a mesma arma em personagens diferentes, cobrando cada atribuição.
- Gacha e passe de batalha são origens discutidas para cobrança. Tratamento de outras origens está aberto; não presumir proibição.
- Tudo permanece editável até o cronômetro terminar, sem travamento por confirmação antecipada.
- Duração da janela ainda depende de teste de ritmo.
- Mostrar escolhas, refinos e orçamento publicamente.
- Só depois de personagens e armas liberar a organização de times no site. Essa apresentação não trava a organização dentro do Genshin.

O guia não especifica uma tela de armas completa nem uma duração de preparação: essas partes não foram prototipadas na revisão 4.

## 8. Responsividade, legibilidade e imagens

- Preservar associação de jogador, autor e alvo em qualquer adaptação. Se os lados forem empilhados ou espelhados, rotular explicitamente os grupos de bans.
- Manter imunes e bans como grupos centrais na referência de desktop; imunes acima dos bans. A adaptação estreita deve preservar essa hierarquia de informação, sem reduzir retratos até ficarem irreconhecíveis.
- Evitar que miniaturas crescentes escondam os controles ou obriguem rolagem excessiva para acessar o deck.
- Medir espaço vertical também com os 8 picks preenchidos, não só na tela inicial.
- Referência de escala da revisão 4: retratos de imunes/bans/picks até 72 px; 60/54 px em telas menores; imagens dos decks em 58/48 px. Medidas orientativas, não obrigação de copiar CSS.
- Imagens externas podem falhar. Nome, identificação e fallback devem permitir continuar operando.
- Disponibilidade, seleção e turno precisam de indicação além de cor; controles devem ser utilizáveis por teclado e ter nomes acessíveis. Trata-se de requisito proposto de qualidade de implementação.
- Paginação deve preservar foco e seleção e informar a página atual. Não assumir que todos os personagens caberão ao mesmo tempo em qualquer tamanho de tela.

## 9. Elementos do mockup sem função definida

A referência inclui uma faixa 'Relógio', pequenos contadores `00:00`, círculos e marcas que parecem controles de resets. A presença visual não define sua regra.

Antes de torná-los funcionais, esclarecer:

- O que cada contador mede, quando inicia/para e quem pode editá-lo.
- Se 'Relógio' apenas nomeia a área ou representa um timer adicional.
- O significado dos círculos, quantidade de usos e possível relação com resets.
- A origem de números/indicadores acessórios.
- O conteúdo e a função das áreas retangulares inferiores; a referência não determina por si só que sejam decks, vídeo ou outra informação.

Não associar esses elementos ao undo, criar cronômetro global, limite de resets ou regras de desempenho sem aprovação. Podem ser anotados como placeholders no design, sem aparência de controle funcional validado.

## 10. Contrato técnico recomendado para integração

Recomendações para implementar os comportamentos acima, não relato de código já entregue:

1. Separar estado provisório de seleção do estado confirmado da partida.
2. Servidor verifica ator autenticado, fase, turno, quantidade, pertencimento ao deck, bans, imunidade, exclusividade e posições individuais.
3. Uma confirmação de par é atômica: ou aceita os dois, ou nenhum. Nunca registrar o primeiro e falhar no segundo.
4. Proteger contra confirmação repetida e concorrente; não gerar ações extras por retransmissão.
5. Somente após aceite transmitir mudança de fase/turno e atualizar o conjunto confirmado.
6. Sincronizar a informação pública de seleções provisórias com aparência distinta das confirmações; espectadores não podem emitir ações.
7. Na reconexão, recuperar estado e tempo do servidor; revalidar qualquer seleção local antes de permitir confirmar.
8. Não congelar o timer automaticamente por erro de rede sem regra aprovada.
9. Não transformar número visual de slot em divisão de times.

## 11. Critérios de aceite

### Layout e informação

- [ ] A/B corretamente identificados, timer ao lado dos nomes e turno além de indicação por cor.
- [ ] Imunes no centro acima dos bans; o mesmo par compartilhado representado para ambos, sem quatro imunes distintos.
- [ ] Bans no centro: os 3 feitos por B à esquerda, lado de A; os 3 feitos por A à direita, lado de B.
- [ ] Autoria e alvo identificáveis; efeito universal preservado.
- [ ] Oito picks por jogador nas laterais, sem agrupamento automático em times.
- [ ] Imune escolhido também ocupa um dos oito slots laterais, sem pick extra.
- [ ] Decks acessíveis, paginação independente e seleção preservada entre páginas.
- [ ] Layout testado com todos os picks e bans preenchidos e em altura reduzida.
- [ ] Falha de imagem não impede identificar ou selecionar personagem válido.

### Interações e regras

- [ ] Nenhum clique aplica ação antes de Confirmar.
- [ ] Bans em lotes 1/2/2/1 e picks conforme a tabela de nove lotes.
- [ ] Confirmar só disponível para lote completo e válido; sem repetição ou confirmação parcial.
- [ ] Os dois jogadores conseguem selecionar dois personagens antes de confirmar nos seus turnos duplos.
- [ ] Imunes liberados só nos picks individuais 4/8; testar pares 3–4, 4–5, 7–8 e pick 8 isolado.
- [ ] Escolha de imune opcional; ambos podem escolher os mesmos dois, sem repetição no próprio conjunto.
- [ ] Com 0/1 elegível, nenhuma declaração parcial; com 2+, declarações A-B distintas.
- [ ] Exatamente 3 bans e 8 picks por jogador, sem ações excedentes.
- [ ] Não imune escolhido bloqueia adversário; ban bloqueia ambos.
- [ ] Edição pré-confirmação não consome undo.
- [ ] Apenas timer do ator desconta; após zero não dispara ação automática.

### Integração real

- [ ] Confirmações atômicas e proteção contra duplicidade testadas no servidor.
- [ ] Ator errado, observador e ações fora de fase recusados.
- [ ] Estado público e reconexão testados com dois jogadores e espectador.
- [ ] Política de undo decidida e coberta por testes antes de habilitar em partidas reais.
- [ ] Elementos acessórios sem regra não apresentados como funções prontas.

## 12. Pendências e relação com documentação antiga

Continuam em aberto:

- Janela de undo após ações posteriores e restauração consistente de turno.
- Undo de um pick ou do lote inteiro.
- Consumo dos 300 segundos na declaração de imunidade.
- Penalidade por tempo negativo.
- Mínimo de personagens e critérios de viabilidade considerando sobreposição dos decks.
- Política para ausência de alvos válidos.
- Duração da fase de armas e detalhes da preparação.
- Tratamento de armas de origens diferentes de gacha e passe.
- Custos para categorias não explicitadas pela escala de cópias de limitados.
- Função dos contadores, círculos, resets e áreas auxiliares do mockup.

A documentação antiga de custos e decks ainda menciona preços base/percentuais e orçamento próprio. Este guia não autoriza substituir toda essa economia. Também não valida a proibição de outras origens de armas nem fecha a janela de undo apenas porque documentos antigos descrevem um retorno de turno.

## 13. Limitações do protótipo de referência

O HTML revisão 4 contém decks fictícios de 30 personagens, oito compartilhados com mesmo custo e valores de teste. Não é catálogo validado de personagens, elementos, raridades ou preços.

É local, sem multiplayer/persistência, e termina depois dos personagens. Armas, preparação e organização dos times não estão implementadas. A função de undo tem risco de inconsistência. Não presumir validação de todos os casos de borda ou disponibilidade das imagens externas.

Seu posicionamento de imunes e bans sob os nomes está superado pelo modelo central definido em 18/10/2026. Nenhuma alteração no HTML está implícita nesta revisão documental.

SHA-256 do HTML recebido como referência histórica: `43e6518e69e1864c58ec6fc235f27c75d408c65427672929dd80923203166760`.
