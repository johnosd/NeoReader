# Implementation Plan: Caixa unificada de cor, estilo e nota ao criar ou editar highlight

**Slug**: `016-caixa-unificada-highlight-nota` | **Date**: 2026-09-11 | **Spec**: `sdd/specs/016-caixa-unificada-highlight-nota/spec.md`

## Summary

Unifica cor, estilo e nota numa única caixa (`HighlightComposerSheet`, novo
componente React fora do iframe do EPUB, substituindo `HighlightNoteSheet`),
usada tanto pra CRIAR um highlight (ao tocar "Destacar" no menu de seleção,
em vez do submenu de cores atual que cria na hora) quanto pra EDITAR um já
existente (ao tocar nele, em vez dos dois fluxos separados de hoje — cor/
estilo que aplicam na hora, e "Anotar" com Salvar/Cancelar próprio).
Confirmar grava tudo junto (`addHighlight` na criação;
`updateHighlightAppearance`+`updateHighlightNote` na edição); cancelar não
tem efeito nenhum. `EpubViewer.tsx` deixa de desenhar um submenu de
cores/estilos dentro do iframe sandboxado — só dispara um callback com o
payload necessário. O toast pós-criação da `015` continua existindo, mas só
dispara se a nota ficou vazia na caixa (FR-006).

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (stack já travada pela constitution).

**Primary Dependencies**: Nenhuma nova. Reaproveita `BottomSheet`/`Button`
(`src/components/ui/`), a paleta compartilhada `ANNOTATION_COLORS`
(`src/utils/annotationColors.ts`, já usada por `BookmarkSheet.tsx` num
color-picker React real — mesmo padrão a reaproveitar aqui) e o mecanismo
de settings global já existente (`src/db/settings.ts`,
`updateReaderDefaults`).

**Storage**: `ReaderDefaults` (`src/types/settings.ts`) ganha
`lastHighlightColor`/`lastHighlightStyle` — ver `research.md` D-002.
Nenhuma mudança em `Highlight`/Dexie (campos `color`/`style`/`note` já
existem desde 010/013).

