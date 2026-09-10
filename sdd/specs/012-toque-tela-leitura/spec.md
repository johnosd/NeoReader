# Feature Specification: Controle de toque na tela de leitura

**Slug**: `012-toque-tela-leitura`

**Created**: 2026-09-10

**Status**: Convergida

**Input**: Usuário trouxe exemplos do app Moon Reader (tela "Screen Touch
Control" com zonas de toque configuráveis por grid). Validado via
`sdd-assess` em `sdd/assessments/controle-customizavel-toque-na-tela-leitura/`
(veredito `go`). Escopo original combinado com o usuário: nova zona de
toque na borda esquerda com ação fixa (sem customização ainda) +
visualização read-only de um mapa mostrando todas as zonas de toque
ativas hoje. **Pivotado durante o `sdd-execute`** (ver Clarifications,
sessão 2026-09-10 continuação): a ação da zona esquerda passou de
"voltar capítulo/seção anterior" pra "abrir o índice (TOC)" — protótipo
da navegação foi testado no device real e o usuário não viu valor nela;
abrir o índice foi julgado mais valioso.

## Escopo

### Incluído

- Nova zona de toque na borda esquerda da área de leitura, limitada
  verticalmente à faixa central da tela (entre as zonas de chrome de
  topo e rodapé já existentes), que abre o índice (tabela de conteúdo)
  do livro — o mesmo painel hoje acessível pelo botão de TOC no menu do
  leitor.
- A nova zona funciona mesmo com TTS ativo, seguindo o mesmo padrão das
  zonas de chrome já existentes.
- A zona não emite feedback visual próprio antes de abrir o índice (sem
  flash/indicador dedicado) — o próprio painel de índice abrindo já é o
  feedback.
- Tela read-only em Settings > Aparência com um diagrama estático +
  legenda mostrando todas as zonas de toque ativas hoje na tela de
  leitura: topo/rodapé/direita = mostrar/esconder menu, centro (texto) =
  tradução inline / Word Lens, nova borda esquerda = abrir índice.

### Fora de Escopo

- Grid de 9 zonas configuráveis e tela de customização/atribuição de
  ações por zona (candidato a v2 futura, após validar uso real desta
  versão mínima) — decidido explicitamente em 2026-09-10 (2ª rodada):
  implementação fica simples/fixa, sem introduzir uma estrutura de
  mapeamento zona→ação no código ainda.
- Navegação de capítulo/seção via toque (voltar ou avançar) —
  descartada nesta rodada: prototipada e testada no device real, mas o
  usuário não viu valor nela; substituída pela ação de abrir o índice
  (ver Clarifications).
- Qualquer mudança na faixa direita existente (continua exclusivamente
  alternando o menu/chrome).
- Mudar o modelo de leitura de `flow=scrolled` pra paginação real.
- Gesto de "Long Tap" (toque longo) e qualquer ação associada a ele.
- Mudanças no comportamento de auto-hide do menu/chrome — já resolvido
  separadamente (bug `menu-chrome-leitor-some-sozinho-apos`).
- Persistência/preferência do usuário sobre a zona — é comportamento
  fixo do app nesta rodada, não uma configuração salva.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir o índice tocando a borda esquerda (Priority: P1)

Como leitor, quero tocar numa faixa na borda esquerda da tela de leitura
pra abrir o índice (tabela de conteúdo) direto, sem precisar abrir o
menu primeiro pra depois tocar no botão de TOC.

**Why this priority**: É o valor central desta feature — um atalho de
1 toque pra uma ação que hoje exige 2 toques (abrir o menu, depois tocar
em TOC). Entrega o valor principal da feature sozinha.

**Independent Test**: Testável abrindo qualquer livro, tocando a faixa
esquerda (região central verticalmente, entre as zonas de chrome de
topo e rodapé) e confirmando que o painel de índice abre diretamente.

**Acceptance Scenarios**:

1. **Given** o leitor está exibindo qualquer seção do livro, **When** o
   usuário toca na faixa esquerda (fora das zonas de chrome de
   topo/rodapé e fora de texto legível), **Then** o painel de índice
   (TOC) abre diretamente — mesmo painel acionado hoje pelo botão de
   TOC no menu.
2. **Given** o TTS (narração) está ativo e tocando, **When** o usuário
   toca na faixa esquerda, **Then** o índice abre normalmente (mesmo
   padrão das zonas de chrome existentes, que também não são bloqueadas
   pelo TTS).
3. **Given** o usuário toca no canto superior-esquerdo ou
   inferior-esquerdo da tela (dentro da zona de chrome de
   topo/rodapé), **When** o toque acontece, **Then** o comportamento é
   o de hoje (mostrar/esconder o menu) — a nova zona de índice não se
   estende a esses cantos.
4. **Given** o usuário toca em texto legível (parágrafo) que esteja
   fisicamente perto da borda esquerda, **When** o toque acontece sobre
   o texto, **Then** o comportamento de tradução inline / Word Lens tem
   prioridade — a nova zona nunca intercepta toques que caiam sobre
   texto legível.

---

### User Story 2 - Visualizar o mapa de zonas de toque do leitor (Priority: P2)

Como leitor, quero ver, na tela de Aparência das configurações, um
diagrama mostrando o que cada zona de toque da tela de leitura faz
hoje, pra entender o comportamento do app sem precisar descobrir por
tentativa e erro.

**Why this priority**: Resolve a queixa de que hoje não existe nenhuma
forma de visualizar isso — mas é informativo, não bloqueia a User Story
1, que já entrega o valor funcional principal sozinha.

**Independent Test**: Testável abrindo Settings > Aparência e conferindo
que o diagrama e a legenda descrevem corretamente as zonas ativas
(topo/rodapé/direita = menu, centro = tradução, esquerda = índice).

**Acceptance Scenarios**:

1. **Given** o usuário está na tela de Settings > Aparência, **When** a
   seção do mapa de zonas é exibida, **Then** um diagrama estático da
   tela de leitura mostra todas as zonas ativas hoje (topo, rodapé,
   direita, centro/texto, nova faixa esquerda) com uma legenda
   descrevendo a ação de cada uma.
2. **Given** o diagrama está visível, **When** o usuário interage com
   ele (toca em qualquer parte do diagrama), **Then** nada acontece
   além do que já é padrão de rolagem/leitura da tela de Settings — o
   diagrama é somente leitura, sem nenhuma ação executável a partir
   dele.
3. **Given** o usuário abre a tela de Aparência num idioma diferente de
   português (i18n do app: pt-BR, en, es), **When** o mapa de zonas é
   exibido, **Then** a legenda está traduzida conforme o idioma ativo,
   seguindo o padrão de i18n já usado no restante do app.

### Edge Cases

- Orientação de tela (retrato/paisagem) ou redimensionamento de janela
  (Capacitor Android x Web): a faixa esquerda deve recalcular sua
  posição igual às zonas de chrome já existentes fazem hoje (mesma
  abordagem de geometria responsiva).
- Tocar a zona esquerda com o índice já aberto: comportamento segue o
  que o painel de índice já faz hoje quando acionado enquanto já está
  aberto (nenhuma lógica nova precisa ser criada pra esse caso — reusa
  o handler existente do botão de TOC do menu).
- Livro sem TOC/índice definido no EPUB: a zona esquerda continua
  abrindo o mesmo painel que o botão de TOC do menu abre hoje — o
  comportamento pra "sem índice" já existe e não muda com esta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE reconhecer uma nova zona de toque na borda
  esquerda da área de leitura, limitada verticalmente à faixa entre as
  zonas de chrome de topo e rodapé já existentes (sem sobrepor os
  cantos superior/inferior-esquerdos).
- **FR-002**: Ao tocar na zona esquerda (fora de texto legível), o
  sistema DEVE abrir o índice (tabela de conteúdo) do livro — o mesmo
  painel acessível hoje pelo botão de TOC no menu do leitor.
- **FR-003**: Abrir o índice pela zona esquerda DEVE funcionar
  independentemente do estado do TTS (ativo/pausado/inativo), seguindo
  o mesmo padrão das zonas de chrome já existentes.
- **FR-004**: Toques que caiam sobre texto legível (parágrafo) DEVEM
  continuar priorizando o comportamento de tradução inline / Word Lens,
  mesmo que fisicamente próximos da borda esquerda — a nova zona nunca
  deve interceptar esses toques.
- **FR-005**: A zona esquerda NÃO DEVE produzir nenhum feedback visual
  dedicado antes de abrir o índice (sem flash, ripple ou indicador) — o
  próprio painel abrindo já é o feedback.
- **FR-006**: O sistema DEVE expor, em Settings > Aparência, um diagrama
  estático (somente leitura) representando todas as zonas de toque
  ativas hoje na tela de leitura (topo, rodapé, direita, centro/texto,
  nova faixa esquerda), com legenda descrevendo a ação de cada uma.
- **FR-007**: O diagrama e sua legenda DEVEM estar disponíveis nos 3
  idiomas já suportados pelo app (pt-BR, en, es), seguindo o provider de
  i18n existente.
- **FR-008**: O sistema NÃO DEVE alterar o comportamento das zonas de
  chrome já existentes (topo, rodapé, direita) nem da faixa direita
  como um todo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário lendo qualquer parte do livro consegue abrir o
  índice tocando a borda esquerda da tela, sem precisar abrir o menu
  primeiro.
- **SC-002**: Nenhuma regressão de comportamento nas zonas de toque já
  existentes (chrome de topo/rodapé/direita, tradução inline, highlight,
  bookmark, navegação por TTS) — cobertura de testes automatizados
  existente para tap continua 100% passando.
- **SC-003**: Um usuário consegue, em Settings > Aparência, identificar
  corretamente o que cada zona de toque da tela de leitura faz, sem
  precisar perguntar ou descobrir por tentativa e erro.
- **SC-004**: Toque em texto legível próximo à borda esquerda continua
  abrindo tradução inline em 100% dos casos testados manualmente em
  device real — zero abertura acidental do índice por engano.

## Assumptions

- O índice (TOC) já existe como feature completa no app (painel hoje
  acionado pelo botão de TOC do menu/chrome) — a zona esquerda é só um
  atalho a mais pra abrir o mesmo painel, reaproveitando o handler já
  existente, não uma feature de índice nova.
- A tela de Settings > Aparência já existe e comporta uma nova
  seção/subseção sem precisar de uma tela dedicada nova.
- Não há necessidade de persistir nenhuma preferência do usuário nesta
  rodada — a zona esquerda tem comportamento fixo, e o diagrama é só
  informativo.
- O público desta feature é o mesmo público atual do NeoReader (não há
  segmentação por usuário Pro/free) — não há sinal de que isso deva ser
  um recurso pago.

## Clarifications

### Sessão 2026-09-10

- Q: Onde deve morar a visualização read-only do mapa de zonas de
  toque? → A: Dentro de Settings > Aparência (existente).
- Q: A semântica exata do gesto na borda esquerda (pular capítulo
  inteiro vs. rolar ~90% da tela) — deixar em aberto pra protótipo, ou
  decidir agora? → A: Deixa em aberto pra protótipo (recomendado) —
  resolver no início do sdd-plan/sdd-execute comparando as duas no
  device real. **[Superado — ver sessão de continuação abaixo: a
  premissa "navegar capítulo" foi descartada por completo depois do
  protótipo.]**
- Q: O que acontece se o usuário tocar a zona esquerda já estando no
  primeiro capítulo/seção do livro? → A: Nada acontece (toque ignorado
  silenciosamente). **[Obsoleto — não se aplica mais; a zona não navega
  seção, ver sessão de continuação.]**
- Q: A zona esquerda deve ter feedback visual no toque (ex:
  flash/indicador)? → A: Silencioso — sem indicador extra. **(mantido,
  agora aplicado a "abrir o índice" em vez de "navegar seção")**
- Q: Com TTS ativo, a zona esquerda deve navegar normalmente ou ficar
  desativada? → A: Segue o padrão das zonas de chrome existentes — age
  normalmente mesmo com TTS ativo. **(mantido, agora "abre o índice"
  em vez de "navega")**
- Q: Como resolver a sobreposição geométrica nos cantos
  superior/inferior-esquerdos, hoje já ocupados pelas zonas de chrome de
  topo/rodapé (que cobrem a largura inteira)? → A: Zona esquerda fica
  limitada à faixa central, entre as zonas de chrome de topo e rodapé —
  sem sobrepor os cantos. **(mantido)**
- Q: Como deve ser apresentado o mapa de zonas em Settings > Aparência?
  → A: Diagrama estático com legenda (não interativo). **(mantido)**

### Sessão 2026-09-10 (continuação — durante o sdd-execute, T001)

- Q: O protótipo de "abrir a zona esquerda pula pro fim do
  capítulo/seção anterior" (reaproveitando `prevToEnd()`/
  `goToAdjacentSection`) foi testado no device real. Funcionou tecnicamente
  (102 testes verdes, sem regressão), mas o usuário reportou: "funcionou
  mas não gostei, não vi valor em voltar para início do capítulo."
  Qual ação a zona esquerda deve ter em vez disso? → A: Abrir o índice
  (TOC) diretamente — mesmo painel hoje acessível só pelo botão de TOC
  do menu. Motivo do usuário: "o objetivo não é navegar mas
  definir/mapear zona do touch screen e ações" — o valor da feature está
  em ter zonas de toque mapeadas pra ações úteis, e abrir o índice foi
  julgado mais valioso que voltar um capítulo.
- Q: Com a mudança de ação, vale introduzir uma estrutura de código tipo
  "mapeamento zona→ação" (ex: tabela/objeto interno), mesmo sem UI de
  customização pro usuário ainda? → A: Não — manter simples, a zona
  esquerda chama a ação de abrir índice diretamente, igual as outras
  zonas hoje (centro=tradução, direita=chrome). Sem abstração nova no
  código; a "definição do mapa" fica documentada no diagrama da User
  Story 2, não numa estrutura de dados customizável (isso seria a v2,
  fora de escopo, conforme já decidido no assessment).
- Q: Isso muda o pré-requisito de "não há seção anterior → ignora
  silenciosamente" (FR-003 antigo)? → A: Sim, esse requisito deixa de
  existir — abrir o índice está sempre disponível, não depende de haver
  ou não uma seção anterior. Removido da spec.
- Validado no device real após a mudança: usuário confirmou "funcionou
  bem, gostei" tocando a borda esquerda com o índice abrindo
  diretamente, em qualquer ponto do livro.
