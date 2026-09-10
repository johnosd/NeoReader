# Feature Specification: Anotações associadas a highlights

**Slug**: `013-anotacoes-highlights`

**Created**: 2026-09-10

**Status**: Implementada

**Input**: Usuário pediu: "após o usuário fazer um highlight ele deve poder
clicar no highlight e poder escrever uma anotação. a anotação fica
associada ao highlight, quando o highlight é excluído a anotação tbm é.
na tela de detalhes do livro é possível ver highlight e a anotação
associada". Veio de uma avaliação via `sdd-adhoc` que redirecionou pra
`sdd-specify` — o pedido em si é claro (não precisou de `sdd-assess`),
mas o escopo tem decisões reais de dados/UX que não cabiam num ajuste
ad-hoc: se a anotação sincroniza na nuvem, onde exatamente a UI de
escrita vive (o menu de highlight hoje é DOM injetado no iframe
sandboxado do EPUB, não um componente React), formato do texto, e como
a lista de Destaques exibe a anotação.

## Escopo

### Incluído

- Ação "Anotar" (ou "Editar anotação", se já existir uma) no menu que já
  abre ao tocar num highlight existente — mesmo menu que hoje tem
  remover/trocar cor/trocar estilo.
- Escrever, editar e remover o texto de uma anotação associada a um
  highlight, com salvamento explícito (botão Salvar).
- Exclusão em cascata: apagar o highlight apaga a anotação associada
  junto, sem deixar registro órfão.
- Exibição da anotação na aba de Destaques da tela de detalhes do
  livro, junto do trecho destacado correspondente.

### Fora de Escopo

- Sincronização da anotação no Google Drive — fica local ao
  dispositivo nesta rodada, mesmo tratamento que highlight já tem hoje.
- Indicador visual no próprio highlight, durante a leitura, sinalizando
  que ele tem anotação — descoberta só via menu do highlight ou tela de
  detalhes do livro.
- Anotações "soltas", sem um highlight associado.
- Formatação rica de texto (negrito, links, listas, etc.) — só texto
  simples multi-linha.
- Busca ou filtro de anotações.
- Anotação em bookmarks ou itens de vocabulário — só highlights.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escrever e editar anotação num highlight (Priority: P1)

Como leitor, quero tocar num highlight que já criei e escrever uma
anotação sobre ele, pra registrar meus pensamentos/reflexões sobre
aquele trecho — e poder editar essa anotação depois.

**Why this priority**: é o valor central da feature — sem isso não há
anotação nenhuma pra ver depois.

**Independent Test**: criar um highlight, tocar nele, escolher
"Anotar", escrever texto, salvar, reabrir o menu do highlight e
confirmar que o texto persistiu e a ação agora aparece como "Editar
anotação".

**Acceptance Scenarios**:

1. **Given** um highlight sem anotação, **When** o usuário toca nele e
   escolhe "Anotar", **Then** abre uma tela de texto vazia, pronta pra
   digitar.
2. **Given** a tela de anotação aberta com texto digitado, **When** o
   usuário toca em Salvar, **Then** a anotação é persistida associada
   ao highlight, e a tela fecha.
3. **Given** um highlight sem anotação, **When** o menu do highlight é
   aberto, **Then** a ação aparece rotulada como "Anotar".
4. **Given** um highlight que já tem anotação, **When** o usuário toca
   nele, **Then** a ação no menu aparece rotulada como "Editar
   anotação" (ou equivalente) e, ao tocar, abre a tela já preenchida
   com o texto existente.
5. **Given** a tela de anotação aberta (nova ou editando uma
   existente), **When** o usuário toca em Salvar tendo apagado todo o
   texto (ou deixado só espaços em branco), **Then** nenhuma anotação
   fica associada ao highlight — se havia uma antes, ela é removida.
6. **Given** a tela de anotação aberta com alterações não salvas,
   **When** o usuário cancela/fecha sem tocar em Salvar, **Then**
   nenhuma alteração é persistida.

