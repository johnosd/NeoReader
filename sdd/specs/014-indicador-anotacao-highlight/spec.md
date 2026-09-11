# Feature Specification: Indicador visual de anotação em highlights com preview flutuante

**Slug**: `014-indicador-anotacao-highlight`

**Created**: 2026-09-10

**Status**: Implementada

**Input**: Reversão explícita da FR-011 da feature `013-anotacoes-highlights`
(que decidiu não exibir nenhum indicador visual de "tem anotação" sobre o
highlight). Pedido do usuário, com 2 imagens de referência de outro app
leitor: um highlight com anotação ganha uma marca amarela sobreposta no
início do trecho destacado (tipo aba de post-it); tocar nessa marca abre uma
caixa amarela flutuante posicionada acima do trecho, mostrando o texto da
anotação, sem precisar abrir o menu completo de gerenciamento do highlight.

## Escopo

### Incluído

- Um indicador visual (marca/aba) sobre highlights que possuem uma anotação
  (`Highlight.note` preenchida), sobreposto ao início do trecho destacado.
- Tocar nesse indicador abre uma caixa flutuante, posicionada perto do
  trecho, mostrando o texto completo da anotação em modo somente leitura.
- Fechar a caixa flutuante ao tocar fora dela.
- Highlights sem anotação continuam exatamente como hoje (sem indicador).
- O restante do trecho destacado (fora do indicador) continua abrindo o
  menu completo de gerenciamento do highlight, sem nenhuma mudança de
  comportamento.

### Fora de Escopo

- Editar a anotação diretamente na caixa flutuante — edição continua
  exclusivamente pelo fluxo já existente (tocar no highlight → menu →
  "Anotar"/"Editar anotação" → `HighlightNoteSheet`).
- Qualquer mudança no modelo de dados (`Highlight.note` já existe da feature
  013; nenhum campo novo é necessário).
- Sincronização da anotação (já fora de escopo desde a 013 — permanece
  local-only).
- Indicador ou preview escalarem com o tamanho de fonte/zoom do leitor —
  ambos usam tamanho fixo, independente da configuração de fonte (ver
  Assumptions).
- Customização de cor/posição do indicador pelo usuário.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver rapidamente que um highlight tem anotação (Priority: P1)

Enquanto lê, o usuário vê uma pequena marca amarela sobreposta ao início de
um highlight, distinta da cor do highlight em si, sinalizando que aquele
trecho tem uma anotação associada — sem precisar tocar em nada.

**Why this priority**: É o valor central do pedido — hoje não há nenhuma
forma de saber que um highlight tem anotação sem abrir o menu completo em
cada um. Sem isso, a User Story 2 não tem gatilho visual.

**Independent Test**: Pode ser testado abrindo um capítulo com um highlight
que tenha `note` preenchida e um highlight sem `note` — só o primeiro exibe
a marca. Não depende da User Story 2 para ter valor (o usuário já ganha a
sinalização visual mesmo sem tocar).

**Acceptance Scenarios**:

1. **Given** um highlight com anotação salva, **When** o capítulo é
   renderizado, **Then** uma marca amarela distinta aparece sobreposta ao
   início do trecho destacado.
2. **Given** um highlight sem anotação (nota vazia ou nunca criada),
   **When** o capítulo é renderizado, **Then** nenhuma marca aparece sobre
   ele.
3. **Given** um highlight cuja cor de destaque já é amarela/âmbar, **When**
   ele também tem anotação, **Then** a marca continua identificável (forma
   distinta, não só cor sólida) e não se confunde visualmente com a cor do
   highlight.
4. **Given** uma anotação existente é removida (nota apagada via
   `HighlightNoteSheet`), **When** o texto salvo fica vazio, **Then** a
   marca desaparece do highlight.

---

### User Story 2 - Ler a anotação sem abrir o menu completo (Priority: P2)

Ao tocar na marca amarela, o usuário vê o texto da anotação numa caixa
flutuante próxima ao trecho, sem precisar abrir o menu de gerenciamento do
highlight.

**Why this priority**: Depende da marca da US1 existir primeiro (é o
gatilho), mas entrega valor incremental próprio — leitura rápida da nota
sem o custo de navegar o menu completo.

