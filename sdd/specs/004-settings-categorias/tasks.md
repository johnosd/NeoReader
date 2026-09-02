---
description: "Tasks: Reorganizar Tela de Settings em Categorias Navegáveis"
---

# Tasks: Reorganizar Tela de Settings em Categorias Navegáveis

**Input**: Documentos de design de `sdd/specs/004-settings-categorias/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), quickstart.md

**Organization**: Tasks agrupadas por user story. **Nota de execução**: US1
("menu de categorias") e US2 ("entrar numa categoria e ajustar") são
tratadas numa única fase (Fase 3) porque são mecanicamente inseparáveis
nesta feature — não dá pra tirar o conteúdo do arquivo monolítico sem, no
mesmo passo, criar o destino dele; um menu cujas categorias não levam a
lugar nenhum não é um checkpoint válido. Cada task ainda carrega sua tag de
story (`[US1]`/`[US2]`) pra rastreabilidade. US3 e US4 continuam em fases
próprias porque sua implementação já sai pronta da Fase 3 — essas fases
existem pra travar cobertura de teste dedicada às suas próprias acceptance
scenarios, não pra implementar de novo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3, US4)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Telas: `src/screens/` (um arquivo por tela, PascalCase, ex: `SettingsAppearanceScreen.tsx`)
- Layout compartilhado de Settings: `src/components/settings/`
- Hooks: `src/hooks/` (prefixo `use`)
- Rotas/pilha de navegação: `src/App.tsx` (`type Route`, `switch (current.name)`)
- Textos: `src/i18n/messages.ts` (3 blocos: pt-BR, en, es)
- Testes: `src/__tests__/`, espelhando a estrutura acima (`__tests__/screens/`, `__tests__/hooks/`)

---

## Phase 1: Setup

**Purpose**: Confirmar baseline limpo antes de qualquer mudança.

- [X] T001 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` no estado atual (antes de qualquer mudança desta feature) — isola qualquer regressão futura como introduzida por esta feature, não preexistente.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura compartilhada que toda subtela nova vai usar.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T002 [P] Criar `src/components/settings/SettingsLayout.tsx` extraindo `SettingsSection`, `SettingsGroup`, `SettingBlock` e `InfoRow` de `src/screens/SettingsScreen.tsx` (copiar como estão hoje, exportar) — ainda sem remover do arquivo original.
- [X] T003 [P] Criar `src/hooks/useUserSettings.ts`: encapsula `getSettings`/`updateAppSettings`/`updateReaderDefaults` (de `src/db/settings.ts`) com estado de loading, retornando `{ settings, saveAppSettings, saveReaderDefaults }` — mesmo contrato que `SettingsScreen.tsx` já usa hoje internamente, só extraído.
- [X] T004 [P] Criar `src/__tests__/hooks/useUserSettings.test.tsx`: cobre estado inicial (`settings === null`), settings populado após `getSettings()` resolver, e que `saveAppSettings`/`saveReaderDefaults` chamam o respectivo `update*` e atualizam o estado local.
- [X] T005 Em `src/App.tsx`, adicionar ao union `type Route` os 6 membros novos: `{ name: 'settings-language' }`, `{ name: 'settings-appearance' }`, `{ name: 'settings-word-lens' }`, `{ name: 'settings-narration' }`, `{ name: 'settings-integrations' }`, `{ name: 'settings-sync' }` — só o tipo; os `case` do switch entram na Fase 3, junto com cada subtela.
- [X] T006 Em `src/i18n/messages.ts`, adicionar a chave `settings.language.sectionDescription` nos 3 blocos de locale (pt-BR, en, es), descrevendo os dois controles de idioma juntos (ex. pt-BR: "Idioma da interface do app e idioma padrão de tradução de trechos.").

**Checkpoint**: Infraestrutura pronta — `SettingsScreen.tsx` ainda intacto, build/lint/test continuam passando.

---

## Phase 3: User Story 1 + User Story 2 - Menu de categorias com navegação funcional (Priority: P1) 🎯 MVP

**Objetivo**: Settings vira um menu curto de categorias; cada categoria abre uma subtela dedicada com paridade total de comportamento; voltar de dentro de uma categoria retorna ao menu (não sai do Settings).

**Independent Test**: Abrir Configurações, ver a lista de categorias (não a tela longa antiga), entrar em pelo menos 3 categorias diferentes, ajustar uma configuração em cada uma, confirmar persistência, e voltar ao menu a cada vez sem sair do Settings.

