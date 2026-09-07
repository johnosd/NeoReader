# Implementation Plan: Highlights de trecho selecionado no leitor

**Slug**: `010-highlights-selecao-texto` | **Date**: 2026-09-06 | **Spec**: `sdd/specs/010-highlights-selecao-texto/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Permitir que o usuário selecione um trecho por toque longo + arrasto, escolha uma
cor num menu próprio e tenha esse trecho marcado de forma persistente, com a
lista dos highlights na tela de detalhes do livro — **sem alterar em nada o
comportamento do toque curto**, que continua abrindo a tradução inline.

A abordagem técnica se apoia em três achados da exploração, todos verificados no
código:

1. **Pintura**: o `foliate-js` já anexa um `Overlayer` por seção sozinho
   (`view.js:266`) e expõe `addAnnotation`/`draw-annotation`/`show-annotation`.
   O SVG do overlayer é `pointer-events: none` (`overlayer.js:17-21`), então
   pintar highlight **não intercepta toque algum** e não mexe no DOM do EPUB.
2. **Convivência com o toque atual**: o gesto novo entra como **mais um ramo de
   guarda** no listener de `click` que já existe (`EpubViewer.tsx:2966`), no
   mesmo formato dos ~10 ramos atuais. Nenhum timer de long-press disputa com o
   `didScroll`/`TAP_SLOP_PX` — quem decide que virou seleção é o WebView.
3. **Menu**: injetado no doc do iframe seguindo o padrão já provado do
   `#nr-translation-block`, evitando o problema de compositing de overlay sobre
   iframe que o próprio `ReaderScreen.tsx` documenta.

Decisões e alternativas rejeitadas estão em `research.md`; a entidade e o schema
em `data-model.md`; a verificação em device em `quickstart.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, build com Vite 8 (`tsc -b` + build
de produção).

**Primary Dependencies**: `foliate-js` (vendor, já instalado — usado aqui via
`view.getCFI`, `view.addAnnotation`, `view.deleteAnnotation`, eventos
`draw-annotation` / `show-annotation` / `create-overlay`, e `Overlayer.highlight`
de `foliate-js/overlayer.js`), Dexie.js (IndexedDB), Zustand, Tailwind CSS v4,
Lucide React, Capacitor 8 (Android). **Nenhuma dependência nova.**

**Storage**: Dexie/IndexedDB, banco `NeoReaderDB`. Tabela nova `highlights` em
`this.version(19)` (a atual é a 18, `src/db/database.ts:376`). Local-first, sem
sincronização na nuvem nesta feature.

**Testing**: Vitest + Testing Library. O harness de teste do leitor já existe e
cobre o que esta feature precisa: `src/__tests__/components/EpubViewer.test.tsx`
(2368 linhas) traz `makeFakeDoc`, `click`/`clickAt`, `touchAt`, `setCaretRange` e
`expectTapIgnored(reason)`; o `FoliateViewMock` fica em `src/__tests__/setup.ts`.

**Target Platform**: Android (Capacitor, alvo de qualidade) e Web (funcionamento
básico com seleção por mouse). Sem build iOS.

**Performance Goals**: N/A explícito. O único ponto sensível é repintar os
highlights de uma seção ao carregá-la — volume por seção é pequeno e o `redraw`
no reflow é do próprio `paginator.js`.

**Constraints**:

- O toque curto no parágrafo **não pode regredir** (restrição repetida duas vezes
  pelo usuário; FR-007, SC-002).
- Schema Dexie é append-only — nunca editar uma `version()` existente.
- O iframe do EPUB roda com `allow-scripts` removido (`vite.config.ts:54`); toda
  interatividade injetada é tratada por listeners do documento pai, como o bloco
  de tradução já faz.
- Nada de dependência nova sem aprovação (Princípio V).

**Scale/Scope**: single-user por dispositivo. Dezenas a poucas centenas de
highlights por livro no pior caso realista.

## Decisões Invariantes

Travadas agora; revisitar qualquer uma exige reabrir o design.

1. **A seleção é a nativa do WebView.** Não implementar seleção própria, alças
   próprias, nem `user-select: none`. O app observa o resultado.
2. **A guarda contra conflito é por estado capturado no início do gesto, nunca
   por timer.** O estado "havia seleção quando este gesto começou" é gravado em
   `touchstart`/`pointerdown` e consumido pelo `click`. Ler `getSelection()`
   dentro do `click` **não** serve: no Android a seleção já foi colapsada quando
   o `click` de dispensa chega.
3. **A guarda entra como mais um ramo do listener de `click` existente**, com
   `logReaderTapIgnored('text-selection')`, na ordem: (a) resíduo de scroll,
   (b) botões do menu de seleção e do bloco de tradução, (c) **guarda de
   seleção**, (d) todo o resto como está hoje. Os botões vêm antes da guarda
   porque o menu é injetado no mesmo doc — se a guarda viesse antes, o menu
   engoliria os próprios cliques.
4. **A pintura é sempre via overlayer do `foliate-js`.** Nunca envolver texto do
   EPUB em elementos para marcar — isso violaria FR-012 e desestabilizaria CFIs.
5. **O menu de seleção é injetado no doc do iframe e anexado ao fim do
   `<body>`** — nunca com `para.after(...)`, que desloca índices de CFI do
   conteúdo seguinte.
6. **O menu é uma lista declarativa de ações** (FR-003a): um array de descritores
   renderizado em laço, com um item nesta rodada. Não é framework de plugins,
   não é registry — é a forma mais simples que já atende o requisito.
7. **Highlights são locais.** Nenhum `syncKey`/`syncedAt`/`syncError`, nenhum
   agendamento de sync no Drive, nenhum soft delete (FR-018, FR-021).
8. **Remoção de livro apaga seus highlights** dentro da mesma transação de
   `deleteBook` (FR-018a).
9. **A lista vive na tela de detalhes do livro**, como uma aba nova do sistema de
   abas já existente. Não existe visão agregada entre livros (FR-028a).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS | PASS | Este plano + `tasks.md` são o artefato exigido; a execução só começa após OK do usuário. Escopo ambíguo foi resolvido por perguntas no `sdd-specify` (9 clarificações registradas), não por suposição. |
| II. Comentários só onde o "porquê" não é óbvio | PASS | PASS | Três pontos exigem comentário curto e estão marcados nas tasks: por que a guarda captura estado no `touchstart` e não no `click` (Invariante 2), por que o menu é anexado ao fim do `body` (Invariante 5), e por que a pintura não usa o mecanismo do vocabulário (Invariante 4). |
| III. Explícito antes de mágico | PASS | PASS | Sem camada de abstração de anotações, sem "engine" genérica. **Tensão examinada**: FR-003a pede um menu extensível, o que se aproxima de "desenhar para requisito hipotético". Resolvida sem violar o princípio — um array de descritores com **um** item é literalmente a forma mais simples de renderizar um menu; não há maquinaria a mais. Registrado em Complexity Tracking por transparência. |
| IV. Build limpo é a definição de "pronto" | PASS | PASS | `npm run lint && npm test && npm run build` em cada checkpoint de fase e no Checklist de Release. |
| V. Dependências novas exigem justificativa | PASS | PASS | Zero dependências novas. Tudo sai de `foliate-js` e Dexie, já instalados. |

**Restrições do Projeto** (também verificadas): schema append-only respeitado
(nova `version(19)`, v18 intocada); local-first mantido (sem backend, sem sync);
cuidado com o iframe respeitado (menu injetado segue o padrão existente, sem
depender de scripts dentro do sandbox); modelo de monetização não é tocado.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/010-highlights-selecao-texto/
├── spec.md              # Saída do sdd-specify
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões técnicas e alternativas rejeitadas
├── data-model.md        # Fase 1 — entidade Highlight + schema v19
├── quickstart.md        # Fase 1 — verificação manual em device
└── tasks.md             # Saída do sdd-plan
```

