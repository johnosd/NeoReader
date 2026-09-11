# Implementation Plan: Atalho pra anotar highlight logo após criar

**Slug**: `015-atalho-anotar-highlight-criacao` | **Date**: 2026-09-11 | **Spec**: `sdd/specs/015-atalho-anotar-highlight-criacao/spec.md`

## Summary

Depois de criar um highlight, um toast tocável aparece convidando a
anotar; tocando nele, `HighlightNoteSheet` (já existente, feature 013)
abre direto, associado ao highlight recém-criado. Tecnicamente, isso é
quase inteiramente reaproveitamento: o componente `Toast`
(`src/components/ui/Toast.tsx`) ganha uma prop opcional `onAction` (torna
o conteúdo tocável, opt-in, sem afetar os 7 usos existentes), e
`ReaderScreen.tsx` passa a `await` o id retornado por `addHighlight`
(hoje fire-and-forget) pra guardar o highlight recém-criado num novo
estado (`highlightAnnotateToast`), que dispara o mesmo `setHighlightNoteTarget`
que o fluxo de menu já usa hoje. Nenhuma mudança em `EpubViewer.tsx`
(iframe do EPUB não é tocado — diferente da 014), nenhuma mudança de
schema (`Highlight.note` já existe).

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (stack já travada pela constitution).

**Primary Dependencies**: Nenhuma nova. Reaproveita `Toast`
(`src/components/ui/Toast.tsx`) e `HighlightNoteSheet`
(`src/components/reader/HighlightNoteSheet.tsx`), ambos já existentes.

**Storage**: N/A — nenhuma mudança em `Highlight`/Dexie (campo `note` já
existe desde a feature 013). `db/highlights.ts::addHighlight` já é
`async` e retorna `Promise<number>` (o id recém-criado) — usado pra
montar o `Highlight` completo do toast, sem nenhuma mudança nesse
arquivo.

**Testing**: Vitest + Testing Library, `src/__tests__/screens/ReaderScreen.test.tsx`
— mesmo arquivo/padrão que já testa `onAnnotateHighlight`/
`HighlightNoteSheet` hoje (mock posicional de `dexie-react-hooks`,
captura de `mocks.epubViewerProps` pra disparar `onCreateHighlight`/
`onAnnotateHighlight` diretamente, sem depender do iframe do EPUB).

**Target Platform**: Android (Capacitor) + Web — mesmos alvos do projeto.

**Performance Goals**: N/A.

**Constraints**:
- Toda a mudança fica FORA do iframe sandboxado do EPUB — diferente da
  014. `EpubViewer.tsx` não muda: o ponto de entrada já existe
  (`onCreateHighlight`, chamado uma única vez, síncrono, no handler de
  clique da cor no menu de seleção — `EpubViewer.tsx:4171`), sem prop
  nova saindo do iframe.
- `Toast` é compartilhado por outras 7 telas (`App.tsx`,
  `AddBookButton.tsx`, `HomeScreen.tsx`, `LibraryScreen.tsx`,
  `OpdsCatalogSettingsScreen.tsx`) — a prop nova precisa ser 100%
  opt-in, sem alterar o comportamento de nenhum uso existente (todos
  passam só `children`+`onDismiss`, nunca a prop nova).
- `handleCreateHighlight` (`ReaderScreen.tsx:1038`) hoje é
  fire-and-forget (`void addHighlight(...)`) — precisa virar `async`/
  `await` pra ter o id disponível antes de acionar o toast.

**Scale/Scope**: App local-first, single-user por dispositivo — sem
preocupação de escala.

## Decisões Invariantes

- Estado do toast vive em `ReaderScreen.tsx`
  (`highlightAnnotateToast: Highlight | null`), mesmo padrão já usado por
  `highlightNoteTarget` — nunca dentro do iframe/`EpubViewer` (o toast é
  UI fora do sandbox, igual ao próprio `HighlightNoteSheet`).
- `handleCreateHighlight` passa a `await addHighlight(...)`, monta o
  `Highlight` completo (payload + id retornado + `bookId` + `createdAt`)
  e grava em `highlightAnnotateToast` — SUBSTITUINDO qualquer toast
  anterior via `setState` simples. Satisfaz FR-005 (nunca dois toasts)
  de graça, sem fila/dedupe dedicada.
- `Toast` ganha uma prop nova opcional `onAction?: () => void`. Quando
  presente, `children` é envolvido por um `<button type="button">` (em
  vez do `<span>` atual) — foco/teclado/clique gratuitos, sem
  reimplementar `role="button"`/`onKeyDown` à mão (Constitution III). O
  elemento raiz continua `<div role="status">` (semântica de
  live-region inalterada); só o miolo tocável muda. Os 7 usos
  existentes continuam passando só `children`+`onDismiss` e renderizam
  exatamente como hoje.