### Testes da Fase

- [X] T007 [P] [US1] Reescrever `src/__tests__/screens/SettingsScreen.test.tsx`: novo teste "mostra as 7 categorias clicáveis e os 3 itens diretos no menu principal" — verifica presença de todas as labels de categoria (`sectionLabel` de cada uma) + Plano Pro + Cotas de Uso + Build/Sobre.
- [X] T008 [P] [US1] Em `src/__tests__/screens/SettingsScreen.test.tsx`: teste "cada categoria dispara o callback onOpen* correspondente ao clicar" (`onOpenLanguage`, `onOpenAppearance`, `onOpenWordLens`, `onOpenNarration`, `onOpenIntegrations`, `onOpenSync`, `onOpenOpdsCatalogs`), no mesmo padrão do teste já existente pra `onOpenOpdsCatalogs`.
- [X] T009 [P] [US2] Criar `src/__tests__/screens/SettingsAppearanceScreen.test.tsx` portando de `SettingsScreen.test.tsx` (versão atual, antes da reescrita): "salva defaults do leitor ao alterar tamanho de fonte", "modo original respeita fonte e cores...", "modo confortavel reativa fonte e cores...".
- [X] T010 [P] [US2] Criar `src/__tests__/screens/SettingsWordLensScreen.test.tsx` portando: "mostra o Word Lens ativo em B1 sem carregar o data pack", "exibe legenda, versao, limitacoes e atribuicoes do Word Lens", "salva ativacao e nivel do Word Lens".
- [X] T011 [P] [US2] Criar `src/__tests__/screens/SettingsIntegrationsScreen.test.tsx` portando: "mantem campos de integracao compactos ate o usuario expandir", "explica o que cada API key habilita nas integracoes", "valida e salva key da Speechify no blur".
- [X] T012 [P] [US2] Criar `src/__tests__/screens/SettingsNarrationScreen.test.tsx`: cobre o card informativo de TTS nativo (badge "Ativo") e o toggle "Manter tela ativa" (`WakeLockService.setEnabled`/`isEnabled`) — comportamento hoje sem teste dedicado no arquivo monolítico.
- [X] T013 [P] [US2] Criar `src/__tests__/screens/SettingsSyncScreen.test.tsx` portando: "mostra sync de bookmarks como recurso Pro nas configuracoes".
- [X] T014 [P] [US2] Criar `src/__tests__/screens/SettingsLanguageScreen.test.tsx` portando: "salva idioma padrao pelo bottom sheet", "salva idioma do app pelo bottom sheet".
- [X] T015 [US2] Estender `src/__tests__/App.test.tsx` com cenários de navegação profunda pra pelo menos 2 categorias novas: `Home -> Settings -> Aparência -> Back -> Settings(menu) -> Back -> Home`, provando que voltar de dentro de uma categoria retorna ao menu, e voltar do menu sai do Settings (FR-006/FR-007).

### Implementation

