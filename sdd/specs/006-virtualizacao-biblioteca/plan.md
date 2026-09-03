# Implementation Plan: Virtualização da tela de Biblioteca (grid e lista)

**Slug**: `006-virtualizacao-biblioteca` | **Date**: 2026-09-03 | **Spec**: `sdd/specs/006-virtualizacao-biblioteca/spec.md`

## Summary

Hoje `LibraryScreen.tsx` (modo lista, via `LibraryBookRow`) e
`LibraryGridView.tsx` (modo grid) renderizam **todos** os livros filtrados de
uma vez, sem nenhum limite — cada linha/card monta seu próprio
`useBookCoverUrl` (live query Dexie + `URL.createObjectURL` de uma capa
decodificada), então uma biblioteca grande vira centenas/milhares de nós no
DOM e de capas decodificadas na memória simultaneamente. A feature introduz
virtualização baseada em `@tanstack/react-virtual` (`useWindowVirtualizer`,
que usa a `window` como scroll container) nos dois modos, mantendo o scroll
de página inteira já existente (sem painel de scroll interno separado) e
preservando o comportamento visual/funcional atual de cada item. Modo lista é
P1 (padrão salvo em `localStorage`), modo grid é P2. Um mecanismo de cache de
posição de scroll fora do lifecycle do componente (módulo JS, não
`localStorage`/Zustand) resolve preservar o scroll ao voltar de um livro e
resetar ao topo quando filtro/busca/ordenação mudam — necessário porque
`src/App.tsx` desmonta `LibraryScreen` de verdade ao navegar (só a tela no
topo da pilha é renderizada, sem keep-alive).

## Technical Context

**Language/Version**: TypeScript ~6.0.2 / React 19.2.4 via Vite 8 — sem
mudança.

**Primary Dependencies**: `@tanstack/react-virtual@^3.14.10` (**NOVA**,
justificada em `research.md` Decisão 1, aprovada explicitamente pelo usuário
em 2026-09-03 conforme constitution Princípio V). Reaproveita
`dexie-react-hooks` (`useLiveQuery`, já usado por `useBookCoverUrl` e
`useLibraryCatalog`) e `lucide-react` (ícones já usados em `LibraryBookRow`/
`GridBookCard`) — sem mudança nesses dois.

**Storage**: Dexie — sem alteração de schema, sem nova `version()`. A feature
só muda como `LibraryBook[]` (já produzido por `useLibraryCatalog`) é
renderizado, não como é buscado/computado.

**Testing**: Vitest + Testing Library. Arquivos novos/afetados listados em
Project Structure. Exige um stub de `ResizeObserver` em
`src/__tests__/setup.ts` — `measureElement` do TanStack Virtual (medição
dinâmica de altura por item) depende de `ResizeObserver`, ausente no jsdom
(ver `research.md` Decisão 3 / Risco R-001). `useWindowVirtualizer` em si
(medição do viewport via `window.innerWidth`/`innerHeight`) não depende
disso — jsdom expõe esses valores por padrão (1024×768), então dá pra
testar "renderiza muito menos que o total" de forma real em unit test.

**Target Platform**: Android (Capacitor, WebView) + Web — mesma superfície
de código. Scroll rápido ("fling") em WebView Android é o cenário de maior
risco de UX (ver R-003) — validado manualmente via `quickstart.md`, já que
jsdom não mede fluidez/memória de verdade.

**Performance Goals**: SC-001/SC-002 da spec — biblioteca de 1.000+ livros
rola sem travar; número de nós de livro no DOM proporcional à viewport, não
ao total de livros.

**Constraints**: Manter scroll de página inteira (FR-002) — essa restrição
guiou a escolha da lib (ver `research.md`). Nenhuma mudança visual/funcional
por item — capa, progresso, tags, favoritos, menu de opções (lista) e barra
de progresso (grid) continuam idênticos (FR-005).