**Testing**: Vitest + Testing Library. Dois arquivos principais:
`src/__tests__/components/EpubViewer.test.tsx` (describe "highlights de
trecho selecionado") e `src/__tests__/screens/ReaderScreen.test.tsx`
(describe do fluxo de anotação/criação) — AMBOS vão precisar de reescrita
substancial dos testes que hoje assumem criação/edição imediata por toque
num swatch de cor dentro do iframe (comportamento removido por esta
feature, não só estendido — ver R-001).

**Target Platform**: Android (Capacitor) + Web — mesmos alvos do projeto.

**Performance Goals**: Pintura do highlight deixa de ser otimista/imediata
e passa a depender do ciclo reativo (`useLiveQuery` → prop `highlights` →
efeito de repaint) — ver `research.md` D-003 e R-002 abaixo. Sem meta
numérica formal, mas deve continuar parecendo instantâneo (validação manual
no `quickstart.md`).

**Constraints**:
- `EpubViewer.tsx`: o menu de seleção/gerenciamento sandboxado do EPUB
  (`#nr-selection-menu`/`#nr-highlight-menu`) perde as opções de cor/estilo
  (viram dead code a remover) — só mantém as ações que continuam imediatas
  (Copy/Share/Traduzir no menu de seleção; Remover no menu de
  gerenciamento). Cuidado com sandbox/CSP ao mexer ali (regra do CLAUDE.md).
- A caixa unificada em si vive FORA do iframe (`ReaderScreen.tsx`), como
  `BottomSheet` — ver `research.md` D-001.
- `HighlightNoteSheet.tsx` é RENOMEADO/expandido pra
  `HighlightComposerSheet.tsx` — responsabilidade cresce de "só nota" pra
  "cor + estilo + nota, criação E edição" (Constitution: um arquivo, uma
  responsabilidade, mas o nome tem que refletir o que o arquivo faz agora).
- Schema do banco é append-only (`db/database.ts`) — mas esta feature não
  precisa de nova `version()` (nenhum campo indexado novo).

**Scale/Scope**: App local-first, single-user por dispositivo — sem
preocupação de escala.

## Decisões Invariantes

- A caixa unificada é UM componente (`HighlightComposerSheet`), com um modo
  `mode: 'create' | 'edit'`:
  - `create`: recebe `draft: HighlightDraftPayload` (cfi/paraCfi/text/
    sectionIndex/percentage, SEM cor/estilo — vêm de `defaultColor`/
    `defaultStyle`, o último usado) e `defaultColor`/`defaultStyle`.
  - `edit`: recebe `highlight: Highlight` (já tem `color`/`style`/`note`
    atuais, usados como valor inicial dos controles).
  - `onSave: (result: { color: string; style: HighlightStyle; note: string }) => void`
    e `onClose: () => void`, em ambos os modos — quem decide o que fazer
    com o resultado é `ReaderScreen`, nunca o componente em si.
- `EpubViewer.tsx` ganha um `HighlightDraftPayload` novo (exportado, mesmo
  padrão de `HighlightCreationPayload` hoje, só sem `color`/`style`) e dois
  props novos: `onRequestCreateHighlight?: (draft: HighlightDraftPayload) => void`
  (disparado ao tocar "Destacar" no menu de seleção — fecha o menu, limpa a
  seleção nativa, NÃO cria nada ainda) e `onEditHighlight?: (highlight: Highlight) => void`
  (renomeado de `onAnnotateHighlight`, disparado pelo ÚNICO botão que
  substitui "Anotar"/"Editar anotação" + "Cor e estilo" no menu de
  gerenciamento). `onCreateHighlight` e `onChangeHighlightAppearance`
  SAEM da interface de props de `EpubViewer` — deixam de existir chamadas
  que criem ou apliquem aparência de dentro do iframe; `onDeleteHighlight`
  não muda (Remover continua imediato, fora da caixa — FR-008 da spec).
- `renderSelectionMenuActionsHtml`'s modo `'colors'` e
  `renderHighlightMenuActionsHtml`'s modo `'colors'` são REMOVIDOS (não
  refatorados) — junto dos branches do click handler único que hoje leem
  `data-nr-selection-open-colors`/`-color`/`-style`/`-back` e
  `data-nr-highlight-open-colors`/`-color`/`-style`/`-back`. O tipo
  `SelectionMenuMode` e as funções `setSelectionMenuMode`/
  `setHighlightMenuAppearance` só sobrevivem se ainda tiverem uso real
  (reposicionar o menu ao reabrir) — se não, também saem.
- Pintura do highlight é 100% reativa (`research.md` D-003) — nenhum
  `paintHighlight`/`void paintHighlight(...)` é chamado a partir do
  confirm da caixa. Confirmar só grava no Dexie; o `useEffect(() => {...},
  [highlights])` que já existe em `EpubViewer.tsx` cuida do resto.
- `handleSaveHighlightComposer` (novo, em `ReaderScreen.tsx`) é o ÚNICO
  lugar que decide o que gravar, ramificando por `mode`:
  - `create`: `addHighlight({...draft, color, style, note: note || undefined, bookId, createdAt})`
    → `updateReaderDefaults({ lastHighlightColor: color, lastHighlightStyle: style })`
    (fire-and-forget, não bloqueia o fechamento da caixa) → se `note` veio
    vazia, seta `highlightAnnotateToast` (mesmo estado da feature 015,
    FR-006); se veio preenchida, NÃO seta o toast.
  - `edit`: `updateHighlightAppearance(id, { color, style })` +
    `updateHighlightNote(id, note)` (podem rodar em paralelo, `Promise.all`
    — duas chamadas já existentes, sem necessidade de uma função nova no
    `db/highlights.ts`).
  - Em ambos os casos, fecha a caixa (`setHighlightComposer(null)`) ao
    final.