**Independent Test**: Pode ser testado tocando na marca de um highlight com
anotação longa e curta, verificando que o texto completo aparece (com
rolagem se necessário) e que a caixa fecha ao tocar fora.

**Acceptance Scenarios**:

1. **Given** a marca amarela visível sobre um highlight com anotação,
   **When** o usuário toca nela, **Then** uma caixa amarela flutuante abre
   próxima ao trecho, mostrando o texto completo da anotação em modo
   leitura (sem campos editáveis).
2. **Given** a caixa flutuante aberta, **When** o usuário toca em qualquer
   lugar fora dela, **Then** a caixa fecha.
3. **Given** uma anotação longa que não cabe no espaço vertical padrão da
   caixa, **When** a caixa abre, **Then** o texto rola dentro da caixa (sem
   truncar/cortar o conteúdo).
4. **Given** um highlight cujo trecho está perto do topo da tela (sem
   espaço vertical suficiente acima para abrir a caixa), **When** o usuário
   toca na marca, **Then** a caixa abre abaixo do trecho em vez de acima.
5. **Given** a caixa flutuante aberta em modo leitura, **When** o usuário
   quer editar a anotação, **Then** ele precisa fechar a caixa e usar o
   fluxo já existente (tocar no highlight → menu → "Editar anotação") — a
   caixa não oferece nenhuma ação de edição.

---

### Edge Cases

- Tocar em qualquer parte do trecho destacado que não seja a marca amarela
  continua abrindo o menu completo de gerenciamento (Anotar/Editar
  anotação, Remover, Cor e estilo) — comportamento inalterado da feature
  013.
- Highlight muito curto (poucas palavras) — a marca não deve ultrapassar a
  largura do próprio trecho nem sobrepor o texto vizinho fora do highlight.
- Dois highlights com anotação muito próximos/adjacentes — cada marca fica
  restrita ao início do seu próprio trecho; sobreposição visual entre
  marcas de highlights diferentes é aceitável como limitação conhecida
  (não é o foco desta rodada).
- Mudança de tema (claro/escuro) do leitor — a marca e a caixa mantêm a
  mesma cor amarela de referência em ambos os temas, com contraste
  suficiente para leitura do texto sobre o fundo amarelo.
- Reflow do texto (troca de fonte, tamanho de fonte, orientação de tela) —
  a marca deve permanecer ancorada ao início do highlight após o reflow,
  não flutuar em posição desalinhada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE exibir um indicador visual (marca) sobreposto
  ao início de qualquer highlight cujo campo `note` esteja preenchido
  (não vazio), revertendo a decisão da FR-011 de `013-anotacoes-highlights`.
- **FR-002**: O sistema NÃO DEVE exibir o indicador sobre highlights sem
  anotação (campo `note` vazio ou ausente).
- **FR-003**: O indicador DEVE usar uma forma/estilo visualmente distinto
  (não apenas uma cor sólida) para permanecer identificável mesmo quando a
  cor do highlight subjacente também for amarela/âmbar.
- **FR-004**: Tocar no indicador DEVE abrir uma caixa flutuante, próxima ao
  trecho destacado, exibindo o texto completo da anotação em modo somente
  leitura (sem controles de edição).
- **FR-005**: A caixa flutuante DEVE permitir rolagem interna quando o texto
  da anotação exceder o espaço vertical disponível, sem truncar o conteúdo.
- **FR-006**: A caixa flutuante DEVE fechar ao detectar um toque fora dela.
- **FR-007**: Quando não houver espaço vertical suficiente acima do trecho
  para abrir a caixa, o sistema DEVE abri-la abaixo do trecho em vez de
  cortar/sair da área visível.
- **FR-008**: Tocar em qualquer parte do highlight que não seja o indicador
  DEVE continuar abrindo o menu completo de gerenciamento do highlight,
  sem alteração de comportamento em relação ao que existe hoje.
- **FR-009**: Quando o texto de uma anotação é removido/esvaziado (via
  `HighlightNoteSheet`), o indicador correspondente DEVE deixar de ser
  exibido na próxima renderização do trecho.
