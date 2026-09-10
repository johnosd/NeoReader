# Implementation Plan: Anotações associadas a highlights

**Slug**: `013-anotacoes-highlights` | **Date**: 2026-09-10 | **Spec**: `sdd/specs/013-anotacoes-highlights/spec.md`

## Summary

Adicionar um campo opcional de anotação em texto livre (até 2000
caracteres) a cada highlight já existente. A escrita/edição acontece
numa nova ação "Anotar"/"Editar anotação" no menu que já abre ao tocar
num highlight (mesmo menu de remover/cor/estilo, em `EpubViewer.tsx`),
abrindo um `BottomSheet` React novo (`HighlightNoteSheet`) fora do
iframe do EPUB — mesmo padrão de comunicação por callback que as ações
existentes desse menu já usam. A anotação é exibida na aba Destaques de
`BookDetailsScreen.tsx`, truncada se longa. Modelada como campo
opcional na própria linha do `Highlight` (não uma entidade/tabela
nova) — decisão que resolve a exclusão em cascata (FR-007) de graça,
sem lógica extra, e evita bump de versão do Dexie.

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (stack já travada pela constitution).

**Primary Dependencies**: Nenhuma nova. Reaproveita `dexie-react-hooks`
(`useLiveQuery`, já usado pra `highlights` em `BookDetailsScreen.tsx`),
`foliate-js` (só indiretamente — a nova ação não toca a API de
overlay/pintura do highlight), provider de i18n local.

**Storage**: Dexie — campo novo `note?: string` em `Highlight`
(`src/types/highlight.ts` + tabela `highlights` em `src/db/database.ts`).
Segue exatamente o precedente já existente do campo `style?:
HighlightStyle` (comentário em `types/highlight.ts`: campo opcional,
não indexado, **não exige nova `version()` do Dexie** — registros
antigos simplesmente não têm o campo, sempre ler com fallback).

**Testing**: Vitest + Testing Library — mesmos arquivos/padrões já
usados pra highlights: `src/__tests__/components/EpubViewer.test.tsx`
(describe `EpubViewer — highlights de trecho selecionado`),
`src/__tests__/db/highlights.test.ts`, `src/__tests__/screens/
BookDetailsScreen.test.tsx`, `src/__tests__/screens/ReaderScreen.test.tsx`.

**Target Platform**: Android (Capacitor) + Web — mesmos alvos do projeto.

**Performance Goals**: N/A — campo de texto simples, sem trabalho
sensível a performance.

**Constraints**:
- `EpubViewer.tsx`: mudanças na área do iframe do EPUB exigem cuidado
  com sandbox/CSP (regra já registrada no CLAUDE.md) — a nova ação do
  menu só adiciona um botão declarativo (mesmo padrão de
  `data-nr-highlight-remove`/`-color`/`-style`) que dispara um
  callback pra fora do iframe; a UI de escrita em si (textarea) **não**
  vive dentro do iframe.
- **Colisão de nome a evitar**: `foliate-js` já expõe `view.addAnnotation`/
  `view.deleteAnnotation` pra pintar/despintar o overlay visual do
  highlight no texto (usado em `paintHighlight`, `EpubViewer.tsx:2791,3810`)
  — isso é um conceito **completamente diferente** da anotação de texto
  desta feature. Por isso o campo/entidade de domínio desta feature
  chama-se **`note`** no código (nunca `annotation`), mesmo com a spec e
  a UI usando "anotação" em português — evita qualquer confusão entre
  "pintar o highlight" e "escrever a nota do usuário".
- Nenhum componente `<textarea>` existe hoje no projeto (grep
  confirmou) — é um padrão de UI novo, mas usa só HTML nativo dentro de
  um `BottomSheet` já existente (`src/components/ui/BottomSheet.tsx`),
  sem biblioteca nova.

**Scale/Scope**: App local-first, single-user por dispositivo — sem
preocupação de escala.

## Decisões Invariantes

- A anotação é um campo opcional (`note?: string`) na própria linha do
  `Highlight` — não uma tabela/entidade separada. Isso resolve a
  exclusão em cascata (FR-007) automaticamente: apagar o highlight já
  apaga a nota junto, sem código de cascata dedicado.