- Cancelar (`onClose`) NUNCA grava nada — nem em `create` (nada existia
  ainda) nem em `edit` (nada foi aplicado até aqui, diferente do
  comportamento imediato de hoje) — só fecha a caixa. Isso elimina a
  necessidade de "desfazer" mudança nenhuma (diferente de uma versão que
  aplicasse cor/estilo na hora e precisasse reverter no cancel).
- O toast da feature 015 (`highlightAnnotateToast`, `Toast` com `onAction`)
  não muda de mecanismo — só a CONDIÇÃO de quando é setado muda (FR-006).
  Tocar nele continua abrindo a MESMA caixa unificada, agora em modo
  `edit` (reaproveita 100% o caminho de edição — não existe mais uma
  versão "simples" separada do sheet).
- `lastHighlightColor`/`lastHighlightStyle` são carregados uma vez em
  `ReaderScreen.tsx` (não em `useReaderAppearance`, pra não inchar um hook
  já grande com aparência/TTS/Word Lens — `research.md` D-002) via
  `getSettings()` num `useEffect` de montagem, com fallback local
  `'indigo'`/`'background'` enquanto carrega.
- Nenhuma dependência nova.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compatível | Compatível | Veio de `sdd-specify` com entrevista + 2 rodadas de clarify (8 perguntas no total, zero `[NEEDS CLARIFICATION]` remanescente) — escopo grande reconhecido desde o início e tratado com o processo completo, não como ajuste ad-hoc. |
| II. Comentários só onde o "porquê" não é óbvio | Compatível | Compatível | Pontos não óbvios que vão levar comentário: por que a caixa vive fora do iframe (D-001), por que a pintura é só reativa e não otimista (D-003, com referência direta ao bug real já investigado nesta sessão), por que `lastHighlightColor/Style` fica fora de `useReaderAppearance`. |
| III. Explícito antes de mágico | Compatível | Compatível | Reaproveita 3 padrões já provados (`BottomSheet`/color-picker de `BookmarkSheet`, `ReaderDefaults`/`updateReaderDefaults`, efeito reativo `[highlights]` já existente) em vez de inventar mecanismo novo. Único ponto genuinamente novo é o componente `HighlightComposerSheet` em si — mas ele CONSOLIDA dois componentes/fluxos existentes, reduzindo superfície líquida (remove código morto do menu sandboxado). |
| IV. Build limpo é a definição de "pronto" | Compatível | Compatível | `npm run build` no Checklist de Release de `tasks.md`. |
| V. Dependências novas exigem justificativa | Compatível | Compatível | Nenhuma dependência nova. |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/016-caixa-unificada-highlight-nota/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── research.md            # D-001/D-002/D-003
├── quickstart.md          # Fase 1, passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `data-model.md` (nenhuma entidade nova — `Highlight` só ganha um NOVO
MOMENTO de escrita, não campos novos; `ReaderDefaults` ganha 2 campos
primitivos simples, não uma entidade). Sem `contracts/` (nenhuma superfície
de API/rede nova).

### Source Code (repository root)

```text
src/
├── components/
│   └── reader/
│       ├── EpubViewer.tsx                    # MODIFICADO: remove modo 'colors' dos dois
│       │                                      # menus sandboxados + click branches associados;
│       │                                      # novo HighlightDraftPayload; props
│       │                                      # onRequestCreateHighlight/onEditHighlight no
│       │                                      # lugar de onCreateHighlight/
│       │                                      # onChangeHighlightAppearance/onAnnotateHighlight
│       ├── HighlightNoteSheet.tsx             # REMOVIDO (substituído)
│       └── HighlightComposerSheet.tsx         # NOVO: cor + estilo + nota, modos create/edit
├── screens/
│   └── ReaderScreen.tsx                       # MODIFICADO: estado highlightComposer,
│                                               # handleSaveHighlightComposer, carga de
│                                               # lastHighlightColor/Style, toast condicional
├── types/
│   └── settings.ts                            # MODIFICADO: ReaderDefaults +
│                                               # lastHighlightColor/lastHighlightStyle
├── db/
│   └── settings.ts                            # Sem mudança de código — updateReaderDefaults
│                                               # já aceita qualquer patch de ReaderDefaults
└── i18n/
    └── messages.ts                            # MODIFICADO: chaves novas do
                                                # HighlightComposerSheet (3 locales)

src/__tests__/
├── components/
│   └── EpubViewer.test.tsx                    # MODIFICADO: remove testes do submenu de
│                                               # cores imediato (create e edit), adiciona
│                                               # testes de onRequestCreateHighlight/
│                                               # onEditHighlight
└── screens/
    └── ReaderScreen.test.tsx                  # MODIFICADO: remove testes de
                                                # handleCreateHighlight/
                                                # handleChangeHighlightAppearance/
                                                # onAnnotateHighlight antigos, adiciona
                                                # testes do HighlightComposerSheet (create +
                                                # edit + toast condicional)
```