Sem `contracts/` — a feature não expõe nem altera superfície de API.

### Source Code (repository root)

Projeto único React + TypeScript com um projeto Android nativo acoplado via
Capacitor. Apenas os caminhos tocados por esta feature:

```text
src/
├── components/reader/
│   ├── EpubViewer.tsx           # gesto, guarda de toque, menu injetado, pintura
│   └── BookmarkSheet.tsx        # doa a paleta de cores para o módulo compartilhado
├── screens/
│   ├── ReaderScreen.tsx         # fiação de props/callbacks do viewer
│   └── BookDetailsScreen.tsx    # aba nova de highlights + contador
├── db/
│   ├── database.ts              # version(19) + tabela highlights
│   ├── highlights.ts            # NOVO — repositório
│   └── books.ts                 # cascade de remoção
├── types/
│   └── highlight.ts             # NOVO — entidade
├── utils/
│   └── annotationColors.ts      # NOVO — paleta compartilhada
├── i18n/
│   └── messages.ts              # chaves pt-BR / en / es
└── __tests__/
    ├── setup.ts                 # FoliateViewMock ganha addAnnotation/overlayer
    ├── components/EpubViewer.test.tsx
    ├── screens/BookDetailsScreen.test.tsx
    ├── db/highlights.test.ts    # NOVO
    └── db/books.deleteBook.test.ts

android/app/src/main/java/com/johnny/neoreader/
└── MainActivity.java            # supressão do ActionMode (US2)
```

**Structure Decision**: projeto único (`src/`) com nativo Android em `android/`.
A feature toca cinco áreas já existentes (`components/reader`, `screens`, `db`,
`i18n`, `__tests__`), cria três arquivos novos em pastas que já existem
(`types/highlight.ts`, `db/highlights.ts`, `utils/annotationColors.ts`) e faz uma
alteração no nativo. Nenhuma pasta nova, nenhum padrão estrutural novo.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Menu de seleção como lista declarativa de ações (FR-003a) roça o Princípio III ("não desenhar para requisito hipotético futuro") | O usuário pediu explicitamente, duas vezes, um menu que "poderá ter outras opções", com o Kindle como referência. É requisito declarado, não antecipação do implementador | Hardcodar um seletor de cores seria mais simples hoje, mas foi rejeitado na revisão da spec justamente por exigir redesenho do menu, do posicionamento e possivelmente do gesto quando entrasse a segunda ação |
| Gravar `paraCfi` e `text` sem consumidor nesta rodada | São a âncora de fallback de R-001 (estabilidade do CFI de intervalo diante das injeções de DOM do próprio app). Gravá-los agora custa dois campos; descobrir depois que faltam custa migração de schema com dado já em produção | Gravar só o `cfi` de intervalo foi rejeitado porque R-001 é um risco identificado com mecanismo conhecido, não hipotético — mas note que o **fallback em si não é implementado** agora, exatamente para respeitar o Princípio III |

## Estratégia de Testes

Prioridade: unitário → integração (componente com Testing Library) → manual em
device (último recurso, mas **obrigatório** aqui pela constitution e pela
natureza de gesto da feature).

Onde cada camada pega o quê:

- **Unitário** (`src/__tests__/db/highlights.test.ts`,
  `db/books.deleteBook.test.ts`): CRUD, ordenação por `percentage`, cascade de
  remoção. Barato e determinístico.
- **Integração de componente** (`EpubViewer.test.tsx`,
  `BookDetailsScreen.test.tsx`): a **guarda de toque** é testável aqui sem
  device, usando `touchAt` + `click` + `expectTapIgnored('text-selection')` do
  harness existente. É a rede de segurança principal contra a regressão que o
  usuário proibiu — cada ramo de guarda existente continua com seu teste.
- **Manual em device** (`quickstart.md`): o que jsdom não consegue simular —
  seleção nativa, alças, barra do sistema Android, reflow e rotação.

O `FoliateViewMock` precisa ganhar `addAnnotation`, `deleteAnnotation` e um
`getContents()` que devolva `overlayer`, hoje fixo em `undefined`
(`src/__tests__/setup.ts:151-155`) — sem isso os testes da pintura não têm o que
observar.

