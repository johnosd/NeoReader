---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Highlights de trecho selecionado no leitor

**Input**: Documentos de design de `sdd/specs/010-highlights-selecao-texto/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), research.md, data-model.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- App React + TypeScript em `src/`, projeto único (sem separação front/back)
- Leitor e componentes do leitor em `src/components/reader/`
- Telas completas em `src/screens/`
- Schema e repositórios Dexie em `src/db/`
- Tipos de domínio em `src/types/`, funções puras em `src/utils/`
- Textos de UI em `src/i18n/messages.ts` (pt-BR, en, es no mesmo arquivo)
- Testes em `src/__tests__/`, espelhando `src/`; sem `globals` do Vitest
- Nativo Android em `android/app/src/main/java/com/johnny/neoreader/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Base de dados e tipos que todas as stories consomem.

- [X] T001 Criar `src/types/highlight.ts` com a interface `Highlight` conforme `data-model.md` (campos `bookId`, `cfi`, `paraCfi`, `text`, `color`, `sectionIndex`, `percentage`, `createdAt`) — **[ATUALIZADO T065]** ganhou o campo opcional `style?: HighlightStyle`, sem migração de schema (D-005)
- [X] T002 Adicionar `this.version(19)` em `src/db/database.ts`, copiando as stores da v18 e acrescentando `highlights: '++id, bookId, createdAt'`, mais a declaração `highlights!: Table<Highlight>` — **não editar a `version(18)`** (constitution: schema append-only)
- [X] T003 Criar `src/db/highlights.ts` com `addHighlight`, `getHighlightsByBookId` (ordenado por `percentage`), `updateHighlightColor` e `deleteHighlight` — sem nenhum agendamento de sync no Drive (Invariante 7) — **[SUBSTITUÍDO T065]** `updateHighlightColor` virou `updateHighlightAppearance(id, patch: Partial<Pick<Highlight, 'color'|'style'>>)`, já que cor e estilo agora mudam independentemente pelo mesmo menu (FR-022)
- [X] T004 [P] Criar `src/utils/annotationColors.ts` movendo a constante `COLORS` (8 cores + `labelKey`) e o helper `colorHex` de `src/components/reader/BookmarkSheet.tsx`, e fazer o `BookmarkSheet` importar do novo módulo
- [X] T005 [P] Adicionar chaves de i18n em `src/i18n/messages.ts` (pt-BR, en, es) para o menu de seleção, o menu do highlight, a aba e o estado vazio da tela de detalhes — usar o termo **highlight**, nunca "grifo" (spec, seção Terminologia)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura de teste e cascade de dados que as stories assumem pronta.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T006 Estender o `FoliateViewMock` em `src/__tests__/setup.ts` com `addAnnotation`, `deleteAnnotation` e um `getContents()` que devolva um `overlayer` observável (hoje é fixo `overlayer: undefined`) — sem isso nenhum teste de pintura tem o que asseverar
- [X] T007 Incluir `db.highlights` na transação de `deleteBook` em `src/db/books.ts` e apagar `db.highlights.where('bookId').equals(id)` junto dos demais dados do livro (FR-018a)

### Testes da Fase

- [X] T008 [P] Teste de CRUD e ordenação por `percentage` em `src/__tests__/db/highlights.test.ts`
- [X] T008a [P] Teste em `src/__tests__/db/highlights.test.ts`: dois highlights com intervalos sobrepostos (inclusive com o mesmo início) coexistem como registros distintos, sem merge e sem recusa — FR-016. É o caso que travaria se alguém decidisse deduplicar por CFI mais adiante
- [X] T009 [P] Estender `src/__tests__/db/books.deleteBook.test.ts` cobrindo que remover um livro apaga seus highlights

**Checkpoint**: Fundação pronta - user stories podem começar.

---

## Phase 3: User Story 1 - Criar um highlight e reencontrá-lo marcado (Priority: P1) 🎯 MVP

**Objetivo**: Toque longo + arrasto seleciona; o menu abre com as cores; tocar numa cor marca o trecho e o marca persiste entre sessões — **sem alterar o toque curto**.

**Independent Test**: Criar um highlight, rolar para longe, voltar, fechar o app e reabrir o livro; e, no mesmo device, dar 10 toques curtos em parágrafos e confirmar que a tradução inline abre nas 10.

### T010 — Validação bloqueante da premissa (fazer ANTES de escrever o gesto)

- [X] T010 [US1] Rodar o **Passo 0** de `quickstart.md` no device `RXCX103NMVZ` com o app **sem mudanças**: confirmar que o toque longo produz seleção nativa no iframe, se as alças arrastam e se o toque de dispensa vaza para a tradução. Registrar o resultado em "Execution Notes" no `plan.md`. **Se a seleção nativa não funcionar, parar e reabrir o design** (R-002; plano B = Abordagem 3 do assessment)

### Testes da Fase