**Scale/Scope**: 2 arquivos de tela/componente modificados
(`LibraryScreen.tsx`, `LibraryGridView.tsx`) + 2 hooks novos + testes
correspondentes + 1 dependência nova. Nenhuma rota nova, nenhuma entidade de
dado nova, nenhuma superfície de API nova.

## Decisões Invariantes

- `@tanstack/react-virtual` é a única técnica de virtualização usada — sem
  misturar com `react-window`/implementação manual em nenhum dos dois modos
  (ver `research.md` Decisão 1).
- O modo grid virtualiza por **linha** de até 3 livros (nunca por card
  individual) — mapeia a grade fixa de 3 colunas pro modelo unidimensional
  do `useWindowVirtualizer` (ver `research.md` Decisão 2).
- Scroll é sempre de página inteira via `useWindowVirtualizer` — nenhum
  contêiner interno com `overflow`/altura fixa é introduzido pra lista ou
  grid (FR-002). O `scrollMargin` do virtualizador reflete o `offsetTop` do
  container da lista/grid (não é um valor fixo, porque o cabeçalho da
  Biblioteca tem altura variável — filtros/tags podem quebrar linha) — **não**
  é lido diretamente durante o render (proibido por `react-hooks/refs`) nem
  via `setState` síncrono dentro de um effect (proibido por
  `react-hooks/set-state-in-effect`, ambas regras do `eslint-plugin-react-hooks@7`
  deste projeto). Em vez disso, um `ResizeObserver` no `document.body`
  atualiza o `scrollMargin` (via `setState`) só dentro do seu callback —
  dispara sempre que a altura total da página muda, inclusive quando é só o
  cabeçalho acima do container que cresce/encolhe. Ver R-004.
- `useWindowVirtualizer` é configurado com `useFlushSync: false` (ver
  R-006) — o padrão da lib usa `flushSync` pra recalcular a janela visível,
  o que colide com o commit do React quando lista e grid desmontam/montam
  no mesmo ciclo (troca de `viewMode`).
- O reset de scroll do `useLibraryScrollRestore` **não** é um único
  `window.scrollTo` — é uma reafirmação por alguns frames (`forceScrollTo`,
  ver R-007), porque o virtualizador sendo desmontado (troca de `viewMode`)
  reafirma sua própria posição de scroll conhecida por cima da minha, e o
  novo virtualizador ainda corrige o scroll conforme mede a altura real de
  cada linha nos primeiros frames.
- `measureElement` (medição dinâmica de altura, baseada em `ResizeObserver`)
  é usado tanto na lista quanto no grid, com `estimateSize` servindo só de
  valor inicial — nunca uma altura fixa definitiva, já que `LibraryBookRow`
  tem altura variável de fato (tags podem quebrar linha, `lastOpenedAt` é
  opcional).
- Cache de posição de scroll é **module-level** (variável fora do
  componente, não `useState`/`useRef` do componente, não `localStorage`,
  não um store Zustand novo), chaveado por `viewMode` + assinatura de
  (`activeFilter`, `search`, `sort`) — ver `research.md` Decisão 4. É
  resetado implicitamente a cada reload completo do app; isso é aceito, não
  é requisito da spec preservar entre sessões.
- `ResizeObserver` é stubado (no-op) só em `src/__tests__/setup.ts` — o
  stub vive exclusivamente no ambiente de teste, nunca no código de
  produção.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | OK | OK | Este plano é a proposta de arquivos afetados. |
