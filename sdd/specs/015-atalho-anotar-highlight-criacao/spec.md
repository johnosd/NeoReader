# Feature Specification: Atalho pra anotar highlight logo após criar

**Slug**: `015-atalho-anotar-highlight-criacao`

**Created**: 2026-09-11

**Status**: Implementada

**Input**: Pedido do usuário durante entrevista sobre melhorias de UI do
leitor ("criar um highlight com anotação junto"). Hoje são dois fluxos
separados: (1) criar o highlight (selecionar texto → tocar "Destacar" →
escolher cor) e (2) anotar (tocar no highlight recém-criado → menu →
"Anotar" → `HighlightNoteSheet`). O usuário quer reduzir isso a menos
toques quando quiser anotar logo na criação.

## Escopo

### Incluído

- Um aviso (toast) aparece logo após qualquer highlight ser criado,
  convidando o usuário a anotar — tocável, abre direto o sheet de
  escrever a anotação (`HighlightNoteSheet`) já direcionado pro highlight
  recém-criado.
- O toast some sozinho depois de alguns segundos se ignorado, sem
  bloquear nem exigir nenhuma ação do usuário.
- Aparece toda vez que um highlight novo é criado, de forma consistente
  (sem lógica de "só na primeira vez"/flag de descoberta).

### Fora de Escopo

- Qualquer mudança no fluxo de ESCREVER a anotação em si —
  `HighlightNoteSheet` continua exatamente como está (mesmo limite de
  caracteres, mesmo botão Salvar/Cancelar).
- Anotar automaticamente sem interação do usuário (o toast só abre o
  sheet quando tocado; nunca cria uma nota sozinho).
- Mudança no menu de gerenciamento de um highlight já existente — a ação
  "Anotar"/"Editar anotação" continua funcionando exatamente como hoje,
  como via alternativa a qualquer momento (o toast é um atalho a mais,
  não substitui esse caminho).
- Fila/histórico de highlights criados sem nota (ex: uma lista de
  "highlights que você ainda não anotou") — fora desta rodada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anotar um highlight logo depois de criá-lo (Priority: P1)

Depois de criar um highlight (selecionar texto → escolher cor), um
aviso aparece na tela convidando a anotar. Tocando nele, o sheet de
escrever a anotação abre direto, já associado ao highlight recém-criado.

**Why this priority**: É o valor central do pedido — reduz o fluxo de
"criar, depois voltar e abrir o menu de novo" pra um único toque extra,
sem sair do momento em que o usuário acabou de decidir que aquele trecho
importa.

**Independent Test**: Criar um highlight, ver o aviso aparecer, tocar
nele, confirmar que o sheet abre com o highlight certo (o que acabou de
ser criado, não outro), escrever uma nota e salvar — confirmar que a
nota fica associada ao highlight certo.

**Acceptance Scenarios**:

1. **Given** o usuário acabou de criar um highlight, **When** o toast
   aparece, **Then** ele mostra uma mensagem convidando a anotar e é
   tocável.
2. **Given** o toast está visível, **When** o usuário toca nele, **Then**
   o sheet de anotação abre, vazio, associado ao highlight recém-criado
   (não a nenhum outro).
3. **Given** o toast está visível, **When** o usuário NÃO toca nele e
   espera, **Then** ele desaparece sozinho depois de alguns segundos, e o
   highlight permanece sem anotação (igual ao comportamento de hoje).
4. **Given** um highlight já foi criado e o toast dele ainda está
   visível, **When** o usuário cria um SEGUNDO highlight, **Then** o
   toast atual é substituído por um novo, referente a este segundo
   highlight (nunca dois toasts ao mesmo tempo).
5. **Given** o usuário tocou no toast e o sheet abriu, **When** ele toca
   em Cancelar (sem salvar), **Then** o comportamento é idêntico ao de
   cancelar uma edição de anotação hoje — o highlight fica sem nota, sem
   nenhum efeito colateral novo.

---

### Edge Cases

- O highlight ainda pode ser anotado a qualquer momento depois, pelo
  fluxo já existente (tocar no highlight → menu → "Anotar") — o toast
  não é a única oportunidade, só um atalho a mais logo após a criação.
- Se o usuário navegar pra outro capítulo/fechar o livro enquanto o
  toast está visível, ele simplesmente some junto com a troca de tela
  (mesmo comportamento que qualquer outro elemento transitório da UI).
- Criar vários highlights em sequência rápida não deve empilhar toasts
  nem gerar comportamento inesperado — sempre no máximo um visível,
  sempre referente ao mais recente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE exibir um toast logo após qualquer
  highlight ser criado, convidando o usuário a anotar aquele trecho.
