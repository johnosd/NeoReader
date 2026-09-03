# Feature Specification: Virtualização da tela de Biblioteca (grid e lista)

**Slug**: `006-virtualizacao-biblioteca`

**Created**: 2026-09-03

**Status**: Convergida

**Input**: `[Perf]` Nenhuma tela de biblioteca virtualiza a lista de livros — `LibraryGridView.tsx`, `LibraryScreen.tsx` e `BookRow.tsx` renderizam todos os cards de uma vez. Mitigado parcialmente em 2026-09-01 com `.slice(0, 20)` nas rows horizontais da Home (`useLibraryGroups.ts`/`useCategoryGroups.ts`), mas a tela de Biblioteca completa (grid e lista) continua sem limite/virtualização. Precisa de dependência nova (ex: `react-window`) — perguntar antes de adicionar, por regra do CLAUDE.md.

## Escopo

### Incluído

- Virtualização (renderização apenas dos itens visíveis + margem de segurança) da lista de livros na tela de Biblioteca (`LibraryScreen.tsx`), nos dois modos de visualização: lista (`LibraryBookRow`) e grid (`LibraryGridView`).
- Comportamento correto de scroll ao trocar filtro, busca ou ordenação (lista nova → topo) e ao voltar de um livro aberto (posição preservada).
- Manutenção do scroll de página única (cabeçalho, filtros e busca continuam rolando junto com a lista, sem introduzir um painel de scroll interno separado).

### Fora de Escopo

- As rows horizontais da Home (`BookRow.tsx`, `useLibraryGroups.ts`, `useCategoryGroups.ts`) — já têm mitigação parcial via `.slice(0, 20)` aplicada em 2026-09-01; não fazem parte desta spec.
- Redimensionamento/recompressão de capas de EPUB (item `[Perf]` separado no backlog).
- Liberação de capítulos do DOM do leitor (`foliate-js` / `EpubViewer.tsx`) — item `[Perf]` separado no backlog, sem relação com a tela de Biblioteca.
- Escolha da técnica/biblioteca de virtualização — decisão técnica, fica para o `sdd-plan` (inclui avaliar se precisa de dependência nova, com justificativa e aprovação explícita antes de instalar, conforme constitution).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rolar a Biblioteca em modo lista sem travar (Priority: P1)

Um usuário com uma biblioteca grande (centenas ou milhares de livros) abre a tela de Biblioteca no modo lista (o modo padrão) e rola a lista inteira. A rolagem permanece fluida, sem congelamentos nem uso de memória crescente proporcional ao total de livros — apenas os itens visíveis (mais uma margem) existem no DOM a qualquer momento.

**Why this priority**: Lista é o `viewMode` padrão salvo em `localStorage` (`LibraryScreen.tsx`), então é a primeira experiência da maioria dos usuários com bibliotecas grandes — e a que hoje sofre mais, já que cada `LibraryBookRow` monta um `useBookCoverUrl` (live query no Dexie + `URL.createObjectURL` de uma capa decodificada) para todo livro, mesmo fora da tela.

**Independent Test**: Pode ser totalmente testado importando/simulando uma biblioteca com pelo menos 1.000 livros, abrindo a Biblioteca em modo lista, e confirmando rolagem fluida do topo ao fim sem taxa de card/memória crescendo de forma descontrolada — entrega valor mesmo que o modo grid (User Story 2) ainda não esteja implementado.

**Acceptance Scenarios**:

1. **Given** uma biblioteca com 1.000+ livros e modo lista ativo, **When** o usuário rola a lista do topo ao fim, **Then** a rolagem permanece fluida e apenas uma fração dos livros (visíveis + margem) existe no DOM a qualquer momento.
2. **Given** o usuário rolou a lista até o meio e abriu um livro, **When** ele volta para a Biblioteca, **Then** a lista aparece na mesma posição de scroll de antes.
3. **Given** o usuário rolou a lista até o meio, **When** ele muda o filtro ativo, o texto de busca ou a ordenação, **Then** a lista resultante (mesmo que igual em conteúdo) aparece rolada para o topo.

---

### User Story 2 - Rolar a Biblioteca em modo grid sem travar (Priority: P2)

O mesmo comportamento de rolagem fluida e DOM limitado da User Story 1, aplicado ao modo grid (`LibraryGridView`, hoje uma grade de 3 colunas renderizando todos os cards de capa de uma vez).

**Why this priority**: Mesmo problema de fundo da User Story 1 (ausência total de virtualização), mas em uma superfície secundária — grid não é o `viewMode` padrão.

**Independent Test**: Pode ser totalmente testado alternando para o modo grid com a mesma biblioteca de 1.000+ livros e confirmando rolagem fluida e DOM limitado, igual à User Story 1 — entrega valor incremental mesmo que dependa da mesma base técnica da P1.

**Acceptance Scenarios**:

1. **Given** uma biblioteca com 1.000+ livros e modo grid ativo, **When** o usuário rola a grade do topo ao fim, **Then** a rolagem permanece fluida e apenas uma fração dos cards existe no DOM a qualquer momento.
2. **Given** o usuário alterna entre modo lista e modo grid, **When** a troca acontece, **Then** ambos os modos continuam consistentes com as mesmas regras de scroll (preservar ao voltar de um livro, resetar em filtro/busca/ordenação) descritas na User Story 1.

---

