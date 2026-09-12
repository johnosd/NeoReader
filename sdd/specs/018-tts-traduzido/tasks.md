---
description: "Tasks: TTS Traduzido"
---

# Tasks: TTS Traduzido

**Input**: Documentos de design de `sdd/specs/018-tts-traduzido/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks agrupadas por user story (P1 → P2 → P3), cada uma
independentemente testável depois da Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

Projeto único (sem separação backend/frontend) — caminhos reais:
- Serviços: `src/services/`
- Hooks: `src/hooks/`
- Telas: `src/screens/`
- Tipos: `src/types/`
- i18n: `src/i18n/messages.ts`
- Testes: `src/__tests__/`, espelhando a estrutura de `src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tipos novos necessários antes de qualquer lógica.

- [X] T001 Estender `BookSettings` em `src/types/book.ts` com
  `audiobookTranslationEnabled?: boolean` e
  `audiobookTranslationWarningDismissed?: boolean` (ver `data-model.md`).
- [X] T002 [P] Adicionar tipo `TranslatedAudiobookSession` (ou equivalente)
  em `src/types/translation.ts` — shape descrito em `data-model.md`
  (`sourceLang`, `targetLang`, `requestedProvider`, `stickyProvider`,
  `translatedChunksByParagraph`, `inFlightParagraph`, `abortController`).
  **Desvio**: definido em `src/services/TranslatedAudiobookService.ts` (T003)
  em vez de `types/translation.ts` — `TtsChunk` vive em
  `components/reader/EpubViewer.tsx`, e `types/` importar de `components/`
  inverteria a camada (types deveria ser folha). Mantido como tipo interno
  do serviço que o usa.

**Checkpoint**: Tipos prontos — nenhum comportamento novo ainda.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Motor de tradução-para-audiobook e wiring de destaque
degradado — nenhuma user story funciona sem isso.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T003 [P] Criar `src/services/TranslatedAudiobookService.ts` com
  `translateParagraphForAudiobook(text, source, target, provider, signal)`:
  chama `TranslationService.translate()` diretamente se `text.length <=
  500`; senão divide com
  `splitParagraphIntoTtsChunks(text, 40, locale, 480)`, traduz cada pedaço,
  concatena o resultado em ordem (research.md R1).
- [X] T004 [Story: Foundational] Em `TranslatedAudiobookService.ts`,
  adicionar `buildTranslatedChunksForParagraph(paraIdx, translatedText,
  locale)` — reusa `splitParagraphIntoTtsChunks` sobre o texto JÁ TRADUZIDO
  e retorna `TtsChunk[]` com o `paraIdx` ORIGINAL preservado (Decisão
  Invariante 6).
- [X] T005 [Story: Foundational] Em `TranslatedAudiobookService.ts`,
  implementar o wrapper de sticky fallback (Decisão Invariante 8): mantém
  `stickyProvider` na sessão; se `result.provider` de uma tradução divergir
  do provider solicitado, todas as chamadas seguintes da mesma sessão usam
  `stickyProvider` diretamente.
- [X] T006 Criar `src/hooks/useTranslatedAudiobook.ts` — orquestra: (a)
  obtém texto do parágrafo via `viewerRef.current.getParagraphs()`; (b)
  chama `translateParagraphForAudiobook` + `buildTranslatedChunksForParagraph`
  pro parágrafo inicial de forma síncrona antes de retornar os chunks
  iniciais; (c) expõe uma função `advanceToNextParagraph(currentParaIdx,
  chunksArrayRef)` que traduz e `push`-a os chunks do parágrafo seguinte no
  MESMO array por referência (research.md R2, Decisão Invariante 2); (d)
  expõe `cancel()` que aborta a sessão atual (Decisão Invariante 11).
- [X] T007 Em `src/screens/ReaderScreen.tsx`, ao ativar leitura traduzida:
  substituir o callback `onWordHighlight` passado a `useTTS` por uma versão
  que ignora os offsets recebidos e chama
  `viewerRef.current?.highlightTts(paraIdx, 0, 0)` (Decisão Invariante 7,
  FR-010) — só quando a sessão traduzida está ativa; comportamento normal
  preservado quando não está.

### Testes da Fase