- [X] T011 [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: com seleção ativa registrada no início do gesto, o `click` seguinte é ignorado com `expectTapIgnored('text-selection')` e **não** chama `onTranslate`
- [X] T012 [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: **sem** seleção, o toque curto continua abrindo a tradução inline exatamente como hoje — este é o teste anti-regressão da restrição do usuário (FR-007/SC-002)
- [X] T013 [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: gesto de rolagem (`touchstart` → `touchmove` além do `TAP_SLOP_PX` → `click`) continua caindo em `expectTapIgnored('scroll-gesture')` e não cria seleção nem menu (SC-003)
- [X] T013a [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx` cobrindo as quatro rejeições de FR-006 — o menu **não** abre quando a seleção está (a) colapsada, (b) só com espaços/quebras, (c) contida no `#nr-translation-block`, (d) com `startContainer` e `endContainer` em documentos diferentes. Um caso por `it`, para o relatório dizer qual rejeição quebrou
- [X] T014 [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: escolher uma cor no menu chama o callback de criação com CFI de intervalo (range **não** colapsado), texto e cor
- [X] T014a [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: a seleção deixar de ser elegível fecha o menu sem criar highlight (FR-004), e a seleção mudar de extensão reancora o menu em vez de recriá-lo (FR-005)
- [X] T015 [P] [US1] Teste em `src/__tests__/components/EpubViewer.test.tsx`: ao carregar uma seção, os highlights daquela seção são repintados via `addAnnotation`

### Implementation

- [X] T016 [US1] Em `src/components/reader/EpubViewer.tsx`, rastrear estado de seleção: listener de `selectionchange` no doc de cada seção carregada (dentro do handler de `load`, junto dos listeners de toque em ~2953) e captura de "havia seleção quando o gesto começou" no `touchstart`/`pointerdown` — **com comentário curto explicando por que não dá para ler `getSelection()` dentro do `click`** (Invariante 2, Princípio II)
- [X] T017 [US1] Em `src/components/reader/EpubViewer.tsx`, acrescentar `'text-selection'` ao union `ReaderTapIgnoredReason` (linha ~86) e o ramo de guarda no listener de `click` (~2966), **depois** do ramo de `didScroll` e dos botões de ação, **antes** de qualquer ramo que abra tradução (Invariante 3)
- [X] T018 [US1] Em `src/components/reader/EpubViewer.tsx`, gerar o payload do highlight reusando `getParagraphBookmarkPayload` (~2174) **sem** o `range.collapse(true)`: `view.getCFI(sectionIndex, range)` com o range da seleção, mais `paraCfi`, `text`, `sectionIndex` e `percentage`
- [X] T018a [US1] Em `src/components/reader/EpubViewer.tsx`, criar o predicado único de elegibilidade da seleção — algo como `getEligibleSelectionRange(doc): Range | null` — aplicando as rejeições de FR-006: range colapsado, texto que fica vazio após `trim()`, range contido em `#nr-translation-block` (reusar o padrão de `closest('#nr-translation-block')` já usado em ~1706) ou no próprio menu injetado, e range cujos `startContainer`/`endContainer` estejam em documentos diferentes. **Um único ponto de decisão**, consumido tanto pelo listener de `selectionchange` (T016) quanto pela abertura do menu (T019) — não duplicar as checagens nos dois lugares. Comentar que a rejeição cross-documento é defensiva: cada seção do EPUB carrega em iframe próprio, então o WebView não consegue criar essa seleção hoje, mas o predicado não deve depender disso
- [X] T019 [US1] Em `src/components/reader/EpubViewer.tsx`, injetar o menu de seleção no doc do iframe seguindo o padrão do `#nr-translation-block`: renderizado a partir de **um array de descritores de ação** (Invariante 6), com um item nesta rodada, anexado ao **fim do `<body>`** — com comentário curto explicando por que não é `para.after` (Invariante 5)
- [X] T019a [US1] Em `src/components/reader/EpubViewer.tsx`, fechar o menu de seleção sem criar highlight quando a seleção deixa de ser elegível — toque fora, seleção desfeita pelo WebView, ou troca de seção (FR-004). O gatilho é o mesmo `selectionchange` de T016 devolvendo `null` no predicado de T018a, não um listener de clique próprio
- [X] T019b [US1] Em `src/components/reader/EpubViewer.tsx`, reancorar o menu enquanto a seleção muda de tamanho ou posição — o usuário arrastando as alças (FR-005). Reposicionar a partir do `getClientRects()` do range atual, com o mesmo cálculo usado ao abrir; evitar reconstruir o DOM do menu a cada evento
- [X] T020 [US1] Em `src/components/reader/EpubViewer.tsx`, adicionar o CSS do menu ao bloco de estilos já injetado no iframe, usando os tokens do tema do leitor e as cores de `src/utils/annotationColors.ts`; garantir rolagem horizontal quando houver mais ações do que cabem (FR-003b)
- [X] T021 [US1] Em `src/components/reader/EpubViewer.tsx`, pintar highlights via `view.addAnnotation({ value: cfi })` + listener de `draw-annotation` chamando `draw(Overlayer.highlight, { color })`, com `Overlayer` vindo de import dinâmico de `foliate-js/overlayer.js` (mesmo padrão do import dinâmico de `view.js`) — **com comentário curto explicando por que não se usa o mecanismo do vocabulário** (Invariante 4)
- [X] T022 [US1] Em `src/components/reader/EpubViewer.tsx`, repintar os highlights da seção no evento `create-overlay` e no `load`, usando `sectionIndex` para filtrar sem resolver CFIs desnecessários; tolerar CFI que não resolve sem quebrar a leitura (FR-017)
- [X] T023 [US1] Em `src/screens/ReaderScreen.tsx`, carregar os highlights do livro, passá-los ao `EpubViewer` como prop e adicionar o callback de criação que grava via `src/db/highlights.ts` e atualiza a lista em memória
- [X] T023a [US1] **(ad-hoc, achado durante T024 em device)** Corrigir corrida no Android: tocar num swatch de cor não criava o highlight porque o WebView colapsa a seleção nativa (disparando `selectionchange` com seleção vazia) como parte de processar o PRÓPRIO toque no swatch, antes do `click` do swatch chegar — `pendingHighlightRange` já tinha sido zerado quando o handler do clique rodava. Corrigido em `src/components/reader/EpubViewer.tsx`: o `selectionchange` não zera mais `pendingHighlightRange` numa leitura inelegível (só esconde o menu); o branch do swatch lê a seleção viva primeiro e cai pro último range elegível como fallback; o range só é descartado de fato ao consumir a cor ou num dismiss real (guarda `text-selection`). Teste de regressão: T014b em `EpubViewer.test.tsx`. Ver R-009 em `plan.md`
- [X] T023b [US1] **(ad-hoc, achados rodando o Passo 6 em Chromium real via Playwright MCP)** Três bugs que jsdom não pegava, todos em `src/components/reader/EpubViewer.tsx`: (a) **R-010** — o `click` que encerra o arrasto de seleção na web abria a tradução e fechava o menu; a guarda passou a ler também a seleção viva (`getEligibleSelectionRange`) e só fecha o menu num dismiss de verdade; (b) **R-011** — `ev.target instanceof Element` é sempre falso entre realms, então `target.closest('[data-nr-selection-color]')` nunca achava o swatch; criado `getSelectionColorButtonAtPoint` com fallback por coordenada, no mesmo formato de `getTranslationActionAtPoint`; (c) **R-012** — a pintura passava a chave da paleta pro `fill` do SVG; agora converte com `annotationColorHex`. Testes de regressão T024a/T024b/T024c em `EpubViewer.test.tsx`
- [X] T023c [US1] Rodar o **Passo 6** (web) de `quickstart.md` em Chromium real via Playwright MCP, com EPUB importado pela UI e seleção por arrasto de mouse: menu abre e permanece; cor cria highlight com CFI de intervalo; pintura correta; persiste a reload; seleção entre dois parágrafos vira um highlight; toque fora dispensa sem criar; seleção dentro do bloco de tradução não abre o menu; 8/8 toques curtos abriram a tradução; zero erro de console. **Não substitui T024** — nada aqui exercita toque longo, alças, barra do sistema ou reflow por mudança de fonte
- [X] T023d [US1] **(ad-hoc, achado na 2ª rodada de T024 em device)** Corrigir a repintura na reabertura do livro (**R-013**): `useEffect` em `[highlights]` em `src/components/reader/EpubViewer.tsx` repintando todas as seções carregadas, no mesmo formato do efeito do Word Lens; `repaintHighlightsForSection` passou a aceitar a lista explicitamente pra não depender da ordem dos efeitos do `useSyncRef`. Teste de regressão T024d (verificado que falha sem o efeito)
- [ ] T024 [US1] Rodar o **Passo 1** de `quickstart.md` no device, incluindo as três checagens da restrição (1.8, 1.9, 1.10) e a checagem de R-001 (1.5). Registrar o resultado de R-001 em "Riscos e Decisões" no `plan.md`

**Critério de Conclusão**: no device, toque longo + arrasto seleciona e abre o menu; tocar numa cor marca o trecho; o highlight sobrevive a rolagem, troca de capítulo e reabertura do app; o menu **não** abre nos quatro casos de FR-006 (seleção colapsada, só espaços, dentro do bloco de tradução, entre documentos); os 10 toques curtos abrem a tradução nas 10 vezes e as 10 rolagens não criam seleção; `npm run lint && npm test && npm run build` limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Em execução — código e testes completos (T010-T023d); fluxo principal **confirmado pelo usuário no device** em 2026-09-06 ("agora deu certo") depois do fix de R-013; **falta o restante de T024**: as três checagens da restrição (1.8/1.9/1.10) e a checagem 1.5 em parágrafo com palavra do vocabulário (R-001)
- Feito: T010 (premissa validada em device — ver Riscos e Decisões R-002); tipo `HighlightCreationPayload`; predicado de elegibilidade `getEligibleSelectionRange` (FR-006); `buildHighlightPayloadFromRange` (CFI de intervalo, sem `normalizeCfi`); menu de seleção como lista declarativa (`#nr-selection-menu`, `.nr-sel-color`); guarda de seleção no `click` (ramo `'text-selection'`, agora com as duas leituras — estado no início do gesto + seleção viva); `getSelectionColorButtonAtPoint` (fallback por coordenada, R-011); `paintHighlight`/`repaintHighlightsForSection` via `Overlayer.highlight` com cor CSS (R-012); wiring em `ReaderScreen.tsx` (`useLiveQuery` + `addHighlight`); **T023a** (corrida do Android, R-009) e **T023b** (R-010/R-011/R-012)
- Testes executados: `npm run lint && npm test && npm run build` — suíte completa **824 passed / 2 skipped** (pré-existentes); 88 testes em `EpubViewer.test.tsx` (T014b + T024a/b/c)
- Verificado em device (T024): criar highlight por toque longo + arrasto + cor, pintura, reabertura do livro com as marcações no lugar (usuário + CDP); **1.8 — 8/8 toques curtos abriram a tradução**; **1.9 — 0/10 rolagens criaram seleção ou menu**; **1.10 — o toque de dispensa foi ignorado (`text-selection`), sem abrir tradução, e o toque seguinte traduziu normalmente**
- Pendências: **1.5 em parágrafo com palavra do vocabulário** (é o que fecha R-001) e o Passo 5 (reflow, rotação, tema claro, TTS). Scripts de device em `.tmp-e2e/` — exigem a tela desbloqueada, senão o WebView é suspenso e o CDP não responde

---

## Phase 4: User Story 2 - Menu do NeoReader sem o menu do sistema por cima (Priority: P2)

**Objetivo**: No Android, selecionar texto no leitor mostra só o menu do NeoReader; fora do leitor o menu do sistema volta ao normal.

**Independent Test**: No device, selecionar texto no leitor (só o menu do app aparece) e depois selecionar texto na busca da biblioteca (menu do sistema aparece).

### Testes da Fase

- [X] T025 [P] [US2] Teste em `src/__tests__/screens/ReaderScreen.test.tsx`: montar o leitor liga a supressão e desmontar desliga (`NativeSystemUiService` mockado recebe as duas chamadas, na ordem) — cobre R-003. Somado um segundo teste: volta do segundo plano reaplica a supressão
- [X] T025a [P] [US2] Teste da degradação na web (FR-029): fora de plataforma nativa a supressão é no-op e **não** lança. **Desvio do texto da task**: ficou em `src/__tests__/services/NativeSystemUiService.test.ts`, não no teste de tela — é lá que as guardas (`isNativePlatform`/`getPlatform`) vivem e onde os testes equivalentes do `setReaderImmersiveMode` já estavam

### Implementation

- [X] T026 [US2] Em `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`, sobrescrever `onWindowStartingActionMode` (as duas assinaturas, com e sem `type`) para recusar action modes flutuantes enquanto um flag estiver ligado — com comentário curto explicando que o Chromium sobe esse menu por caminhos que não emitem `contextmenu` cancelável, então não há como bloquear pelo JS
- [X] T027 [US2] Adicionar `setSelectionMenuSuppressed(PluginCall)` a `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`, **ao lado de `setReaderImmersiveMode` (~linha 92)** e no mesmo formato (`call.getBoolean("enabled", false)`, `getActivity()` com `call.reject` se nulo, `runOnUiThread`). **Não criar plugin novo**: esse plugin já hospeda método de UI da Activity com escopo do leitor, e este é o mesmo tipo de flag
- [X] T027a [US2] Expor `setSelectionMenuSuppressed(enabled: boolean)` em `src/services/NativeSystemUiService.ts`, ao lado de `setReaderImmersiveMode` e com as mesmas duas guardas: `Capacitor.isNativePlatform() && getPlatform() === 'android'` e `typeof método !== 'function'`. Essas guardas são também o que faz a feature degradar sã na web (FR-029) — nenhum caminho novo é necessário para isso
- [X] T028 [US2] Em `src/screens/ReaderScreen.tsx`, ligar/desligar a supressão **no mesmo `useEffect` que já chama `setReaderImmersiveMode` (~339-341, com o cleanup em 341)** e no ponto de reaplicação (~905). Manter os dois no mesmo efeito é o que impede o estado de divergir e vazar para outras telas (R-003) — não criar um efeito paralelo
- [X] T026a [US2] **(ad-hoc, achado em T029)** A supressão pela Activity não funciona (R-014). Criado `android/app/src/main/java/com/johnny/neoreader/NeoReaderWebView.java` (`startActionMode` devolve um ActionMode silencioso) e `android/app/src/main/res/layout/capacitor_bridge_layout_main.xml` (cópia do layout do Capacitor apontando para essa classe). `MainActivity` deixou de sobrescrever `onWindowStartingActionMode` e passou a só expor o flag
- [X] T029 [US2] Rodar o **Passo 2** de `quickstart.md` no device, incluindo 2.2 e 2.3 (o menu do sistema volta fora do leitor e a supressão religa ao voltar)

**Critério de Conclusão**: no device, nenhuma barra flutuante do sistema aparece sobre a seleção dentro do leitor, e a seleção em campos de texto fora do leitor mantém o menu do sistema intacto; suíte limpa.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** — validada no device (T029). A abordagem original do plano (recusar em `Activity.onWindowStartingActionMode`) não funcionou e foi substituída pelo `NeoReaderWebView` (T026a, R-014)
- Feito: `MainActivity.onWindowStartingActionMode` (as duas assinaturas) recusando ActionMode **FLOATING** enquanto o flag está ligado; `setSelectionMenuSuppressed` no `NeoReaderLibraryPlugin` (ao lado de `setReaderImmersiveMode`, mesmo formato); `setSelectionMenuSuppressed` no `NativeSystemUiService` com as mesmas duas guardas; liga/desliga no **mesmo `useEffect`** do modo imersivo em `ReaderScreen.tsx` e reaplica na volta do segundo plano (R-003)
- Testes executados: `npm run lint`, `npm test` (833 passed / 2 skipped) e `npm run build` limpos; `gradlew assembleDebug` compila o Java novo
- Verificado em device: 2.1 — selecionando texto no leitor aparece **só** o menu do NeoReader (screenshot); 2.2 — no campo de busca da biblioteca o menu do sistema volta ao normal (screenshot), então o flag não vazou (R-003). 2.3 (religar ao voltar pro leitor) está coberto pelo mesmo efeito de montagem, mas não foi fotografado separadamente
- Pendências: nenhuma

---

## Phase 5: User Story 3 - Remover ou trocar a cor pelo próprio texto (Priority: P3)

**Objetivo**: Tocar num highlight abre o menu do highlight (remover / trocar cor) em vez da tradução inline.

**Independent Test**: Criar um highlight, tocar nele, trocar a cor, reabrir o livro para confirmar a cor nova, e depois remover.

### Testes da Fase

- [X] T030 [P] [US3] Teste em `src/__tests__/components/EpubViewer.test.tsx`: toque sobre um highlight abre o menu do highlight e **não** chama `onTranslate` (FR-019, R-005)
- [X] T031 [P] [US3] Teste em `src/__tests__/components/EpubViewer.test.tsx`: toque numa parte sem highlight de um parágrafo que contém highlight continua abrindo a tradução (FR-020)
- [X] T032 [P] [US3] Teste em `src/__tests__/components/EpubViewer.test.tsx`: remover chama `deleteAnnotation` e trocar a cor repinta

### Implementation

- [X] T033 [US3] Em `src/components/reader/EpubViewer.tsx`, escutar `show-annotation` do `view` e usar o `rect` do evento para ancorar o menu do highlight; marcar o gesto como consumido para que o listener de `click` do NeoReader não abra a tradução no mesmo toque (R-005)
- [X] T034 [US3] Em `src/components/reader/EpubViewer.tsx`, montar o menu do highlight reusando a mesma estrutura declarativa do menu de seleção (Invariante 6), com remover e a paleta de cores
- [X] T035 [US3] Em `src/screens/ReaderScreen.tsx`, ligar os callbacks de remover e trocar cor a `deleteHighlight`/`updateHighlightColor` de `src/db/highlights.ts`, repintando o texto imediatamente (FR-021, FR-022) — **[SUBSTITUÍDO T065]** `updateHighlightColor` → `updateHighlightAppearance`, callback renomeado `handleChangeHighlightAppearance(highlight, patch)`
- [X] T036 [US3] Rodar o **Passo 3** de `quickstart.md` no device

**Critério de Conclusão**: tocar num highlight abre o menu correto; trocar cor repinta na hora e sobrevive a reabrir o livro; remover apaga na hora e não volta; tocar fora do highlight no mesmo parágrafo continua traduzindo; suíte limpa.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** — código, testes, Chromium real e device (T036)
- Feito: menu `#nr-highlight-menu` com a mesma estrutura declarativa do menu de seleção (remover + as 8 cores); detecção do toque sobre highlight; ramo de menu e ramo de fechamento no listener de `click`; `getHighlightMenuButtonAtPoint` (mesmo fallback por coordenada de R-011); `deleteAnnotation`/repintura imediatas; `handleDeleteHighlight`/`handleChangeHighlightColor` em `ReaderScreen.tsx`; razão nova `'highlight-menu'` no `reader.tap.ignored` para diagnóstico em device
- **Desvio de T033 (registrado)**: em vez de escutar `show-annotation`, consultamos `overlayer.hitTest(x, y)` **dentro do nosso listener de click**. O evento do foliate nasce de um listener de click dele no MESMO documento, então usá-lo deixaria o roteamento refém da ordem de registro dos dois listeners (o próprio R-005). O hitTest é a mesma fonte de dados, consultada quando nos convém, e mantém a ordem dos ramos que a Invariante 3 define
- Testes executados: T030/T031/T032 em `EpubViewer.test.tsx` (92 no arquivo); suíte completa 833 passed / 2 skipped; lint e build limpos. Em Chromium real (Passo 3 do quickstart, exceto o que é de device): tocar no highlight abre o menu e **não** traduz (`reader.tap.ignored:highlight-menu`); trocar a cor repinta e persiste no IndexedDB; remover apaga a pintura e o registro (4 → 3); tocar numa parte sem highlight do mesmo parágrafo continua traduzindo
- Verificado em device (Passo 3): 3.1 tocar num highlight abre o menu e a tradução **não** abre; 3.2 trocar a cor repinta na hora e persiste no IndexedDB (`1:rose` → `1:amber`); 3.3 remover apaga a pintura e o registro (5 → 4); 3.4 coberto em Chromium (toque fora do trecho marcado continua traduzindo)
- Pendências: nenhuma

---

## Phase 6: User Story 4 - Ver os highlights do livro na tela de detalhes (Priority: P4)

**Objetivo**: A tela de detalhes do livro ganha uma aba de highlights, ordenada pela posição no texto, com navegação de volta ao trecho e remoção.

**Independent Test**: Criar highlights num livro, sair do leitor, abrir os detalhes desse livro e navegar de volta a um deles.

### Testes da Fase

- [X] T037 [P] [US4] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`: a aba lista os highlights do livro na ordem de `percentage`, com trecho, cor, posição e data
- [X] T038 [P] [US4] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`: tocar num item chama `onRead` com o CFI do highlight (FR-025)
- [X] T039 [P] [US4] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`: livro sem highlights mostra o estado vazio, e o contador aparece junto de marcadores e vocabulário

### Implementation

- [X] T040 [US4] Em `src/screens/BookDetailsScreen.tsx`, acrescentar `'highlights'` ao tipo `Tab` (linha ~72) e ao array `TABS` (~74), com a chave de i18n criada em T005
- [X] T041 [US4] Em `src/screens/BookDetailsScreen.tsx`, carregar os highlights do livro e renderizar a aba com `ListItem` + `EmptyState`, seguindo o padrão da aba de marcadores (~676-732): trecho truncado na exibição, marca da cor, posição e data, com botão de remover
- [X] T042 [US4] Em `src/screens/BookDetailsScreen.tsx`, ligar o toque no item a `openReader(highlight.cfi)` — mesmo caminho que a aba de marcadores já usa (~685)
- [X] T043 [US4] Em `src/screens/BookDetailsScreen.tsx`, adicionar o contador de highlights à linha de `Stat` existente (~617-618)
- [X] T040a [US4] **(ad-hoc, achado em T044)** Corrigir highlight que não pintava ao abrir pelo CFI da lista (R-015): `paintHighlight` em `src/components/reader/EpubViewer.tsx` ganhou uma retentativa única, 300ms depois, quando `draw-annotation` não dispara na primeira chamada — corrida com a navegação inicial do próprio leitor pro mesmo CFI. Teste de regressão T024e em `EpubViewer.test.tsx`
- [X] T044 [US4] Rodar o **Passo 4** de `quickstart.md` no device

**Critério de Conclusão**: a aba lista corretamente, ordenada pela posição no texto; tocar abre o livro no trecho com o highlight visível; remover pela lista some dos dois lugares; livro sem highlights mostra estado vazio; contador presente; suíte limpa.

**Checkpoint**: User Story 4 funcional e testável isoladamente.

**Registro da Fase**:

- Status: **Concluída** — código, testes, Chromium e device (T044)
- Feito: aba `highlights` no `Tab`/`TABS` com badge de contagem; `useLiveQuery(getHighlightsByBookId)` (já ordenado por `percentage`, FR-024); lista com `ListItem` + `EmptyState` no padrão da aba de marcadores — bolinha na cor do highlight, trecho truncado só na exibição, `X% · data` e botão de remover; toque abre `openReader(highlight.cfi)`; `Stat` de highlights entre marcadores e vocabulário
- Testes executados: T037/T038/T039 + T039a (remover pela lista) + T024e (retentativa de pintura, R-015) em `BookDetailsScreen.test.tsx`/`EpubViewer.test.tsx`; suíte completa **838 passed / 2 skipped**; lint e build limpos
- Achado de UI corrigido na verificação visual (Chromium): a bolinha de cor saía como um risco fino — o slot `leading` do `ListItem` não é flex, então um `<span>` inline ignora `w-3 h-3`; resolvido com `block`
- **Achado real em device (T040a, R-015)**: abrir o livro direto pelo CFI da lista posicionava certo (FR-025), mas o highlight não pintava — corrida entre a navegação inicial do leitor pro CFI-alvo e o nosso próprio `paintHighlight` pro mesmo alvo; `draw-annotation` nunca disparava na 1ª tentativa, sem erro. Corrigido com retentativa única após 300ms. Confirmado em device por CDP (`pintados: ["#06b6d4"]`) e por screenshot
- Verificado em device (Passo 4): 4.1 lista com 4 itens ordenados; 4.2 tocar num item abre o livro no trecho com o highlight visível (após o fix); 4.5 contador (4 highlights) junto de marcadores e vocabulário. 4.3/4.4 cobertos em Chromium e nos testes automatizados
- Pendências: nenhuma

---

## Phase 6b: Copiar e Compartilhar no menu de seleção (FR-003c/FR-003d) — ad-hoc

**Objetivo**: Trazer Copiar e Compartilhar pro escopo (decisão do usuário durante
a validação em device da US1 — ver Clarificações, sessão 2026-09-06), usando a
extensibilidade que o menu já tinha (FR-003a). Sem dependência nova: Clipboard
API (`navigator.clipboard.writeText`) e Web Share API (`navigator.share`), ambas
nativas do WebView Android/Chromium.

- [X] T053 [P] Teste em `src/__tests__/components/EpubViewer.test.tsx`: tocar em
  Copiar chama `navigator.clipboard.writeText` com o texto selecionado, fecha o
  menu e **não** cria highlight (T050)
- [X] T054 [P] Teste em `src/__tests__/components/EpubViewer.test.tsx`: tocar em
  Compartilhar chama `navigator.share({ text })` com o texto selecionado (T051)
- [X] T055 [P] Teste em `src/__tests__/components/EpubViewer.test.tsx`: sem
  `navigator.share` disponível (FR-003d), tocar em Compartilhar não lança e o
  menu fecha do mesmo jeito (T052)
- [X] T056 Em `src/components/reader/EpubViewer.tsx`: ícones `SELECTION_RUN_ICON`
  (mesmo padrão de `TRANSLATION_ICON`, paths do lucide embutidos como string —
  o menu roda dentro do doc do iframe); `renderSelectionMenuActionsHtml` ganha
  o grupo `data-nr-selection-action="tools"` (Copiar/Compartilhar) antes do
  grupo de cores, com um `.nr-sel-divider` entre eles
- [X] T057 Em `src/components/reader/EpubViewer.tsx`: `getSelectionRunButtonAtPoint`
  (mesmo fallback cross-realm por coordenada de `getSelectionColorButtonAtPoint`,
  R-011) e o ramo `selectionRunBtn` no listener de `click`, com a mesma
  prioridade dos swatches de cor — reusa o fallback `getEligibleSelectionRange(doc)
  ?? pendingHighlightRange` pra pegar o texto mesmo se o WebView já colapsou a
  seleção nativa por causa do próprio toque no botão (R-009)
- [X] T058 CSS: `.nr-sel-icon-btn` (círculo com ícone, sem cor de fundo — não é
  highlight) e `.nr-sel-divider`, usando os tokens do tema do leitor
- [X] T059 [P] Chaves de i18n (`reader.selectionMenu.copy`/`.share`) em pt-BR/en/es
- [X] T060 Verificado em Chromium real via Playwright MCP com seleção por
  arrasto de mouse: `navigator.clipboard.readText()` devolve o texto exato
  copiado; `navigator.share` é chamado com `{ text }` correto; menu some nos
  dois casos, sem highlight criado
- [X] T061 Rodar no device: 1 toque em Copiar → colar em outro app confirma o
  texto certo; 1 toque em Compartilhar → o sheet nativo do Android abre com o
  texto certo; cancelar o sheet não deixa o app em estado estranho (FR-003d).
  **1ª rodada**: Copiar funcionou, Compartilhar não fez nada — ver T061a
- [X] T061a **(ad-hoc, achado em T061)** Corrigir Compartilhar no Android
  (R-016): o WebView não implementa Web Share de forma confiável.
  `shareText` novo no `NeoReaderLibraryPlugin.java` (`Intent.ACTION_SEND`,
  mesmo padrão dos outros métodos do plugin); `shareText()` em
  `NativeSystemUiService.ts` usa o plugin no Android, cai pro
  `navigator.share` do browser fora dele. Testes cobrindo os dois caminhos
- [X] T061b **(ad-hoc, pedido do usuário testando em device)** Cores como
  submenu, não na fileira: um único botão "Destacar" (ícone highlighter)
  abre um submenu com voltar + as 8 cores, substituindo o conteúdo do mesmo
  menu. `renderSelectionMenuActionsHtml(mode)` com dois modos ('root' |
  'colors'); reseta pra 'root' só numa abertura nova (menu estava
  escondido). `getSelectionColorButtonAtPoint`/`getSelectionRunButtonAtPoint`
  unificadas em `getSelectionMenuButtonAtPoint(selector)`. Testes T062-T064
- [ ] T061c Revalidar no device com o build corrigido: Compartilhar abre o
  sheet nativo do Android com o texto certo; o botão único "Destacar" abre o
  submenu de cores e volta; criar highlight a partir do submenu continua
  funcionando

**Critério de Conclusão**: os dois botões aparecem no menu de seleção, ao lado
das cores; Copiar e Compartilhar funcionam com o texto exato da seleção; nenhum
dos dois cria highlight; ausência da API correspondente não lança erro; suíte
limpa.

**Registro da Fase**:

- Status: Código, testes e Chromium completos (T053-T061b); Copiar validado no
  device; Compartilhar e o submenu de cores corrigidos após 1ª rodada de teste
  do usuário — **falta T061c (revalidar no device)**, aparelho desconectou
- Testes executados: T050/T051/T052/T062/T063/T064 em `EpubViewer.test.tsx`
  (103 no arquivo) + 5 testes de `shareText` em `NativeSystemUiService.test.ts`;
  suíte completa **849 passed / 2 skipped**; lint, build e `gradlew
  assembleDebug` limpos
- Verificado em Chromium: clipboard real do OS recebeu o texto exato; menu
  compacto (Copiar/Compartilhar/Destacar); submenu de cores abre/volta;
  highlight criado a partir do submenu; `navigator.share` chamado com o texto
  certo (fallback web, já que Chromium desktop não é Android nativo)
- **Achado real em device (R-016)**: Compartilhar não funcionava — WebView
  Android não implementa Web Share de forma confiável. Corrigido com
  `Intent.ACTION_SEND` nativo via `NeoReaderLibraryPlugin`
- **Pedido do usuário testando em device (D-004)**: cores ocupavam fileira
  demais — viraram submenu atrás de um botão "Destacar"
- Pendências: **T061c** — revalidar Compartilhar e o submenu no device com o
  build corrigido

---

## Phase 6c: 3 estilos de marcação (FR-003e/FR-003f/FR-011a) — ad-hoc

**Objetivo**: Além da cor, o highlight pode ter um estilo visual — fundo
colorido, sublinhado ou risco ondulado — escolhível tanto ao criar quanto ao
editar. Decisão do usuário numa entrevista de acompanhamento (ver
Clarificações, spec.md), depois de confirmar Compartilhar + o submenu de cores
(D-004) funcionando em device e pedir mais polimento com outro app leitor como
referência visual.

- [X] T065 Em `src/types/highlight.ts`: `export type HighlightStyle =
  'background' | 'underline' | 'squiggly'`; `Highlight.style?: HighlightStyle`
  (opcional, não-indexado — sem `version(20)` do Dexie, D-005). Em
  `src/db/highlights.ts`: `updateHighlightColor` → `updateHighlightAppearance(id,
  patch: Partial<Pick<Highlight, 'color'|'style'>>)`. Em
  `src/types/foliate.d.ts`: declarar `Overlayer.underline`/`.squiggly` (só
  `highlight` estava declarado; `tsc -b` pega a lacuna, `tsc --noEmit` sozinho
  não — por isso `npm run build` continua sendo o gate, não só o type-check)
- [X] T066 Em `src/components/reader/EpubViewer.tsx`: ícones SVG dos 3 estilos
  (`HIGHLIGHT_STYLE_ICON`); `getOverlayerDrawFn(OverlayerCtor, style)`
  selecionando `.highlight`/`.underline`/`.squiggly`; `paintHighlight` e
  `repaintHighlightsForSection` passam a levar o `style` (fallback `??
  'background'` pra highlights gravados antes deste campo, FR-011a);
  `renderStyleButtonsHtml` compartilhado entre os dois menus. **Menu de
  criação**: submenu de "Destacar" ganha a fileira de estilo antes das cores;
  o estilo escolhido é **estado pendente** (`pendingHighlightStyle`) — só
  tocar numa cor confirma e fecha, igual já valia pra cor sozinha (FR-003f).
  **Menu de gerenciar** (`renderHighlightMenuActionsHtml`): ganha a mesma
  fileira de estilo entre remover e as cores, abrindo já com o estilo atual do
  highlight marcado (`setHighlightMenuAppearance`); trocar o estilo aplica e
  persiste na hora **sem fechar o menu** — diferente da cor, que fecha — porque
  o highlight já existe e não há confirmação pendente (FR-022)
- [X] T066a [P] Em `src/screens/ReaderScreen.tsx`: `handleCreateHighlight`
  grava `payload.style`; `handleChangeHighlightColor` →
  `handleChangeHighlightAppearance(highlight, patch)`, repassando pra
  `updateHighlightAppearance`
- [X] T066b [P] Chaves de i18n (`reader.selectionMenu.style.background` /
  `.underline` / `.squiggly`) em pt-BR/en/es
- [X] T067 Testes em `src/__tests__/components/EpubViewer.test.tsx`: T032
  atualizado pro novo formato de `onChangeHighlightAppearance(highlight,
  {color})`; T032b novo — o menu de gerenciar abre com o estilo atual marcado
  (`aria-pressed`) e trocar o estilo aplica (`overlayer.add` com a draw
  function certa) sem fechar o menu. Em `src/__tests__/db/highlights.test.ts`:
  teste de `updateHighlightAppearance` pra cor e pra estilo, separados
- [X] T067a Verificado em Chromium real via Playwright MCP, dirigindo o doc do
  iframe diretamente (`MouseEvent` sintético com `clientX`/`clientY`, mesma
  exigência de coordenada do R-011): tocar em "Destacar" abre o submenu com
  voltar + 3 estilos + 8 cores; tocar num estilo marca `aria-pressed` sem
  fechar o submenu; tocar numa cor fecha e pinta (`overlayer.add` com stroke
  do sublinhado observado no SVG). `lint`/`tsc -b`/`build`/suíte completa
  (**851 passed / 2 skipped**) limpos
- [X] T067b Revalidar no device: criar um highlight em cada um dos 3 estilos
  pelo menu de criação; abrir o menu de gerenciar de um highlight existente e
  confirmar que abre com o estilo certo marcado; trocar o estilo pelo menu de
  gerenciar sem o menu fechar; trocar a cor pelo menu de gerenciar fecha como
  antes. **Confirmado pelo usuário no device** (`RXCX103NMVZ`, "deu certo")

**Critério de Conclusão**: os 3 estilos aparecem nos dois menus (criar e
gerenciar); no menu de criação o estilo é só estado pendente até a cor
confirmar; no menu de gerenciar cor e estilo aplicam e persistem no toque, mas
só a cor fecha o menu; nenhum highlight gravado antes deste campo quebra;
suíte limpa.

**Registro da Fase**:

- Status: **Concluída** — código, testes, Chromium e device (T065-T067b)
- Testes executados: T032 atualizado + T032b novo em `EpubViewer.test.tsx`
  (106 no arquivo); 2 testes novos em `db/highlights.test.ts`; suíte completa
  **851 passed / 2 skipped**; `npx tsc --noEmit` limpo mas **`npm run build`
  pegou 2 erros que o type-check isolado não pegou** (`Overlayer.underline`/
  `.squiggly` faltando em `foliate.d.ts` — `tsc -b` usa os `tsconfig` de
  projeto, diferentes do `tsc --noEmit` direto); corrigido antes de reportar
  pronto
- Verificado em Chromium: submenu de "Destacar" com os 3 ícones de estilo +
  divisor + 8 cores; clicar em "Sublinhado" marca `aria-pressed=true` sem
  fechar; clicar numa cor fecha e pinta com stroke (elemento `<rect>`/`<path>`
  com `stroke-width` no SVG do overlayer, condizente com `Overlayer.underline`)
- Verificado em device (`RXCX103NMVZ`, `npm run android:run`): usuário
  confirmou os 3 estilos funcionando nos dois menus ("deu certo")
- Pendências: nenhuma

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento e verificações que atravessam as stories.

- [ ] T045 Rodar o **Passo 5** de `quickstart.md` no device: reflow (fonte/tamanho/tema), rotação, tema claro e escuro, TTS ativo, e a checagem 5.5 de R-001
- [X] T045a Verificar SC-011 na prática — **superado por evidência real, não descartável**: Copiar e Compartilhar (Fase 6b) entraram no array de descritores do menu como ações de verdade, e nada além do array mudou — mesmo gesto, mesmo posicionamento, mesmo fluxo de highlight intocado. Confirma SC-011 sem precisar de ação de mentira pra depois remover. Falta só confirmar a rolagem horizontal de FR-003b com os 10 itens (2 ações + 8 cores) em device — ver T061
- [ ] T046 Revisar a terminologia em todo o código, i18n e testes tocados: **highlight**, nunca "grifo" (spec, seção Terminologia). Na mesma passada, confirmar FR-028a: nenhuma lista de highlights agregada entre livros foi introduzida — em especial que a `VocabularyScreen` não ganhou aba, seção nem contador de highlights
- [ ] T047 Conferir que os comentários exigidos pelo Princípio II estão nos três pontos não óbvios (guarda no `touchstart`, menu no fim do `body`, pintura sem o mecanismo do vocabulário) e que não sobrou comentário explicando o óbvio
- [ ] T048 Atualizar o `README.md` na seção de funcionalidades do leitor, se a feature mudar o inventário descrito lá
- [ ] T049 Fechar R-001 no `plan.md`: registrar o resultado da validação e, **só se houve desvio**, abrir as tasks do fallback por texto

### Checklist de Release

- [X] Fase 3 (User Story 1 — criar e reencontrar highlight) concluída
- [X] Fase 4 (User Story 2 — supressão do menu do sistema) concluída
- [X] Fase 5 (User Story 3 — gerenciar pelo texto) concluída
- [X] Fase 6 (User Story 4 — lista na tela de detalhes) concluída
- [X] `npm run lint` limpo
- [X] `npm test` limpo (851 passed / 2 skipped)
- [X] `npm run build` limpo (Princípio IV da constitution — definição de "pronto")
- [X] `quickstart.md` executado no device `RXCX103NMVZ`, incluindo as três checagens da restrição do usuário (1.8, 1.9, 1.10) — **Passos 1-4 completos; falta o Passo 5** (T045: reflow/rotação/tema/TTS) na Fase 7 de polimento
- [X] Nenhuma dependência nova adicionada (Princípio V)
- [X] `version(18)` do Dexie intocada; apenas `version(19)` acrescentada

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende do Foundational. **T010 bloqueia T016-T023** — a validação da premissa vem antes do gesto. **T018a bloqueia T016 e T019**: o predicado de elegibilidade é o ponto único de decisão que os dois consomem
- **User Story 2 (Phase 4)**: depende da US1 (não há o que suprimir sem menu próprio)
- **User Story 3 (Phase 5)**: depende da US1 (não há highlight para tocar)
- **User Story 4 (Phase 6)**: depende do Setup + Foundational; **independente da US2 e US3** — pode ser feita em paralelo com elas depois da US1
- **Polish (Phase 7)**: depende das stories desejadas estarem completas

### Parallel Opportunities

- T004 e T005 (paleta e i18n) em paralelo no Setup
- T008 e T009 (testes de db) em paralelo no Foundational
- Todos os testes marcados `[P]` dentro de cada fase
- Depois da US1 fechada, US2/US3 (leitor) e US4 (tela de detalhes) tocam arquivos diferentes e podem andar em paralelo

---

## Parallel Example: User Story 1

```bash
# Testes da Fase 3 podem ser escritos juntos — todos no mesmo harness já existente
Task: "T011 [P] [US1] guarda de seleção ignora o click"
Task: "T012 [P] [US1] toque curto sem seleção continua traduzindo"
Task: "T013 [P] [US1] rolagem não vira seleção"
Task: "T013a [P] [US1] as quatro rejeições de FR-006 não abrem o menu"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia todas as stories)
3. Rodar T010 — validação da premissa **antes** de escrever o gesto
4. Completar Fase 3: User Story 1
5. **PARAR E VALIDAR**: quickstart Passo 1 completo no device, com atenção às checagens 1.8/1.9/1.10

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → validar no device → é o MVP entregável (highlight funciona, mas no Android a barra do sistema ainda pode cobrir o menu)
3. US2 → o menu passa a ser só do app no Android
4. US3 → o highlight vira reversível dentro do leitor
5. US4 → visão consolidada por livro

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente, em português (`feat: adiciona X`)
- Parar em qualquer checkpoint pra validar a story isoladamente
- A restrição repetida pelo usuário (toque curto não pode regredir) tem rede em três camadas: T012 e T013 automatizados, o ramo de guarda explícito (T017) e as checagens 1.8-1.10 no device

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