---

### User Story 2 - Ver a anotação na tela de detalhes do livro (Priority: P1)

Como leitor, quero ver, na aba de Destaques da tela de detalhes do
livro, a anotação associada a cada highlight, pra revisar minhas notas
sem precisar reabrir o livro.

**Why this priority**: é o outro pilar explícito do pedido — sem isso a
anotação fica presa dentro do leitor, inacessível pra revisão rápida.

**Independent Test**: criar um highlight com anotação, abrir a tela de
detalhes do livro, aba Destaques, e confirmar que o texto da anotação
aparece junto do trecho destacado, sem toque extra.

**Acceptance Scenarios**:

1. **Given** um highlight com anotação, **When** a aba Destaques é
   exibida, **Then** o texto da anotação aparece visível abaixo do
   trecho destacado correspondente, sem exigir toque extra.
2. **Given** uma anotação mais longa que o espaço disponível na lista,
   **When** exibida na aba Destaques, **Then** o texto é truncado
   (reticências) — sem botão de expandir nesta rodada.
3. **Given** um highlight sem anotação, **When** exibido na aba
   Destaques, **Then** nenhum espaço extra de anotação aparece —
   comportamento idêntico ao que já existe hoje pra highlights sem
   anotação.

### Edge Cases

- Excluir um highlight que tem anotação remove a anotação associada
  junto, automaticamente — nunca fica um registro órfão.
- Texto da anotação só com espaços em branco é tratado como vazio
  (mesma regra de "esvaziar remove a anotação").
- Livro sem highlights: a aba Destaques mantém o estado vazio
  (`EmptyState`) que já existe hoje — nenhuma mudança.