- **FR-002**: O toast DEVE ser tocável — tocar nele abre o sheet de
  escrever a anotação (`HighlightNoteSheet`), associado especificamente
  ao highlight que acabou de ser criado.
- **FR-003**: O toast DEVE desaparecer sozinho após alguns segundos
  (~5-6s) se o usuário não tocar nele, sem exigir nenhuma ação.
- **FR-004**: Se o toast for ignorado, o highlight DEVE permanecer sem
  anotação — idêntico ao comportamento atual de um highlight recém
  criado, sem nenhuma nota forçada ou pendência visível além do que já
  existe hoje (ex: o indicador visual da feature 014 simplesmente não
  aparece, porque não há nota).
- **FR-005**: Se um novo highlight for criado enquanto o toast de um
  highlight anterior ainda está visível, o sistema DEVE substituir o
  toast atual por um novo, referente ao highlight mais recente — nunca
  mais de um toast visível ao mesmo tempo.
- **FR-006**: O toast DEVE aparecer de forma consistente toda vez que um
  highlight é criado, sem lógica de "só na primeira vez" ou qualquer
  estado de preferência persistido sobre já ter visto o aviso antes.
- **FR-007**: Cancelar a escrita da anotação a partir do sheet aberto
  pelo toast NÃO DEVE ter nenhum comportamento diferente de cancelar
  pelo fluxo já existente (menu → Anotar) — o highlight fica sem nota,
  sem efeito colateral.
- **FR-008**: Nenhuma mudança de comportamento é esperada no fluxo já
  existente de anotar/editar anotação de um highlight já existente
  (tocar no highlight → menu → "Anotar"/"Editar anotação") — o toast é
  um caminho adicional, não uma substituição.

### Key Entities

- **Highlight**: entidade já existente (features 010/013/014). Nenhum
  campo novo — esta feature só oferece um caminho mais rápido pra
  preencher o campo `note` (`string | undefined`) já existente, logo
  após a criação.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Criar um highlight e tocar no toast leva direto ao sheet
  de anotação em 1 toque a mais (em vez dos 2 toques do fluxo atual:
  tocar o highlight + tocar "Anotar" no menu).
- **SC-002**: 100% dos highlights criados durante o teste manual mostram
  o toast; nenhum highlight criado fica sem a oportunidade do atalho.
- **SC-003**: Nenhum teste automatizado pré-existente do fluxo de
  criação de highlight ou do menu de gerenciamento regride por causa
  desta mudança.
- **SC-004**: Criar 2 highlights em sequência rápida nunca resulta em
  mais de um toast visível ao mesmo tempo.

## Assumptions

- O texto exato do toast (ex: "Highlight criado — toque para anotar")
  fica a critério da implementação/plan, desde que comunique claramente
  a ação disponível — não foi fixado como requisito literal aqui.
- A duração de ~5-6 segundos é uma referência, não um valor exato
  travado — pequenos ajustes durante a implementação (ex: 5000ms vs
  6000ms) não violam o requisito, desde que fique nessa faixa de "tempo
  suficiente pra ler e decidir".
- Reaproveitar o componente `Toast` já existente (`src/components/ui/Toast.tsx`)
  é a direção esperada (achado durante a entrevista, componente já usado
  em outras partes do app) — decisão técnica final de como estendê-lo
  (ex: suportar uma ação tocável, já que hoje só tem `onDismiss`) fica
  para o `sdd-plan`.

## Clarifications

### Sessão 2026-09-11

- Q: Mecanismo do atalho — toast pós-criação tocável, ou um botão
  dedicado no próprio menu de seleção (ex: "Destacar e anotar")? → A:
  Toast pós-criação, tocável — reaproveita o componente já existente no
  app, não bloqueia nem obriga nada. Refletido em FR-001/FR-002.
- Q: Se o toast for ignorado, o que acontece? → A: Some sozinho depois de
  alguns segundos, sem nota — mesmo comportamento de hoje; o usuário
  ainda pode anotar depois pelo menu normal. Refletido em FR-003/FR-004.
- Q: O atalho deve aparecer toda vez que um highlight é criado, ou só em
  certas situações (ex: só na primeira vez)? → A: Toda vez, de forma
  consistente e previsível — sem flag de "já visto antes". Refletido em
  FR-006.
- Q: Quanto tempo o toast deve ficar visível? → A: Mais tempo que o
  padrão do componente (~5-6s em vez dos 3s padrão) — dá tempo real de
  ler e decidir, diferente de um toast só informativo. Refletido em
  FR-003 e Assumptions.
- Q: Se um segundo highlight for criado enquanto o toast do primeiro
  ainda está visível, o que acontece? → A: O novo toast substitui o
  anterior — nunca dois ao mesmo tempo, sempre referente ao highlight
  mais recente. Refletido em FR-005 e no 4º Acceptance Scenario da US1.
