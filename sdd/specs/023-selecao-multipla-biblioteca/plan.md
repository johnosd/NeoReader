# Implementation Plan: Seleção múltipla na biblioteca com ações em lote

**Slug**: `023-selecao-multipla-biblioteca` | **Date**: 2026-10-12 | **Spec**: `sdd/specs/023-selecao-multipla-biblioteca/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Adiciona um modo de seleção à `LibraryScreen`, nas visualizações lista e grade. O modo começa com long-press num livro. Enquanto ele está ativo, o toque curto alterna a marcação, e uma barra de seleção substitui o cabeçalho (busca, filtros, ordenar e troca de visualização). A partir da barra, uma folha de ações em lote aplica aos livros marcados: **excluir** (com confirmação), **mover para coleção** (com "Sem coleção" e criação de coleção nova), **favoritar/remover dos favoritos** (adaptativo) e **status de leitura**.

A abordagem técnica:
- Estado de seleção efêmero dentro da tela.
- Um hook de long-press próprio, baseado em pointer events, sem dependência nova.
- Funções de lote finas em `src/db/`, que reaproveitam a exclusão individual (`deleteBook`) e fazem as mudanças de campo numa transação Dexie.
- Dois componentes novos (barra e folha) para não engordar a `LibraryScreen.tsx`, que já tem 1443 linhas.

## Technical Context

**Language/Version**: TypeScript 5.x + React 19 (Vite 8).

**Primary Dependencies**: Tailwind CSS v4 (tokens em `src/index.css`), Dexie.js + `dexie-react-hooks` (`useLiveQuery` já reativa a biblioteca a mudanças no DB), Lucide React (ícones), `@tanstack/react-virtual` via `useWindowVirtualList` (lista e grade já virtualizadas), Capacitor 8 (`useCapacitorBackButton`). **Nenhuma dependência nova.**

**Storage**: IndexedDB via Dexie (`NeoReaderDB`, schema v19). Sem mudança de schema. Os campos alterados já existem em `books`: `isFavorite`, `readingStatus`, `collectionId`, `collectionOrder`.

**Testing**: Vitest + Testing Library (jsdom). Os testes ficam em `src/__tests__/` espelhando `src/`. A camada de DB é testada com mocks de `db` (padrão de `src/__tests__/db/books.deleteBook.test.ts`). Gestos e o comportamento real do WebView são validados manualmente no device (o jsdom não reproduz scroll × long-press).

**Target Platform**: Android (Capacitor WebView) e Web. O gesto é pensado primeiro para toque.

**Performance Goals**: SC-003: ação em lote sobre 50 livros em menos de 3 s num Android intermediário. A rolagem da lista e da grade não pode regredir (o long-press não pode bloquear o scroll).

**Constraints**:
- Não mudar o comportamento de toque para abrir nem das ações individuais fora do modo (FR-002).
- O long-press não pode disparar o menu de contexto nativo nem seleção de texto no WebView.
- A lista e a grade são virtualizadas: a marcação visual tem de vir de prop/estado do pai, nunca de estado local do item.

**Scale/Scope**: bibliotecas pessoais de dezenas a poucos milhares de livros. Seleção típica de 2 a 50 livros, com pior caso de algumas centenas.

## Decisões Invariantes

- **D-01 — Seleção é estado efêmero da tela**: um `Set<number>` de ids de livros, num hook dedicado (`useLibrarySelection`) usado pela `LibraryScreen`. Não vai para Zustand nem para storage. Sair da tela descarta a seleção.
- **D-02 — Long-press próprio com pointer events**: hook `useLongPress`. O timer dispara em 500 ms e é cancelado por movimento acima de 10 px, `pointercancel` ou `pointerup`. O `click` que segue um long-press disparado é suprimido. Sem biblioteca de gestos (Constitution V).
- **D-03 — Modo de seleção = `selectedIds.size > 0`**: não existe um booleano separado. Desmarcar o último encerra o modo sozinho (FR-007), sem caminho de "modo ativo com zero selecionados".
- **D-04 — No modo de seleção, o item inteiro vira um único alvo de toque**:
  - Na lista, um botão de cobertura (`absolute inset-0`, `aria-pressed`) fica por cima da linha, de modo que "⋯", tags e favorito internos não recebem o toque.
  - Na grade, o `onClick` do card alterna em vez de abrir.
- **D-05 — Barra de seleção substitui o `<header>` inteiro**: busca, filtros, ordenar, trocar visualização e "+" somem enquanto o modo estiver ativo. O estado de filtro/busca não é alterado, então ao sair a tela volta exatamente como estava.
- **D-06 — Exclusão em lote = laço sequencial sobre `deleteBook(id)`**: não reimplementa a cascata. Assim herda a limpeza de progresso/marcadores/vocabulário/highlights/OPDS e do arquivo local. Cada livro é independente: uma falha conta como falha e o laço segue (falha parcial, FR-013).
- **D-07 — Favorito, status e coleção em lote = uma transação Dexie**: tudo ou nada. Falha parcial só existe na exclusão.
- **D-08 — "Favoritar" é adaptativo e calculado no momento da abertura da folha** (todos favoritos → remover; senão → favoritar), com valor explícito (`setBooksFavorite(ids, value)`). Nunca usa `toggleFavorite` por livro, que inverteria estados mistos.
- **D-09 — Mover para coleção substitui a coleção atual** e usa `collectionOrder = Date.now() + índice`, preservando a ordem da seleção dentro da coleção. "Sem coleção" grava `collectionId: null` e `collectionOrder: undefined`, como o `setBookCollection` faz hoje.
- **D-10 — Tags em lote ficam fora** (spec, Clarifications). Nada nesta feature mexe em `setBookTags`/`LibraryTagSheet`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | ✅ | ✅ | Este plano lista os arquivos tocados. O `sdd-execute` só começa depois do OK do usuário. As ambiguidades de escopo foram resolvidas na spec (8 clarificações), sem suposição. |
| II. Comentários só onde o "porquê" não é óbvio | ✅ | ✅ | Pontos que pedem comentário curto: supressão do click pós-long-press, tolerância de movimento (scroll), botão de cobertura da lista, `Set` imutável no estado React (sem equivalente direto em Python: é preciso criar um `Set` novo para o React detectar a mudança). |
| III. Explícito antes de mágico | ✅ | ✅ | Dois hooks pequenos e de responsabilidade única (`useLongPress`, usado em 2 lugares; `useLibrarySelection`, testável isolado) e dois componentes. Sem abstração genérica de "seleção para qualquer lista": é só a Biblioteca. |
| IV. Build limpo é a definição de "pronto" | ✅ | ✅ | Toda fase termina com `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm test` e `npm run build`. |
| V. Dependências novas exigem justificativa | ✅ | ✅ | Nenhuma: o long-press é caseiro (D-02) e não há haptics (o plugin `@capacitor/haptics` não está instalado e não será adicionado). |
| Restrição: schema append-only | ✅ | ✅ | Sem mudança de schema. |
| Fluxo: validar UI em browser real/device | ✅ | ✅ | `quickstart.md` cobre o Chromium (Playwright MCP) e o device Android, com foco no gesto (R-001). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/023-selecao-multipla-biblioteca/
├── spec.md              # Saída do sdd-specify
├── plan.md              # Este arquivo
├── quickstart.md        # Verificação manual (browser + device)
└── tasks.md             # Saída do sdd-plan (fase de tasks)
```

