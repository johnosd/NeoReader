---
description: "Tasks: Tradução Premium BYOK (DeepL, OpenAI, Google)"
---

# Tasks: Tradução Premium BYOK (DeepL, OpenAI, Google)

**Input**: Documentos de design de `sdd/specs/017-traducao-premium-byok/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Organization**: Tasks agrupadas por user story (P1 DeepL → P2 OpenAI → P3 Google), cada uma independentemente testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 (DeepL) / US2 (OpenAI) / US3 (Google)

## Path Conventions

Projeto único (sem separação backend/frontend). Caminhos reais tocados por
esta feature (ver `plan.md` → `## Project Structure`):

- Tipos: `src/types/translation.ts` (novo), `src/types/settings.ts`,
  `src/types/book.ts`, `src/types/vocabulary.ts`
- Serviços: `src/services/TranslationService.ts`,
  `src/services/TranslationProviderRegistry.ts` (novo),
  `src/services/{DeepL,OpenAiTranslation,GoogleTranslate}Service.ts` (novos)
- UI: `src/screens/SettingsTranslationScreen.tsx` (novo),
  `src/screens/SettingsScreen.tsx`, `src/screens/BookDetailsScreen.tsx`,
  `src/screens/ReaderScreen.tsx`, `src/App.tsx`
- Outros: `src/hooks/useReaderAppearance.ts`,
  `src/components/settings/apiKeyValidation.ts`, `src/i18n/messages.ts`
- Testes: `src/__tests__/` espelhando os caminhos acima

## Phase 1: Setup

**Purpose**: Confirmar pré-condições — sem inicialização de projeto (stack já existe).

- [X] T001 Confirmar que nenhuma dependência nova é necessária (`fetch`
      nativo cobre os 3 provedores, mesmo padrão de
      `src/services/SpeechifyService.ts`) — checklist, sem instalação.
      Confirmado: `package.json` sem alterações necessárias.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura compartilhada pelas 3 user stories — tipos,
registry, ponto único de tradução, telas/rotas shell.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T002 Criar `src/types/translation.ts`: `TranslationProvider`,
      `PremiumTranslationProvider`, `TranslationApiKeyValidationCode` (7
      categorias, ver `data-model.md`), `TranslationApiKeyValidationResult`,
      `TranslationResult`.
- [X] T003 [P] `src/types/settings.ts`: `AppSettings` +`deeplApiKey`,
      `openaiTranslationApiKey`, `googleTranslateApiKey`; atualizar
      `DEFAULT_APP_SETTINGS` e `normalizeUserSettings` (mesmo padrão dos
      campos de chave de TTS já existentes).
- [X] T004 [P] `src/types/book.ts`: `BookSettings`
      +`translationProvider?: TranslationProvider`.
- [X] T005 [P] `src/types/vocabulary.ts`: `TranslationCache`
      +`provider: TranslationProvider`.
- [X] T006 Criar `src/services/TranslationProviderRegistry.ts` — espelha
      `src/services/TtsProviderRegistry.ts`: `TRANSLATION_PROVIDER_ORDER`
      (só `['mymemory']` por ora — cada story seguinte adiciona seu
      provider), `PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS` como
      `Partial<Record<PremiumTranslationProvider, ...>>` (vazio por ora),
      `getTranslationProviderApiKeyFromSettings`,
      `isTranslationProviderConfigured`,
      `getTranslationProviderAvailability`,
      `resolveTranslationProviderFromAvailability`.