| II. Comentários só onde o "porquê" não é óbvio | OK | OK | Comentários necessários: por que `scrollMargin` é lido do DOM a cada render (cabeçalho de altura variável), por que o cache de scroll é module-level em vez de state (App.tsx desmonta a tela ao navegar), por que `ResizeObserver` é stubado no setup de teste, por que o grid virtualiza por linha e não por card. |
| III. Explícito antes de mágico | Risco avaliado | OK | Virtualização introduz posicionamento absoluto (`translateY`) por item — é o padrão idiomático documentado da lib escolhida, não uma abstração própria. Os dois hooks novos (`useWindowVirtualList`, `useLibraryScrollRestore`) existem porque lista e grid compartilham a mesma mecânica — evita duplicar setup do virtualizador em 2 arquivos, não é abstração especulativa. |
| IV. Build limpo é a definição de "pronto" | OK | OK | `npm run build` ao final de cada fase. |
| V. Dependências novas exigem justificativa | Pendente → Resolvido | OK | `@tanstack/react-virtual` justificada em `research.md` Decisão 1 e **aprovada explicitamente pelo usuário em 2026-09-03** antes deste plano ser escrito. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/006-virtualizacao-biblioteca/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── research.md            # Fase 0 — decisão de lib, unidade de virtualização, medição de altura, cache de scroll
├── quickstart.md          # Fase 1 — verificação manual (DOM limitado, fluidez, memória, scroll no device)
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

(Sem `data-model.md`/`contracts/` — nenhuma entidade de dado nova, nenhuma
superfície de API nova. A feature opera só sobre `LibraryBook[]`, já
produzido por `useLibraryCatalog`.)

### Source Code (repository root)

```text
src/
├── screens/
│   └── LibraryScreen.tsx                # MODIFICADO — modo lista passa a usar useWindowVirtualList + useLibraryScrollRestore
├── components/
│   └── LibraryGridView.tsx              # MODIFICADO — agrupa livros em linhas de 3 e usa useWindowVirtualList
├── hooks/
│   ├── useWindowVirtualList.ts          # NOVO — wrapper fino sobre useWindowVirtualizer (@tanstack/react-virtual), compartilhado entre lista e grid
│   └── useLibraryScrollRestore.ts       # NOVO — cache module-level de posição de scroll por (viewMode + assinatura de filtro/busca/ordenação)
└── __tests__/
    ├── setup.ts                          # MODIFICADO — stub de ResizeObserver (measureElement do TanStack Virtual depende dele)
    ├── screens/
    │   └── LibraryScreen.test.tsx        # MODIFICADO — novos testes: DOM limitado com biblioteca grande, reset de scroll em filtro/busca/ordenação
    ├── components/
    │   └── LibraryGridView.test.tsx      # NOVO — DOM limitado no modo grid com biblioteca grande
    └── hooks/
        ├── useWindowVirtualList.test.ts       # NOVO
        └── useLibraryScrollRestore.test.ts    # NOVO — lógica pura de assinatura/cache, sem depender de DOM real

package.json                              # MODIFICADO — nova dependência @tanstack/react-virtual
```

**Structure Decision**: Projeto único (React + Capacitor), sem separação
backend/frontend. Nenhuma pasta nova — 2 hooks novos em `src/hooks/`
(convenção já usada: hooks começam com `use`, um arquivo = uma
responsabilidade), testes espelhando em `src/__tests__/hooks/` e
`src/__tests__/components/`, seguindo a estrutura já estabelecida no
projeto.

## Complexity Tracking

> Nenhuma violação não justificada do Constitution Check. O único ponto
> avaliado (2 hooks novos em vez de inline) está documentado na tabela acima
> como justificado, não como violação — tabela abaixo fica vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário (hooks puros: `useLibraryScrollRestore`) → componente
(Testing Library: `LibraryScreen`, `LibraryGridView`, asserção de contagem de
nós renderizados) → manual no device/`quickstart.md` (fluidez real de
scroll, memória, "fling" em WebView Android — o que jsdom não mede de
verdade).

Testes novos cobrem especificamente o que esta feature muda:
- `useLibraryScrollRestore.test.ts`: assinatura muda → posição salva é
  descartada e o próximo mount começa do topo; assinatura igual → posição
  salva é restaurada; cada `viewMode` tem cache independente.
- `useWindowVirtualList.test.ts`: com N itens e um `estimateSize` fixo, o
  número de itens virtuais retornados é bem menor que N (bound baseado em
  `window.innerHeight` do jsdom, real e não-zero por padrão).