Comandos-base:

```powershell
npm run lint
npm test
npm run build
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (T001-T005) | Feito: tipo `Highlight`, schema Dexie v19, repositório `db/highlights.ts`, paleta compartilhada `annotationColors.ts`, chaves i18n (3 locales) |
| Foundational (T006-T009) | Feito: `FoliateViewMock` com `addAnnotation`/`deleteAnnotation`/overlayer observável; cascade de remoção em `deleteBook`; testes de CRUD, sobreposição (FR-016) e cascade (FR-018a) — todos verdes |
| User Story 1 (gesto/menu/pintura) | **Código e testes completos (T010-T023b); validado ponta a ponta em Chromium real (Passo 6); falta T024 (device)**. Gesto de seleção nativo + menu `#nr-selection-menu` + guarda `text-selection` no click (agora com leitura viva da seleção, R-010) + swatch resolvido por coordenada (R-011) + pintura via `Overlayer.highlight` com cor CSS (R-012) + wiring em `ReaderScreen.tsx`. `npm run lint && npm test && npm run build` limpos (824 passed / 2 skipped) |
| User Story 2 (supressão Android) | Código completo (T025-T028): `onWindowStartingActionMode` recusando ActionMode FLOATING, `setSelectionMenuSuppressed` no plugin e no `NativeSystemUiService`, ligado/desligado no mesmo efeito do modo imersivo. **Falta T029 (device)** — o ActionMode só dá pra verificar no Android |
| User Story 3 (gerenciar highlight) | Código e testes completos (T030-T035) e fluxo verificado em Chromium real: tocar no highlight abre o menu (sem traduzir), trocar cor repinta e persiste, remover apaga pintura e registro, tocar fora do trecho continua traduzindo. **Falta T036 (device)** |
| User Story 4 (aba na tela de detalhes) | **Concluída** — código, testes (T040-T043) e device (T044). Achado real em device (R-015): abrir pela lista não pintava o highlight — resolvido com retentativa em `paintHighlight`. Confirmado por CDP e screenshot |
| Copiar/Compartilhar no menu (FR-003c/FR-003d, ad-hoc) | Código, testes e Chromium completos. Compartilhar não funcionava no Android (R-016, WebView sem Web Share confiável) — resolvido com `shareText` nativo (Intent.ACTION_SEND). Cores viraram submenu por trás de um botão "Destacar" (D-004, pedido do usuário testando em device). |
| 3 estilos de marcação (FR-003e/FR-003f/FR-011a, ad-hoc) | **Concluída** (T065-T067b). `Highlight.style` opcional (D-005, sem migração de schema); submenu de criação ganhou fileira de estilo antes das cores (estado pendente, só a cor confirma); menu de gerenciar highlight ganhou os mesmos 3 estilos, aplicando na hora sem fechar (FR-022). `lint`/`tsc -b`/`build`/suíte completa (851 passed / 2 skipped) limpos. Verificado em Chromium real e confirmado pelo usuário no device (`RXCX103NMVZ`) |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | CFI de intervalo pode não resolver entre sessões: o app injeta `<span class="nr-vocab">` no texto (`EpubViewer.tsx:706-722`) e insere o bloco de tradução com `para.after` — as duas coisas alteram a estrutura que o CFI endereça. O CFI de marcador escapa por ser colapsado no início do parágrafo; o de intervalo não tem essa folga | Alto para FR-013/SC-004: highlight poderia "sumir" ao reabrir o livro | Validar empiricamente na US1 (quickstart 1.5 e 5.5, em parágrafo que contenha palavra do vocabulário). `text` e `paraCfi` já são gravados para permitir fallback por texto **sem migração**. Só implementar o fallback se a validação mostrar desvio — Princípio III |
| R-002 | A premissa central (toque longo do WebView seleciona texto no iframe do foliate) nunca foi verificada em device | Crítico: se cair, a User Story 1 muda de forma | **Resolvido em 2026-09-06 (T010, device RXCX103NMVZ, build atual sem mudanças desta feature)**: toque longo seleciona nativamente (alças aparecem, arrasto estende a seleção) e a barra do sistema Android aparece — os três confirmados. Premissa da Abordagem 1 validada; segue como planejado, sem pivotar pra Abordagem 3. **Achado extra confirmado, não hipotético**: o toque de dispensa da seleção (tocar fora pra fechá-la) **vaza para a tradução inline hoje** — exatamente o conflito que a guarda de T016/T017 (Invariante 2/3, estado capturado no `touchstart`) precisa fechar. Aumenta a prioridade de T011/T012 como teste anti-regressão real, não preventivo |
| R-003 | A supressão do `ActionMode` no Android é global à Activity; se o estado "estou no leitor" vazar, o menu de seleção do sistema some em telas onde ele é legítimo (ex: busca da biblioteca) | Médio: regressão silenciosa fora do leitor | Alternar o flag no ciclo de vida do leitor (montagem/desmontagem do `ReaderScreen`), com verificação explícita no quickstart 2.2/2.3 |
| R-004 | Menu injetado no doc do iframe pode ter limitações de posicionamento perto das bordas ou sob o chrome do leitor | Baixo | Plano B registrado em `research.md`: overlay React sobre o iframe, ao custo de converter coordenadas e assumir o risco de compositing que o `ReaderScreen` documenta |
| R-005 | O `foliate-js` instala o próprio listener de `click` no doc para o `hitTest` do overlayer (`view.js:438-444`), coexistindo com o listener do NeoReader no mesmo documento | Médio para FR-019/FR-020: toque num highlight poderia disparar as duas coisas | Tratar `show-annotation` como a fonte de verdade do toque em highlight e marcar o gesto como consumido, de modo que o ramo de tradução do listener do NeoReader não rode no mesmo toque. Coberto por teste na US3 |
| R-006 | FR-014 (highlight continua alinhado após mudar fonte/tema/rotação) é atendido por comportamento do **vendor**: o `paginator.js:566-571` chama `overlayer.redraw()` no relayout. Não há código nosso nesse caminho, logo não há teste nosso que o proteja — uma atualização do `foliate-js` poderia mudar isso silenciosamente | Baixo agora, mas invisível se regredir | Dependência registrada em vez de assumida. Coberto por verificação em device (quickstart 5.1/5.2). Se um dia falhar, o sintoma é highlight deslocado após trocar fonte — anotar aqui como primeira hipótese |
| D-001 | Decisão: pintura via overlayer do `foliate-js`, não por wrapping de DOM | — | Justificada em `research.md` R0.1. Fecha FR-012 e protege o roteamento de toque (`pointer-events: none`) |
| D-003 | Decisão (resolve o achado A4 do Analyze): a supressão do `ActionMode` entra como `setSelectionMenuSuppressed` no `NeoReaderLibraryPlugin` existente, não num plugin novo | — | Precedente direto no próprio repositório: `setReaderImmersiveMode` (`NeoReaderLibraryPlugin.java:92`) já é um método de UI da Activity com escopo do leitor, exposto por `NativeSystemUiService.ts` e ligado ao ciclo de vida em `ReaderScreen.tsx:339-341`. Plugin novo seria cerimônia sem ganho; ligar no mesmo efeito é também a mitigação de R-003 |
| D-002 | Decisão: guarda por estado capturado no início do gesto, sem timer de long-press | — | Justificada em `research.md` R0.3. É o que atende à restrição repetida pelo usuário sem disputar com o `didScroll` |
| D-005 | **Decisão técnica** (2026-09-06, entrevista sobre os 3 estilos de marcação): `Highlight.style` entra como campo **opcional e não-indexado** — não precisa de `version(20)` nova do Dexie, só campos usados em índice exigem migração. Os 3 estilos usam as draw functions **já prontas** do vendor (`Overlayer.highlight`/`.underline`/`.squiggly` em `node_modules/foliate-js/overlayer.js:164-260`), nenhuma delas desenhada por nós; só faltavam na declaração `foliate.d.ts` (adicionadas). Fluxo assimétrico: no menu de **criação**, o estilo é estado pendente (só a cor confirma+fecha, igual já valia pra cor sozinha); no menu de **gerenciar** um highlight existente, cor OU estilo já aplicam e persistem no toque (FR-022), sem confirmação — o highlight já existe | — |
| R-007 | **Achado real durante T014** (não hipotético): `buildHighlightPayloadFromRange` inicialmente passava o CFI de intervalo por `normalizeCfi()` — que chama `CFI.collapse(cfi)` incondicionalmente (colapsa pro INÍCIO do range, sem `toEnd`). Isso destruiria a estrutura de intervalo do highlight, reduzindo-o a um ponto — violação direta de FR-012, e o MESMO risco de colisão de `syncKey` já registrado em `decision.md` do assessment, agora confirmado no código de produção, não só hipotetizado | Alto — sem o teste T014, o highlight gravado seria sempre um ponto, não um intervalo | **Resolvido**: removido o `normalizeCfi()` de `buildHighlightPayloadFromRange` — usa `view.getCFI(sectionIndex, range)` direto. Comentário de aviso deixado no código apontando pra este risco. Teste T014 assevera `getCFI` foi chamado com um range `collapsed: false` |
| R-008 | Import dinâmico de `foliate-js/overlayer.js` **em série** após o de `view.js` (`await import(a); await import(b)`) atrasou `container.appendChild(view)` o suficiente pra quebrar 6 testes que só flushavam um tick de microtask após montar (timing, não erro real — nenhum catch disparava) | Médio — sintoma enganoso (parecia falha de import, era só atraso) | **Resolvido**: o import de `overlayer.js` foi desacoplado do caminho crítico (fire-and-forget, com a promise guardada em `overlayerModulePromiseRef` pra `paintHighlight` esperar por ela só se precisar) — `view.js` continua sendo a única dependência bloqueante da abertura do leitor, igual a antes desta feature. Lição pra próximas features: nunca adicionar um segundo `await import(...)` em série no `setup()` sem medir o impacto — usar `Promise.all` ou desacoplar |
| R-010 | **Achado real em Chromium** (Passo 6 do quickstart via Playwright MCP, 2026-09-06): na web a seleção **nasce durante o arrasto**, então no `pointerdown` não havia seleção nenhuma e `hadSelectionAtTouchStart` ficava `false`. O `click` que encerra o arrasto (o browser dispara um mesmo com o mouse tendo andado) caía no fluxo de tradução: abria o bloco inline e a seleção sumia junto com o menu recém-aberto | Alto para FR-029/quickstart 6.1-6.2: na web o menu abria e fechava sozinho, era impossível chegar na cor | **Resolvido**: a guarda do `click` passou a ter **duas leituras** — o estado capturado no início do gesto (Android, onde a seleção já foi colapsada quando o click chega) **e** a leitura viva de `getEligibleSelectionRange` (web, onde a seleção ainda está de pé). Se a seleção está viva, o click é ignorado **sem** fechar o menu; só um dismiss de verdade fecha. Teste T024a |
| R-011 | **Achado real em Chromium, explica o sintoma de device do R-009**: `ev.target instanceof Element` é **sempre falso** para eventos vindos do iframe do EPUB — o `Element` do nosso código é o do documento pai e o alvo vem de outro realm (verificado: `btn instanceof parent.Element === false`). O `target` do listener de click cai então no `documentElement`, e `target.closest('[data-nr-selection-color]')` **nunca** acha o swatch. Todo o resto do handler já convivia com isso via fallback por coordenada (`getTranslationActionAtPoint`, `isTranslationBlockTap`, `getTapReadableBlock`); só o ramo novo do highlight não tinha | Crítico — era o que impedia criar highlight em browser real; é uma **segunda causa suficiente** para o mesmo sintoma reportado em device no R-009 (menu abre, escolher cor não cria nada) | **Resolvido**: novo `getSelectionColorButtonAtPoint(target, doc, x, y)`, no mesmo formato de `getTranslationActionAtPoint` (alvo direto → `elementFromPoint` → varredura dos swatches por retângulo). Teste T024b. Em jsdom o bug era invisível: o doc falso do harness vive no mesmo realm, então `instanceof` passa |
| R-012 | **Achado real em Chromium**: `paintHighlight` passava a **chave** da paleta (`'amber'`, `'rose'`...) para `draw(Overlayer.highlight, { color })`, e o overlayer joga esse valor direto no atributo `fill` do SVG. `amber`, `emerald` e `rose` não são cores nomeadas em CSS — pintavam preto; `indigo`/`cyan`/`orange`/`pink`/`purple` pintavam a cor errada (a nomeada do CSS, não o token do app) | Médio-alto: highlight visível mas na cor errada, e preto sobre texto no tema escuro | **Resolvido**: `annotationColorHex(color)` na hora de pintar (`#f59e0b` etc). A cor **gravada** continua sendo a chave — só a pintura converte. Teste T024c |
| R-016 | **Achado real em device** (2026-09-06, usuário testando o build com Copiar/Compartilhar): Copiar funcionou; Compartilhar não fez nada. Causa: o Android System WebView (usado pelo Capacitor), diferente do Chrome for Android, não implementa a Web Share API de forma confiável — `navigator.share()` existe/resolve sem erro mas não abre sheet nenhum | Alto — FR-003c ficava quebrado especificamente no Android, a plataforma alvo de qualidade | **Resolvido**: `shareText` novo no `NeoReaderLibraryPlugin` (mesmo padrão de `setReaderImmersiveMode`/`setSelectionMenuSuppressed` — capacidade nova no plugin já existente, sem plugin novo), disparando `Intent.ACTION_SEND` nativo. `NativeSystemUiService.shareText(text)` usa o plugin no Android e cai pro `navigator.share` do browser fora dele (onde funciona bem — é o Chrome de verdade, não WebView embarcado). Testes cobrindo os dois caminhos + FR-003d (sem nenhum dos dois, não lança) |
| D-004 | **Decisão de UX** (2026-09-06, usuário testando em device): as 8 cores direto na fileira do menu de seleção tomavam espaço demais na tela. Trocado por um único botão "Destacar" (ícone highlighter) que abre um submenu com as 8 cores + botão de voltar, substituindo o conteúdo do mesmo menu (sem popover novo, sem mudar o container). Reseta pro modo raiz sempre que uma seleção NOVA é aberta (menu estava escondido); mantém o modo se a seleção só mudou de tamanho (usuário ajustando as alças) | — | `renderSelectionMenuActionsHtml(mode)` com dois modos; `setSelectionMenuMode` reposiciona ao trocar (o tamanho da caixa muda). `getSelectionColorButtonAtPoint`/`getSelectionRunButtonAtPoint` unificadas em `getSelectionMenuButtonAtPoint(selector)` — eram duas cópias quase idênticas, agora uma função parametrizada |
| R-015 | **Achado real em device** (T044, 2026-09-06): tocar num item da aba de Highlights abria o livro no trecho certo (FR-025 ok) mas o highlight **não aparecia pintado**. Isolado com logs temporários: `repaintHighlightsForSection` e `paintHighlight` rodavam certinho (view e `OverlayerCtor` prontos), `view.addAnnotation({value: cfi})` resolvia sem lançar — mas o evento `draw-annotation` **nunca disparava** (`handled` ficava `false`). A mesma chamada, feita manualmente alguns segundos depois pelo console, pintava sem problema — não é CFI inválido nem seção errada, é uma corrida: abrir o leitor direto num CFI dispara a navegação inicial do próprio leitor para esse mesmo alvo ao mesmo tempo que o nosso código tenta pintar o highlight nesse alvo; o foliate resolve o overlayer antes dele estar pronto e não emite o evento, sem erro nenhum | Alto para FR-013/SC-004 no caminho específico "abrir pela lista" — o highlight ficava fantasma até rolar pra fora e voltar | **Resolvido**: `paintHighlight` ganhou uma retentativa única (`isRetry`), 300ms depois, quando `handled` fica `false` — mesma filosofia de tolerância do FR-017 (nunca há erro pra capturar; só a ausência do evento). Teste de regressão T024e — mocka o `addAnnotation` resolvendo sem emitir o evento na 1ª chamada; verificado que falha sem o fix. Confirmado em device com CDP: `pintados: ["#06b6d4"]` logo após navegar da lista |
| R-014 | **Achado real em device** (T029, 2026-09-06): recusar o ActionMode em `Activity.onWindowStartingActionMode` **não suprime** a barra flutuante de seleção. Verificado com log: o hook É chamado (`type=1`, FLOATING) e devolvemos `null`, e a barra Copiar/Traduzir/Selecionar tudo aparece do mesmo jeito — `null` ali significa apenas "a app não fornece um ActionMode próprio", e o DecorView cria o dele em seguida. Também não serve `mode.finish()` em `onActionModeStarted`: o Chromium trata a destruição do ActionMode como desistência e **limpa a seleção junto**, o que apagaria a seleção e o nosso menu | Alto para FR-010/US2: a barra do sistema cobria exatamente o menu de cores | **Resolvido**: interceptar em `View.startActionMode` do próprio WebView. Criados `NeoReaderWebView extends CapacitorWebView` (devolve um `ActionMode` silencioso, que não desenha nada, em vez de `null`/`finish()` — assim a seleção nativa e as alças continuam de pé) e uma cópia do `capacitor_bridge_layout_main.xml` no app apontando para essa classe (recurso do app sobrescreve o da biblioteca; é o único ponto de injeção, já que o Bridge infla esse layout e busca `R.id.webview`). Verificado em device por screenshot: só o menu do NeoReader aparece, e na busca da biblioteca o menu do sistema volta ao normal |
| R-013 | **Achado real em device** (2026-09-06, inspecionando o WebView do celular por CDP): highlight criado aparecia na hora, mas **o livro reabria sem marcação nenhuma** — os 2 highlights do usuário estavam gravados no IndexedDB, com CFI que resolve (`addAnnotation` manual disparava `draw-annotation`), e mesmo assim nada era pintado. Causa: a lista vem de `useLiveQuery` (assíncrona) e a repintura só acontecia em `create-overlay`/`load`; no device essas duas coisas correm ao contrário da web — as seções carregam antes da query resolver, a repintura roda com lista vazia e **nunca mais é disparada**. Também explica navegar para uma seção já carregada e não ver nada | Alto para FR-013/SC-004 — a persistência existia no banco mas não na tela, que é o que o usuário vê | **Resolvido**: `useEffect` em `[highlights]` repinta todas as seções carregadas quando a lista chega ou muda, no mesmo formato do efeito que o Word Lens já usa (`loadedSectionsRef`). Repintar é idempotente (`view.addAnnotation` remove a anotação de mesmo CFI antes de desenhar). Teste T024d — verificado que falha sem o efeito |
| R-009 | **Achado real em device** (1ª rodada de T024, 2026-09-06): tocar num swatch de cor abria/posicionava o menu certo, mas não criava o highlight. Causa: no Android, o WebView colapsa a seleção nativa (dispara `selectionchange` com seleção vazia) como parte de processar o PRÓPRIO toque no swatch — **antes** do evento `click` desse mesmo toque rodar. O código original zerava `pendingHighlightRange` em toda leitura inelegível do `selectionchange`, então por volta do `click` o range já tinha sumido. Não apareceu em nenhum teste automatizado porque `fireSelectionChange`/`click` nos testes rodam em passos discretos, sem essa corrida real de eventos do Android | Alto — quebrava o caminho principal da US1 inteira (criar highlight), só visível em device real | **Resolvido** (T023a): `selectionchange` não zera mais `pendingHighlightRange` numa leitura inelegível (só esconde o menu); o branch do clique no swatch lê `getEligibleSelectionRange(doc)` primeiro e cai pro `pendingHighlightRange` como fallback se a seleção viva já tiver sumido; o range só é descartado de fato ao consumir a cor ou num dismiss real (guarda `text-selection`). Teste de regressão: T014b reproduz a ordem exata de eventos observada (`selectionchange` com seleção nula, **depois** `click` no swatch) |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-06 | Setup + Foundational | Tipo/schema/repositório/paleta/i18n criados; mock do foliate-js estendido com addAnnotation/deleteAnnotation/overlayer observável; cascade de remoção. `npm run lint && npm test && npm run build` limpos — suíte completa 813 passed / 2 skipped (pré-existentes) | Nenhuma — fundação pronta |
| 2026-09-06 | User Story 1 (código) | T010 validado em device (R-002 resolvido, achado extra confirmado — toque de dispensa vazava pra tradução). Implementados: predicado de elegibilidade FR-006, guarda `text-selection` no click, menu de seleção declarativo, `buildHighlightPayloadFromRange` (bug do `normalizeCfi` achado e corrigido via teste — R-007), `paintHighlight`/repaint via `create-overlay`+`load`, wiring em `ReaderScreen.tsx`. Suíte completa 820 passed / 2 skipped, lint e build limpos | **T024 — validação em device**, único item restante do checkpoint da US1 |
| 2026-09-06 | User Story 1 (1ª rodada de T024 em device) | Menu abre e posiciona certo no device, mas escolher cor não criava o highlight — corrida real do Android entre `selectionchange` e `click` do próprio swatch (R-009, task ad-hoc T023a). Corrigido: `selectionchange` não zera mais o range pendente numa leitura inelegível; o clique no swatch lê a seleção viva com fallback pro último range elegível. Teste de regressão T014b adicionado (85 testes em `EpubViewer.test.tsx`, suíte completa não re-rodada nesta linha — só o arquivo tocado). Build reinstalado no device | Reconfirmar o Passo 1 completo com o fix aplicado |
| 2026-09-06 | User Story 1 (Passo 6 — web, Chromium real via Playwright MCP) | Rodado **antes** de voltar ao device, com EPUB real importado pela UI e seleção por arrasto de mouse de verdade. **Três bugs reais achados e corrigidos** (T023b): R-010 (click que encerra o arrasto abria a tradução e fechava o menu), R-011 (`instanceof Element` cross-realm — o clique no swatch nunca era reconhecido; segunda causa suficiente pro sintoma de device do R-009) e R-012 (cor da paleta ia como chave pro `fill` do SVG). Depois dos fixes: menu abre e fica; cor cria o highlight com CFI de intervalo (`epubcfi(...(/2/26,/1:0,/1:68))`); pintura correta; sobrevive a reload, troca de capítulo e rolagem longa; seleção entre 2 parágrafos vira 1 highlight; toque fora dispensa sem criar; seleção dentro do bloco de tradução não abre o menu; 8/8 toques curtos abriram a tradução. `lint` + 824 testes + `build` limpos | **T024 em device** continua sendo o gate — a web não substitui o Passo 1 |