- [X] T007 Modificar `src/services/TranslationService.ts`: `hashText` passa
      a foldar `provider` no input (`` `${provider}::${langpair}::${text}` ``
      — FR-010); `translate()` ganha `options?: { provider?:
      TranslationProvider; signal?: AbortSignal }`; quando `provider` for
      premium e configurado, delega pro registry (T006); senão mantém o
      caminho MyMemory atual intacto; grava `provider` na entrada de cache.
      A truncagem por `MAX_CHARS` (FR-013) continua acontecendo uma vez,
      antes do despacho pro provider selecionado — nunca reimplementada
      dentro de cada `*Service.ts` de provider. **A árvore de decisão
      completa do FR-007 (retry limitado em timeout/429/5xx; sem retry em
      quota/billing/idioma não suportado/chave inválida — cai direto pro
      MyMemory; erro de requisição/bug interno — propaga o erro, sem
      fallback automático; cancelamento — aborta sem fallback) vive
      inteiramente aqui dentro, nunca no chamador** (`ReaderScreen` só
      resolve `provider`/`signal` e injeta o resultado — não decide
      retry/fallback). Isso é o que permite um segundo consumidor futuro
      (`## Assumptions` da spec) reusar `translate()` sem duplicar essa
      lógica.
- [X] T008 [P] `src/components/settings/apiKeyValidation.ts`: nova função
      `getTranslationApiKeyValidationMessage(code, t)` mapeando as 7
      categorias pra chaves i18n novas (T013).
- [X] T009 Criar `src/screens/SettingsTranslationScreen.tsx` (shell —
      cabeçalho + `IntegrationHelpBanner`, sem nenhuma linha de provider
      ainda) e ligar: `src/screens/SettingsScreen.tsx` (prop
      `onOpenTranslation` + `ListItem` nova) e `src/App.tsx` (rota
      `{ name: 'settings-translation' }`, import, case).
- [X] T010 Modificar `src/hooks/useReaderAppearance.ts`: expor
      `translationProvider: TranslationProvider` (resolvido via
      `resolveTranslationProviderFromAvailability`, análogo a `ttsEngine`)
      e `translationProviderAvailability: Record<TranslationProvider,
      boolean>`.
- [X] T011 Modificar `src/screens/BookDetailsScreen.tsx`: seletor de
      provedor de tradução (bottom sheet análogo ao `ttsProviderSheetOpen`
      já existente) + banner de fallback quando efetivo ≠ selecionado
      (FR-009), iterando sobre `TRANSLATION_PROVIDER_ORDER`.
- [X] T012 Modificar `src/screens/ReaderScreen.tsx`: `handleTranslate`
      resolve `translationProvider` (de T010) e mantém um
      `AbortController` num `ref`, abortando o anterior a cada nova
      chamada (FR-007, cancelamento), passando `{ provider, signal }` pro
      `translate()` (T007).
- [X] T013 [P] `src/i18n/messages.ts` (pt-BR/en/es): chaves compartilhadas
      — título/descrição da tela de Configurações > Tradução, título do
      sheet de seleção em `BookDetailsScreen`, texto do banner de
      fallback, e `settings.apiKey.validation.*` novas pras 7 categorias
      (T008).

### Testes da Fase

- [X] T014 [P] `src/__tests__/services/TranslationService.test.ts` —
      hash isolado por provider (mesmo texto+idioma, provider diferente →
      cache não compartilhado, FR-010).
- [X] T015 [P] `src/__tests__/services/TranslationProviderRegistry.test.ts`
      — helpers de disponibilidade/resolução com o registry ainda vazio de
      premium.
- [X] T016 Auditoria de log (SC-004): teste que confirma
      `sanitizeDiagnosticsDetails`/`sanitizeUrl` redige uma URL fake
      contendo `?key=...` (research.md R4) — em
      `src/__tests__/services/DiagnosticsLogger.test.ts` (estender se já
      existir, criar se não).

**Checkpoint**: infraestrutura pronta. MyMemory continua funcionando
exatamente como hoje (nenhuma regressão); nenhuma story ainda é
demonstrável ponta a ponta (nenhum provider premium real existe ainda).

**Registro da Fase**:

- Status: concluída
- Feito: T002-T016 (tipos, registry, `translate()` com árvore FR-007 completa,
  cache isolado por provider, telas/rotas shell, seletor+banner em
  BookDetailsScreen, AbortController em ReaderScreen).
- Testes executados: `npx vitest run` nos 3 arquivos novos/estendidos de
  serviço (40 testes) + `ReaderScreen.test.tsx`/`BookDetailsScreen.test.tsx`
  (93 testes, 3 assertions ajustadas pro novo argumento de `translate()`) —
  todos verdes. `npx tsc -p tsconfig.app.json --noEmit` e `npm run lint`
  limpos. Suite completa (`npm test`) rodando em background pra confirmar
  ausência de regressão em outros arquivos.
