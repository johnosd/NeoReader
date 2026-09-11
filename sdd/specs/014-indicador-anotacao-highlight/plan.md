# Implementation Plan: Indicador visual de anotação em highlights com preview flutuante

**Slug**: `014-indicador-anotacao-highlight` | **Date**: 2026-09-10 | **Spec**: `sdd/specs/014-indicador-anotacao-highlight/spec.md`

## Summary

Reverter a FR-011 de `013-anotacoes-highlights`: highlights com `note`
preenchida ganham uma pequena aba amarela de forma distinta sobreposta ao
início do trecho, e tocar nela abre uma caixa flutuante só-leitura com o
texto da anotação (com rolagem e fallback de posição), sem passar pelo
menu completo de gerenciamento. Tecnicamente, a aba e a caixa são
elementos DOM absolutamente posicionados dentro do `doc.body` da seção do
EPUB — mesmo padrão já usado pelos menus de seleção/gerenciamento de
highlight (`#nr-selection-menu`/`#nr-highlight-menu`) — nunca uma 4ª forma
desenhada pelo `Overlayer` do `foliate-js` (que só suporta
highlight/underline/squiggly). A posição vem do `range` que o próprio
evento `draw-annotation` já entrega (campo existente, não usado até hoje).
Nenhuma mudança de schema — reaproveita `Highlight.note` da feature 013.

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (stack já travada pela constitution).

**Primary Dependencies**: Nenhuma nova. Só `foliate-js` (indiretamente,
via o `range` já exposto em `e.detail.range` do evento `draw-annotation` —
ver `research.md` D-002).

**Storage**: N/A — nenhuma mudança em `Highlight`/Dexie. Campo `note` já
existe (feature 013).

**Testing**: Vitest + Testing Library, mesmo arquivo/padrão já usado pro
menu de highlight: `src/__tests__/components/EpubViewer.test.tsx` (describe
`EpubViewer — highlights de trecho selecionado`), que já simula toques via
`dispatchEvent` de `MouseEvent` direto no `document` do iframe em JSDOM —
mecanismo comprovadamente funcional pra essa área do código (diferente da
limitação documentada em `013/plan.md` → Cuidados para Retomada, que é
específica de clique sintético num **Chromium real via Playwright**, não
de JSDOM/Vitest).

**Target Platform**: Android (Capacitor) + Web — mesmos alvos do projeto.

**Performance Goals**: N/A — elementos DOM pequenos, criados/atualizados
só quando uma seção repinta (já acontece hoje pro destaque em si).

**Constraints**:
- `EpubViewer.tsx`: toda a lógica nova vive dentro do iframe sandboxado
  do EPUB (mesma área de `paintHighlight`/`renderHighlightMenuActionsHtml`)
  — cuidado com sandbox/CSP (regra do CLAUDE.md).
- **Não mexer no vendor `foliate-js`**: a aba não pode depender de uma 4ª
  draw function do `Overlayer` — ver `research.md` D-001.
- Um highlight pode ter várias abas simultaneamente visíveis na tela (uma
  por highlight-com-nota carregado), ao contrário do menu (`#nr-highlight-menu`,
  singleton) — precisa de um container com múltiplos filhos, não um
  elemento único reaproveitado.
- A caixa de preview É singleton (só uma pode estar aberta por vez, mesmo
  padrão do menu) — precisa fechar a anterior antes de reposicionar numa
  aba diferente.

**Scale/Scope**: App local-first, single-user por dispositivo — sem
preocupação de escala.

## Decisões Invariantes

- A aba é um elemento DOM (`button` com `data-nr-highlight-note-tab="<cfi>"`),
  nunca uma forma desenhada pelo `Overlayer` do vendor — ver `research.md`
  D-001.
- A aba é criada/atualizada/removida dentro de `paintHighlight` (mesma
  função que já pinta o destaque em si), condicionada a
  `Boolean(highlight.note)` — nasce e morre junto do highlight/nota, sem
  efeito ou sincronização própria. O efeito `useEffect(() => {...},
  [highlights])` que já existe (`EpubViewer.tsx:3494-3503`, repinta seções
  carregadas quando a lista de highlights muda) já cobre "nota
  adicionada/editada/removida" de graça — `updateHighlightNote` grava no
  Dexie, `useLiveQuery` emite lista nova, o efeito repinta.