- `LibraryScreen.test.tsx`: com `useLibraryCatalog` mockado retornando uma
  lista grande (ex: 500 livros), o número de `LibraryBookRow` renderizados
  no DOM é uma fração pequena do total; com uma lista pequena (ex: 3-5
  livros, menor que a margem de overscan), todos aparecem normalmente sem
  diferença de comportamento (FR-006); mudar filtro/busca/ordenação reseta
  o scroll pro topo (via `window.scrollTo` espionado/mockado).
- `LibraryGridView.test.tsx` (novo arquivo): mesma asserção de DOM limitado,
  agora para `GridBookCard` agrupado em linhas de 3.

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Arquivo único: `npx vitest run src/__tests__/screens/LibraryScreen.test.tsx`
(ou o arquivo relevante da fase em andamento).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluído — `@tanstack/react-virtual@^3.14.10` instalado, baseline confirmado (775 testes, lint/tsc/build limpos antes da feature). |
| Foundational (Fase 2) | Concluído — `useWindowVirtualList.ts` e `useLibraryScrollRestore.ts` criados e testados isoladamente (6 testes novos). Stub de `ResizeObserver` em `setup.ts`. Desvio técnico R-004 resolvido (scrollMargin via ResizeObserver no body, não leitura direta de ref no render). |
| US1 — Lista virtualizada (Fase 3) | Concluído — modo lista de `LibraryScreen.tsx` virtualizado (MVP). 6 testes novos (787 no total, sem regressão). Achado grave R-005 (measureElement usa offsetHeight/offsetWidth, não getBoundingClientRect) resolvido com helper de teste escopado. |
| US2 — Grid virtualizado (Fase 4) | Concluído — `LibraryGridView.tsx` virtualizado por linha de 3. 3 testes novos (790 no total, sem regressão). Reaproveitou os mesmos 2 hooks e o helper de teste de R-005. |
| Polish (Fase 5) | Concluído — comentários revisados (T019), checagens automatizadas finais verdes (T020). T018 (quickstart.md) completo: passos 1-4 via Playwright MCP (2 bugs reais achados/corrigidos — R-006/R-007) e passo 5 no device Android real (`SM-S911B`) validado pelo usuário. Único ponto notado (pop-in de capas durante fling) confirmado como edge case já aceito na spec, não regressão. Feature completa. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `measureElement` do TanStack Virtual usa `ResizeObserver`, ausente no jsdom (ambiente do Vitest) — qualquer teste que monte um item com essa ref lançaria `ReferenceError: ResizeObserver is not defined`. | Alto se não tratado antes das tasks de teste — bloquearia toda a suíte de `LibraryScreen`/`LibraryGridView`. | Stub no-op de `ResizeObserver` em `src/__tests__/setup.ts` (task de Setup, antes de qualquer teste que renderize a lista/grid virtualizada). |
| R-002 | Itens de altura variável (medidos via `measureElement`, não fixos) podem causar um pequeno ajuste visual ("pulo") ao restaurar uma posição de scroll salva com base em `estimateSize`, antes da altura real ser medida. | Baixo — trade-off conhecido de virtualização com estimativa, comum em qualquer lib desse tipo. | Resolvido: `overscan` (default 5) validado ao vivo — restaurações de scroll testadas no browser (T010, posições 620px e 5892px) e no device Android real não mostraram pulo perceptível; screenshots de scroll em profundidade (linhas ~600-620 de 1200) sem artefato visual. |
| R-004 | O padrão documentado do TanStack Virtual pra `scrollMargin` (ler `containerRef.current?.offsetTop` direto no corpo do render, como no research.md original) viola `react-hooks/refs` deste projeto (`eslint-plugin-react-hooks@7`, preset `recommended`). A correção óbvia (medir em `useLayoutEffect`/`useEffect` e chamar `setState` sincronamente) também viola `react-hooks/set-state-in-effect` — só é aceito `setState` dentro do callback de uma subscrição a um sistema externo (ex: `addEventListener`, `ResizeObserver`). | Baixo/Médio — bloqueava `npm run lint` (gate obrigatório da constitution), descoberto ao rodar lint pela primeira vez após criar `useWindowVirtualList.ts`. | Resolvido: `scrollMargin` vira `useState`, atualizado só dentro do callback de um `ResizeObserver` observando `document.body` (dispara sempre que a altura total da página muda, cobrindo o caso do cabeçalho variável). `useWindowVirtualList.ts` ajustado, lint/tsc confirmados limpos, 6 testes dos hooks passando. |
| R-007 | Ao trocar `viewMode` (lista↔grid), o reset de scroll pro topo (`useLibraryScrollRestore`) não "grudava" — testado ao vivo no browser (Playwright), `scrollY` voltava pra ~4844 em vez de 0. Causa raiz (via stack trace instrumentado em runtime): o virtualizador antigo, sendo desmontado, chama `Virtualizer._willUpdate` reafirmando sua última posição conhecida (`scrollTo({top: 5000})`) **depois** do meu `scrollTo(0,0)`; o virtualizador novo então corrige o scroll em cascata (`resizeItem`/`applyScrollAdjustment`) conforme mede a altura real de cada linha nos primeiros frames. `overflow-anchor: none` no container (tentativa 1) e desativar `shouldAdjustScrollPositionOnItemSizeChange` (tentativa 2, além disso não é uma opção de construtor válida — só propriedade de instância, quebrava `npm run build`) não resolveram sozinhos. | Alto — sem isso, FR-003/FR-004 ficam quebrados especificamente na troca de `viewMode`, o cenário mais visível de uso (padrão do usuário testando a feature). Só apareceu testando num browser real; nenhum teste jsdom cobria essa troca lista↔grid já montada. | Resolvido: `forceScrollTo` (em `useLibraryScrollRestore.ts`) reafirma o `scrollTo` alvo por 8 frames via `requestAnimationFrame`, garantindo que a posição desejada seja a última a "vencer" depois que os virtualizadores antigo/novo terminam de se acertar. Confirmado ao vivo nos dois sentidos (lista→grid e grid→lista) com biblioteca de 300-1200 livros sintéticos. `overflow-anchor: none` mantido nos containers como defesa adicional (não prejudica, mesmo não tendo sido a causa raiz). |
| R-006 | `useWindowVirtualizer` usa `flushSync` internamente por padrão (opção `useFlushSync`, default `true`) pra recalcular a janela visível de forma síncrona quando uma medição muda o tamanho total. Ao trocar `viewMode`, isso colidia com o commit do React (lista e grid desmontando/montando no mesmo ciclo), gerando `[ERROR] flushSync was called from inside a lifecycle method` no console — achado testando ao vivo no browser (Playwright). | Médio — é só um warning de console (não quebra a UI visivelmente), mas indica um estado de scheduling inconsistente do React; poderia virar bug real em versões futuras do React/da lib. | Resolvido: `useFlushSync: false` em `useWindowVirtualList.ts` — o recálculo passa a ser assíncrono (1 frame a mais, imperceptível), sem colidir com o commit do React. Confirmado: 0 erros de console após o fix, nos dois sentidos de troca de `viewMode`. |
| R-005 | O `measureElement` do `@tanstack/react-virtual` usa `offsetHeight`/`offsetWidth` do elemento pra corrigir a altura estimada — **não** `getBoundingClientRect()` (testado empiricamente: patchar `getBoundingClientRect` não mudou nada; patchar `offsetHeight`/`offsetWidth` resolveu). jsdom retorna 0 pra essas duas propriedades por padrão (não faz layout de verdade). Com R-001 (stub de `ResizeObserver`) sozinho, cada item medido "encolhe" pra 0px, o que faz o cálculo da janela visível entrar num loop instável — cada correção revela mais itens ainda não medidos, até a lista inteira (ou um limite interno da lib) ser alcançada. Sintoma observado: `LibraryScreen.test.tsx` renderizando ~256 de 500 linhas, começando no índice 244 (não 0), teste 20x mais lento (25s vs 1.3s). | Alto se não tratado — quebra qualquer teste que monte a lista/grid virtualizada com `measureElement` ativo, de forma silenciosa (os testes "passam" com asserções fracas, mas testam o comportamento errado). | Resolvido: `src/__tests__/testUtils/domMeasurements.ts` (`mockElementDimensions(width, height)`) — patch de `offsetHeight`/`offsetWidth` via `Object.defineProperty` no `HTMLElement.prototype`, escopado por teste (retorna função de restore, usada em `afterEach`) em vez de global em `setup.ts` — evita risco de mudar comportamento de outros ~100 arquivos de teste que podem depender do zero padrão do jsdom pra essas propriedades. Usado em `LibraryScreen.test.tsx`; reaproveitar em `LibraryGridView.test.tsx` (Fase 4). |
| R-003 | `useBookCoverUrl` (live query Dexie + `URL.createObjectURL`) monta/desmonta a cada vez que um item entra/sai da janela virtualizada — scroll rápido ("fling") pode gerar muitas queries Dexie por segundo, especialmente em WebView Android. | Médio — é justamente o tipo de cenário que só se observa de verdade no device, não em teste automatizado. | Resolvido: validado pelo usuário no device Android real (`SM-S911B`, `npm run android:run`) fazendo fling na lista — sem crash, sem lentidão perceptível. Único efeito colateral notado (capas em pop-in durante o fling) é o edge case já aceito na spec (placeholder breve antes da capa carregar), não uma sobrecarga de Dexie. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-03 | Setup (Fase 1) | `@tanstack/react-virtual@^3.14.10` instalado (2 pacotes). Baseline confirmado: 775 testes passando, lint/tsc/build limpos. | Nenhuma. |
| 2026-09-03 | Foundational (Fase 2) | `useWindowVirtualList.ts` e `useLibraryScrollRestore.ts` criados, com 6 testes novos passando. Achado durante a task: o padrão original de `scrollMargin` (ler ref direto no render, ou `setState` síncrono num effect) viola `react-hooks/refs`/`react-hooks/set-state-in-effect` (`eslint-plugin-react-hooks@7`, preset recommended, já configurado no projeto) — corrigido com `ResizeObserver` no `document.body`, `setState` só dentro do callback (R-004). | Nenhuma. |