- Pendências: nenhuma bloqueante — ver R-005 em `plan.md` (limitação
  conhecida e aceita sobre HTTP 400 não distinguir "idioma não suportado"
  de "requisição inválida").

---

## Phase 3: User Story 1 - Traduzir com DeepL via chave própria (Priority: P1) 🎯 MVP

**Objetivo**: fluxo completo configurar → validar → selecionar por livro
→ traduzir → fallback, com DeepL.

**Independent Test**: configurar uma chave DeepL real, selecionar DeepL
pra um livro de teste, comparar o texto traduzido no tap-to-translate
contra o MyMemory.

### Testes da Fase

- [X] T017 [P] [US1] `src/__tests__/services/DeepLService.test.ts` —
      `validateApiKey` (7 categorias via mock de `fetch`, ver
      `contracts/deepl-translate.md`), `translate` (sucesso + cada
      categoria de erro mapeada).
- [X] T018 [P] [US1] `src/__tests__/screens/SettingsTranslationScreen.test.tsx`
      — linha DeepL: campo de chave, "Testar chave", só persiste se
      válida. **Inclui um teste pra FR-012**: a tela renderiza e permite
      configurar/testar a chave DeepL sem depender de
      `useEntitlements().isPro` (ex: renderizar com `isPro: false` e
      confirmar que a linha do provider não fica bloqueada/oculta) — trava
      contra uma futura adição acidental de Pro-gating nesta tela.
- [X] T019 [P] [US1] `src/__tests__/screens/BookDetailsScreen.test.tsx` —
      seleção de DeepL quando configurado/validado; seleção sem efeito se
      não configurado (FR-005); banner de fallback quando chave é
      invalidada depois (FR-009).
- [X] T020 [US1] `src/__tests__/screens/ReaderScreen.test.tsx` —
      `handleTranslate` usa DeepL quando selecionado; cancelamento (trocar
      de trecho) aborta o `AbortSignal` da chamada anterior. **Escopo
      ajustado**: os casos de fallback por tipo de erro (timeout/quota/
      chave/idioma) já são cobertos em `TranslationService.test.ts` e
      `DeepLService.test.ts` — `translate` está totalmente mockado neste
      arquivo (`ReaderScreen.test.tsx`), então testar a árvore de decisão
      do FR-007 aqui de novo seria duplicar cobertura na camada errada, não
      reforçá-la.

### Implementation

- [X] T021 [US1] Criar `src/services/DeepLService.ts` — mesmo formato de
      `SpeechifyService.ts` (`getApiKey`/`isConfigured`/`validateApiKey`/
      `translate`), contrato em `contracts/deepl-translate.md` (2 hosts
      conforme sufixo `:fx` da chave).
- [X] T022 [US1] Registrar DeepL em `TranslationProviderRegistry.ts`
      (T006): entrada em `PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS.deepl`
      e em `TRANSLATION_PROVIDER_ORDER`.
- [X] T023 [US1] ~~Adicionar linha DeepL em `SettingsTranslationScreen.tsx`~~
      — já satisfeito por T022: a tela (T009) é genérica sobre
      `PREMIUM_TRANSLATION_PROVIDER_ORDER`/`_DEFINITIONS`, então registrar
      o DeepL no registry já faz a linha aparecer sozinha, sem código de UI
      novo.
- [X] T024 [US1] ~~Chaves i18n específicas de DeepL~~ — não necessário:
      seguindo o mesmo padrão já usado pro TTS
      (`PREMIUM_TTS_PROVIDER_DEFINITIONS`), `label`/`description` do
      provider ficam como string literal pt-BR direto no registry (T022),
      não passam por `t()`. Consistente com o precedente, não uma lacuna.