| 2026-09-06 | User Story 1 (2ª rodada de T024 em device) | Usuário testou no celular e reportou falha. Inspeção do WebView do device por **CDP** (`adb forward` + `chromium.connectOverCDP`) mostrou: os 2 highlights dele **estavam gravados** com CFI de intervalo válido, e criar um novo pintava na hora — mas reabrir o livro não pintava nada (R-013). Corrigido com o efeito de repintura em `[highlights]`; teste T024d. Suíte 825 passed / 2 skipped, lint e build limpos | Reconfirmar no device com a tela desbloqueada (o device travou durante o build) |

| 2026-09-06 | US1/US2/US3 — validação em device (T024, T029, T036) | Dirigido por CDP + toque REAL de sistema (`adb shell input motionevent`; o toque sintético do CDP **não** dispara a seleção nativa do WebView). Confirmados: toque longo + arrasto seleciona e abre o menu; tocar numa cor cria o highlight com CFI de intervalo e pinta; **1.8 — 8/8 toques curtos abriram a tradução**; **1.9 — 0/10 rolagens criaram seleção**; **1.10 — o toque de dispensa foi ignorado (`text-selection`) e não abriu tradução, e o toque seguinte abriu normalmente**; US2 — a barra do sistema sumiu no leitor e voltou na busca da biblioteca (R-014); US3 — tocar no highlight abre o menu sem traduzir, trocar cor repinta e persiste, remover apaga pintura e registro | Faltam 1.5 com palavra do vocabulário (fecha R-001) e o Passo 5 (reflow/rotação/TTS/tema) |