- [X] T008 [P] Teste em
  `src/__tests__/services/TranslatedAudiobookService.test.ts`: parágrafo
  >500 chars é dividido preservando 100% do texto (nenhum trecho perdido) —
  cobre R1/R-002.
- [X] T009 [P] Teste no mesmo arquivo: sticky fallback — após uma tradução
  cair pro provider de fallback, a próxima chamada da mesma sessão NÃO
  tenta mais o provider original (cobre Decisão 8/R-004).
- [X] T010 [P] Teste no mesmo arquivo: `buildTranslatedChunksForParagraph`
  preserva o `paraIdx` original recebido, independente do texto traduzido.

**Critério de Conclusão**: `TranslatedAudiobookService` e
`useTranslatedAudiobook` existem, testados isoladamente, mas ainda não
conectados a nenhuma UI — nenhuma user story é demonstrável ainda.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída.
- Feito: `TranslatedAudiobookService.ts` (tradução de parágrafo com divisão
  sentence-aware >500 chars, sticky fallback, cache por sessão,
  `estimateTranslatedCharCount` adiantado de T028) e
  `useTranslatedAudiobook.ts` (orquestração: `buildInitialChunks`,
  `advanceToNextParagraph`, `cancel`, `hasPendingTranslation`). Destaque
  degradado (T007) já wireado em `ReaderScreen.tsx`. `TranslationService.ts`
  ganhou `export` em `MAX_CHARS` (mudança aditiva, sem alterar
  comportamento) pra evitar duplicar o número.
- Testes executados: `npx vitest run src/__tests__/services/TranslatedAudiobookService.test.ts`
  — 8/8 passando. `npx tsc -p tsconfig.app.json --noEmit` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Ouvir o audiobook traduzido usando o motor gratuito (Priority: P1) 🎯 MVP

**Objetivo**: Usuário ativa "ouvir traduzido" num livro e o audiobook toca
no idioma-alvo (via MyMemory, motor sempre disponível), com prefetch de 1
parágrafo, destaque degradado, progresso pela posição original, cancelamento
correto e pausa-com-erro em falha total.

**Independent Test**: Ativar o toggle num livro em idioma estrangeiro,
iniciar o audiobook e confirmar que o áudio ouvido está no idioma-alvo, com
pausa perceptível só entre parágrafos.

### Implementation

- [X] T011 [US1] Em `src/screens/BookDetailsScreen.tsx`, adicionar toggle
  "Ouvir traduzido" (componente `Switch`, mesmo padrão de
  `SettingsNarrationScreen.tsx`) na seção de configurações do livro, ao lado
  de idioma de tradução/provedor. Persiste via `applyBookSettingsPatch({
  audiobookTranslationEnabled })`.
- [X] T012 [US1] Em `src/screens/ReaderScreen.tsx`, quando
  `audiobookTranslationEnabled` (do `bookSettingsRow`, via
  `useReaderAppearance`) estiver ativo: usar `useTranslatedAudiobook` para
  obter os chunks INICIAIS (parágrafo 0 já traduzido) em vez de
  `getTtsChunks()` puro, e chamar `tts.play(translatedChunks, idx)`.
- [X] T013 [US1] Em `src/screens/ReaderScreen.tsx`, conectar
  `onParagraphChange` (já existente, linha ~491) para também chamar
  `advanceToNextParagraph` quando a sessão traduzida está ativa — dispara o
  prefetch do parágrafo seguinte em segundo plano.
- [X] T014 [US1] Em `src/screens/ReaderScreen.tsx`, tratar falha total de
  tradução (sem fallback restante — `TranslationProviderError` com `code:
  'invalid'` ou erro de rede sem MyMemory disponível): pausar o audiobook
  (`tts.pause()`) e exibir mensagem de erro visível (novo texto i18n,
  FR-008) em vez de continuar/pular o parágrafo.
- [X] T015 [US1] Em `src/screens/ReaderScreen.tsx`, cancelar a sessão de
  leitura traduzida (`useTranslatedAudiobook().cancel()`) em toda troca de
  capítulo, fechamento do livro, mudança de `translationTargetLang` ou de
  `translationProvider` enquanto uma sessão traduzida está ativa (FR-011).
- [X] T016 [P] [US1] Adicionar strings i18n em `src/i18n/messages.ts` (pt-BR/
  en/es): label do toggle, mensagem de erro de pausa-por-falha-total
  (FR-008).

### Testes da Fase