- [X] T024b [US1] **Task ad-hoc, descoberta testando US1 no browser real**
      (ver `plan.md` R-006): DeepL (e OpenAI) bloqueiam CORS de propósito —
      não funcionam de jeito nenhum chamados direto do browser/WebView.
      Decisão do usuário: restringir esses 2 provedores ao app Android via
      `CapacitorHttp` nativo (bypassa CORS só lá), Web fica só com
      Google+MyMemory. Implementado: `capacitor.config.ts`
      (`CapacitorHttp: { enabled: true }`); `TranslationProviderDefinition`
      ganhou `requiresNativePlatform`; `isTranslationProviderPlatformRestricted`
      novo em `TranslationProviderRegistry.ts`, usado por
      `isTranslationProviderConfigured`/`getTranslationProviderAvailability`/
      `resolveConfiguredTranslationProvider`; `SettingsTranslationScreen.tsx`
      mostra um aviso "Android apenas" em vez do campo de chave (evita
      chamar `validateApiKey` fadado a falhar); `BookDetailsScreen.tsx`
      mostra banner/meta "Android apenas" distinto de "chave pendente". 9
      testes novos/atualizados (`TranslationProviderRegistry`,
      `SettingsTranslationScreen`, `BookDetailsScreen`, `ReaderScreen`).

**Critério de Conclusão**: usuário configura uma chave DeepL real,
seleciona DeepL pra um livro, tap-to-translate usa DeepL, e qualquer
falha (timeout/quota/chave/idioma) cai pro MyMemory sem interromper a
leitura — coberto por teste automatizado e confirmado manualmente via
`quickstart.md`.

**Checkpoint**: User Story 1 funcional e testável isoladamente (MVP).

**Registro da Fase**:

- Status: concluída
- Feito: `DeepLService.ts` (host free/pro por sufixo `:fx`, `GET /v2/usage`
  pra validar chave, `POST /v2/translate`); registrado em
  `TranslationProviderRegistry.ts` (linha na tela de Configurações aparece
  sozinha, T023 virou no-op); testes de serviço, tela, seleção por livro e
  cancelamento em `ReaderScreen`.
- Testes executados: `npx vitest run` — `DeepLService.test.ts` (16),
  `SettingsTranslationScreen.test.tsx` (3), `BookDetailsScreen.test.tsx`
  (44, incluindo 3 novos de DeepL), `ReaderScreen.test.tsx` (54, incluindo
  2 novos: provider premium selecionado + cancelamento), 4
  `TranslationProviderRegistry.test.ts` atualizados (deepl agora
  registrado). Suite completa (`npm test`), `npx tsc --noEmit`, lint e
  `npm run build` — todos limpos.
- Pendências: nenhuma bloqueante. **Atualização pós-checkpoint**: usuário
  testou "Testar chave" da DeepL no browser (dev) e recebeu erro genérico
  — investigado e é CORS, bloqueio de propósito da API da DeepL/OpenAI
  (R-006 em `plan.md`), não um bug. Decisão do usuário: restringir
  DeepL/OpenAI ao app Android via `CapacitorHttp` (T024b, ad-hoc). Web
  agora mostra "disponível só no Android" pra DeepL, corretamente, em vez
  de tentar e falhar.
- [X] T024c [US1] **Task ad-hoc, bug real encontrado testando no device
  Android** (build+install via `gradlew.bat`+`adb`, chave real da DeepL):
  "Testar chave" funcionou (CapacitorHttp confirmado bypassando CORS), mas
  a tradução falhava com `code: "invalid"` — logcat mostrou
  `source_lang: "ES-419"` no request. A DeepL rejeita variante regional no
  idioma de ORIGEM (só aceita código base, ex. "ES"), diferente do
  destino (onde "PT-BR" é aceito). `bookLanguage` vem direto do EPUB, sem
  o filtro dos 7 idiomas do app, então pode ter qualquer variante regional
  (`es-419`, `en-US`, etc.). Corrigido em `DeepLService.ts`:
  `toDeepLSourceLangCode` agora usa `getBaseLanguage()` (já existia em
  `utils/language.ts`) antes de maiusculizar; `toDeepLTargetLangCode`
  mantido como estava (destino já vem de um conjunto fechado). +1 teste de
  regressão. Re-testado no device: tradução funcionou.