| 2026-09-06 | US4 (aba na tela de detalhes) | Aba `highlights` com badge, lista ordenada por `percentage` (trecho, cor, posição, data), remover pela lista, contador junto de marcadores/vocabulário, e navegação de volta ao trecho. Testes T037-T039a; suíte 837 passed / 2 skipped. Verificado em Chromium, inclusive a navegação (tocar no item de 8% abriu o leitor com aquele highlight visível) | **T044 (device)**; o aparelho desconectou do `adb` antes do install |

| 2026-09-06 | US4 (T044, device) | Passo 4 completo no `RXCX103NMVZ`: aba com contador, lista ordenada com 4 itens, tocar num item abre o livro no trecho — mas o highlight não pintava (R-015). Isolado via logs temporários no código (removidos depois), corrigido com retentativa em `paintHighlight`, confirmado no device via CDP (`pintados: ["#06b6d4"]`) e por screenshot. Teste de regressão T024e. `lint`/testes (838 passed / 2 skipped)/build limpos | Nenhuma — US1 a US4 completas, incluindo device |

| 2026-09-06 | Copiar/Compartilhar no menu (ad-hoc, decisão do usuário) | Usuário, testando a US1 no device, decidiu trazer Copiar e Compartilhar pro escopo agora (estavam em Fora de Escopo, com o menu preparado de propósito pra isso via FR-003a). Spec emendada (FR-003c/FR-003d). Implementado com Clipboard API + Web Share API — **zero dependência nova**. `getSelectionRunButtonAtPoint` no mesmo padrão cross-realm de `getSelectionColorButtonAtPoint` (R-011); mesmo fallback de seleção pendente do R-009. Testes T050-T052; suíte 841 passed / 2 skipped. Confirmado em Chromium real: clipboard do SO recebeu o texto exato, `navigator.share` chamado com `{text}` correto | **T061 (device)** — aparelho desconectou antes de instalar o build |