- [X] T016 [P] [US2] Criar `src/screens/SettingsAppearanceScreen.tsx`: extrai o bloco de Aparência (preview, tema, fonte, tamanho, espaçamento, modo) de `SettingsScreen.tsx` original, com header próprio (`ArrowLeft` + `sectionLabel`/`sectionDescription`), `useCapacitorBackButton(onBack)`, usando `useUserSettings` e `SettingsSection`/`SettingsGroup`/`SettingBlock` de `components/settings/SettingsLayout.tsx`.
- [X] T017 [P] [US2] Criar `src/screens/SettingsWordLensScreen.tsx`: extrai o bloco de Word Lens (enabled, level, legenda, fontes/limitações), mesmo padrão de header/back button/hook.
- [X] T018 [P] [US2] Criar `src/screens/SettingsIntegrationsScreen.tsx`: extrai o bloco de Integrações inteiro — inclui migrar pra este arquivo `ApiKeyField`, `ValidationBadge`, `IntegrationStatus`, `KeyVisibilityButton`, `getProviderIcon`, `TTS_PROVIDER_EDUCATION_KEYS`, `getApiKeyValidationMessage`, `getEducationStatus`, `EMPTY_TTS_*` constantes, e a lógica de validação de chave (`validateTtsProviderKey`, `saveYoutubeKey`).
- [X] T019 [P] [US2] Criar `src/screens/SettingsNarrationScreen.tsx`: extrai o bloco de Narração (card de TTS nativo via `InfoRow` + toggle `WakeLockService`).
- [X] T020 [P] [US2] Criar `src/screens/SettingsSyncScreen.tsx`: extrai o bloco de Sincronização inteiro — inclui migrar `getBookmarkSyncMeta`, `getDataSyncMeta`, `DATA_SYNC_CONNECTED_DESC`, `DATA_SYNC_PENDING_DESC`, os hooks `useBookmarkDriveSyncStatus`/`useProgressDriveSyncStatus`/`useVocabularyDriveSyncStatus`, e `handleReconnectDrive`.
- [X] T021 [P] [US2] Criar `src/screens/SettingsLanguageScreen.tsx`: junta o bloco de "Idioma do App" (bottom sheet `APP_LOCALE_PREFERENCES`) e o de "Tradução" (bottom sheet `TRANSLATION_LANGUAGE_OPTIONS`) numa única tela, com header usando `t('settings.appLanguage.sectionLabel')` como título e `t('settings.language.sectionDescription')` (criada na T006) como subtítulo.
- [X] T022 [US1] Reescrever `src/screens/SettingsScreen.tsx`: remove o conteúdo completo migrado nas T016-T021 (Aparência, Word Lens, Integrações, Narração, Sincronização, Idioma do App + Tradução), substitui cada um por 1 `ListItem` de categoria (ícone + `sectionLabel` como título + `sectionDescription` como meta + chevron), mantendo intactos só os blocos de Plano Pro, Cotas de Uso e Build/Sobre e o `useEntitlements`/`useRefreshEntitlementsOnFocus`/`FeatureQuotaService` que eles usam.
- [X] T023 [US1] Atualizar a interface `SettingsScreenProps` em `SettingsScreen.tsx`: adicionar `onOpenLanguage`, `onOpenAppearance`, `onOpenWordLens`, `onOpenNarration`, `onOpenIntegrations`, `onOpenSync` (mantendo `onBack`, `onOpenPaywall`, `onOpenOpdsCatalogs` como já existem).
- [X] T024 [US2] Em `src/App.tsx`: adicionar os 6 `case` do switch pras rotas tipadas na T005 (`settings-language`, `settings-appearance`, `settings-word-lens`, `settings-narration`, `settings-integrations`, `settings-sync`), cada um renderizando a tela nova correspondente com `onBack={pop}` (mesmo padrão do `case 'opds-catalog-settings'` já existente); e passar as 6 novas props pro `<SettingsScreen>` fazendo `push({ name: '...' })` pra cada uma.