**Structure Decision**: Projeto único (React + TypeScript + Vite), sem
separação backend/frontend — segue a estrutura já existente. Diferente da
014 (tudo dentro do iframe) e da 015 (tudo fora, sem tocar no iframe), esta
feature muda em AMBOS os lados: remove superfície do menu sandboxado E
adiciona/substitui um componente React fora dele.

## Complexity Tracking

*(vazio — nenhuma violação do Constitution Check a justificar)*

## Estratégia de Testes

Prioridade: unitário/componente (Vitest + Testing Library) → manual num
browser real (`npm run dev`, mesmo mecanismo Playwright já validado na
014/015 — token de aprendizado: clique sintetizado no menu de seleção
sandboxado só resolve certo com `clientX`/`clientY` reais, ver
`015/plan.md` → Cuidados para Retomada) → device Android como reforço,
dado que esta feature muda de verdade a árvore DOM dentro do iframe
(remoção do submenu de cores), então tem mais risco de regressão visual que
a 015 teve.

Como esta feature REMOVE comportamento coberto por testes existentes (não
só adiciona), a ordem de trabalho recomendada é: escrever/ajustar os testes
JUNTO de cada mudança de código (não depois) — um teste antigo que ainda
passa depois da remoção do submenu de cores é um sinal de teste
desatualizado, não de sucesso.