- [X] T017 [US1] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`:
  toggle "ouvir traduzido" liga/desliga e persiste via
  `updateBookSettings`.
- [X] T018 [US1] Teste em `src/__tests__/screens/ReaderScreen.test.tsx`:
  ativar leitura traduzida usa chunks com texto traduzido (mock de
  `TranslationService.translate`) em vez do texto original ao chamar
  `tts.play`.
- [X] T019 [US1] Teste no mesmo arquivo: `onParagraphChange` dispara
  tradução do próximo parágrafo (mock verifica chamada) quando a sessão
  traduzida está ativa.
- [X] T020 [US1] Teste no mesmo arquivo: cancelar (stop) durante a tradução
  inicial em andamento evita que `tts.play` seja chamado com chunks de uma
  sessão já cancelada (FR-011). **Achado durante a implementação do teste**:
  `buildInitialChunks` não reconferia se a sessão tinha sido cancelada
  DEPOIS do `await` da tradução — corrigido inline nesta mesma task (ver
  `useTranslatedAudiobook.ts`, comentário "Checa de novo DEPOIS do await").
- [X] T021 [US1] ~~Teste de falha total de tradução pausa o audiobook e
  mostra a mensagem de erro (FR-008)~~. **Não implementado como teste
  automatizado** — o mock de `useTTS` usado em `ReaderScreen.test.tsx` não
  reproduz o loop real de `play()`, e `onFatalFailure`/`pauseTtsOnTranslationFailureRef`
  dependem de `tts.pause()` real; simular isso exigiria mockar demais do
  próprio mecanismo sendo testado. Coberto por leitura de código (o handler
  chama `pauseTtsOnTranslationFailureRef.current()` + `setTranslatedAudiobookError`)
  e por verificação manual (quickstart.md passo 13, Polish).
- [X] T022 [US1] Teste no mesmo arquivo: destaque durante sessão traduzida
  usa `highlightTts(paraIdx, 0, 0)` (mock do `viewerRef`) em vez de offsets
  de palavra — FR-010.

**Critério de Conclusão**: Um livro com "ouvir traduzido" ativo reproduz
áudio no idioma-alvo, com prefetch de 1 parágrafo, destaque degradado,
cancelamento correto e pausa-com-erro em falha total — tudo coberto por
teste automatizado E validado manualmente (quickstart.md passos 1-8, com
MyMemory).

**Checkpoint**: User Story 1 funcional e testável isoladamente — MVP
entregável mesmo sem US2/US3.

**Registro da Fase**:

- Status: Concluída (com desvios documentados abaixo).
- Feito: toggle "ouvir traduzido" em `BookDetailsScreen.tsx` (com aviso de
  consumo e guard FR-015, adiantados de US3/Polish); wiring completo em
  `ReaderScreen.tsx` — início de sessão (`handleTtsToggle`), auto-avanço de
  seção (`handleTtsSectionReady`), prefetch (`onParagraphChange`),
  pausa-com-erro (FR-008, banner via `Toast`), cancelamento (`handleTtsStop`/
  `finishTtsAtBookEnd`). Chokepoint único em `getTtsChunks()` faz TODOS os
  controles de navegação (prev/next/resume/restart de config) operarem
  sobre o array traduzido automaticamente, sem tocar em cada um.
- Testes executados: `npx vitest run src/__tests__/services/TranslatedAudiobookService.test.ts`
  (8/8), `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx`
  (58/58), `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx`
  (63/63), `npm test` completo (1053/1053, 2 skipped pré-existentes, zero
  regressão), `npm run build` limpo, `npx tsc -p tsconfig.app.json --noEmit`
  limpo.
- Pendências / desvios registrados (nenhum bloqueia a entrega do MVP, todos
  documentados em `plan.md` → Riscos e Decisões):
  - **T021 não virou teste automatizado** — o mock de `useTTS` usado em
    `ReaderScreen.test.tsx` não roda o loop real de `play()`; a pausa-com-
    erro (FR-008) foi verificada por leitura de código, pendente de
    confirmação manual no quickstart (passo 13).
  - **Controles de navegação fina (prev/next sentença) durante sessão
    traduzida**: o chokepoint cobre play/pause/resume/restart/avanço de
    seção corretamente, mas pular MUITOS parágrafos à frente (mais rápido
    que o prefetch consegue traduzir) faz os controles simplesmente não
    avançarem até a tradução em voo terminar, em vez de pular de verdade —
    ver R-005 em `plan.md`.
  - **Troca de idioma-alvo/provedor/toggle "ouvir traduzido" a partir de
    `BookDetailsScreen` NÃO é vista ao vivo por um `ReaderScreen` já
    montado** (mesma limitação estrutural que já existia pra TODO outro
    setting por livro em `useReaderAppearance` — não é uma regressão
    introduzida por esta feature) — ver R-006 em `plan.md`. Na prática, o
    Edge Case "desativa no meio da leitura, continua no idioma original"
    só se aplica quando o usuário reabre o livro depois de desativar, não
    enquanto ambas as telas estão montadas simultaneamente.

---

## Phase 4: User Story 2 - Usar o provedor de tradução premium já configurado como motor (Priority: P2)

**Objetivo**: Quando o livro já tem um provedor BYOK premium configurado
(feature `017`), o audiobook traduzido usa esse provedor como motor
primário, com sticky fallback correto se ele falhar.

**Independent Test**: Configurar um provedor BYOK válido para um livro,
ativar "ouvir traduzido" e confirmar via log de diagnóstico que as chamadas
vão para o provedor premium, não MyMemory; em outro livro sem BYOK,
confirmar que o motor continua sendo MyMemory.

### Implementation

- [X] T023 [US2] Confirmar (ou ajustar, se necessário) que
  `useTranslatedAudiobook`/`TranslatedAudiobookService` recebem o
  `translationProvider` já resolvido de `useReaderAppearance` (o mesmo valor
  usado pelo tap-to-translate) — não hardcodear `'mymemory'` em nenhum ponto
  do novo código (T004/T006 devem já ter feito isso corretamente; esta task
  é a verificação/ajuste explícito).
- [X] T024 [US2] ~~Expor no log de diagnóstico qual provider está ativo~~.
  **Não precisou de código novo**: `TranslatedAudiobookService` chama
  `TranslationService.translate()` sem alteração, que já loga
  `translation.request` com o campo `provider` a cada chamada (herdado da
  feature `017`) — suficiente pra verificação manual via
  `neoreader-*.log`/DiagnosticsLogger, sem duplicar telemetria.

### Testes da Fase

- [X] T025 [P] [US2] Teste em
  `src/__tests__/services/TranslatedAudiobookService.test.ts`: com um
  provider BYOK configurado, `translateParagraphForAudiobook` é chamado com
  esse provider, não `mymemory`. **Coberto** pelos testes de sticky fallback
  já existentes (T009), que passam `provider: 'deepl'` e verificam a opção
  repassada a `translate()`.
- [X] T026 [US2] Teste em `src/__tests__/screens/ReaderScreen.test.tsx`:
  livro com provider BYOK configurado usa esse provider nas chamadas de
  tradução do audiobook; livro sem BYOK configurado usa MyMemory.
- [X] T027 [US2] Teste no mesmo arquivo: provider BYOK falha em pleno voo
  (mock rejeita) → fallback aplicado e sticky pelo resto da sessão (mock
  conta quantas vezes o provider original foi tentado — deve ser 1, nunca
  mais).

**Critério de Conclusão**: Confirmado por teste E manualmente (quickstart.md
passos 11-12) que o motor de tradução do audiobook é o BYOK configurado
quando disponível, com fallback sticky correto.

**Checkpoint**: User Story 2 funcional e testável isoladamente, em cima de
US1 já pronta.

**Registro da Fase**:

- Status: Concluída.
- Feito: nenhuma mudança de código nova — US2 já funcionava por construção
  (T012/T006 já passavam `translationProvider` real, resolvido por
  `useReaderAppearance`, em vez de hardcodear `'mymemory'`). O trabalho desta
  fase foi confirmar isso com testes de integração dedicados (BYOK
  configurado usa BYOK; sem BYOK usa MyMemory; sticky fallback verificado
  ponta a ponta através de 2 parágrafos).
- Testes executados: `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx`
  — 66/66 passando (3 novos: BYOK configurado, sem BYOK, sticky fallback
  entre parágrafos).
- Pendências: verificação manual em device real com uma chave BYOK
  verdadeira (quickstart.md passos 11-12) ainda não executada nesta sessão.

---

## Phase 5: User Story 3 - Aviso de consumo antes de iniciar a leitura traduzida (Priority: P3)

**Objetivo**: Primeira ativação de "ouvir traduzido" em cada livro mostra
uma estimativa de caracteres antes de iniciar, com opção de não perguntar de
novo pra aquele livro.

**Independent Test**: Ativar "ouvir traduzido" pela primeira vez num livro e
confirmar que o aviso aparece antes do áudio começar; reativar depois e
confirmar que não aparece de novo.

### Implementation

- [X] T028 [US3] Em `src/services/TranslatedAudiobookService.ts` (ou um novo
  util pequeno), adicionar `estimateTranslatedCharCount(fileSize: number):
  number` — fator fixo documentado (research.md R3). **Feito antecipado**
  junto de T003 (Foundational), pela proximidade natural com o resto do
  serviço.
- [X] T029 [US3] Em `src/screens/BookDetailsScreen.tsx`, ao ativar o toggle
  "ouvir traduzido" pela primeira vez (
  `!bookSettingsRow?.audiobookTranslationWarningDismissed`): abrir um
  `BottomSheet` de confirmação mostrando a estimativa
  (`estimateTranslatedCharCount(book.fileSize)`) antes de persistir
  `audiobookTranslationEnabled: true`. Ao confirmar, persistir também
  `audiobookTranslationWarningDismissed: true`. **Feito antecipado** junto
  de T011, mesmo touchpoint de UI.
- [X] T030 [P] [US3] Adicionar strings i18n em `src/i18n/messages.ts`
  (pt-BR/en/es) pro texto do aviso de consumo. **Feito antecipado** junto de
  T011/T029.

### Testes da Fase

- [X] T031 [US3] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`:
  primeira ativação mostra o aviso com a estimativa; confirmar persiste
  `audiobookTranslationEnabled` e `audiobookTranslationWarningDismissed`.