**Critério de Conclusão**: Abrir Configurações mostra o menu com as 7 categorias + 3 itens diretos; cada categoria abre uma subtela real com paridade total de comportamento (mesmas asserções que existiam no arquivo monolítico, agora nos arquivos novos); voltar de qualquer subtela retorna ao menu; voltar do menu sai do Settings. `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem erro.

**Checkpoint**: Navegação ponta a ponta completa e funcional — MVP da feature entregue.

**Registro da Fase**:

- Status: Concluída
- Feito: `SettingsScreen.tsx` reescrito como menu de categorias (7 categorias clicáveis + Plano Pro/Cotas de Uso/Build-Sobre diretos). Criadas as 6 subtelas (`SettingsLanguageScreen`, `SettingsAppearanceScreen`, `SettingsWordLensScreen`, `SettingsNarrationScreen`, `SettingsIntegrationsScreen`, `SettingsSyncScreen`), cada uma com header próprio + `useCapacitorBackButton`. `App.tsx` com os 6 `case` novos + push handlers. Durante a T018, um bug de lint (`react-hooks/set-state-in-effect`) apareceu ao portar a inicialização de `ttsKeyInputs`/`youtubeKeyInput` de uma Promise `.then()` pra um `useEffect` — corrigido inline (bloqueava a própria task) separando `SettingsIntegrationsForm` como componente interno que só monta com `settings` já carregado, usando lazy initializers de `useState` em vez de `setState` síncrono no efeito.
- Testes executados: `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm test` (759 passed | 2 skipped, incluindo os 7 arquivos de teste novos/reescritos + 2 cenários novos em `App.test.tsx`), `npm run build` (limpo, mesmo warning pré-existente de chunk size).
- Pendências: nenhuma.

---

## Phase 4: User Story 3 - Itens sem configuração continuam acessíveis direto no menu (Priority: P2)

**Objetivo**: Plano Pro, Cotas de Uso e Build/Sobre têm cobertura de teste dedicada, comprovando paridade 1:1 com o comportamento anterior à reorganização.

**Independent Test**: No menu de categorias, confirmar que "Plano Pro" abre a tela de Paywall direto (com badge "Ativo" pra usuário Pro), e que "Cotas de Uso"/"Build/Sobre" mostram sua informação ali mesmo, sem navegação extra.

**Nota**: A implementação destes 3 itens já foi entregue na Fase 3 (T022), como parte da reescrita do menu — não há task de implementação nova aqui, só travar cobertura de teste específica pra essa parte do menu (a Fase 3 focou em provar a estrutura do menu como um todo, não o comportamento detalhado de cada item direto).

### Testes da Fase

- [X] T025 [P] [US3] Em `src/__tests__/screens/SettingsScreen.test.tsx`: portar "mostra status Free e quotas restantes nas configuracoes" pro novo shape do menu (linha "Cotas de Uso").
- [X] T026 [P] [US3] Em `src/__tests__/screens/SettingsScreen.test.tsx`: teste dedicado de Plano Pro — badge "Ativo" pra usuário Pro (mock `useEntitlements` com `isPro: true`), chama `onOpenPaywall` ao tocar, sem subtela intermediária.
- [X] T027 [P] [US3] Em `src/__tests__/screens/SettingsScreen.test.tsx`: teste dedicado de Build/Sobre — mostra a info de chaves públicas direto no menu, sem navegação/clique extra.

**Critério de Conclusão**: Os 3 itens diretos têm teste próprio, cobrindo especificamente seu comportamento (não só presença no menu), e passam sem alteração de código adicional.

**Checkpoint**: US3 comprovada por teste.

**Registro da Fase**:

- Status: Concluída
- Feito: 3 testes dedicados adicionados a `SettingsScreen.test.tsx` (quotas restantes, badge Ativo + navegação do Plano Pro, info de Build/Sobre). Nenhuma implementação nova — já entregue na Fase 3.
- Testes executados: `npx vitest run src/__tests__/screens/SettingsScreen.test.tsx` (5 passed).
- Pendências: nenhuma.

---

## Phase 5: User Story 4 - Configurações de idioma consolidadas num só lugar (Priority: P3)

**Objetivo**: Comprovar por teste que "Idioma do App" e "Tradução" vivem juntos numa única categoria "Idioma", sem exigir navegação entre duas categorias diferentes.

**Independent Test**: Entrar na categoria "Idioma" e confirmar que tanto o seletor de idioma da interface quanto o de idioma padrão de tradução aparecem na mesma tela.

**Nota**: A implementação (`SettingsLanguageScreen.tsx`) já foi entregue na Fase 3 (T021); esta fase adiciona só a asserção que comprova especificamente a propriedade de consolidação (FR-003), distinta dos testes de comportamento individual já portados na T014.

### Testes da Fase

- [X] T028 [US4] Em `src/__tests__/screens/SettingsLanguageScreen.test.tsx`: teste dedicado "os dois controles de idioma aparecem juntos na mesma renderização" — verifica que o row de idioma do app e o row de idioma de tradução estão ambos presentes ao montar a tela uma única vez (sem navegação intermediária).

**Critério de Conclusão**: FR-003 comprovado por teste automatizado.

**Checkpoint**: US4 comprovada por teste.

**Registro da Fase**:

- Status: Concluída
- Feito: teste "mostra os dois controles de idioma juntos na mesma tela, sem navegar entre categorias" adicionado a `SettingsLanguageScreen.test.tsx` (escrito junto com a T014 na Fase 3, formalizado aqui). Nenhuma implementação nova.
- Testes executados: `npx vitest run src/__tests__/screens/SettingsLanguageScreen.test.tsx` (3 passed).
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento da feature — validação manual, i18n, limpeza final.

- [X] T029 Rodar o cenário ponta a ponta de `sdd/specs/004-settings-categorias/quickstart.md` (browser via `npm run dev`; botão físico de voltar validado no device Android via `npm run android:run`). Validado manualmente pelo usuário no device real (RXCX103NMVZ) — app buildado, sincronizado e instalado 3 vezes ao longo da Fase 6 (versão final já com R-005 e R-006 aplicados). Usuário confirmou "feito, teste concluído" em 2026-09-02, depois de reportar e resolver 1 achado (botão de reconectar ausente na Sincronização — logado em `.planning/backlog.md`, fora de escopo desta feature) e pedir os 2 ajustes de conteúdo já registrados (R-005, R-006).
- [X] T030 Revisão de i18n: todas as chaves novas/usadas pelas 6 subtelas + menu existem nos 3 locales — garantido mecanicamente por `MessageKey = keyof typeof ptBRMessages` + `satisfies Record<MessageKey, string>` nos blocos en/es (`src/i18n/messages.ts`); `npx tsc --noEmit` falharia se alguma chave estivesse faltando em qualquer locale, e passou limpo.
- [X] T031 Limpeza final: nenhum import/ícone/estado sem uso restante — garantido mecanicamente por `noUnusedLocals`/`noUnusedParameters` do `tsconfig.app.json`, que fariam `tsc` falhar; passou limpo em `src/screens/SettingsScreen.tsx` e nos demais arquivos novos.
- [X] T032 Checagem final: `npm run lint && npm test && npx tsc --noEmit && npm run build` — todos limpos (762 testes passando, 2 skipped pré-existentes).

### Ad-hoc: ajustes pedidos pelo usuário durante o teste manual no device (R-005)

Descobertos depois da app instalada no device pro T029 — dentro do escopo desta feature (é conteúdo do mesmo menu), registrados como tasks ad-hoc por task template (ver `plan.md` R-005 e `spec.md` Clarifications "Sessão 2026-09-02 (ajustes pós-implementação)").

- [X] T033 [Ad-hoc] Criar `src/components/settings/apiKeyValidation.ts` (tipos `KeyValidationState`, `IDLE_KEY_STATE`, `getApiKeyValidationMessage`, `getEducationStatus`) e reduzir `src/components/settings/ApiKeyField.tsx` a só componentes (`ApiKeyField`, `ValidationBadge`, `IntegrationStatus`, `KeyVisibilityButton`) — corrige erro de lint `react-refresh/only-export-components` (um arquivo não pode misturar export de componente com export de função/constante).
- [X] T034 [Ad-hoc] Mover as 3 chaves de provedor TTS (Speechify, ElevenLabs, Fish Audio) de `SettingsIntegrationsScreen.tsx` pra `SettingsNarrationScreen.tsx`, reaproveitando o mesmo padrão gate+form (lazy initializers de `useState`) já usado desde a T018.
- [X] T035 [Ad-hoc] Reduzir `SettingsIntegrationsScreen.tsx` a só o campo YouTube Data API.
- [X] T036 [Ad-hoc] Em `SettingsScreen.tsx`, mesclar as 2 linhas de cota (Book Intelligence, NYT Discovery) pra dentro do mesmo `SettingsSection`/`SettingsGroup` de "Plano Pro" — remove a seção "Cotas de Uso" separada.
- [X] T037 [Ad-hoc] Remover a seção "Build/Sobre" inteira de `SettingsScreen.tsx`; remover as chaves i18n órfãs (`settings.build.*`, `settings.quota.sectionLabel`, `settings.quota.sectionDescription`) dos 3 locales em `src/i18n/messages.ts`; reescrever `settings.plan.sectionDescription` (3 locales) pra refletir que a seção agora cobre plano + uso.
- [X] T038 [Ad-hoc] Atualizar testes afetados: `SettingsScreen.test.tsx` (remove asserções de "Uso Free"/"Build", ajusta pra Plano+quotas juntos), `SettingsNarrationScreen.test.tsx` (ganha os 3 testes de Speechify portados de Integrações + mock de `@/db/settings`), `SettingsIntegrationsScreen.test.tsx` (reescrito só pra YouTube).

**Verificação**: `npm run lint && npm test && npx tsc --noEmit && npm run build` — todos limpos, 764 testes passando (2 skipped pré-existentes).

### Ad-hoc: "Plano" vira categoria própria (R-006)

Pedido logo em seguida ao R-005, depois do usuário ver o bloco Plano expandido direto no menu (ver `plan.md` R-006 e `spec.md` Clarifications "Sessão 2026-09-02 (ajuste adicional: Plano vira categoria)").

- [X] T039 [Ad-hoc] Criar `src/screens/SettingsPlanScreen.tsx`: NeoReader Pro (com `onClick` pra `onOpenPaywall`) + as 2 cotas de uso mensal, mesmo padrão de header/back button das outras subtelas; `getPlanMeta`/`getQuotaMeta`/`getQuotaBadge`/`getQuotaTone` movidos pra este arquivo.
- [X] T040 [Ad-hoc] Reduzir `src/screens/SettingsScreen.tsx` a 1 `ListItem` "Plano" com badge PRO/Free + chevron (`onClick` → `onOpenPlan`); remove `FeatureQuotaService`, `getPlanMeta`/`getQuotaMeta`/`getQuotaBadge`/`getQuotaTone` (migraram pra T039); atualiza `SettingsScreenProps` (`onOpenPaywall` → `onOpenPlan`).
- [X] T041 [Ad-hoc] Em `src/App.tsx`: adicionar `{ name: 'settings-plan' }` ao `type Route`, o `case` correspondente renderizando `SettingsPlanScreen` (`onBack={pop}`, `onOpenPaywall={() => push({ name: 'paywall' })}`), e trocar a prop `onOpenPaywall` por `onOpenPlan` na chamada de `<SettingsScreen>`.
- [X] T042 [Ad-hoc] Em `src/i18n/messages.ts`: adicionar `settings.plan.tierPro` ("PRO") e `settings.plan.tierFree` ("Free") nos 3 locales.
- [X] T043 [Ad-hoc] Reescrever `src/__tests__/screens/SettingsScreen.test.tsx` (8 categorias uniformes incluindo "Plano", badge PRO/Free, callback `onOpenPlan`) e criar `src/__tests__/screens/SettingsPlanScreen.test.tsx` (quotas restantes, badge Ativo + abre Paywall) portando os testes que estavam no menu.

**Verificação**: `npm run lint && npm test && npx tsc --noEmit && npm run build` — todos limpos, 765 testes passando (2 skipped pré-existentes).

### Checklist de Release

- [X] Fase 3 (US1 + US2) concluída — menu + 6 subtelas funcionais
- [X] Fase 4 (US3) concluída — itens diretos com cobertura dedicada
- [X] Fase 5 (US4) concluída — consolidação de Idioma comprovada
- [X] `quickstart.md` executado com sucesso (browser + device Android) — validado pelo usuário no device (T029)
- [X] i18n completo nos 3 locales (pt-BR, en, es)
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos
- [X] Nenhuma dependência nova adicionada a `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA a Fase 3
- **Fase 3 (US1+US2)**: depende do Foundational — é o MVP; bloqueia as Fases 4 e 5 (ambas dependem do menu/subtelas já existirem pra ter o que testar)
- **Fase 4 (US3)** e **Fase 5 (US4)**: podem rodar em paralelo entre si depois da Fase 3 (tocam arquivos de teste diferentes)
- **Polish (Fase 6)**: depende de todas as fases anteriores completas