- [X] T024d [US1] **Task ad-hoc, pedido do usuário após ver funcionar no
  device**: reverte parte do FR-008 (spec.md atualizado, sessão
  2026-09-11) — mostrar qual provedor traduziu, por paridade com o
  indicador de engine de TTS. Decisão (usuário escolheu entre 3 opções):
  selo discreto "via {provedor}" dentro do painel de tradução, só quando
  ≠ MyMemory. Mudança de contrato: `TranslationService.translate()` agora
  retorna `TranslationResult` (`{ translatedText, provider,
  detectedSourceLang? }`) em vez de só `string`, porque o provider
  efetivo só é conhecido depois da árvore de decisão do FR-007 (pode
  divergir do pedido). Propagado por `ReaderScreen.handleTranslate` →
  `EpubViewerHandle.injectTranslation` (novo 3º parâmetro opcional
  `provider`) → HTML injetado no painel (`.nr-tr-provider`, estilo
  discreto igual ao já usado pra atribuição do Word Lens). Testes
  atualizados nos 4 arquivos que chamam/mockam `translate()`
  (`TranslationService`, `DeepLService`, `ReaderScreen`, `EpubViewer`) +
  1 novo (`injectTranslation` recebe o provider certo).

---

## Phase 4: User Story 2 - Traduzir com OpenAI via chave própria (Priority: P2)

**Objetivo**: mesmo fluxo da US1, com OpenAI (tom/diálogo via Structured
Outputs).

**Independent Test**: configurar chave OpenAI real, selecionar pra um
livro de teste, comparar preservação de tom/diálogo num trecho com fala
direta — sem depender de Google implementado.

### Testes da Fase

- [ ] T025 [P] [US2] `src/__tests__/services/OpenAiTranslationService.test.ts`
      — `validateApiKey`, `translate` com parse de Structured Outputs
      (ver `contracts/openai-responses-translate.md`); resposta fora do
      schema esperado → categoria `invalid`.
- [ ] T026 [P] [US2] Estender `SettingsTranslationScreen.test.tsx` pra
      linha OpenAI.
- [ ] T027 [P] [US2] Estender `BookDetailsScreen.test.tsx` pra seleção de
      OpenAI (mesmos cenários da US1: bloqueio sem chave, fallback banner).
- [ ] T028 [US2] Estender `ReaderScreen.test.tsx` pra OpenAI selecionado
      (mesmos cenários de fallback da US1).

### Implementation

- [ ] T029 [US2] Criar `src/services/OpenAiTranslationService.ts` —
      contrato em `contracts/openai-responses-translate.md` (modelo mini,
      Structured Outputs `strict: true`).
- [ ] T030 [US2] Registrar OpenAI em `TranslationProviderRegistry.ts`.
- [ ] T031 [US2] Adicionar linha OpenAI em `SettingsTranslationScreen.tsx`.
- [ ] T032 [US2] Chaves i18n específicas de OpenAI.

**Critério de Conclusão**: mesmo critério da US1, com OpenAI, sem
regressão em DeepL nem MyMemory.

**Checkpoint**: User Story 2 funcional e testável isoladamente, além da US1.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Traduzir com Google Cloud Translation via chave própria (Priority: P3)

**Objetivo**: mesmo fluxo das US1/US2, com Google (maior cobertura de
idiomas).

**Independent Test**: configurar chave Google real, selecionar pra um
livro de teste, confirmar tradução + fallback nos mesmos cenários de
erro.

### Testes da Fase

- [ ] T033 [P] [US3] `src/__tests__/services/GoogleTranslateService.test.ts`
      — `validateApiKey`, `translate` (ver
      `contracts/google-translate-basic-v2.md`).
- [ ] T034 [P] [US3] Estender `SettingsTranslationScreen.test.tsx` pra
      linha Google.
- [ ] T035 [P] [US3] Estender `BookDetailsScreen.test.tsx` pra seleção de
      Google.
- [ ] T036 [US3] Estender `ReaderScreen.test.tsx` pra Google selecionado.