| 2026-09-03 | US1 — Lista virtualizada (Fase 3) | `LibraryScreen.tsx`: `.map` direto de `LibraryBookRow` trocado por `VirtualizedLibraryList` (usa `useWindowVirtualList`); `useLibraryScrollRestore` plugado. Achado durante os testes (R-005): `measureElement` mede via `offsetHeight`/`offsetWidth`, não `getBoundingClientRect` — jsdom retorna 0 pra ambos, causando um loop instável na janela visível (chegou a renderizar 256/500 linhas erradas). Corrigido com `src/__tests__/testUtils/domMeasurements.ts` (patch escopado por teste, não global). 787 testes passando (6 novos), lint/tsc/build limpos. | Nenhuma — MVP completo. |

| 2026-09-03 | US2 — Grid virtualizado (Fase 4) | `LibraryGridView.tsx`: agrupamento em linhas de 3 (`chunkIntoRows`) + `useWindowVirtualList`, `estimateSize` via `window.innerWidth`. Reaproveitou `useLibraryScrollRestore` já plugado na Fase 3 (nenhuma implementação nova). 790 testes passando (3 novos), lint/tsc/build limpos. | Nenhuma — US1+US2 completas. |

| 2026-09-03 | Polish (Fase 5) | Comentários revisados (T019). Checagens automatizadas verdes (T020). `quickstart.md` passos 1-4 executados de verdade via Playwright MCP (conectado ao Chrome do usuário via extensão — login Google real, feito manualmente por ele; 300-1200 livros sintéticos inseridos/removidos via `db.books.bulkAdd`/`bulkDelete`): DOM limitado confirmado (10-21 nós vs. centenas/milhares de livros), scroll de página inteira confirmado (`document.body.scrollHeight` ≈ altura do container virtualizado), screenshots sem regressão visual em lista e grid, scroll preservado ao abrir/voltar de um livro (FR-003) e resetado em mudança de filtro (FR-004) — ambos confirmados nos dois `viewMode`. 2 bugs reais achados e corrigidos só visíveis num browser de verdade: **R-006** (`flushSync` colidindo com o commit do React na troca de `viewMode` → `useFlushSync: false`) e **R-007** (reset de scroll perdendo a corrida contra o virtualizador antigo reafirmando sua posição + o novo corrigindo scroll em cascata → `forceScrollTo`, reafirmação por 8 frames). Regressão zero: 790 testes, lint/tsc/build limpos após os fixes. | Passo 5 do `quickstart.md` (device Android, cenário de "fling" — R-003) sendo validado pelo usuário em paralelo, no device físico. |