- No código, o campo/domínio chama-se **`note`**, nunca `annotation` —
  reservado pro conceito já existente de overlay de highlight do
  foliate-js (`view.addAnnotation`/`deleteAnnotation`). A UI e a spec
  continuam usando "anotação"/"Anotar" em português livremente; é só o
  identificador de código que evita a palavra.
- A ação "Anotar"/"Editar anotação" é um item novo, declarativo, no
  menu de highlight já existente em `EpubViewer.tsx`
  (`renderHighlightMenuActionsHtml`) — mesmo padrão de
  `data-nr-highlight-*` das ações existentes (remover/cor/estilo).
  Clicar nela dispara um novo callback (`onAnnotateHighlight`) pra fora
  do iframe; não abre nenhuma UI de texto dentro do sandbox.
- A UI de escrita/edição é um `BottomSheet` React novo
  (`HighlightNoteSheet`), renderizado em `ReaderScreen.tsx` no mesmo
  nível de `BookmarkSheet` — nunca dentro do iframe do EPUB.
- Salvar exige toque explícito (FR-004) — sem autosave, sem debounce.
  Salvar com texto vazio/só espaços remove o campo `note` (FR-006), em
  vez de gravar string vazia.
- Nenhuma sincronização de nuvem é adicionada — `note` segue exatamente
  o tratamento local-first que `Highlight` já tem hoje (sem
  `scheduleXxxDriveSync`).
- Nenhuma dependência nova é adicionada ao projeto.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compatível | Compatível | Veio de `sdd-specify` com entrevista + clarify completos (7 perguntas respondidas, zero `[NEEDS CLARIFICATION]` remanescente); este plano não introduz decisão nova não coberta pela spec. |
| II. Comentários só onde o "porquê" não é óbvio | Compatível | Compatível | Dois pontos não óbvios vão levar comentário: por que `note` (não `annotation`) no código, e por que campo opcional em vez de tabela nova (cascata de graça). |
| III. Explícito antes de mágico | Compatível | Compatível | Sem autosave/debounce (explicitamente rejeitado na spec); campo simples em vez de nova entidade/relação — menor abstração que resolve o requisito por completo. |
| IV. Build limpo é a definição de "pronto" | Compatível | Compatível | `npm run build` faz parte do Checklist de Release em tasks.md. |
| V. Dependências novas exigem justificativa | Compatível | Compatível | Nenhuma dependência nova — `<textarea>` nativo dentro de `BottomSheet` já existente. |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/013-anotacoes-highlights/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1, passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `research.md` (nenhuma incerteza técnica genuína restante — a
exploração deste plano já resolveu as duas questões que motivaram o
redirecionamento do `sdd-adhoc`). Sem `contracts/` (nenhuma superfície
de API/rede nova). Sem `data-model.md` dedicado — o modelo é um campo
único documentado acima e no `data-model.md` inline desta seção seria
redundante; a Key Entity de `spec.md` + esta seção já cobrem.

### Source Code (repository root)

```text
src/
├── types/
│   └── highlight.ts                    # MODIFICADO: campo `note?: string` em Highlight
├── db/
│   └── highlights.ts                   # MODIFICADO: updateHighlightNote(id, note: string | null)
├── components/
│   └── reader/
│       ├── EpubViewer.tsx              # MODIFICADO: item "Anotar" no menu de highlight + prop onAnnotateHighlight
│       └── HighlightNoteSheet.tsx      # NOVO: BottomSheet com textarea pra escrever/editar a nota
├── screens/
│   ├── ReaderScreen.tsx                # MODIFICADO: estado do sheet + handleAnnotateHighlight/handleSaveHighlightNote
│   └── BookDetailsScreen.tsx           # MODIFICADO: exibe highlight.note truncado na aba Destaques
└── i18n/
    └── messages.ts                      # MODIFICADO: novas chaves (reader.highlightMenu.*, highlightNote.*) nos 3 locales

src/__tests__/
├── db/
│   └── highlights.test.ts              # MODIFICADO: testes de updateHighlightNote
├── components/
│   └── EpubViewer.test.tsx             # MODIFICADO: testes do item de menu + callback onAnnotateHighlight
├── screens/
│   ├── ReaderScreen.test.tsx           # MODIFICADO: testes do sheet (abrir/salvar/cancelar/esvaziar)
│   └── BookDetailsScreen.test.tsx      # MODIFICADO: testes de exibição/truncamento da nota
```