- **FR-010**: O indicador e a caixa flutuante DEVEM manter tamanho fixo,
  independente do tamanho de fonte/zoom configurado no leitor.
- **FR-011** *(supersede a FR-011 original de 013-anotacoes-highlights)*:
  O sistema DEVE exibir o indicador de "tem anotação" descrito nesta spec.
- **FR-012**: Nenhuma outra ação do menu de gerenciamento do highlight
  (Anotar/Editar anotação, Remover, Cor e estilo) DEVE sofrer regressão de
  comportamento por causa desta feature.

### Key Entities

- **Highlight**: entidade já existente (feature 010/013). Nenhum campo
  novo — esta feature consome o campo `note` (`string | undefined`) já
  presente para decidir se exibe o indicador. Nenhuma mudança de schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos highlights com anotação preenchida exibem o
  indicador visual ao renderizar o capítulo; 0% dos highlights sem
  anotação exibem qualquer indicador.
- **SC-002**: O usuário consegue ler o texto completo de uma anotação
  tocando apenas no indicador, sem nenhum toque adicional no menu completo.
- **SC-003**: Nenhum teste automatizado pré-existente do menu de
  gerenciamento de highlight (feature 010/013) regride por causa desta
  mudança.
- **SC-004**: O indicador permanece corretamente posicionado (ancorado ao
  início do highlight) após troca de fonte, tamanho de fonte ou reflow do
  texto, validado manualmente em pelo menos 2 configurações de fonte
  diferentes.

## Assumptions

- O indicador e a caixa flutuante usam tamanho fixo em pixels, sem escalar
  com o tamanho de fonte do leitor (confirmado com o usuário — prioriza
  previsibilidade de layout sobre consistência proporcional).
- A caixa flutuante é estritamente somente-leitura nesta rodada; qualquer
  atalho de edição direta nela fica fora de escopo (confirmado com o
  usuário).
- A forma exata do indicador (ex: aba com canto dobrado, ícone pequeno) é
  uma decisão de design visual a resolver no `sdd-plan`/implementação,
  desde que atenda ao requisito de distinguibilidade da FR-003.
- Sobreposição visual entre marcas de highlights adjacentes é uma limitação
  aceita nesta rodada, não um requisito a resolver agora.

## Clarifications

### Sessão 2026-09-10

- Q: Posicionamento e tamanho da marca amarela — cobre só o início do
  trecho, com largura fixa, ou o highlight inteiro? → A: Marca pequena e
  fixa no início do trecho, largura fixa (não acompanha o comprimento do
  highlight). Refletido em FR-001 e no Edge Case de highlight curto.
- Q: A caixa flutuante permite editar a nota diretamente, ou é só leitura?
  → A: Só leitura; edição continua exclusivamente pelo fluxo já existente
  (menu completo → Editar anotação). Refletido em FR-004 e no Fora de
  Escopo.
- Q: Nota muito longa — a caixa deveria rolar ou truncar? → A: Rola
  internamente, sem truncar o conteúdo. Refletido em FR-005 e Acceptance
  Scenario 3 da US2.
- Q: Como a caixa flutuante é fechada? → A: Ao tocar fora dela (mesmo
  padrão dos outros menus/popups do leitor). Refletido em FR-006.
- Q: Como evitar confusão visual quando o highlight já é amarelo/âmbar? →
  A: A marca usa forma distinta (não só cor sólida), sempre — não apenas
  quando o highlight é amarelo. Refletido em FR-003.
- Q: Tocar fora da marca (no resto do trecho destacado) muda o
  comportamento atual? → A: Não — continua abrindo o menu completo de
  gerenciamento, sem mudança. Refletido em FR-008 e no primeiro Edge Case.
- Q: O que acontece se não houver espaço vertical acima do trecho para
  abrir a caixa? → A: Abre abaixo do trecho nesse caso (fallback
  automático). Refletido em FR-007 e Acceptance Scenario 4 da US2.
- Q: A caixa flutuante deve ter algum atalho para editar a nota, ou fica
  100% sem ações? → A: 100% sem ações — só leitura, sem duplicar a
  affordance de edição que já existe no menu completo. Refletido em FR-004
  e Acceptance Scenario 5 da US2.