| 2026-09-03 | Polish (Fase 5) — fechamento | Usuário validou no device Android real (`SM-S911B`, `npm run android:run`): app funcionando, lista/grid virtualizados sem crash. Único ponto notado — capas em pop-in durante scroll rápido ("fling") — confirmado pelo próprio usuário como exatamente o edge case já aceito na spec (placeholder breve antes da capa carregar, trade-off esperado de carregar capas sob demanda em vez de todas de uma vez, que é justamente o que resolve o problema de memória original). Nenhuma mudança de código necessária. Checklist de Release completo — feature pronta pra fechar como Implementada. | Nenhuma. |

**PRÓXIMO**: Rodar `sdd-converge` quando o usuário quiser auditar a implementação final contra spec/plan/tasks, ou seguir direto pro commit.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `package.json` / `package-lock.json` — `@tanstack/react-virtual@^3.14.10` adicionado
- `src/hooks/useWindowVirtualList.ts` — wrapper sobre `useWindowVirtualizer`, `scrollMargin` via `ResizeObserver` no `document.body`
- `src/hooks/useLibraryScrollRestore.ts` — cache module-level de posição de scroll por assinatura
- `src/__tests__/setup.ts` — stub de `ResizeObserver`
- `src/__tests__/hooks/useWindowVirtualList.test.ts`, `src/__tests__/hooks/useLibraryScrollRestore.test.ts` — 6 testes novos
- `src/screens/LibraryScreen.tsx` — modo lista virtualizado (`VirtualizedLibraryList`), `useLibraryScrollRestore` plugado
- `src/__tests__/testUtils/domMeasurements.ts` — helper de teste pra medição de elementos (R-005)
- `src/__tests__/screens/LibraryScreen.test.tsx` — 8 testes novos (T008/T008a/T008b/T008c/T009/T010/T015 + empty state)
- `src/components/LibraryGridView.tsx` — modo grid virtualizado por linha de 3 (`chunkIntoRows` + `useWindowVirtualList`)
- `src/__tests__/testUtils/domMeasurements.ts` — reaproveitado por `LibraryGridView.test.tsx` também
- `src/__tests__/components/LibraryGridView.test.tsx` — 2 testes novos (T014 + biblioteca pequena)
- (Fase 5) Sem arquivo novo — `src/hooks/useWindowVirtualList.ts` ganhou `useFlushSync: false` (R-006) e `src/hooks/useLibraryScrollRestore.ts` ganhou `forceScrollTo` (R-007), ambos achados testando ao vivo no browser

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar como Convergida. -->