### Source Code (repository root)

Projeto único (React + Capacitor). Só os caminhos tocados por esta feature:

```text
src/
├── screens/
│   └── LibraryScreen.tsx              # ALTERA: usa seleção, troca header↔barra, back button, toast de resultado; LibraryBookRow/VirtualizedLibraryList recebem props de seleção
├── components/
│   ├── LibraryGridView.tsx            # ALTERA: props de seleção, long-press, marcação visual no GridBookCard
│   ├── LibrarySelectionBar.tsx        # NOVO: X + contador + botão "Ações"
│   └── BulkBookActionsSheet.tsx       # NOVO: folha com excluir/confirmar, coleção (lista + criar), favoritar adaptativo, status
├── hooks/
│   ├── useLongPress.ts                # NOVO
│   └── useLibrarySelection.ts         # NOVO
├── db/
│   ├── books.ts                       # ALTERA: deleteBooks, setBooksFavorite, setBooksReadingStatus
│   └── collections.ts                 # ALTERA: setBooksCollection
└── i18n/
    └── messages.ts                    # ALTERA: chaves library.selection.* e bulkActions.* em pt-BR/en/es

src/__tests__/
├── hooks/useLongPress.test.ts         # NOVO
├── hooks/useLibrarySelection.test.ts  # NOVO
├── db/books.bulk.test.ts              # NOVO
├── db/collections.bulk.test.ts        # NOVO
├── components/LibraryGridView.test.tsx        # ALTERA
├── components/BulkBookActionsSheet.test.tsx   # NOVO
└── screens/LibraryScreen.test.tsx             # ALTERA
```

**Structure Decision**: segue a estrutura existente:
- Componentes reutilizáveis em `src/components/` (a `QuickBookActionsSheet.tsx` é o modelo da folha nova).
- Hooks em `src/hooks/`.
- Repositórios em `src/db/`.
- i18n centralizado em `src/i18n/messages.ts`, com um objeto por idioma e pluralização por chaves `.one`/`.many`, como em `library.bookCount.*`.