Comandos-base:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
npx vitest run src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx
```

**Atenção**: `npx tsc --noEmit` SEM `-p tsconfig.app.json` é um NO-OP silencioso
neste projeto — `tsconfig.json` da raiz tem `"files": []` e só `references`
(setup de project references, coerente com `npm run build` usar `tsc -b`).
Rodar sem `-p` sempre retorna exit 0 e zero output, mesmo com erros de tipo
reais no código (achado durante a US1 desta feature — ver R-004). Sempre usar
`-p tsconfig.app.json` explicitamente ao validar só tipos, sem build completo.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Foundational (settings + i18n) | Concluída |
| User Story 1 (criação unificada) | Concluída |
| User Story 2 (edição unificada) | Concluída |
| Polish | Concluída |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Esta feature REMOVE comportamento hoje coberto por testes (criação imediata ao tocar cor, aplicação imediata de cor/estilo na edição) — diferente de 014/015, que só adicionaram. Múltiplos testes existentes em `EpubViewer.test.tsx`/`ReaderScreen.test.tsx` vão FALHAR intencionalmente até serem reescritos. | Se a reescrita de testes for feita "depois, em lote", há uma janela real de regressão não detectada (build passa, mas comportamento errado). | Resolvido: US1 (5 testes de `EpubViewer.test.tsx` + 8 de `ReaderScreen.test.tsx`) e US2 (7 + 4) reescritos junto de cada mudança de código, nunca em lote — `npm test` verde ao fechar as duas fases. |
| R-002 | Pintura deixa de ser otimista (D-003) — depende do ciclo `useLiveQuery` → re-render → efeito `[highlights]`. Não medido empiricamente ainda se isso introduz atraso perceptível no toque de "Salvar" da caixa. | Se perceptível, a UX de "criar/editar highlight" pareceria mais lenta que hoje, mesmo que funcionalmente correta. | Resolvido: validado num browser real (Playwright, T024) — confirmar o highlight criado (cor rose) já aparecia pintado no overlay SVG poucos instantes depois do "Salvar" (round-trip Dexie→useLiveQuery→repaint), sem atraso perceptível na inspeção. A alternativa de `research.md` D-003 (paint imperativo) segue disponível, mas não se mostrou necessária. |
| R-003 | `HighlightNoteSheet.tsx` é removido/renomeado — qualquer referência externa a esse nome de arquivo/componente (ex: um teste ou import esquecido) quebra silenciosamente só no `tsc`/build, não em runtime. | Baixo, mas real — arquivo puramente novo em cima do antigo evita "meio migrado". | Resolvido: `grep -r HighlightNoteSheet src/` (rodado ao fechar a US2) só encontra 1 comentário histórico em `HighlightComposerSheet.tsx`, nenhum import/uso real. |
| R-004 | `npx tsc --noEmit` (sem `-p`) é um NO-OP silencioso neste projeto (`tsconfig.json` raiz tem `"files": []`, só `references` — setup de project references). Achado durante T011/T012 desta feature: renomear/remover refs em `EpubViewer.tsx` deixou 3 `Cannot find name` reais no código, mas `npx tsc --noEmit` reportou "limpo" (exit 0, zero linhas) — só `npx tsc --noEmit -p tsconfig.app.json` (ou `npm run build`, que usa `tsc -b` corretamente) pegou os erros de verdade. | Checagens de tipo "rápidas" entre edições podiam estar dando falso positivo de "limpo" ao longo de TODA a sessão (features 014/015 inclusive) — embora o `npm run build` de cada Polish (que usa `tsc -b`, funciona certo) já tenha sido o gate real que teria pego qualquer erro remanescente antes de reportar concluído. | Resolvido: comando corrigido em `## Estratégia de Testes` acima (`-p tsconfig.app.json` explícito) — usado daqui pra frente nesta feature. Nenhuma ação retroativa necessária em 014/015 (o `npm run build` de cada uma já validou de verdade). |
| R-005 | Validação manual via Playwright (T024): o gesto "tocar num highlight EXISTENTE pra abrir o menu de gerenciamento" não foi possível reproduzir via clique sintético — `overlayer.hitTest({x,y})` (do `foliate-js`, código NÃO tocado por esta feature) retornou `[]` mesmo com coordenadas corretas (confirmado testando o `range.getBoundingClientRect()` de um highlight já pintado, com e sem scroll). A criação (US1) foi validada ponta a ponta com sucesso; o hit-test de highlight existente ficou sem cobertura de browser real. | Risco residual BAIXO: o mecanismo de hit-test é 100% preexistente (feature 010, semanas em produção) — esta feature só mudou o que acontece DEPOIS do menu abrir (`onEditHighlight`/`onDeleteHighlight`), e isso está coberto por 4 testes automatizados (T014/T015/T032/T035) que já mockam `overlayer.hitTest` diretamente (mesmo padrão usado desde a feature 010). | Resolvido: não reproduzido via Playwright (mesma limitação já documentada no bugfix `highlight-some-ao-tocar-no-mesmo` desta sessão — coordenadas dentro do iframe/shadow-DOM do foliate-js são difíceis de traduzir para clique sintético), mas confirmado no device Android real (build instalado, usuário testou em 2026-09-11: "funcionou, menu abriu certo" — Remover + Editar abrem corretamente ao tocar num highlight existente). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-11 | Foundational | `ReaderDefaults` (`types/settings.ts`) ganhou `lastHighlightColor`/`lastHighlightStyle` (default indigo/background), mapeados em `normalizeUserSettings`; chave `highlightComposer.title` nos 3 locales. Achado: 4 testes de `settings.test.ts` comparavam `readerDefaults` com igualdade exata — corrigidos inline (bloqueavam a própria task). `npx tsc --noEmit` limpo, `npx vitest run src/__tests__/db/settings.test.ts` 7/7. | Nenhuma — pronto pra US1. |
| 2026-09-11 | User Story 1 | `HighlightComposerSheet.tsx` novo (substitui `HighlightNoteSheet.tsx`) — cor/estilo/nota numa caixa só, sem prop `mode` (infere create/edit pela presença de `highlight`). `EpubViewer.tsx`: `HighlightDraftPayload` novo, prop `onRequestCreateHighlight`; "Destacar" no menu de seleção agora só monta o draft e dispara o callback (não cria mais nada); removido o modo `'colors'` do menu de SELEÇÃO (criação) e código morto associado (`pendingHighlightStyle`, branches de cor/estilo/voltar). `ReaderScreen.tsx`: estado `highlightComposer`, `lastHighlightColor`/`lastHighlightStyle` (carregados via `getSettings()` no mount, gravados via `updateReaderDefaults` ao confirmar), `handleSaveHighlightComposer` (branch `create`), toast da 015 agora só dispara se a nota ficou vazia (FR-006). Fluxo de EDIÇÃO (menu de gerenciamento) mantido no formato ANTIGO por enquanto — decisão deliberada pra manter a US1 independentemente testável sem quebrar a edição (documentado no Critério/Checkpoint da fase); migra na US2. Reescritos 5 testes de `EpubViewer.test.tsx` e 8 de `ReaderScreen.test.tsx` (6 do fluxo antigo + 3 novos). Achado de processo real: `npx tsc --noEmit` sozinho é no-op neste projeto (R-004, resolvido — comando corrigido, memory criada). `npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run build` limpos (924 passando, 2 skipped pré-existentes). | Nenhuma — US1 completa e testável isoladamente. |