- Anotação no limite máximo de caracteres: o sistema impede ultrapassar
  o limite, com alguma indicação clara ao usuário de que chegou perto
  do limite (o exato tratamento visual fica pro `sdd-plan`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir abrir uma tela de escrita de
  anotação a partir do menu de um highlight existente (mesmo menu que
  já tem remover/trocar cor/trocar estilo).
- **FR-002**: O rótulo dessa ação no menu DEVE refletir se o highlight
  já tem anotação ("Anotar" quando não tem, "Editar anotação" ou
  equivalente quando já tem).
- **FR-003**: A anotação DEVE aceitar texto livre multi-linha, sem
  formatação rica, até um limite de 2000 caracteres.
- **FR-004**: Salvar a anotação DEVE exigir confirmação explícita do
  usuário (ação de Salvar) — nenhuma alteração persiste só por digitar
  ou fechar a tela sem confirmar.
- **FR-005**: Cancelar/fechar a tela de anotação sem salvar NÃO DEVE
  persistir nenhuma alteração feita.
- **FR-006**: Salvar com o texto vazio (ou só espaços em branco) quando
  já existe uma anotação DEVE remover a anotação associada, voltando o
  highlight ao estado "sem anotação".
- **FR-007**: Excluir um highlight DEVE excluir automaticamente
  qualquer anotação associada a ele, sem deixar registro órfão.
- **FR-008**: A aba de Destaques na tela de detalhes do livro DEVE
  exibir o texto da anotação (quando existir) visível junto ao trecho
  destacado correspondente, sem exigir toque adicional.
- **FR-009**: Quando a anotação exibida na aba Destaques for mais longa
  que o espaço disponível, o sistema DEVE truncá-la visualmente
  (reticências), sem mecanismo de expandir nesta rodada.
- **FR-010**: A anotação NÃO DEVE sincronizar com nenhum serviço de
  nuvem nesta rodada — permanece local ao dispositivo, mesmo
  tratamento que highlight já recebe hoje.
- **FR-011**: O sistema NÃO DEVE exibir nenhum indicador visual de "tem
  anotação" sobre o highlight em si durante a leitura nesta rodada —
  a anotação só é perceptível via menu do highlight ou tela de
  detalhes do livro.
- **FR-012**: O sistema NÃO DEVE alterar o comportamento das ações já
  existentes no menu de highlight (remover, trocar cor, trocar estilo)
  nem da lista de Destaques já existente pra highlights sem anotação.

### Key Entities

- **Anotação**: texto simples (até 2000 caracteres, multi-linha),
  associado a exatamente um highlight (relação 1 para 1). Criada e
  atualizada pelo usuário via a tela de escrita; removida
  automaticamente quando o highlight associado é removido, ou quando o
  usuário salva com o texto vazio. Não sincroniza com nuvem nesta
  rodada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuário consegue escrever e salvar uma anotação em
  qualquer highlight existente; reabrir o menu do highlight depois
  mostra o texto salvo.
- **SC-002**: Usuário consegue editar uma anotação existente e ver a
  mudança refletida tanto no menu do highlight quanto na aba Destaques
  da tela de detalhes do livro.
- **SC-003**: Excluir um highlight sempre remove a anotação associada
  junto — nenhuma anotação sobrevive sem o highlight correspondente,
  em 100% dos casos testados.
- **SC-004**: A aba Destaques mostra corretamente a anotação (ou nada,
  se não houver) para todos os highlights do livro, sem exigir toque
  extra pra ver o texto.
- **SC-005**: Nenhuma regressão nas ações existentes do menu de
  highlight (remover, trocar cor, trocar estilo) nem na lista de
  Destaques já existente — cobertura de testes automatizados existente
  continua 100% passando.

## Assumptions

- A tela de escrita de anotação abre como um componente React normal
  fora do iframe do EPUB — mesmo padrão que as outras ações do menu de
  highlight já usam hoje (comunicam a mutação pra fora do iframe via
  callback, em vez de manipular estado direto dentro do sandbox).
- "Highlight" nesta spec é exclusivamente a entidade já existente em
  `src/types/highlight.ts` — não inclui bookmark nem item de
  vocabulário.
- O limite de 2000 caracteres é suficiente tanto pra uma nota curta
  quanto pra um parágrafo de reflexão mais longo — nenhum caso de uso
  maior foi levantado.
- O público desta feature é o mesmo público atual do NeoReader — não há
  sinal de que anotação deva ser um recurso exclusivo Pro (highlight em
  si, que ela depende, já não é hoje).

## Clarifications

### Sessão 2026-09-10

- Q: O menu que já abre ao tocar num highlight existente (remover/cor/
  estilo) é o lugar certo pra adicionar "Anotar"? E dá pra editar a
  anotação depois? → A: Sim, novo item nesse menu; editável depois
  (tocando de novo no highlight).
- Q: A anotação deveria sincronizar no Google Drive, igual bookmark, ou
  ficar só local, igual highlight hoje? → A: Fica local, igual
  highlight — sem sync nesta rodada.
- Q: Que tipo de texto a anotação aceita? → A: Texto livre multi-linha,
  sem formatação rica, limite alto (2000 caracteres).
- Q: Como a anotação aparece na lista de Destaques da tela de detalhes
  do livro? → A: Sempre visível abaixo do trecho destacado, truncada
  (reticências) se longa — sem botão de expandir nesta rodada.
- Q: Salvar a anotação exige um toque explícito em "Salvar", ou salva
  sozinho conforme a pessoa digita/fecha a tela? → A: Botão Salvar
  explícito — nada persiste sem confirmação.
- Q: Se o usuário apagar todo o texto de uma anotação existente e
  confirmar, isso remove a anotação ou salva vazia? → A: Remove a
  anotação — texto vazio equivale a "sem anotação".
- Q: Durante a leitura, o próprio highlight deveria ter algum indicador
  visual de que tem anotação? → A: Não nesta rodada — descoberta só
  via menu do highlight ou tela de detalhes do livro.