- Posição da aba: `range.getClientRects()[0]` do `range` entregue por
  `e.detail.range` no handler de `draw-annotation` — ver `research.md`
  D-002. Nunca recalcula o CFI por conta própria.
- Container `#nr-highlight-note-tabs` guarda múltiplas abas (uma por
  highlight-com-nota da seção), diferente do padrão singleton dos menus —
  cada filho é identificado por `data-nr-highlight-note-tab="<cfi>"`, e
  repaint remove abas cujo CFI não está mais na lista de highlights com
  nota (highlight excluído ou nota esvaziada).
- Caixa de preview (`#nr-highlight-note-preview`) é singleton, mesmo
  padrão de `#nr-highlight-menu`: criada sob demanda
  (`ensureNotePreviewEl(doc)`), populada e reposicionada a cada abertura
  (`setNotePreviewContent`), escondida (não removida) ao fechar.
- Posicionamento da caixa usa uma função nova, `positionNotePreview`, que
  decide acima/abaixo do trecho por espaço disponível (FR-007) — ver
  `research.md` D-003. Não reaproveita `positionSelectionMenu`/
  `positionMenuAtRect` como estão (só fazem clamp pro topo).
- Roteamento de toque: no `click` handler único de `doc` (mesmo handler de
  todos os outros gestos do leitor), a checagem da aba (`getNoteTabAtPoint`,
  mesmo padrão de 3 níveis de `getHighlightMenuButtonAtPoint` — `closest`,
  depois `elementFromPoint`, depois iteração com `isPointInsideElement`)
  entra **logo após o bloco de `highlightMenuBtn`** (antes do bloco de
  ações do parágrafo/tradução, e antes de `getHighlightAtPoint`) — a aba
  se sobrepõe visualmente ao início do highlight, então precisa de
  prioridade sobre o "toque sobre highlight abre o menu completo" (FR-008
  exige que o resto do trecho continue abrindo o menu normalmente; só a
  aba abre o preview).
- Tocar na aba, se o menu completo de outro highlight estiver aberto,
  fecha esse menu (`closeHighlightMenu` + zera `activeHighlight`/
  `activeHighlightMenuRect`) antes de abrir o preview — nunca os dois
  visíveis ao mesmo tempo.
- Fechar a caixa ao tocar fora (FR-006) usa o mesmo mecanismo que já fecha
  o menu de highlight quando `activeHighlight` está setado e o toque foi
  fora dele (`EpubViewer.tsx:3944-3950`) — variável de estado irmã
  (`activeNotePreviewCfi`) checada no mesmo bloco de "toque fora fecha e
  consome".
- Tamanho fixo da aba e da caixa, independente de fonte/zoom (FR-010,
  Assumption da spec) — nenhum cálculo de `em`/`rem` relativo ao
  `fontSize` do leitor.
- Nenhuma dependência nova.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compatível | Compatível | Veio de `sdd-specify` com entrevista + clarify completos (4+4 perguntas respondidas, zero `[NEEDS CLARIFICATION]` remanescente); este plano não introduz decisão de escopo nova além do que a spec já fechou. |
| II. Comentários só onde o "porquê" não é óbvio | Compatível | Compatível | Pontos não óbvios que vão levar comentário: por que a aba é DOM e não uma 4ª draw function do Overlayer (D-001), por que a posição vem de `e.detail.range` e não de `overlayer.hitTest()` (D-002), por que a caixa de preview precisa de lógica própria de flip (D-003). |
| III. Explícito antes de mágico | Compatível | Compatível | Reaproveita 3 padrões já provados no próprio arquivo (elemento DOM posicionado por rect, hit-testing de 3 níveis, singleton `ensureXxxEl`) em vez de inventar mecanismo novo; única peça genuinamente nova é a lógica de flip de `positionNotePreview`, pequena e isolada. |
| IV. Build limpo é a definição de "pronto" | Compatível | Compatível | `npm run build` faz parte do Checklist de Release em `tasks.md`. |
| V. Dependências novas exigem justificativa | Compatível | Compatível | Nenhuma dependência nova. |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/014-indicador-anotacao-highlight/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── research.md            # D-001/D-002/D-003 (decisões técnicas com alternativas)
├── quickstart.md          # Fase 1, passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