### Implementation

- [ ] T037 [US3] Criar `src/services/GoogleTranslateService.ts` —
      contrato em `contracts/google-translate-basic-v2.md`. **Atenção**:
      a chave vai no query string (`?key=...`) — confirmar que a URL
      passada pra `fetchWithTimeout` é a mesma forma já coberta pelo teste
      de auditoria T016 (não inventar um formato de URL que escape da
      detecção de `sanitizeUrl`).
- [ ] T038 [US3] Registrar Google em `TranslationProviderRegistry.ts`.
- [ ] T039 [US3] Adicionar linha Google em `SettingsTranslationScreen.tsx`.
- [ ] T040 [US3] Chaves i18n específicas de Google.

**Critério de Conclusão**: os 3 provedores completos; SC-004 reconfirmado
com os 3 provedores reais (nenhuma chave em log); sem regressão nas
stories anteriores.

**Checkpoint**: as 3 user stories completas e testáveis, juntas ou isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais que atravessam as 3 stories.

- [ ] T041 `npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm test && npm run build` — zero erros.
- [ ] T042 Rodar `quickstart.md` ponta a ponta com pelo menos 1 provedor real.
- [ ] T043 Revisão final de `DiagnosticsLogger`: nenhuma chave em texto
      plano pros 3 provedores reais (SC-004).
- [ ] T044 Limpar código morto/comentário desatualizado introduzido
      durante as 3 stories.

### Checklist de Release

- [ ] Fase 3 (User Story 1 — DeepL) concluída
- [ ] Fase 4 (User Story 2 — OpenAI) concluída
- [ ] Fase 5 (User Story 3 — Google) concluída
- [ ] `npm run lint && npm test && npm run build` limpos
- [ ] Nenhuma chave de API em log/analytics (SC-004)
- [ ] Testado em browser real (não só jsdom)
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA as 3 user stories.
- **User Stories (Phase 3-5)**: dependem do Foundational; entre si, US1→US2→US3
  reflete a prioridade (P1/P2/P3), mas cada uma toca majoritariamente
  arquivos próprios (`*Service.ts` distintos) — a exceção é
  `TranslationProviderRegistry.ts` e `SettingsTranslationScreen.tsx`,
  tocados por todas as 3 (coordenar ordem de merge se paralelizadas).
- **Polish (Phase 6)**: depende de todas as stories desejadas estarem completas.

### Parallel Opportunities

- Tasks `[P]` na mesma fase podem rodar em paralelo (arquivos diferentes).
- US1/US2/US3 podem ser trabalhadas em paralelo depois do Foundational,
  desde que a coordenação em `TranslationProviderRegistry.ts` e
  `SettingsTranslationScreen.tsx` seja combinada entre quem estiver
  implementando cada uma.

---

## Parallel Example: Foundational

```bash
Task: "T003 [P] src/types/settings.ts"
Task: "T004 [P] src/types/book.ts"
Task: "T005 [P] src/types/vocabulary.ts"
Task: "T008 [P] src/components/settings/apiKeyValidation.ts"
Task: "T013 [P] src/i18n/messages.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational (bloqueia todas as stories).
3. Completar Fase 3: User Story 1 (DeepL).
4. **PARAR E VALIDAR**: testar DeepL isoladamente via `quickstart.md`.

### Incremental Delivery

1. Setup + Foundational → fundação pronta (MyMemory intacto).
2. User Story 1 (DeepL) → testar isoladamente → considerar entrega (MVP).
3. User Story 2 (OpenAI) → testar isoladamente → entregar.
4. User Story 3 (Google) → testar isoladamente → entregar (feature completa).

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica (US1/US2/US3).
- Commitar após cada task ou grupo lógico coerente (convenção do projeto:
  `feat: adiciona X`, em português).
- Parar em qualquer checkpoint pra validar a story isoladamente.
- Nenhuma task introduz cadeia automática entre provedores premium nem
  toggle de consentimento de fallback — ambos foram explicitamente
  descartados na spec (`## Clarifications`).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