Convergência auditada em 2026-09-03: nenhuma lacuna (`missing`/`partial`/
`contradicts`/`unrequested`) entre `spec.md` (7 FRs, 4 SCs, 2 user stories,
5 edge cases) e o código final. Todos os arquivos listados em `Arquivos
Principais` são exatamente os modificados/criados no working tree — sem
escopo extra, sem sobra.

O que foi construído, resumido:

- **US1 (lista, P1/MVP)**: `LibraryScreen.tsx` ganhou `VirtualizedLibraryList`
  (componente interno), que troca o `.map` direto de `LibraryBookRow` por
  renderização via `useWindowVirtualList` — só os itens visíveis (+ margem)
  existem no DOM, confirmado ao vivo (10 nós de 1.200 livros no topo, 17-18
  nós rolado até o meio).
- **US2 (grid, P2)**: `LibraryGridView.tsx` virtualiza por linha de 3 livros
  (`chunkIntoRows`), reaproveitando o mesmo `useWindowVirtualList` — sem
  duplicar a mecânica de virtualização.
- **Scroll de página inteira (FR-002)**: mantido nos dois modos, sem painel
  de scroll interno — confirmado ao vivo (`document.body.scrollHeight` ≈
  altura do container virtualizado).
- **Preservar/resetar scroll (FR-003/FR-004)**: `useLibraryScrollRestore`
  (cache module-level por `viewMode` + assinatura de filtro/busca/
  ordenação) restaura a posição exata ao voltar de um livro e reseta ao
  topo em mudança de filtro/busca/ordenação — confirmado ao vivo nos dois
  `viewMode`, incluindo a troca lista↔grid (o cenário mais frágil,
  ver R-007).