Sem `data-model.md` (nenhuma entidade/campo novo — reaproveita
`Highlight.note` da 013). Sem `contracts/` (nenhuma superfície de
API/rede nova).

### Source Code (repository root)

```text
src/
├── components/
│   └── reader/
│       └── EpubViewer.tsx              # MODIFICADO: aba (#nr-highlight-note-tabs)
│                                        # + caixa de preview (#nr-highlight-note-preview)
│                                        # + roteamento de toque + CSS + paintHighlight estendido
└── i18n/
    └── messages.ts                      # MODIFICADO: aria-label da aba (ex: reader.highlightMenu.noteIndicatorLabel)
                                          # nos 3 locales

src/__tests__/
└── components/
    └── EpubViewer.test.tsx             # MODIFICADO: testes de aba (aparece/some conforme note),
                                          # toque abre preview, toque fora fecha, fallback de posição,
                                          # toque no resto do highlight continua abrindo o menu completo
```

Nenhum outro arquivo muda — `types/highlight.ts`, `db/highlights.ts`,
`ReaderScreen.tsx`, `BookDetailsScreen.tsx` e `HighlightNoteSheet.tsx` já
existem da feature 013 e não precisam de alteração (esta feature só
consome `highlight.note`, não escreve nele).

**Structure Decision**: Projeto único (React + TypeScript + Vite), sem
separação backend/frontend — segue a estrutura já existente. Toda a
mudança de comportamento fica confinada a `EpubViewer.tsx` (mesmo arquivo
que já concentra o menu de seleção e o menu de gerenciamento de highlight)
— nenhum componente React novo, nenhuma prop nova saindo do `EpubViewer`
pro `ReaderScreen` (diferente da 013, que precisou de
`onAnnotateHighlight` pra abrir UI fora do iframe; aqui a caixa de preview
é só leitura e vive inteiramente dentro do iframe, sem sair pra React).

## Complexity Tracking

*(vazio — nenhuma violação do Constitution Check a justificar)*

## Estratégia de Testes

Prioridade: unitário (Vitest + Testing Library, simulando toques via
`dispatchEvent` no `document` do iframe em JSDOM — mecanismo já
comprovado pros testes existentes do menu de highlight) → manual em
device Android real como validação final (mandatado pela constitution pra
mudanças de UI/leitor, e especialmente relevante aqui por ser posição/forma
visual — cobertura automatizada não substitui ver a aba e a caixa
renderizadas de verdade, com reflow de fonte real).