A `LibraryScreen.tsx` recebe só a fiação. A UI nova vai para arquivos próprios.

## Complexity Tracking

> Sem violações da constitution. Seção intencionalmente vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário (hooks)**:
  - `useLongPress` com fake timers: dispara após 500 ms, não dispara com movimento acima de 10 px nem com `pointercancel`, suprime o click que segue o disparo e não suprime o click curto.
  - `useLibrarySelection`: start/toggle/clear, poda de ids que saíram da biblioteca.
- **Unitário (DB)**, com `db` mockado no padrão de `books.deleteBook.test.ts`:
  - `deleteBooks` chama `deleteBook` por id, continua após falha e retorna `{ succeeded, failed }`.
  - `setBooksFavorite`, `setBooksReadingStatus` e `setBooksCollection` gravam os campos certos para todos os ids numa transação.
- **Componente**:
  - `BulkBookActionsSheet`: rótulo adaptativo de favoritos, confirmação de exclusão com contagem, cancelar não apaga, criar coleção e mover, "Sem coleção", status.
  - `LibraryGridView`: no modo de seleção o toque alterna e não abre, e a marcação aparece.
  - `LibraryScreen`: long-press entra no modo, o cabeçalho troca pela barra, o X e o back saem, e desmarcar o último sai.
- **Manual** (`quickstart.md`): gesto no device real (scroll × long-press, menu de contexto, seleção de texto), exclusão em lote de livros `local` (o arquivo some) e tempo para 50 livros (SC-003).

Comandos-base:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npx vitest run src/__tests__/hooks/useLongPress.test.ts
npm run build
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 2 — Foundational | ✅ Concluída: `useLongPress`, `useLibrarySelection`, chaves `library.selection.*` |
| Fase 3 — US1 (seleção + excluir) | 🟡 Implementada e testada em jsdom; **T017 (gesto no device) aberta** |
| Fase 4 — US2 (coleção) | 🟡 Implementada e testada em jsdom; falta validar no device |
| Fase 5 — US3 (favoritos/status) | 🟡 Implementada e testada em jsdom; falta validar no device |
| Fase 6 — Polish | 🟡 T028, T030 e T032 feitas; T029 e T031 dependem de device |
| Gates (2026-10-12) | lint, `tsc -p tsconfig.app.json`, `npm test` (1696 ✓, 2 pulados) e `npm run build` verdes |
| Device | nenhum conectado nesta sessão: R-001 (gesto no WebView) segue **não validado** |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Long-press no Android WebView pode brigar com o scroll, abrir o menu de contexto/callout da imagem ou selecionar texto | Alto: quebra o gesto principal ou a rolagem | Cancelar em `pointercancel` e em movimento acima de 10 px. `preventDefault` no `contextmenu`. Classes `select-none` e `[-webkit-touch-callout:none]` nos itens. Validar no device (quickstart, passo 3) antes de fechar a US1. |
| R-002 | Itens virtualizados são desmontados e remontados durante o scroll | Médio: a marcação some ao voltar à tela | A marcação vem de `selectedIds.has(book.id)` passado por prop (D-04). Teste de componente cobre. |
| R-003 | `deleteLocalCopyIfUnused` faz `db.books.filter(...)` (varredura completa) por livro, logo a exclusão em lote é O(n·m) | Médio: pode estourar o SC-003 em bibliotecas grandes | Aceito no MVP (D-06). Medir 50 livros no device (quickstart, passo 6). Se passar de 3 s, abrir task de otimização sem mudar o comportamento. |
| R-004 | Toasts concorrentes (import, bookmarks restaurados, resultado do lote) na mesma posição fixa | Baixo: sobreposição visual | Estado próprio `bulkResult` com o mesmo componente `Toast`. Aceita-se a sobreposição rara com o toast de importação (import em andamento é raro durante a seleção). |
| R-006 | Decisão: `useLongPress` devolve `onClickCapture` em vez de receber `onClick` (desvio do T001) | Médio: muda como os componentes da Fase 3 consomem o hook | O componente mantém o próprio `onClick` e espalha os handlers do hook (`{...longPress}`) no elemento raiz do item. A supressão do click pós-long-press pega também os botões internos da linha da lista. |
| R-005 | `LibraryScreen.tsx` já tem 1443 linhas | Baixo: manutenção | A UI nova vai para `LibrarySelectionBar` e `BulkBookActionsSheet`. A tela só faz a fiação. |
| R-007 | Decisão: a barra de seleção é `fixed` sobre o cabeçalho, que continua no DOM `invisible` + `inert`, em vez de ser trocada (desvio da D-05) | Médio: trocar um cabeçalho de ~250 px por ~64 px deslocaria a lista sob o dedo no long-press, e rolando a lista a barra ficaria fora da tela | Mantida. Efeito visual igual ao "substitui"; FR-005 atendido (busca/filtros/ordenar inertes). Validar no device que a barra não colide com a barra de status. |
| R-008 | Decisão: long-press e toque usam a mesma ação `toggle`; `start` saiu de `useLibrarySelection` | Baixo | Com o modo ativo, um toque lento (≥ 500 ms) alterna o livro em vez de "sumir" (o hook engole o click seguinte). |
| R-009 | `collections.name` tem índice único (`&name`): criar coleção com nome repetido estouraria `ConstraintError` | Médio | "Criar e mover" reaproveita a coleção existente quando o nome bate (sem diferenciar maiúsculas). Coberto por teste. |
| R-010 | Achado fora do escopo: card da grade sem capa não tem nome acessível (sem `alt`), então leitor de tela o anuncia como "botão" | Baixo (a11y, pré-existente) | Não corrigido. Em modo de seleção o card ganha `aria-label`; fora dele segue como estava. Reportado ao usuário para decidir. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-12 | Fase 2 — Foundational | T001–T005 concluídas. Hooks de long-press e de seleção, com 18 testes. Fase 1 vazia por desenho. Achado A3 do Analyze descartado: o jsdom 29 tem `PointerEvent` com `clientX`/`button`. | Iniciar a Fase 3 (US1) |
| 2026-10-12 | Fase 3 — US1 | T006–T016 concluídas, T017 aberta. Exclusão em lote, barra, grade e lista com long-press, fiação na tela. Sem device conectado. | T017 (gesto no device) |
| 2026-10-12 | Fase 4 — US2 | T018–T022 concluídas. Mover para coleção com "Sem coleção" e "Criar e mover" (reaproveita nome existente). | Validar no device |
| 2026-10-12 | Fase 5 — US3 | T023–T027 concluídas. Favoritar adaptativo e status em lote; painéis da folha unificados em `panel`. | Validar no device |
| 2026-10-12 | Fase 6 — Polish | T028, T030, T032 concluídas. T029 e T031 dependem de device. | Rodada no device (T017, T029, T031) |