| 2026-09-11 | User Story 2 | Menu de gerenciamento colapsado: `renderHighlightMenuActionsHtml` sem modo/`hasNote` (Remover + 1 botão "Editar" com preview de cor/estilo); prop `onAnnotateHighlight`→`onEditHighlight`, `onChangeHighlightAppearance` removida. Limpeza além do previsto em T022: `SelectionMenuMode`/`setSelectionMenuMode`/`renderStyleButtonsHtml` removidos por completo (zero uso restante), CSS `.nr-sel-color`/`.nr-sel-style-btn[aria-pressed]` removido. `ReaderScreen.tsx`: `handleSaveHighlightComposer`'s branch `edit` (escrito na US1) passou a ser o único caminho de edição. 7 testes de `EpubViewer.test.tsx` reescritos (T030/T032/T035) ou removidos (T030b/T032b/T032c/T033/T034 — cenários de submenu imediato, obsoletos por design); 4 de `ReaderScreen.test.tsx` reescritos/novos. `grep -r HighlightNoteSheet src/` confirma zero import remanescente (R-003 satisfeito). `npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test && npm run build` limpos (919 passando, 2 skipped pré-existentes). | Nenhuma — feature completa (criação + edição unificadas). |
| 2026-09-11 | Polish | Gates finais já confirmados na US2. Validação manual num browser real via Playwright (mesmo livro "The Gift" já usado nas features 014/015): fluxo de CRIAÇÃO validado ponta a ponta — tocar "Destacar" abre a caixa (sem submenu no iframe), cor/estilo default corretos (indigo/background na 1ª vez), trocar cor/estilo/nota e confirmar grava exatamente o escolhido no Dexie (`color: 'rose', style: 'squiggly', note: '...'`), `lastHighlightColor/Style` persistidos em `readerDefaults` de verdade, toast NÃO aparece quando a nota já foi escrita na caixa (FR-006 confirmado), highlight pintado no overlay real (SVG com fill `#f43f5e`) sem atraso perceptível (R-002 resolvido). Zero erros de console. Tentativa de validar o fluxo de EDIÇÃO (tocar num highlight já existente) via clique sintético não teve sucesso — `overlayer.hitTest` (código do foliate-js, não tocado por esta feature) não retornou o highlight nem com coordenadas corretas; registrado como R-005 (risco residual baixo, mecanismo preexistente já coberto por 4 testes automatizados). `README.md` atualizado (T026, bullets de Highlights refletindo a caixa unificada e o toast condicional). Commitado junto com a feature 015 (`831f53c`, confirmado pelo usuário). | Nenhuma — feature implementada por completo. |
| 2026-09-11 | Polish (pós-commit) | R-005 fechado: build instalado no device Android real (`npm run build` → `npx cap sync android` → `gradlew installDebug`), usuário testou o gesto de tocar num highlight existente e confirmou ("funcionou, menu abriu certo") — Remover + Editar abrem corretamente, Editar leva pra caixa unificada. | Nenhuma — todos os riscos da feature resolvidos. |