| 2026-09-06 | Copiar/Compartilhar — correção pós-teste do usuário | Usuário testou no device: Copiar funcionou, Compartilhar não fez nada (R-016). Corrigido com `shareText` nativo via `Intent.ACTION_SEND` no `NeoReaderLibraryPlugin` (mesmo padrão dos outros métodos do plugin), fallback pro `navigator.share` fora do Android. Usuário também pediu que as 8 cores virassem submenu por trás de um botão único (D-004) — implementado (`renderSelectionMenuActionsHtml` com modos root/colors), com testes novos (T062-T064) e verificado em Chromium: menu compacto, submenu abre/volta, highlight criado a partir dele, share chamado com o texto certo. `getSelectionColorButtonAtPoint`/`getSelectionRunButtonAtPoint` unificadas numa função só. Suíte 849 passed / 2 skipped, lint/build limpos, Java compila | Reinstalar no device (aparelho desconectou) e o usuário revalidar Compartilhar + o novo submenu |

| 2026-09-06 | 3 estilos de marcação (ad-hoc, entrevista pós-D-004) | Usuário confirmou Compartilhar + submenu funcionando, mas pediu evolução visual com referência de outro app (fundo/sublinhado/ondulado + barra de ações rica) e pediu entrevista via AskUserQuestion (4 perguntas, o limite da ferramenta). Decisões: 3 estilos, sem ações extras nesta rodada, mantém o layout compacto com submenu (D-004), menu de gerenciar ganha o mesmo tratamento. `Highlight.style` opcional sem migração (D-005). `EpubViewer.tsx`: ícones SVG dos 3 estilos, `getOverlayerDrawFn`, `renderStyleButtonsHtml` compartilhado entre os dois menus, estado pendente `pendingHighlightStyle` no menu de criação, `setHighlightMenuAppearance` pra reabrir o menu de gerenciar já com o estilo certo marcado. `foliate.d.ts` ganhou as declarações de `Overlayer.underline`/`.squiggly` (faltavam — `tsc -b` pegou, `tsc --noEmit` sozinho não, por isso o build também roda sempre). Testes: `db/highlights.test.ts` (`updateHighlightColor` → `updateHighlightAppearance`), T032 atualizado, T032b novo (estilo ativo ao abrir + troca sem fechar). `lint`/`tsc -b`/`build`/suíte completa (851 passed / 2 skipped) limpos. Verificado em Chromium real: submenu com estilo+cores, toggle de estilo sem fechar, cor confirma e pinta | Reinstalar no device e o usuário revalidar — feito na linha seguinte |