- **FR-005/FR-006**: nenhuma mudança visual/funcional em `LibraryBookRow`/
  `GridBookCard` (favoritar, tags, menu de opções, barra de progresso
  intactos); bibliotecas pequenas continuam renderizando tudo normalmente.
- **FR-007**: `@tanstack/react-virtual` foi a única dependência nova,
  justificada em `research.md` e aprovada explicitamente pelo usuário antes
  de instalar.

Desvios acumulados nas Execution Notes (nenhum contradiz a spec; todos
documentados com evidência de resolução no código):

- **R-004**: `scrollMargin` não pôde ser lido direto do `ref` durante o
  render nem via `setState` síncrono num effect (regras `react-hooks/refs`/
  `set-state-in-effect` do `eslint-plugin-react-hooks@7` deste projeto,
  não previstas no `research.md` original) — resolvido com `ResizeObserver`
  no `document.body`, `setState` só dentro do callback.
- **R-005**: `measureElement` do TanStack Virtual mede via `offsetHeight`/
  `offsetWidth` (não `getBoundingClientRect`, como o `research.md` assumia)
  — jsdom retorna 0 pra ambos, causando um loop instável na virtualização
  durante os testes. Resolvido com um helper de teste escopado
  (`src/__tests__/testUtils/domMeasurements.ts`), não um patch global.
- **R-006/R-007**: 2 bugs reais só visíveis testando num browser de
  verdade (nenhum teste jsdom cobria a troca lista↔grid já montada) —
  `flushSync` colidindo com o commit do React (`useFlushSync: false`) e o
  reset de scroll perdendo a corrida contra os virtualizadores antigo/novo
  se acertando (`forceScrollTo`, reafirmação por 8 frames). Achados e
  corrigidos ao vivo via Playwright MCP antes de fechar a feature — exatamente
  o tipo de bug que só a verificação manual em browser real (constitution)
  pega.

Nenhuma decisão técnica do plano original foi revertida — os 2 hooks
(`useWindowVirtualList`, `useLibraryScrollRestore`) e a escolha de
`@tanstack/react-virtual` permanecem como planejados; os desvios acima são
correções/ajustes descobertos durante a implementação e teste, não
mudanças de direção. 790 testes passando, lint/tsc/build limpos na última
checagem. `README.md` atualizado (tabela de Stack + bullet em
"Funcionalidades → Biblioteca") pra refletir a virtualização como
capacidade visível do produto.