**PRÓXIMO**: rodada no device Android (`npm run android:run`): T017 (gesto: scroll × long-press, menu de contexto, não abrir ao soltar, voltar), T029 (50 livros em < 3 s) e T031 (`quickstart.md` completo). Depois disso, `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/BulkBookActionsSheet.tsx`: folha de ações em lote (favoritos, status, coleção, excluir).
- `src/components/LibrarySelectionBar.tsx` e `src/components/SelectionCheck.tsx`: barra fixa e círculo de seleção.
- `src/screens/LibraryScreen.tsx`: fiação (`useLibrarySelection`, back button, cabeçalho `inert`, toast) e `LibraryBookRow` com overlay de seleção.
- `src/components/LibraryGridView.tsx`: `GridBookCard` com long-press e marcação.
- `src/hooks/useLongPress.ts`, `src/hooks/useLibrarySelection.ts`.
- `src/db/books.ts` (`deleteBooks`, `setBooksFavorite`, `setBooksReadingStatus`) e `src/db/collections.ts` (`setBooksCollection`).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- O jsdom 29 do projeto suporta `PointerEvent`: em teste, `fireEvent.pointerDown(el, { button: 0, clientX, clientY })` funciona. Sem `button: 0`, o hook ignora o evento (trata como botão direito).
- Ao ligar o long-press na linha da lista (T010), espalhe os handlers no `<article>`, não nos botões internos. O `onClickCapture` precisa estar num ancestral de todos os botões para engolir o click pós-long-press.
- Os textos pt-BR antigos em `messages.ts` estão sem acento (legado). As chaves novas desta feature usam acentuação correta.
- A folha de ações em lote é o único consumidor de `deleteBooks`/`setBooks*`. Ela captura os `ids` no render do clique porque `books` (livros selecionados) encolhe sozinho durante a exclusão, via live query.
- Testes da `LibraryScreen` que dependem de long-press usam timer real (~520 ms): fake timers brigam com o virtualizador e as live queries da tela.
- Na grade sem capa o card não tem nome acessível; nos testes da tela, pegar o card por `getByTestId('library-virtual-grid').querySelector('button')`.
- Scripts de patch longos via heredoc do Bash falharam por parse de aspas nesta máquina; gerar o script com a ferramenta Write e rodar `python -I <script>`.