| 2026-09-06 | 3 estilos de marcação — validação em device (T067b) | Aparelho reconectado (`RXCX103NMVZ`/SM-S911B); `npm run android:run` instalou sem erro. Usuário testou os 3 estilos nos dois menus (criar e gerenciar) e confirmou: "deu certo" | Nenhuma — feature completa (US1-US4 + Copiar/Compartilhar + submenu de cores + 3 estilos), todas validadas em device |

**PRÓXIMO**: nenhum item bloqueante em aberto nesta feature. Itens de polimento opcionais seguem em `tasks.md` Fase 7 (T045 reflow/rotação/TTS/tema, T046-T049) e T061c (revalidar Compartilhar especificamente, se ainda não coberto pela rodada acima)

## Arquivos Principais

- `src/types/highlight.ts` — entidade `Highlight`
- `src/types/foliate.d.ts` — `addAnnotation`/`deleteAnnotation`, eventos `draw-annotation`/`show-annotation`/`create-overlay`, módulo `foliate-js/overlayer.js`
- `src/db/database.ts` — `version(19)` + tabela `highlights`
- `src/db/highlights.ts` — repositório (CRUD, sem sync)
- `src/db/books.ts` — cascade de remoção (FR-018a)
- `src/utils/annotationColors.ts` — paleta compartilhada (movida de `BookmarkSheet.tsx`)
- `src/components/reader/EpubViewer.tsx` — gesto (`selectionchange`, `touchstart`/`pointerdown`), guarda no `click`, menu de seleção (`#nr-selection-menu`), `paintHighlight`/`repaintHighlightsForSection`, CSS `.nr-sel-*`
- `src/screens/ReaderScreen.tsx` — `useLiveQuery(getHighlightsByBookId)` + `handleCreateHighlight`
- `src/__tests__/setup.ts` — `FoliateViewMock` com `addAnnotation`/`deleteAnnotation`/overlayer observável
- `src/__tests__/components/EpubViewer.test.tsx` — describe `'EpubViewer — highlights de trecho selecionado'` (T011-T015, T013a, T014a)
- `src/i18n/messages.ts` — chaves `bookDetails.*Highlights*`, `reader.selectionMenu.*`, `reader.highlightMenu.*`