### Edge Cases

- Biblioteca vazia ou com poucos livros (menos que a margem de renderização): deve se comportar exatamente como hoje, sem overhead perceptível de virtualização.
- Busca ou filtro que zera a lista (`isSearchEmpty`/`isFilterEmpty`): estados vazios continuam funcionando sem relação com a virtualização (já não renderizam a lista).
- Rolagem muito rápida ("fling"): é aceitável um breve instante de placeholder/miniatura ausente antes da capa carregar, mas sem espaços em branco permanentes nem erro visual.
- Alternar entre modo lista e modo grid: cada modo gerencia sua própria posição de scroll de forma independente (trocar de modo não precisa preservar a posição do outro modo).
- Livro sem capa (`coverUrl` nulo): continua mostrando o placeholder de ícone (`BookOpen`) atual, sem exigir tratamento especial da virtualização.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE renderizar no DOM apenas os itens da lista (modo lista) e da grade (modo grid) que estão visíveis na viewport, mais uma margem de segurança, independentemente do total de livros na biblioteca.
- **FR-002**: O sistema DEVE manter o scroll da página inteira (cabeçalho, filtros e busca continuam no fluxo normal de rolagem do documento, sem um painel de scroll interno dedicado só à lista).
- **FR-003**: O sistema DEVE preservar a posição de scroll da Biblioteca quando o usuário abre um livro e depois volta para a tela.
- **FR-004**: O sistema DEVE resetar a posição de scroll para o topo sempre que o conjunto de livros exibido mudar por causa de filtro, busca ou ordenação.
- **FR-005**: O sistema DEVE manter o comportamento visual e funcional atual de cada item (capa via `useBookCoverUrl`, progresso, tags, favoritos, menu de opções no modo lista; capa e barra de progresso no modo grid) sem regressão perceptível.
- **FR-006**: O sistema DEVE continuar funcionando corretamente com bibliotecas pequenas (poucos livros) sem overhead ou comportamento diferente do atual.
- **FR-007**: A solução técnica escolhida no `sdd-plan` DEVE ser justificada quanto à necessidade (ou não) de dependência nova, respeitando a exigência de aprovação explícita do usuário antes de instalar qualquer pacote (constitution do projeto).

### Key Entities

Não aplicável — a feature não introduz nem altera entidades de dados; opera sobre a lista de livros já exposta por `useLibraryCatalog` (`LibraryBook[]`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com uma biblioteca de pelo menos 1.000 livros, a tela de Biblioteca (lista e grid) rola do topo ao fim sem travamentos perceptíveis nem espaços em branco persistentes.
- **SC-002**: A qualquer momento durante a rolagem, o número de elementos de livro (linhas ou cards) presentes no DOM permanece proporcional ao tamanho da viewport, não ao total de livros na biblioteca.
- **SC-003**: Abrir e fechar (voltar de) um livro a partir de um ponto rolado da Biblioteca preserva a posição de scroll; mudar filtro, busca ou ordenação sempre retorna a lista ao topo.
- **SC-004**: `npm run build`, `npm run lint` e `npm test` passam sem regressão após a implementação.

## Assumptions

- A base de 1.000 livros usada como critério de sucesso (SC-001/SC-002) pode ser simulada em ambiente de desenvolvimento/teste (dados fictícios ou seed), não depende de uma biblioteca real do usuário desse tamanho.
- `useBookCoverUrl` (live query Dexie + `URL.createObjectURL` por livro) continua sendo a forma de carregar capas; a virtualização apenas limita quantas instâncias desse hook existem montadas simultaneamente — não muda como uma capa individual é buscada.
- O `viewMode` (lista/grid) e sua persistência em `localStorage` (`neoreader:library-view-mode`) não mudam de comportamento, só a forma de renderizar os itens dentro de cada modo.
- Decisão de usar biblioteca externa de virtualização vs. implementação manual (windowing) fica para o `sdd-plan`, que deve trazer a recomendação com trade-offs para aprovação antes de instalar qualquer dependência nova.

## Clarifications

### Sessão 2026-09-03

- Q: Escopo desta spec — só a tela de Biblioteca completa (grid + lista), ou também as rows horizontais da Home (`BookRow`)? → A: Só a tela de Biblioteca; Home já tem mitigação parcial (`.slice(0, 20)`) e fica fora de escopo.
- Q: Como registrar a necessidade de dependência nova de virtualização na spec? → A: Spec fica agnóstica de tecnologia; avaliação de biblioteca vs. solução manual (com justificativa e aprovação antes de instalar) fica para o `sdd-plan`.
- Q: Qual escala de biblioteca a experiência precisa suportar sem travar? → A: ~1.000 livros — vira os critérios SC-001/SC-002.
- Q: As user stories de lista e grid têm a mesma prioridade? → A: Lista é P1 (modo padrão salvo em `localStorage`), grid é P2.
- Q: Deve manter o scroll de página inteira ou aceitar um painel de scroll interno dedicado à lista? → A: Manter scroll de página inteira (FR-002) — preserva a UX atual, mesmo sendo mais restritivo para a técnica de virtualização escolhida no plano.
- Q: Ao voltar de um livro ou mudar filtro/busca/ordenação, a lista deve manter ou resetar a posição de scroll? → A: Manter ao voltar de um livro; resetar em filtro/busca/ordenação (FR-003/FR-004).