- Tocar no toast chama `setHighlightNoteTarget(highlightAnnotateToast)`
  — o MESMO estado que já abre `HighlightNoteSheet` hoje via
  `handleAnnotateHighlight` — e limpa o toast
  (`setHighlightAnnotateToast(null)`). Nenhuma lógica nova no sheet em
  si: Salvar/Cancelar continuam exatamente como estão (satisfaz
  FR-007/FR-008 por reaproveitamento total, não por replicação).
- `handleAnnotateHighlight` (entry point já existente do fluxo de menu)
  também limpa `highlightAnnotateToast` ao abrir o sheet — evita um
  toast antigo "pairando" depois que o usuário já abriu a anotação por
  outro caminho. Não é uma FR da spec; é consequência direta de não
  deixar dois estados de UI competindo pela mesma ação.
- Duração do toast: `durationMs={5500}` (dentro da faixa ~5-6s da
  spec/Assumptions), passada explicitamente na chamada — não altera o
  `durationMs=3000` default do componente, usado pelos outros 7 toasts.
- Texto do toast: chave nova `highlightAnnotateToast.message` nos 3
  locales — frase única, sem formatação rica, no padrão dos textos de
  toast já existentes em `messages.ts`.
- Nenhuma dependência nova.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compatível | Compatível | Veio de `sdd-specify` com entrevista + clarify completos (4+2 perguntas respondidas, zero `[NEEDS CLARIFICATION]` remanescente); este plano não introduz decisão de escopo nova além do que a spec já fechou. |
| II. Comentários só onde o "porquê" não é óbvio | Compatível | Compatível | Pontos não óbvios que vão levar comentário: por que `handleCreateHighlight` virou `async` (precisa do id antes do toast), por que `Toast` usa `<button>` só quando `onAction` existe (mantém `role="status"` na raiz). |
| III. Explícito antes de mágico | Compatível | Compatível | Reaproveita 3 peças já existentes (estado `highlightNoteTarget`/`HighlightNoteSheet`, componente `Toast`, retorno de `addHighlight`) em vez de inventar mecanismo novo; a única peça genuinamente nova é a prop `onAction`, pequena e isolada. |
| IV. Build limpo é a definição de "pronto" | Compatível | Compatível | `npm run build` faz parte do Checklist de Release em `tasks.md`. |
| V. Dependências novas exigem justificativa | Compatível | Compatível | Nenhuma dependência nova. |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/015-atalho-anotar-highlight-criacao/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1, passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `research.md` (nenhuma incerteza técnica genuína — a extensão do
`Toast` e o uso do retorno de `addHighlight` são decisões diretas, já
registradas em Decisões Invariantes). Sem `data-model.md` (nenhuma
entidade/campo novo — reaproveita `Highlight.note` da 013). Sem
`contracts/` (nenhuma superfície de API/rede nova).

### Source Code (repository root)

```text
src/
├── components/
│   └── ui/
│       └── Toast.tsx                    # MODIFICADO: prop onAction opcional
├── screens/
│   └── ReaderScreen.tsx                 # MODIFICADO: handleCreateHighlight assíncrono,
│                                         # estado highlightAnnotateToast, JSX do toast,
│                                         # handleAnnotateHighlight limpa o toast
└── i18n/
    └── messages.ts                      # MODIFICADO: highlightAnnotateToast.message (3 locales)

src/__tests__/
└── screens/
    └── ReaderScreen.test.tsx            # MODIFICADO: testes do toast (aparece, toca abre
                                          # sheet, ignora e some, substitui em criação rápida,
                                          # Cancelar idêntico ao fluxo de menu)
```

Nenhum outro arquivo muda — `EpubViewer.tsx`, `db/highlights.ts`,
`types/highlight.ts` e `HighlightNoteSheet.tsx` já existem e não
precisam de alteração (esta feature só consome o retorno de
`addHighlight` e o estado que já abre o sheet, não escreve em nenhum
deles).

**Structure Decision**: Projeto único (React + TypeScript + Vite), sem
separação backend/frontend — segue a estrutura já existente. Toda a
mudança de comportamento fica em `ReaderScreen.tsx` + `Toast.tsx`
(camada React fora do iframe), ao contrário da 014 que ficou inteira
dentro de `EpubViewer.tsx`.

## Complexity Tracking

*(vazio — nenhuma violação do Constitution Check a justificar)*

## Estratégia de Testes

Prioridade: unitário/componente (Vitest + Testing Library, disparando
`onCreateHighlight`/`onAnnotateHighlight` via `mocks.epubViewerProps`,
mesmo mecanismo já comprovado em `ReaderScreen.test.tsx`) → manual num
browser real (`npm run dev`) como validação final. Diferente da 014,
esta feature não toca no iframe do EPUB nem em código específico de
Android/Capacitor — toda a superfície nova é React "normal" fora do
sandbox, então a validação manual não exige necessariamente o device
Android (browser real já cobre o risco principal: toast aparecendo,
sendo tocável, e abrindo o sheet certo). Device fica como reforço
opcional, não bloqueio, dado o histórico da 014 de bugs específicos de
iframe/overlay que não se aplicam aqui.