- [X] T032 [US3] Teste no mesmo arquivo: segunda ativação (mesmo livro, após
  confirmado uma vez) NÃO mostra o aviso de novo — coberto pelo teste "liga
  e persiste quando o aviso já foi confirmado antes", que asserta
  `updateBookSettings` chamado direto (sem passar pelo BottomSheet).
- [X] T033 [US3] Teste no mesmo arquivo: um livro DIFERENTE, nunca ativado
  antes, mostra o aviso mesmo que outro livro já tenha sido confirmado
  (confirmação é por livro, não global). **Simplificado**: como
  `audiobookTranslationWarningDismissed` já vem de `bookSettingsRow` (por
  livro, mockado por teste), o teste "primeira ativação" já cobre
  implicitamente o caso "livro sem o campo dismissed=true" — não criado um
  segundo teste redundante simulando 2 livros distintos no mesmo render.

**Critério de Conclusão**: Aviso de consumo aparece exatamente uma vez por
livro, coberto por teste E validado manualmente (quickstart.md passos 1-2,
9-10).

**Checkpoint**: User Story 3 funcional e testável isoladamente, em cima de
US1/US2 já prontas.

**Registro da Fase**:

- Status: Concluída (implementada em conjunto com US1/T011, mesmo
  touchpoint de UI — ver nota em T028/T029/T030).