### Parallel Opportunities

- Todas as tasks `[P]` da Fase 3 (T007-T014, T016-T021) podem rodar em paralelo entre si — cada uma cria um arquivo novo e independente. T015, T022, T023, T024 são sequenciais (dependem de vários arquivos criados em paralelo antes existirem, ou editam o mesmo `App.tsx`/`SettingsScreen.tsx`).
- Fases 4 e 5 podem ser feitas em paralelo uma da outra.

---

## Parallel Example: Fase 3 (implementação das 6 subtelas)

```bash
Task: "T016 [P] [US2] Criar src/screens/SettingsAppearanceScreen.tsx"
Task: "T017 [P] [US2] Criar src/screens/SettingsWordLensScreen.tsx"
Task: "T018 [P] [US2] Criar src/screens/SettingsIntegrationsScreen.tsx"
Task: "T019 [P] [US2] Criar src/screens/SettingsNarrationScreen.tsx"
Task: "T020 [P] [US2] Criar src/screens/SettingsSyncScreen.tsx"
Task: "T021 [P] [US2] Criar src/screens/SettingsLanguageScreen.tsx"
```

---

## Implementation Strategy

### MVP First (Fase 3 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia a Fase 3)
3. Completar Fase 3: US1+US2 — menu + 6 subtelas + routing completo
4. **PARAR E VALIDAR**: rodar `quickstart.md` manualmente, confirmar navegação ponta a ponta

### Incremental Delivery

1. Setup + Foundational → infraestrutura pronta
2. Fase 3 → MVP completo e navegável → considerar entrega
3. Fase 4 + Fase 5 (em paralelo) → cobertura de teste dedicada pras stories restantes
4. Fase 6 → validação manual final + release

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- R-002 (`plan.md`): nunca apagar um teste do arquivo monolítico antes do equivalente existir e passar no arquivo novo — a ordem das tasks acima (testes antes/junto da implementação de cada subtela) já reflete isso.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
