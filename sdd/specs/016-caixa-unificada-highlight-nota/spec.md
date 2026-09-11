# Feature Specification: Caixa unificada de cor, estilo e nota ao criar ou editar highlight

**Slug**: `016-caixa-unificada-highlight-nota`

**Created**: 2026-09-11

**Status**: Convergida

**Input**: Pedido do usuário: "usuario seleciona texto, clica em highlight,
abre box de anotacao, com opção de tipo de highlights e cores, usuario
pode adicinar texto ou so escolher hithlige e cores diferentes do
defaut". Hoje a criação é imediata (selecionar texto → "Destacar" →
tocar numa cor já cria o highlight na hora) e a anotação é um passo à
parte (toast da feature `015-atalho-anotar-highlight-criacao` ou menu
de gerenciamento). Esta feature unifica cor, estilo e nota numa única
caixa, tanto na criação quanto na edição de um highlight já existente.

**Reverte/Supersede**: a **FR-008 de `015-atalho-anotar-highlight-criacao`**
("Nenhuma mudança de comportamento é esperada no fluxo já existente de
anotar/editar anotação de um highlight já existente") deixa de valer —
esta feature muda deliberadamente esse fluxo. O toast da 015 continua
existindo, mas com uma condição nova (ver FR-006 abaixo).

## Escopo

### Incluído

- **Criação**: ao tocar "Destacar" no menu de seleção de texto, abre
  uma caixa única com as opções de cor (8) e estilo (3, igual hoje) e
  um campo de texto pra escrever uma nota — tudo antes de o highlight
  existir. Cor/estilo vêm pré-selecionados com o último valor usado
  pelo usuário (ver FR-002). O highlight só é gravado ao tocar em
  confirmar; cancelar não cria nada.
- **Edição**: ao tocar num highlight já existente, o menu de
  gerenciamento abre a MESMA caixa (cor/estilo + nota, pré-preenchida
  com os valores atuais do highlight), substituindo os dois fluxos
  separados de hoje ("Cor e estilo" que aplica na hora, "Anotar"/"Editar
  anotação" com Salvar/Cancelar próprios). Cor, estilo e nota passam a
  mudar juntos, só gravando no banco ao confirmar; cancelar descarta as
  três mudanças e mantém o highlight como estava.
- Toast pós-criação da feature 015 continua existindo, mas só aparece
  quando o usuário confirma a criação SEM escrever nada no campo de
  nota (se já anotou na própria caixa, o toast não tem mais propósito).
- "Remover" (excluir o highlight) continua uma ação separada, fora da
  caixa unificada, no menu de gerenciamento.

### Fora de Escopo

- Mudança na paleta de cores (continuam as mesmas 8) ou nos estilos
  disponíveis (continuam os mesmos 3: fundo, sublinhado, ondulado).
- Mudança em `HighlightNoteSheet` como componente em si além de virar
  parte da caixa unificada — sem novo limite de caracteres, sem
  formatação rica.
- Fila/histórico de highlights sem nota, ou qualquer outra ideia
  correlata não pedida explicitamente aqui.
- Mudança na lista de Destaques da tela de detalhes do livro
  (`BookDetailsScreen`) — fora desta rodada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar um highlight já com cor, estilo e nota (Priority: P1)

Selecionar um trecho, tocar "Destacar", e ver uma caixa única com
cor/estilo (já vindo com o último valor usado) e um campo de texto.
Tocar em confirmar grava o highlight — com ou sem nota, dependendo do
que foi escrito.

**Why this priority**: É o valor central do pedido original — reduzir
o fluxo de "criar, depois abrir de novo pra anotar" pra um único passo,
sem depender de lembrar de tocar num toast depois.

**Independent Test**: Selecionar texto, tocar "Destacar", ver a caixa
com cor/estilo pré-selecionados e campo de texto vazio (ou com o texto
de uma sessão anterior nunca — sempre vazio numa criação nova), mudar
a cor, escrever uma nota, confirmar — o highlight aparece no texto com
a cor escolhida e a nota associada, sem precisar de nenhum toque
adicional.

**Acceptance Scenarios**:

1. **Given** o usuário selecionou um trecho de texto, **When** toca em
   "Destacar", **Then** abre uma caixa com opções de cor (8) e estilo
   (3) e um campo de texto para nota, sem nenhum highlight ainda criado.
2. **Given** a caixa está aberta, **When** o usuário não muda nada e só
   toca em confirmar, **Then** o highlight é criado com a cor/estilo
   pré-selecionados (o último usado) e sem nota.
3. **Given** a caixa está aberta, **When** o usuário troca a cor/estilo
   e/ou escreve uma nota antes de confirmar, **Then** o highlight é
   criado com exatamente essa cor/estilo/nota.
4. **Given** a caixa está aberta, **When** o usuário cancela (fecha sem
   confirmar), **Then** nenhum highlight é criado — o trecho volta a
   ficar sem marcação.
5. **Given** o usuário confirmou a criação SEM escrever nota, **When**
   a criação termina, **Then** o toast da feature 015 aparece
   normalmente, convidando a anotar depois.
6. **Given** o usuário confirmou a criação COM uma nota já escrita,
   **When** a criação termina, **Then** o toast da feature 015 NÃO
   aparece (já foi anotado).

---

### User Story 2 - Editar cor, estilo e nota de um highlight existente na mesma caixa (Priority: P2)

Tocar num highlight já criado abre a mesma caixa unificada,
pré-preenchida com a cor/estilo/nota atuais do highlight. Mudar
qualquer coisa e confirmar aplica tudo junto; cancelar não muda nada.

**Why this priority**: Consistência de UX com a US1 e redução real de
passos na edição (hoje são dois fluxos: um que aplica cor/estilo na
hora, outro com Salvar/Cancelar só pra nota) — mas o valor da US1 já é
entregável sozinho, então esta é complementar, não bloqueante.

**Independent Test**: Tocar num highlight já existente, ver a caixa
abrir com a cor/estilo/nota atuais pré-preenchidos, mudar a cor e
adicionar/editar a nota, confirmar — o highlight reflete as mudanças.
Repetir e cancelar — nada muda.

**Acceptance Scenarios**:

1. **Given** um highlight já existe (com ou sem nota), **When** o
   usuário toca nele, **Then** o menu de gerenciamento oferece a opção
   que abre a caixa unificada, pré-preenchida com a cor, o estilo e a
   nota atuais (nota vazia se não houver).
2. **Given** a caixa de edição está aberta, **When** o usuário muda a
   cor e/ou o estilo e/ou o texto da nota e confirma, **Then** as três
   mudanças são aplicadas juntas ao highlight.
3. **Given** a caixa de edição está aberta com mudanças não confirmadas,
   **When** o usuário cancela, **Then** o highlight permanece
   EXATAMENTE como estava antes (cor, estilo e nota originais).
4. **Given** o menu de gerenciamento de um highlight existente,
   **When** o usuário quer excluir o highlight, **Then** a ação
   "Remover" continua disponível separadamente, fora da caixa
   unificada.

---

### Edge Cases

- Cor/estilo pré-selecionados numa criação nova vêm do ÚLTIMO highlight
  que o usuário criou (em qualquer livro) — se esta é a primeira vez
  que o usuário cria um highlight no app, usa um valor padrão do design
  system (ex: indigo/fundo, igual ao padrão de hoje).
- Cancelar a edição de um highlight que JÁ tinha uma nota deve manter
  essa nota original intacta (não apaga por engano).
- Nenhuma mudança no comportamento do botão "Remover" além de continuar
  visível separadamente (edge case coberto por US2, Acceptance Scenario 4).
- Criar um highlight sem nota e ignorar o toast subsequente continua
  tendo o mesmo resultado de hoje: highlight sem indicador visual da
  feature 014, anotável depois a qualquer momento pelo menu.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Tocar "Destacar" no menu de seleção de texto DEVE abrir
  uma caixa única com opções de cor (8), estilo (3) e um campo de texto
  para nota — substituindo o submenu de cores que hoje cria o highlight
  imediatamente ao tocar numa cor.
- **FR-002**: A caixa de criação DEVE vir com cor/estilo pré-selecionados
  a partir do último highlight criado pelo usuário (qualquer livro); na
  ausência de um highlight anterior, usa o padrão atual do app
  (indigo/fundo).
- **FR-003**: O highlight só DEVE ser gravado ao usuário confirmar a
  caixa — cancelar (fechar sem confirmar) NÃO DEVE deixar nenhum
  highlight criado.
- **FR-004**: Confirmar a caixa de criação DEVE gravar o highlight com
  exatamente a cor, o estilo e o texto de nota presentes na caixa no
  momento da confirmação (nota vazia é permitida — não bloqueia a
  criação).
- **FR-005**: Tocar num highlight já existente DEVE abrir a mesma caixa
  unificada, pré-preenchida com a cor, o estilo e a nota atuais desse
  highlight (campo de nota vazio se não houver nota).
- **FR-006**: O toast pós-criação da feature 015 DEVE aparecer somente
  quando o usuário confirma a criação com o campo de nota vazio; se já
  escreveu uma nota na própria caixa, o toast NÃO DEVE aparecer.
- **FR-007**: Na edição de um highlight existente, mudanças de
  cor/estilo/nota feitas na caixa NÃO DEVEM ser aplicadas ao highlight
  até o usuário confirmar — diferente do comportamento atual de
  cor/estilo (que aplica a cada toque); cancelar DEVE reverter a caixa
  sem alterar o highlight original.
- **FR-008**: A ação "Remover" (excluir o highlight) DEVE continuar
  disponível separadamente no menu de gerenciamento, fora da caixa
  unificada — esta feature não muda esse fluxo.
- **FR-009**: Nenhuma mudança é esperada na paleta de 8 cores nem nos 3
  estilos (fundo, sublinhado, ondulado) — a caixa unificada reorganiza
  onde/quando essas opções aparecem, sem adicionar ou remover opções.

### Key Entities

- **Highlight** (existente, features 010/013/014/015): nenhum campo
  novo — `color`, `style` e `note` já existem. Esta feature muda QUANDO
  e COMO esses três campos são preenchidos/alterados (juntos, atrás de
  confirmar), não a forma dos dados em si.
- **Preferência de "último highlight usado"** (cor + estilo): conceito
  novo, necessário pra pré-selecionar a caixa de criação (FR-002). Não
  é uma nova entidade de domínio visível ao usuário — é estado de
  preferência, cujo mecanismo de persistência exato fica para o
  `sdd-plan`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Criar um highlight com nota leva o usuário a 1 caixa só
  (escolher cor/estilo + escrever nota + confirmar), em vez dos 2 fluxos
  separados de hoje (criar → esperar/tocar no toast → abrir sheet).
- **SC-002**: Editar cor, estilo e nota de um highlight existente é
  possível a partir de UM único ponto de entrada na caixa unificada, em
  vez dos dois fluxos separados de hoje.
- **SC-003**: Cancelar a caixa (criação ou edição) nunca deixa efeito
  colateral — nenhum highlight novo, nenhuma mudança em um existente.
- **SC-004**: O toast da feature 015 nunca aparece depois de uma
  criação em que o usuário já escreveu uma nota na caixa.
- **SC-005**: Nenhum teste automatizado pré-existente do fluxo de
  criação/gerenciamento de highlight ou do toast da 015 regride sem uma
  atualização deliberada e documentada (já que esta feature muda
  comportamento coberto por testes anteriores por design).

## Assumptions

- O limite de caracteres da nota continua 2000, o mesmo já usado por
  `HighlightNoteSheet` desde a feature 013 — não foi pedido nenhum
  ajuste nesse valor.
- O "último highlight usado" (FR-002) persiste ENTRE sessões do app
  (não reseta ao fechar/reabrir) — é o comportamento mais alinhado com
  a intenção do pedido ("cores diferentes do default" sugere um hábito
  contínuo do usuário, não só da sessão atual). O mecanismo exato de
  armazenamento (ex: tabela de settings já existente vs. novo campo)
  fica para o `sdd-plan`.
- O rótulo exato dos botões de confirmar/cancelar na caixa (ex:
  "Destacar" vs. "Salvar" dependendo do contexto criação/edição) fica a
  critério da implementação, desde que comunique claramente a ação.
- O layout técnico exato da caixa (se cabe dentro do menu de seleção
  sandboxado do EPUB como está hoje, ou precisa de um mecanismo novo
  tipo o preview da feature 014) é decisão do `sdd-plan` — esta spec
  fixa o COMPORTAMENTO esperado, não a implementação.

## Clarifications

### Sessão 2026-09-11

- Q: Essa caixa unificada substitui o quê no fluxo atual? → A:
  Substitui o submenu de cores/estilos da criação (não substitui o
  toast da 015). Refletido em FR-001.
- Q: Como funciona o "escolher cor diferente do default" — o que é o
  default? → A: A última cor/estilo usado pelo usuário, não uma cor
  fixa do design system. Refletido em FR-002.
- Q: Ao tocar "Destacar", o highlight já existe com a cor default até o
  usuário confirmar, ou só é criado ao confirmar? → A: Só é criado ao
  confirmar; cancelar não deixa nada pra trás. Refletido em FR-003/FR-004.
- Q: Depois de confirmar a caixa (com ou sem nota), o toast da 015
  ainda aparece? → A: Só aparece se a nota ficou vazia — se já anotou
  na caixa, o toast não aparece mais (seria redundante). Refletido em
  FR-006.
- Q: Essa caixa se aplica só à criação, ou também à edição de um
  highlight já existente? → A: Também unifica o menu de edição — cor,
  estilo e nota passam a ser editados juntos na mesma caixa. Refletido
  em FR-005, User Story 2.
- Q: As opções de cor/estilo mudam de alguma forma dentro da caixa? →
  A: Não, continuam as mesmas 8 cores + 3 estilos de hoje, só
  reorganizadas junto do campo de texto. Refletido em FR-009.
- Q: Na edição, cor/estilo também passam a exigir "Salvar" pra aplicar
  (hoje aplicam na hora a cada toque)? → A: Sim, tudo unificado sob um
  Salvar/Cancelar só, incluindo cor/estilo. Refletido em FR-007.
- Q: O botão "Remover" continua separado, fora da caixa unificada? →
  A: Sim, Remover continua uma ação separada. Refletido em FR-008,
  User Story 2 Acceptance Scenario 4.