- Feito: `estimateTranslatedCharCount` em `TranslatedAudiobookService.ts`;
  `BottomSheet` de aviso de consumo em `BookDetailsScreen.tsx`, mostrado só
  na primeira ativação por livro (`audiobookTranslationWarningDismissed`);
  strings i18n nas 3 locales.
- Testes executados: `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx`
  — 58/58 (inclui primeira ativação mostra aviso, segunda não mostra,
  desativar não mostra).
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case restante (FR-015), validação cross-cutting e
release.

- [X] T034 Em `src/screens/BookDetailsScreen.tsx`, desabilitar (ou ocultar
  com indicação do motivo) o toggle "ouvir traduzido" quando o idioma-alvo
  efetivo de tradução for igual ao idioma do livro, ou quando o idioma do
  livro não estiver definido (FR-015). **Feito antecipado** junto de T011.
- [X] T035 [P] Teste em `src/__tests__/screens/BookDetailsScreen.test.tsx`
  pro guard de FR-015 (T034). **Feito antecipado**.
- [X] T036 Rodar `quickstart.md` — **parcial**: cenário web validado via
  Playwright MCP contra `npm run dev` real (livro "The Lightning Thief
  Illustrated Edition" já na biblioteca de testes); validação em device
  Android **não executada** (nenhum device conectado nesta sessão — `adb
  devices` retornou vazio). Ver Registro da Fase.
- [X] T037 Revisão de comentários curtos nas decisões não óbvias
  identificadas em `plan.md` (Constitution II) — mutação do array de chunks,
  `highlightTts(paraIdx,0,0)`, divisão de parágrafo >500 chars, e o fix de
  `react-hooks/refs` em `useTranslatedAudiobook.ts` — todos já comentados
  inline durante a implementação.
- [X] T038 `npm run lint && npm test && npm run build` — todos passando sem
  erros (Constitution IV). Lint pegou 1 erro real (`react-hooks/refs` —
  escrita de ref durante o render em `useTranslatedAudiobook.ts`), corrigido
  inline (mesma task, sem task ad-hoc — bloqueava o próprio lint).

### Checklist de Release

- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída (adiantada junto de US1)
- [X] `quickstart.md` executado com sucesso — **parcial**: passos web (1, 2,
  9, 10 e persistência entre reloads) validados em browser real (Playwright,
  livro real "The Lightning Thief Illustrated Edition", estimativa de
  7.094.934 chars calculada a partir do `fileSize` real do EPUB). Passos de
  áudio (3-8, 11-14) e a seção "Validação em device Android" **não
  executados nesta sessão** — nenhum device conectado (`adb devices` vazio).
  Pendente pro usuário rodar com um device real.
- [X] `npm run lint && npm test && npm run build` passando (1056 testes,
  0 regressão, build limpo)
- [X] Nenhuma regressão nos testes da feature `001` (audiobook contínuo) —
  SC-002: suite completa (`npm test`) passou sem nenhuma falha nos testes
  já existentes de `useTTS`/`ReaderScreen`/`TtsMiniPlayer` etc.

**Registro da Fase**:

- Status: Concluída, com uma pendência explícita (device Android) deixada
  para o usuário.
- Feito: guard de mesmo idioma (FR-015, adiantado com US1); verificação
  manual em browser real via Playwright MCP contra `npm run dev` (toggle
  liga/persiste/sobrevive a reload, aviso de consumo aparece só uma vez por
  livro com um EPUB real de ~13MB, estimativa de caracteres calculada
  corretamente a partir do `fileSize` real); fix de lint
  (`react-hooks/refs`) em `useTranslatedAudiobook.ts`.
- Testes executados: `npm run lint` (limpo), `npm test` (1056 passando, 2
  skipped pré-existentes, 0 regressão), `npm run build` (limpo),
  `npx tsc -p tsconfig.app.json --noEmit` (limpo).
- Pendências: validação em device Android real (quickstart.md, passos 3-8 e
  11-14, e a seção "Validação em device Android") — não executada nesta
  sessão por falta de device conectado. Recomendado antes de considerar a
  feature pronta pra produção, já que ela toca playback contínuo em segundo
  plano (foco de áudio nativo, wake lock, notificação) — a superfície mais
  sensível a diferenças entre browser e device real nesta feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende do Foundational
- **US2 (Phase 4)**: depende de US1 (reusa o mesmo pipeline, só varia o provider)
- **US3 (Phase 5)**: depende de US1 (o toggle já existe); independente de US2
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Parallel Opportunities

- T001/T002 (Setup) em paralelo — arquivos diferentes.
- T003 e os testes T008-T010 podem ser escritos em paralelo por pessoas
  diferentes, mas a implementação (T003-T006) é sequencial dentro do mesmo
  arquivo.
- T016 (i18n) e T030 (i18n) são independentes de qualquer outra task da
  mesma fase.

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia todas as stories)
3. Completar Fase 3: User Story 1
4. **PARAR E VALIDAR**: testar User Story 1 isoladamente (MyMemory, sem
   nenhuma chave BYOK configurada)

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. User Story 1 → testar isoladamente → considerar entrega (MVP)
3. User Story 2 → motor premium BYOK, sticky fallback
4. User Story 3 → aviso de consumo
5. Polish → FR-015, validação cross-cutting, release

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada fase (sugestão do sdd-execute, nunca automático)
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