**Structure Decision**: Projeto único (React + TypeScript + Vite), sem
separação backend/frontend — segue a estrutura já existente. Único
componente novo é `HighlightNoteSheet.tsx`, seguindo a convenção "um
arquivo = uma responsabilidade" e o padrão já estabelecido por
`BookmarkSheet.tsx` (mesmo `BottomSheet` de `src/components/ui`).

## Complexity Tracking

*(vazio — nenhuma violação do Constitution Check a justificar)*

## Estratégia de Testes

Prioridade: unitário (Vitest + Testing Library) → não há camada de
contrato/integração de API aplicável (app local-first sem backend
próprio de dados de leitura) → manual em device Android real como
validação final (mandatado pela constitution pra mudanças de UI/leitor,
e especialmente relevante aqui por ser o primeiro `<textarea>` do
projeto — teclado virtual Android dentro de um `BottomSheet` sobre o
leitor merece checagem visual real).

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npx vitest run src/__tests__/db/highlights.test.ts
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npx vitest run src/__tests__/screens/ReaderScreen.test.tsx
npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Foundational (campo `note`, `updateHighlightNote`, i18n) | Concluída |
| User Story 1 (escrever/editar via menu do leitor) | Concluída |
| User Story 2 (exibir em Destaques) | Concluída |
| Polish | Concluída — feature implementada por completo |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Nome "annotation" já é usado por `foliate-js` (`view.addAnnotation`/`deleteAnnotation`) pra outro conceito (overlay de pintura do highlight). | Risco de confusão/bug se um futuro identificador de código usar "annotation" pra se referir à nota de texto do usuário. | Resolvido no design: campo/domínio chama-se `note` no código, nunca `annotation`. Documentado nas Decisões Invariantes e deve virar comentário no campo `note` de `types/highlight.ts`. |
| R-002 | Nenhum `<textarea>`/formulário de texto multi-linha existe hoje no projeto — padrão de UI genuinamente novo. | Sem precedente direto de estilo/comportamento (teclado virtual, safe-area, contador de caracteres) pra copiar. | Baixo risco técnico (HTML nativo dentro de `BottomSheet` já existente) — mitigar com validação manual no device real (Estratégia de Testes), não só teste automatizado. |
| R-003 | Modelar como campo em `Highlight` (não tabela própria) simplifica a exclusão em cascata, mas acopla o ciclo de vida da nota ao do highlight permanentemente — se uma feature futura quiser anotação independente de highlight (fora de escopo aqui, mas citado como Fora de Escopo explícito na spec), exigiria migração. | Baixo — a spec já exclui esse caso explicitamente ("Fora de Escopo: Anotações soltas, sem highlight associado"), e reverter pra tabela própria no futuro é uma migração Dexie padrão (`version()` nova), não uma reescrita. | Aceito conscientemente — ver Assumptions da spec. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-10 | Foundational | Campo `note?: string` em `Highlight`, `updateHighlightNote` em `db/highlights.ts` (trim + remove se vazio), chaves i18n nos 3 locales. 3 testes novos (9/9 passando), `tsc --noEmit` limpo. | Nenhuma — pronto pras user stories. |
| 2026-09-10 | User Story 1 | Item "Anotar"/"Editar anotação" no menu do highlight (`EpubViewer.tsx`, `data-nr-highlight-annotate`), `HighlightNoteSheet.tsx` novo, wiring em `ReaderScreen.tsx`. 7 testes novos (152 passando no total dos 2 arquivos). Bug de lint corrigido inline (`setState` em `useEffect` → `key` no componente). | Nenhuma — US1 completa e testável isoladamente. |
| 2026-09-10 | User Story 2 | `highlight.note` exibido na aba Destaques de `BookDetailsScreen.tsx` (via slot `meta` do `ListItem`, truncado `line-clamp-2`, sem tocar no componente compartilhado). 3 testes novos (41/41). | Nenhuma — falta só a Fase Polish. |
| 2026-09-10 | Fase 5 / Polish | `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos (900 testes, 2 skipped pré-existentes). Validado via Playwright (highlight semeado direto no IndexedDB, ver Cuidados para Retomada) e no device real (SM-S911B) — fluxo completo de criar/editar/cancelar/esvaziar anotação + exibição em Destaques confirmado pelo usuário ("funcionou tudo"). `README.md` atualizado. Checklist de Release 100% marcado. | Nenhuma — feature concluída. Limite de 2000 caracteres e troca de idioma en/es não exercidos manualmente (cobertos por teste automatizado e pelo padrão de i18n já usado na tela, respectivamente). |

**PRÓXIMO**: Feature implementada por completo. Sugerido rodar `sdd-converge` numa sessão futura.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/reader/EpubViewer.tsx` — item "Anotar" no menu de highlight + prop `onAnnotateHighlight`
- `src/components/reader/HighlightNoteSheet.tsx` — sheet de escrita/edição
- `src/screens/ReaderScreen.tsx` — estado `highlightNoteTarget` + wiring
- `src/screens/BookDetailsScreen.tsx` — `highlight.note` exibido na aba Destaques
- `src/__tests__/components/EpubViewer.test.tsx` — 3 testes novos
- `src/__tests__/screens/ReaderScreen.test.tsx` — 4 testes novos
- `src/__tests__/screens/BookDetailsScreen.test.tsx` — 3 testes novos

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Validação via Playwright (2026-09-10): criar um highlight de verdade no
  navegador via seleção de texto sintética (`Range` + `Selection.addRange`)
  dispara corretamente o menu de seleção raiz (Copiar/Compartilhar/
  Destacar), mas clicar no botão "Destacar" pra abrir o submenu de cores
  (`[data-nr-selection-open-colors]`) **não** roteia — o clique cai no
  fallback `reason: "text-selection"` do listener principal, mesmo com
  `frame.locator().click()` (clique "real", trusted). Causa não
  investigada a fundo (provável: o app é desenhado pra gesto de toque
  real — `touchstart`/`touchend` coordenados —, não pra um clique de
  mouse avulso sem esse par). Não é um bug desta feature (comportamento
  pré-existente do menu de seleção, não tocado aqui) — só uma limitação
  de testar esse fluxo específico via Playwright. Pra validar a User
  Story 2 (exibição da nota em `BookDetailsScreen`), contornado semeando
  um registro de highlight direto no `IndexedDB` (`NeoReaderDB`,
  `highlights` store) em vez de criar via UI — funcionou bem e é o
  caminho recomendado pra próxima vez que precisar de um highlight de
  teste sem passar pela seleção real. A User Story 1 (menu "Anotar" +
  sheet) não foi visualmente validada no Chromium desta forma — fica
  pra validação no device real (`quickstart.md`), mas tem cobertura
  automatizada forte (152 testes) e reaproveita componentes já
  visualmente provados (`BottomSheet`/`Button`, mesmos de `BookmarkSheet`).

- Nunca nomeie o campo/variável/prop de domínio desta feature como
  `annotation` no código — `foliate-js` já usa esse nome pro overlay de
  pintura do highlight (`view.addAnnotation`/`deleteAnnotation`,
  `EpubViewer.tsx`). Use `note` (ex: `highlight.note`,
  `updateHighlightNote`, `onAnnotateHighlight` é aceitável como nome de
  *callback/ação de UI*, mas o dado em si é `note`).
- O menu de highlight (`renderHighlightMenuActionsHtml`) já tem um
  comentário explícito antecipando esta extensão ("Acrescentar uma ação
  futura ao nível raiz (traduzir, anotar, ouvir) continua sendo
  declarar mais um item aqui, sem tocar no gesto nem no
  posicionamento") — siga esse padrão declarativo
  (`data-nr-highlight-annotate="1"`), não invente um mecanismo novo de
  dispatch.
- Campo `note?: string` não precisa de nova `version()` do Dexie — seguir
  exatamente o precedente do campo `style?` já documentado em
  `types/highlight.ts` (opcional, não indexado, sempre ler com
  fallback).