Comandos-base:

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
npx vitest run src/__tests__/components/EpubViewer.test.tsx
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Foundational (CSS da aba/preview, chave i18n) | Concluída |
| User Story 1 (aba visível) | Concluída |
| User Story 2 (toque abre preview) | Concluída |
| Polish | Concluída |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A aba precisa reagir a reflow (troca de fonte/tamanho/orientação) sem ficar desalinhada (Edge Case da spec) — mas o projeto não tem hoje um evento explícito de "reflow terminou" dedicado a isso; o efeito de highlights (`[highlights]`) só reage a mudança na LISTA, não a mudança de fonte. | Se nada reagir a troca de fonte, a aba pode ficar visualmente desalinhada do início do trecho até o highlight ser repintado por outro motivo (ex: navegação de capítulo). | Ainda aberto — verificação adiada pro `quickstart.md` (passo 10, validação manual no device, Fase Polish). Não bloqueou a User Story 1 (o Critério de Conclusão dela não depende de reflow). |
| R-002 | `overlayer.add()` (chamado internamente por `view.addAnnotation`) pode não expor `e.detail.range` de forma confiável em todas as versões/seções (ex: seção ainda sem overlayer pronto, mesmo cenário do retry de `paintHighlight:2844-2847`) — comportamento não verificado empiricamente, só via tipo declarado em `foliate.d.ts`. | Se `e.detail.range` vier `undefined`/vazio em algum caso de borda, a aba desse highlight específico não teria onde se posicionar. | Resolvido: confirmado na T004 que `e.detail.range`/`e.detail.doc` vêm preenchidos em todos os cenários exercidos (mock de teste espelha exatamente o contrato do `foliate.d.ts`, e o próprio mock usa isso pra simular `overlayer.add`). A leitura acontece dentro do handler que já tem o retry de 300ms, herdando essa proteção de graça — mantido como guarda defensiva (`if (tabRect)`) mesmo sem caso de borda observado. |
| R-003 | JSDOM não implementa `Range.prototype.getClientRects` (achado durante T004/T006 — throw "not a function"), diferente de `getBoundingClientRect` que o jsdom simula com um retângulo zerado. | Sem correção, QUALQUER teste existente que dispare `paintHighlight` (não só os novos desta feature) quebraria com um erro não tratado. | Resolvido: default seguro adicionado em `src/__tests__/setup.ts` (`Range.prototype.getClientRects = () => []` se ainda não existir) — os 112 testes pré-existentes voltaram a passar sem erro, e os novos testes de posição sobrescrevem via `vi.spyOn(Range.prototype, 'getClientRects')` quando precisam de um rect específico. |
| R-004 | `.nr-highlight-note-tab` é appendada ao fim do `<body>` (depois do texto do EPUB no DOM) com `position: absolute` — por padrão, um elemento posicionado pinta ACIMA de conteúdo não-posicionado independente da ordem no DOM, então a aba cobria as primeiras letras do trecho destacado (achado do usuário revisando a feature já implementada, antes da validação em device). | Marca atrapalhando a leitura do início do trecho — o oposto do objetivo da FR-001 (sinalizar sem incomodar). | **1ª tentativa (T005b)**: `z-index: -1` — deixou a aba INVISÍVEL. Causa: o overlay SVG do próprio destaque (`Overlayer.highlight`, `node_modules/foliate-js/overlayer.js`) também é `position: absolute`/`z-index: auto`, e só fica "legível por baixo do texto" por ser translúcido (`opacity ~0.3`), não por estar atrás em z-index — um z-index negativo escondia a aba atrás DESSE overlay também. **2ª tentativa (T005c)**: reposiciona ACIMA da linha — resolvia visibilidade E cobertura, mas ficou uma tira pequena de tamanho fixo, distante da referência visual do usuário. **3ª tentativa (T005d, com 1ª imagem de referência)**: retângulo arredondado TRANSLÚCIDO (`rgba(250,204,21,0.55)`) de volta no início do trecho, largura ~1 palavra. Funcional, mas com um problema novo: DUAS camadas translúcidas empilhadas na mesma região (a aba + o overlay do highlight, cada uma com sua própria opacidade) misturavam visualmente as cores — alpha-blending de duas cores translúcidas sempre produz uma 3ª cor, independente do valor exato escolhido (achado do usuário, 2ª imagem de referência, comparando com um app onde a transição é limpa). **Resolvido de verdade (T005e)**: a cor do indicador deixou de ser uma camada DOM separada — agora é pintada como parte do MESMO desenho do overlay do highlight (`drawHighlightWithNoteIndicator`, novo, ao lado de `getOverlayerDrawFn`): os primeiros `noteWidthPx` do 1º rect saem via `OverlayerCtor.highlight` com `NOTE_INDICATOR_COLOR_HEX`, o resto sai no draw function normal do highlight — dois `<g>` SVG ADJACENTES (nunca sobrepostos), cada pixel recebendo no máximo UMA camada translúcida. `.nr-highlight-note-tab` voltou a ser só o alvo de toque (`background: transparent`) — a cor não vem mais dele. Toque não quebrou em NENHUMA das 4 rodadas: `getNoteTabAtPoint` já tinha um fallback por coordenada (`isPointInsideElement`) que não depende de qual elemento fica visualmente por cima nem de quem pinta a cor. **Trade-off aceito conscientemente**: a FR-003 original pedia "forma distinta, não só cor sólida" pra não se confundir com um highlight âmbar/amarelo — o design final (retângulo, sem forma de fita/ribbon) é mais fiel à referência visual do usuário, mas reintroduz um risco pequeno de baixo contraste especificamente quando o highlight subjacente também é da cor âmbar (não verificado visualmente ainda). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-10 | Foundational | CSS de `.nr-highlight-note-tab` (forma de fita via `clip-path`, cor amarela fixa) e `#nr-highlight-note-preview`/`.nr-note-preview-text` (caixa amarela com rolagem) em `buildReaderCSS`; chave `reader.highlightMenu.noteIndicatorLabel` nos 3 locales. `npx tsc --noEmit` limpo. | Nenhuma — pronto pra US1. |
| 2026-09-10 | User Story 1 | `ensureNoteTabsContainer`/`findNoteTab`/`upsertNoteTab`/`removeNoteTab` novos em `EpubViewer.tsx`; `paintHighlight` lê `e.detail.range`/`e.detail.doc` do evento `draw-annotation` (confirmando R-002) e cria/remove a aba conforme `highlight.note`; `repaintHighlightsForSection` remove abas órfãs (highlight excluído) via `removeOrphanNoteTabs`. 3 testes novos (T036-T038). Achado: JSDOM não implementa `Range.prototype.getClientRects` — polyfill em `setup.ts` (R-003, resolvido). `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos (904 passando, 2 skipped pré-existentes). | Nenhuma — US1 completa e testável isoladamente (aba aparece/some sem depender de toque). |
| 2026-09-10 | User Story 2 | `getNoteTabAtPoint` (hit-test de 3 níveis), `ensureNotePreviewEl`/`setNotePreviewContent`/`closeNotePreview`/`positionNotePreview` (fallback acima/abaixo, FR-007) novos em `EpubViewer.tsx`; novo estado `activeNotePreviewCfi`; 2 branches novos no click handler único (toca na aba abre/popula/posiciona a caixa e fecha o menu completo se estava aberto noutro highlight; toque fora da caixa fecha, irmão do bloco de `activeHighlight`). 4 testes novos (T039-T042, cobrindo abrir/fechar/fallback de posição/não-regressão de FR-008). `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos (908 passando, 2 skipped pré-existentes). | Nenhuma — US2 completa. Falta só a Fase Polish (validação em device real). |
| 2026-09-10 | US1 (ad-hoc T005b) | Achado do usuário revisando US1/US2 já concluídas: a aba cobria as primeiras letras do trecho. `z-index: -1` em `.nr-highlight-note-tab` (era `9997`) — texto pinta por cima, aba só espia nos vãos das letras (R-004). Toque não quebrou (fallback por coordenada já existente). `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 119/119. | Nenhuma — falta só a Fase Polish. |
| 2026-09-10 | US1 (ad-hoc T005c) | Validado em device real: T005b deixou a aba INVISÍVEL (escondida atrás do overlay SVG translúcido do próprio destaque, que também é `position:absolute`/`z-index:auto` — ver R-004). Correção real é de posição, não de camada: `upsertNoteTab` ancora a aba pelo rodapé, ACIMA do topo da linha (`NOTE_TAB_HEIGHT_PX`/`NOTE_TAB_GAP_PX`, constantes novas), `z-index` volta a `9997`. 1 teste ajustado (T036, novo valor esperado de `style.top`). `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 119/119. | Nenhuma — aguardando confirmação visual em device (instalação em andamento). |
| 2026-09-10 | US1 (ad-hoc T005d) | Usuário trouxe imagem de referência (post-it amarelo translúcido cobrindo a 1ª palavra, atrás do texto, destaque normal continuando depois) — redesenho completo: retângulo arredondado translúcido (`rgba(250,204,21,0.55)`, sem `clip-path`), de volta no início do trecho (`rect.top`/`left`), largura ~1 palavra (`computeNoteTabWidth`, novo) e altura da linha (`rect.height`, dinâmico). Legibilidade via opacidade, mesma técnica do highlight em si — não mais posição/z-index. `upsertNoteTab` ganhou parâmetro `width`; `stubRangeClientRects` (teste) passou a incluir `height`. `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 119/119. Trade-off registrado em R-004 (FR-003 "forma distinta" ficou mais fraca — sem confirmação visual em highlight âmbar ainda). | Nenhuma — aguardando confirmação visual em device (instalação em andamento). |
| 2026-09-10 | US1 (ad-hoc T005e) | Instalado em device, usuário reportou cores se misturando no início do trecho (com 2ª imagem de referência mostrando transição limpa entre amarelo e azul). Causa: T005d empilhava 2 camadas translúcidas (aba + overlay do highlight) na mesma região — alpha-blending sempre mistura. Correção: cor do indicador agora pintada DENTRO do mesmo desenho do overlay do highlight (`drawHighlightWithNoteIndicator`, novo) — 2 grupos SVG adjacentes (indicador via `OverlayerCtor.highlight` direto, resto via draw function normal), nunca sobrepostos. `.nr-highlight-note-tab` virou só alvo de toque (`background: transparent`). 1 teste novo (T043b, chama o draw function de verdade pra confirmar a divisão em 2 grupos). `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 120/120, `npm test` 909 passando. | Nenhuma — aguardando confirmação visual em device (instalação em andamento). |
| 2026-09-10 | US1 (ad-hoc T005f) | Usuário reforçou a referência visual ("o amarelo parece um post-it"). Adicionado um cantinho dobrado (triângulo `#eab308`, mais escuro) no topo-esquerdo do indicador, filho do MESMO grupo SVG do indicador (`appendPostItFold`) — puramente decorativo, herda a opacidade do grupo pai, não introduz camada translúcida nova (não reabre R-004). T043b estendido pra checar a presença do cantinho. `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 120/120. | Nenhuma — aguardando confirmação visual em device (instalação em andamento; `npm test` completo rodando em paralelo). |

| 2026-09-10 | US2 (ad-hoc T008b) | Instalado em device com T005e+T005f, usuário confirmou (implicitamente, ao mostrar a caixa aberta) que a aba está visível e tocável — mas reportou que a caixa de preview estava ILEGÍVEL (cartão amarelo pastel fixo, texto escuro quase invisível no tema escuro do leitor) e "fora do design-system do app". Correção: `#nr-highlight-note-preview` trocado pra usar a MESMA receita visual de `#nr-highlight-menu` (`palette.translationBorder`/`translationSurface`/`translationGlow`/`palette.text`), com só um acento fino (`border-left` amarelo) mantendo a ligação visual com o indicador. `npm run lint && npx tsc --noEmit && npm run build` limpos, `npx vitest run .../EpubViewer.test.tsx` 120/120. | Nenhuma — validado no device em seguida (usuário confirmou "deu certo"). |
| 2026-09-11 | Polish (T012-T014) | Gates finais confirmados limpos. Spot-check final no device revelou um bug REAL, mas fora do escopo desta feature (interação pré-existente entre tradução inline e overlay de highlights — highlight some ao traduzir no mesmo parágrafo). Tratado via `sdd-bugfix` em paralelo (`sdd/bugs/highlight-some-ao-tocar-no-mesmo/`, 4 rodadas de investigação até a causa raiz real: `anchor(doc)` do CFI resolvendo `null` silenciosamente contra DOM mutado por `surroundContents` da tradução — confirmado lendo `foliate-js/view.js` diretamente). Veredito final `verified` em 2026-09-11, confirmado pelo usuário no device ("agora sim"). `README.md` atualizado (T014). Itens do `quickstart.md` não exercidos manualmente por completo (âmbar/FR-003, tema claro, rotação de tela) ficam como risco residual baixo, dado o volume de uso real já exercido. | Nenhuma — feature implementada por completo. |