Comandos-base:

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
npx vitest run src/__tests__/screens/ReaderScreen.test.tsx
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Foundational (Toast tocável, chave i18n) | Concluída |
| User Story 1 (toast pós-criação) | Concluída |
| Polish | Concluída |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-11 | Foundational | `Toast.tsx` ganhou prop opcional `onAction` (envolve `children` num `<button>` quando presente, sem afetar os 7 usos existentes); chave `highlightAnnotateToast.message` nos 3 locales de `messages.ts`. `npx tsc --noEmit` limpo. | Nenhuma — pronto pra US1. |
| 2026-09-11 | User Story 1 | `handleCreateHighlight` virou `async`/`await addHighlight(...)` pra ter o id antes de gravar `highlightAnnotateToast`; `handleTapAnnotateToast` novo (abre o sheet via o mesmo `setHighlightNoteTarget` do fluxo de menu, limpa o toast); `handleAnnotateHighlight` também limpa o toast. JSX novo do `<Toast onAction>` em `ReaderScreen.tsx`. 6 testes novos em `ReaderScreen.test.tsx` (toast aparece/toca-abre-sheet/salva-no-id-certo/cancela-sem-gravar/2º-highlight-substitui/menu-limpa-toast). `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos (918 passando, 2 skipped pré-existentes). | Nenhuma — US1 completa e testável isoladamente. |
| 2026-09-11 | Polish | Gates já confirmados na US1 (T014). Validação manual num browser real via Playwright (`npm run dev` + navegação real no livro "The Gift" já na biblioteca de teste) — não device, conforme decisão de `plan.md` (feature não toca no iframe/foliate-js). Fluxo completo exercido de ponta a ponta contra o app rodando de verdade: criar highlight → toast aparece (texto real, locale inglês da sessão) → tocar → sheet abre vazio → salvar → confirmado via IndexedDB que a nota foi gravada no highlight CERTO (id 12, texto "driveway"); e criar 2 highlights em sequência rápida → confirmado só 1 toast no DOM (nunca dois). Zero erros de console durante toda a validação. Achado de tooling (não é bug do produto): `ev.target instanceof Element` no handler de clique do menu de seleção não resolve cross-realm pra elementos de dentro do iframe quando o clique é sintetizado via `dispatchEvent` — o hit-test por coordenada (`getElementFromPoint(doc, clientX, clientY)`, já existente no código como fallback) é quem realmente resolve; só um evento sintético SEM `clientX`/`clientY` reais falha, cenário que não ocorre num toque real de usuário. README.md atualizado (T016, bullet novo em "Highlights"). | Nenhuma — feature completa. |

**PRÓXIMO**: Feature implementada por completo. Sugerido rodar `sdd-converge` numa sessão futura.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/ui/Toast.tsx` — prop `onAction` nova
- `src/i18n/messages.ts` — chave `highlightAnnotateToast.message` (3 locales)
- `src/screens/ReaderScreen.tsx` — `highlightAnnotateToast`, `handleCreateHighlight` assíncrono, `handleTapAnnotateToast`, JSX do toast
- `src/__tests__/screens/ReaderScreen.test.tsx` — 6 testes novos (toast de atalho)
- `README.md` — bullet novo sobre o toast de atalho (seção Highlights)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `HighlightNoteSheet` usa `key={highlight?.id ?? 'closed'}` pro reset de
  texto (ver comentário em `HighlightNoteSheet.tsx:17-20`) — o
  `Highlight` guardado em `highlightAnnotateToast` e depois passado pra
  `highlightNoteTarget` precisa ter `id` definido (vem do retorno de
  `addHighlight`) pra esse mecanismo funcionar; nunca montar esse objeto
  sem o id resolvido.
- `mocks.dbHighlights` em `ReaderScreen.test.tsx` mocka `addHighlight`
  como `vi.fn()` sem resolução default — qualquer teste novo que dispare
  `onCreateHighlight` precisa configurar
  `vi.mocked(addHighlight).mockResolvedValue(<id>)` antes, senão a
  Promise nunca resolve e o toast nunca aparece.
- Validação via Playwright no menu de seleção do EPUB (dentro do
  iframe/shadow DOM do `foliate-view`): um clique sintetizado via
  `dispatchEvent(new MouseEvent('click', ...))` só é roteado
  corretamente pro botão certo se `clientX`/`clientY` vierem preenchidos
  com a posição REAL do elemento (`getBoundingClientRect()`) — o handler
  em `EpubViewer.tsx` usa `ev.target instanceof Element` como 1ª
  tentativa, que falha cross-realm pra nós do iframe, e cai pro hit-test
  por coordenada (`getElementFromPoint`). Um clique sintético sem
  coordenadas reais (ou via `.click()` puro) fica preso em `NO_OPEN_COLORS`
  silenciosamente. Não é um bug do produto (todo toque REAL já vem com
  coordenadas corretas) — é só uma armadilha de automação a lembrar numa
  próxima sessão que precise repetir esse tipo de validação.
