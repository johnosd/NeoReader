# Research: Virtualização da tela de Biblioteca

## Decisão 1: Biblioteca de virtualização

**Decisão**: `@tanstack/react-virtual` (versão atual do registry: `3.14.10`).

**Justificativa**: FR-002 exige manter o scroll de página inteira (cabeçalho +
filtros + lista no mesmo scroll do documento, sem painel de scroll interno
dedicado). `@tanstack/react-virtual` tem um hook de primeira classe pra
exatamente esse caso — `useWindowVirtualizer` — que usa `window` como scroll
container, em vez de exigir um elemento com altura fixa. Além disso:
- Headless (sem CSS/markup próprio) — encaixa direto no Tailwind já usado no
  projeto, sem conflito de estilos.
- Zero dependências, ~3kb gzip (`virtual-core` + adaptador React fino).
- `peerDependencies` inclui `"react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`
  (confirmado via `npm view @tanstack/react-virtual peerDependencies` em
  2026-09-03) — compatível com React 19.2.4 já usado no projeto.
- Mantido pelo time TanStack (mesmo grupo do `react-query`), ativamente
  atualizado.
- Aprovado explicitamente pelo usuário em 2026-09-03, conforme exigido pela
  constitution (Princípio V — dependências novas exigem justificativa e
  aprovação antes de instalar).

**Alternativas consideradas**:
- **`react-window`** (v2, `List`/`Grid`) — a lib originalmente cogitada no
  item de backlog. Rejeitada: seu modelo de dimensionamento é baseado em
  `ResizeObserver` no próprio container (`useResizeObserver` com
  `mode: 'only-height'`), esperando um elemento com altura própria — não tem
  um modo nativo de "usar a window como scroll container". Forçar isso
  exigiria um container com `height: 100vh` e scroll interno, violando FR-002,
  ou hacks de sincronização manual entre o scroll da window e um estado
  interno da lib — mais frágil que usar uma lib que já resolve isso de
  fábrica.
- **`react-virtualized`** (predecessora do `react-window`, tinha
  `WindowScroller`) — rejeitada por ser um pacote maior, com API mais antiga
  e em modo de manutenção reduzida comparado a `@tanstack/react-virtual`.
- **Windowing manual (sem dependência nova)** — calcular manualmente quais
  itens estão visíveis via `scroll`/`resize` listeners e
  `getBoundingClientRect`. Rejeitada como primeira escolha: exigiria
  reimplementar do zero tratamento de resize, scroll rápido ("fling"),
  medição de altura dinâmica por item e overscan — cada um desses é uma fonte
  conhecida de bugs sutis de scroll, especialmente na WebView Android
  (Capacitor) que é uma das duas plataformas alvo do projeto. Uma lib
  headless pequena e madura reduz esse risco por um custo de bundle
  desprezível. Usuário concordou explicitamente com essa troca ao aprovar a
  dependência.

## Decisão 2: Unidade de virtualização no modo grid

**Decisão**: Virtualizar por **linha** (grupos de 3 livros, já que o grid é
fixo em 3 colunas), não por card individual. Cada "item virtual" do
`useWindowVirtualizer` representa uma linha de até 3 `GridBookCard`.

**Justificativa**: `useWindowVirtualizer`/`useVirtualizer` do TanStack Virtual
são unidimensionais (uma lista de itens com um único eixo de scroll). O grid
atual (`LibraryGridView.tsx`) é uma grade CSS de 3 colunas fixas — tratá-lo
como "N linhas de até 3 cards" mapeia diretamente pro modelo unidimensional da
lib, sem precisar de virtualização 2D (que o TanStack Virtual suporta via
duas instâncias cruzadas, mas seria complexidade desnecessária pra uma grade
de colunas fixas, não rolável horizontalmente).

**Alternativas consideradas**:
- Virtualização 2D (linha + coluna independentes) — rejeitada por
  desnecessária: as colunas não rolam de forma independente, só as linhas.

## Decisão 3: Altura dos itens — estimativa + medição dinâmica

**Decisão**: Usar `estimateSize` com um valor aproximado (baseado no layout
atual) combinado com medição dinâmica via `virtualizer.measureElement` (ref
callback padrão do TanStack Virtual, baseado em `ResizeObserver` por item).

**Justificativa**: `LibraryBookRow` (modo lista) tem altura variável de fato —
depende de quantas tags o livro tem (podem quebrar linha) e se
`lastOpenedAt` está presente (linha extra opcional). Usar só uma estimativa
fixa causaria saltos de scroll perceptíveis. `measureElement` é o padrão
documentado do TanStack Virtual pra listas de altura variável — mede a altura
real após o primeiro render de cada item e corrige a posição dos itens
seguintes.

**Risco identificado**: `measureElement` depende de `ResizeObserver`, que o
jsdom (ambiente do Vitest) **não implementa nativamente**. Sem um polyfill,
qualquer teste que monte um componente usando essa ref vai lançar
`ReferenceError: ResizeObserver is not defined`. `useWindowVirtualizer` em si
(medição do viewport via `window.innerWidth`/`innerHeight`) não depende de
`ResizeObserver` — só a medição dinâmica por item depende. Mitigação: um
stub mínimo de `ResizeObserver` (`observe`/`unobserve`/`disconnect` no-op) em
`src/__tests__/setup.ts`, no mesmo espírito do mock já existente ali pro
elemento customizado `foliate-view`. Registrado como task de Setup em
`tasks.md`.

## Decisão 4: Persistência da posição de scroll (FR-003/FR-004)

**Decisão**: Cache em memória, no nível do módulo (module-level, fora do
componente React) — não `localStorage`, não Zustand. Chave = combinação de
`viewMode` (lista/grid) + uma assinatura de `activeFilter` + `search` +
`sort`. Sempre que essa assinatura muda enquanto a tela está montada (efeito
`useEffect` observando essas dependências, ignorando a primeira montagem), o
scroll é forçado pro topo e a entrada de cache correspondente é limpa. Ao
montar a tela, se já existir uma posição salva pra assinatura atual, o scroll
é restaurado pra ela; senão, começa do topo.

**Justificativa**: `src/App.tsx` não usa keep-alive de telas — só a tela no
topo da pilha (`stack[stack.length - 1]`) é renderizada (`switch
(current.name)`), então `LibraryScreen` desmonta de verdade ao abrir um
livro e remonta ao voltar. Um `useRef`/estado local do componente não
sobrevive a esse ciclo — precisa de algo fora do lifecycle do componente. Um
módulo JS com uma variável mutável é a solução mais explícita e direta (sem
mágica, sem dependência nova) — mesmo padrão de simplicidade já usado no
projeto para outros bits de estado leve fora do Dexie (embora esses usem
`localStorage` por precisarem sobreviver a reload; aqui não precisa —
resetar em reload completo do app é aceitável e nunca foi um requisito).
Persistir por assinatura de filtro/busca/ordenação (em vez de só por
`viewMode`) faz o reset-ao-mudar-filtro (FR-004) e o preservar-ao-voltar
(FR-003) caírem naturalmente do mesmo mecanismo, sem precisar saber *por
que* o componente está remontando.

**Alternativas consideradas**:
- `sessionStorage`/`localStorage` — rejeitado: sobreviver a reload de app não
  é um requisito da spec, e usar storage pra um número que só importa durante
  a sessão atual é indireção desnecessária (Princípio III da constitution —
  explícito antes de mágico).
- Store Zustand novo — rejeitado: `src/store/readerStore.ts` é o único store
  Zustand do projeto hoje, dedicado ao estado do leitor; criar um store novo
  só pra 1-2 números de scroll é desproporcional ao problema.