**PRÓXIMO**: Feature implementada por completo, todos os riscos fechados. Sugerido rodar `sdd-converge` numa sessão futura.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/reader/HighlightComposerSheet.tsx` — novo (substitui `HighlightNoteSheet.tsx`, removido), usado em create E edit
- `src/components/reader/EpubViewer.tsx` — menus de seleção e gerenciamento simplificados, sem nenhum submenu de cores/estilo restante
- `src/screens/ReaderScreen.tsx` — `highlightComposer`, `handleSaveHighlightComposer` (único caminho de escrita, create+edit)
- `src/__tests__/components/EpubViewer.test.tsx` — reescrito nas duas fases (criação + gerenciamento)
- `src/__tests__/components/reader/HighlightComposerSheet.test.tsx` — novo (4 testes)
- `src/__tests__/screens/ReaderScreen.test.tsx` — reescrito nas duas fases
- `README.md` — seção Highlights atualizada (caixa unificada, toast condicional)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `pendingHighlightRange` (variável de módulo em `EpubViewer.tsx`) ainda é
  necessária mesmo depois da remoção do submenu de cores — é ela que guarda
  QUAL seleção vai virar o `HighlightDraftPayload` quando "Destacar" for
  tocado. Não remover junto com `pendingHighlightStyle` (esse sim pode sair,
  já que o estilo deixa de ser "armado" por toques dentro do iframe).
- Ao remover os branches do click handler único (`data-nr-selection-color`
  etc.), tomar cuidado pra não remover também o bloco de
  `data-nr-selection-run` (copy/share/translate) nem o de
  `data-nr-highlight-remove` — todos vivem no MESMO `doc.addEventListener('click', ...)`,
  só em branches `if`/`else if` sequenciais (ver `EpubViewer.tsx` a partir
  da linha ~4090 no estado desta sessão).
- `src/__tests__/screens/ReaderScreen.test.tsx` já tem um mock completo de
  `@/db/highlights` (`addHighlight`, `updateHighlightAppearance`,
  `updateHighlightNote`) e captura `mocks.epubViewerProps` pra disparar
  callbacks do `EpubViewer` mockado diretamente — o mesmo mecanismo serve
  pra `onRequestCreateHighlight`/`onEditHighlight` novos, só trocando o nome
  do prop chamado.
- Playwright/browser real: o overlay de highlights do `foliate-js` (SVG com
  as cores pintadas) NÃO vive dentro do `iframe.contentDocument` da seção —
  vive em `foliate-view` (shadow root) → `foliate-paginator` (shadow root),
  como um `<svg>` irmão do iframe. `overlayer.hitTest({x,y})` não respondeu a
  coordenadas calculadas via `range.getBoundingClientRect()` de dentro do
  iframe, mesmo pra um highlight bem no topo da página (sem precisar de
  scroll) — ver R-005. Diferente do menu de SELEÇÃO/CRIAÇÃO (`#nr-selection-menu`,
  cujos botões SÃO resolvidos por coordenada via `getElementFromPoint(doc,
  x, y)`, mecanismo comprovado em 015), o hit-test de highlight usa outro
  caminho (`overlayer.hitTest`) que uma sessão futura precisaria investigar
  mais a fundo (ou só confirmar no device) antes de tentar de novo via
  Playwright.