**PRÓXIMO**: Feature implementada por completo. Sugerido rodar `sdd-converge` numa sessão futura.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/components/reader/EpubViewer.tsx` — `getNoteTabAtPoint`, `ensureNotePreviewEl`/`setNotePreviewContent`/`closeNotePreview`/`positionNotePreview`, 2 branches novos no click handler
- `src/__tests__/components/EpubViewer.test.tsx` — testes T036-T044b
- `README.md` — bullet novo sobre o indicador visual (T014)
- `sdd/bugs/highlight-some-ao-tocar-no-mesmo/` — bug relacionado (achado no spot-check final), tratado à parte, `verified`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Este plano assume que `e.detail.range` do evento `draw-annotation` está
  disponível e correto (tipado em `foliate.d.ts:114`, nunca consumido até
  hoje no código real) — a primeira task do `sdd-execute` que tocar nisso
  deve confirmar empiricamente (log/teste) antes de construir o resto da
  aba em cima dessa premissa. Se o campo vier vazio/undefined na prática,
  reabrir `research.md` D-002 com a alternativa (`overlayer.hitTest()` só
  funciona reativamente a um toque, não proativamente — precisaria de
  outra fonte de rect, a investigar nesse momento).
- Ver R-001 acima: o comportamento de realinhamento em troca de fonte do
  destaque em si (não desta feature) deve ser checado ANTES de assumir
  que a aba tem o mesmo problema ou não.