## Cuidados para Retomada

- O `FoliateViewMock.addAnnotation` (setup.ts) sempre associa ao **conteúdo mais recentemente carregado** (`rendererContents[length-1]`), não faz parsing real de CFI. Suficiente para testes com uma seção carregada por vez; um teste que carregue duas seções e espere pintura na seção certa vai precisar de ajuste no mock, não só no teste.
- `Overlayer` (de `foliate-js/overlayer.js`) **não é mockado** — só `foliate-js/view.js` é. Testes que queiram afirmar a cor pintada podem importar `Overlayer` real e comparar a referência da função passada a `overlayer.add(...)`.
- **Nunca** passar o CFI de intervalo de um highlight por `normalizeCfi()` (`src/utils/cfi.ts`) — ela chama `CFI.collapse()` incondicionalmente e reduz o intervalo a um ponto (R-007). Só marcadores (já colapsados) podem passar por ali com segurança.
- Ao adicionar qualquer import dinâmico novo em `setup()` do `EpubViewer.tsx`, nunca colocá-lo em série (`await` sequencial) antes de `container.appendChild(view)` — R-008. Ou roda em paralelo com `Promise.all`, ou é desacoplado do caminho crítico (padrão usado para `overlayer.js`).
- O menu de seleção (`#nr-selection-menu`) já foi visto rodando em device (1ª rodada de T024) — abre e posiciona corretamente. Falta reconfirmar o fluxo completo após o fix de R-009; overlap com o teclado/chrome e sensação tátil dos swatches (24px) continuam sem checagem explícita.
- **A lista de highlights chega depois do leitor** (R-013): é `useLiveQuery`, então qualquer coisa que dependa dela precisa de um efeito em `[highlights]` além dos eventos do foliate — repintar só em `load`/`create-overlay` deixa o livro sem marcação na reabertura. Vale para a US3 (repintar depois de trocar cor) e para a US4 (lista na tela de detalhes).
- **Dá para inspecionar e dirigir o WebView do celular por CDP**, o que encurta muito o ciclo de debug em device: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` e `chromium.connectOverCDP('http://127.0.0.1:9222')` com o Playwright já instalado. Dá acesso ao DOM das seções (via shadowRoot do `foliate-paginator`), ao IndexedDB e ao console do app. Exige build debug, device desbloqueado (com a tela apagada o WebView é suspenso e o devtools não responde) e refazer o `adb forward` a cada reinstalação, porque o PID muda.
- **Toda navegação direta a um CFI específico (US4, "voltar ao trecho") corre com a navegação inicial do próprio leitor pra esse mesmo alvo** (R-015): `paintHighlight` pode nunca receber `draw-annotation` na primeira tentativa, sem erro nenhum. `paintHighlight` já tem uma retentativa (300ms, uma vez); qualquer outro código que chame `view.addAnnotation`/dependa de `draw-annotation` logo após abrir o leitor num alvo específico precisa do mesmo cuidado.
- **Nada que venha do iframe do EPUB passa em `instanceof`** (R-011). O documento de cada seção é outro realm: `elementoDoIframe instanceof Element` é falso no nosso código, e por isso o `target` do listener de `click` é quase sempre o `documentElement`, não o que o usuário tocou. Todo ramo novo desse handler precisa de fallback por coordenada (`elementFromPoint`, ou varredura por `getBoundingClientRect`) — é o que `getTranslationActionAtPoint`, `isTranslationBlockTap` e `getSelectionColorButtonAtPoint` fazem. **jsdom não pega isso**: o doc falso do harness vive no mesmo realm dos testes, então `instanceof` passa e o teste fica verde com código que não funciona em browser nenhum. Vale para o menu de gerenciamento da US3.
- **A cor gravada é a chave da paleta; quem pinta precisa converter** com `annotationColorHex` (R-012) — o overlayer joga o valor cru no `fill` do SVG.
- **Web e Android criam a seleção em momentos diferentes do gesto** (R-010): no Android ela já existe quando o gesto seguinte começa; na web ela nasce durante o arrasto e ainda está viva no `click` que o encerra. Qualquer guarda nova precisa das duas leituras.
- **Ordem real de eventos no Android é diferente da sequência ingênua "seleciona → menu abre → toca a cor → cria".** Um toque no PRÓPRIO menu (ex: no swatch de cor) já dispara `selectionchange` com a seleção nativa colapsada **antes** do `click` desse mesmo toque chegar (R-009). Qualquer código novo que reaja a `selectionchange` fechando/limpando estado precisa considerar que esse evento pode ser eco do toque que está prestes a interagir com o próprio menu — não assumir que "seleção sumiu" sempre significa "usuário desistiu". Isso vai valer também para o menu de gerenciamento de highlight (US3, `show-annotation`) se ele também reagir a `selectionchange`.
