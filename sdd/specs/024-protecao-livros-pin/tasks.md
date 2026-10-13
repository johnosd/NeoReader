---
description: "Lista de tasks para a feature 024 — Proteção de livros com PIN"
---

# Tasks: Proteção de livros com PIN e grupo "Protegidos" na Biblioteca

**Input**: Documentos de design de `sdd/specs/024-protecao-livros-pin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks agrupadas por user story, em **duas entregas**:

- **Release 1 (MVP)**: Fases 1, 2 e 3 (US1) + a parte A da Fase 4 (recuperação do
  PIN: T038, T039, T058, T042, T043, T059) + a Polish. Esqueci o PIN **tem** que ir
  junto com a US1: sem recuperação, esquecer o PIN tranca o usuário (spec, Assumptions).
- **Release 2**: parte B da Fase 4 (Alterar PIN e Desativar proteção em Configurações:
  T040, T041, T044) e Fase 5 (US3, filtro "Protegidos"; espera a feature 023
  convergir, R-005).

Tasks marcadas **(R2)** pertencem à Release 2. Sem (R2) = Release 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

Projeto único; raiz do repositório = `NeoReader/` (onde está o `package.json`).

- Código: `src/` (`components/`, `screens/`, `hooks/`, `services/`, `db/`, `store/`, `types/`, `utils/`, `i18n/`)
- Testes: `src/__tests__/`, espelhando `src/` (`components/`, `hooks/`, `services/`, `db/`, `store/`, `utils/`, `screens/`)
- Imports absolutos via alias `@/`; testes importam `describe`/`it`/`expect` de `'vitest'`
- Documentação da feature: `sdd/specs/024-protecao-livros-pin/`
- Textos novos: chaves `bookLock.*` em `src/i18n/messages.ts` (pt-BR, en, es)

## Phase 1: Setup (verificações e spikes)

**Purpose**: confirmar premissas do plano antes de escrever código. Nada aqui é código de produção.

- [x] T001 Conferir em `src/db/database.ts` que `version(19)` ainda é a última (a feature 023 não pode ter adicionado outra) e ver em `sdd/specs/023-selecao-multipla-biblioteca/tasks.md` se a 023 já fechou. Registrar o número da nova versão e a situação da 023 em `plan.md` → Riscos (R-005).
- [x] T002 [P] Checagem estática do caminho nativo: confirmar em `android/variables.gradle` que `minSdkVersion` ≥ 24 (cobre `KeyguardManager.isDeviceSecure()`, API 23) e, em `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`, que o request code `4703` está livre (hoje `requestCodes = { 4701, 4702 }`) e que `handleOnActivityResult` ainda retorna cedo para códigos desconhecidos. Registrar em `research.md` → D-004. A validação no aparelho é a T059 (Fase 4).
- [ ] T003 [P] Spike manual no aparelho: medir `crypto.subtle` PBKDF2-SHA-256 com 100 000 iterações num Android intermediário. Se passar de ~300 ms, adotar 50 000. Registrar o valor medido em `research.md` → D-002.

**Checkpoint**: premissas confirmadas ou plano ajustado.

**Registro da Fase**:

- Status: Parcial: T001 e T002 concluídas; T003 pendente (precisa do aparelho).
- Feito: T001: `version(19)` era a última e o código da 023 já está commitado (restam só validações manuais dela). T002: `minSdkVersion` 24 cobre `isDeviceSecure()`, o request code 4703 estava livre e `handleOnActivityResult` retorna cedo para códigos desconhecidos.
- Testes executados: n/a (verificações por leitura de código).
- Pendências: T003: medir PBKDF2 com 100 000 iterações no Android; se passar de ~300 ms, reduzir `PIN_HASH_ITERATIONS` em `src/utils/pinCrypto.ts` para 50 000 e registrar em research.md D-002.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: dados, regras puras, store e textos que todas as stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [x] T004 [P] Criar `src/types/bookProtection.ts` (`BookProtectionRecord`, conforme `data-model.md`) e adicionar `isProtected?: boolean` ao `Book` em `src/types/book.ts`, com comentário de que não é indexado (precedente feature 022).
- [x] T005 [P] Criar `src/utils/pinLockout.ts`: funções puras `registerFailure(state, now)`, `registerSuccess()`, `getRemainingLockMs(state, now)` e as constantes `ATTEMPTS_PER_ROUND = 5`, `BASE_LOCK_MS = 30_000`, `MAX_LOCK_MS = 3_600_000` (D-08). Sem acesso a banco nem a `Date.now()` interno: o relógio entra por parâmetro.
- [x] T006 [P] Criar `src/utils/pinCrypto.ts`: `isValidPinFormat(pin)` (4–6 dígitos), `hashPin(pin, { salt?, iterations? })` e `verifyPin(pin, record)` com PBKDF2-SHA-256 via `crypto.subtle` e comparação em tempo constante. Comentar o porquê do PBKDF2 e o limite do PIN curto (D-01). Seguir o uso de `crypto.subtle` de `src/services/BookImportService.ts`.
- [x] T007 Em `src/db/database.ts`: importar `BookProtectionRecord`, declarar `bookProtection!: Table<BookProtectionRecord, number>` e adicionar `this.version(20).stores({ ...mapa da v19, bookProtection: 'id' })` com comentário (feature 024). Criar `src/db/bookProtection.ts` (`getBookProtection`, `saveBookProtection`, `clearBookProtection`) e, em `src/db/books.ts`, `setBookProtected(id, isProtected)` e `clearAllBooksProtected()`.
- [x] T008 Criar `src/services/BookProtectionService.ts` (classe estática, como os demais services): `hasPin()`, `getLockStatus()`, `createPin(pin)`, `verify(pin)` (aplica e persiste a espera de `pinLockout`; devolve `{ ok: true } | { ok: false, attemptsLeft, lockedUntil }`), `replacePin(pin)` (zera espera), `disable()` (transação: `clearAllBooksProtected` + `clearBookProtection`). Nenhum `logEvent`/`console` recebe o PIN (FR-012).
- [x] T009 [P] Criar `src/store/bookLockStore.ts` (Zustand): `unlocked`, `prompt`, `lock()`, `unlock()`, `requestUnlock(options?: { force?: boolean })` reentrante, `settlePrompt(ok)`. Sem `force`, devolve `true` direto se já desbloqueado; com `force: true` sempre abre o prompt (usado por "Alterar PIN" e "Desativar proteção", FR-014). `lock()` NÃO toca no prompt aberto (data-model). Comentar o motivo.
- [x] T010 [P] Adicionar as chaves `bookLock.*` em `src/i18n/messages.ts` nos 3 locales (pt-BR, en, es): títulos e rótulos do prompt/setup/recuperação, erros ("PIN incorreto", "tente de novo em {seconds} s"), ações (Proteger com PIN, Remover proteção, Bloquear agora, Desbloquear), filtro "Protegidos", aviso "Desbloqueie para selecionar", rótulos de acessibilidade do cadeado e entradas de Configurações. Pluralização onde houver contagem.
- [x] T011 Em `src/hooks/useCapacitorAppListener.ts`: o listener `backButton` das telas passa a ser ignorado enquanto `useBookLockStore.getState().prompt !== null`; adicionar um caminho para o próprio prompt que não é ignorado e fecha adiando para o próximo macrotask (D-008 da research). Comentar o porquê (todos os listeners do mesmo evento disparam).

### Testes da Fase

- [x] T012 [P] `src/__tests__/utils/pinLockout.test.ts`: 4 erros não travam; 5º trava 30 s; rodada seguinte 60 s; 120 s; teto de 1 h; acerto zera tudo; tentativa durante a espera não altera o estado; `getRemainingLockMs` nunca negativo.
- [x] T013 [P] `src/__tests__/utils/pinCrypto.test.ts`: formatos válidos (4, 5, 6 dígitos) e inválidos (3, 7, letras, espaço, vazio); hash e verificação ida e volta; PINs iguais com salts diferentes geram hashes diferentes; PIN errado falha.
- [x] T014 `src/__tests__/db/bookProtection.test.ts` (com `@/db/database` mockado, padrão de `settings.test.ts`): `saveBookProtection` grava com `id: 1`; `clearBookProtection`; `setBookProtected`; `clearAllBooksProtected` só toca os que estavam `true`.
- [x] T015 `src/__tests__/services/BookProtectionService.test.ts`: criar e verificar; 5 erros persistem `lockedUntil`; tentativa na espera não é verificada; acerto zera; `replacePin` zera a espera; `disable` limpa livros e registro numa transação; nenhum `console`/`logEvent` recebe o PIN.
- [x] T016 [P] `src/__tests__/store/bookLockStore.test.ts`: `requestUnlock` com `unlocked` devolve `true` sem abrir prompt; com `{ force: true }` abre o prompt mesmo desbloqueado e só resolve `true` com PIN correto; duas chamadas simultâneas compartilham a Promise; `settlePrompt(true)` marca `unlocked`; `lock()` não resolve prompt aberto.
- [x] T017 `src/__tests__/hooks/useCapacitorAppListener.backGuard.test.tsx`: com prompt aberto, o handler da tela não é chamado; sem prompt, é chamado; o handler do prompt é chamado e o prompt só fecha no macrotask seguinte.
- [x] T018 Rodar `src/__tests__/i18n/messages.test.ts` e confirmar que as chaves novas existem nos 3 locales.

**Critério de Conclusão**: tipos, v20, utils, service, store e textos existem; `npx tsc --noEmit` e os testes T012–T018 passam; `npm run build` limpo. Nenhuma tela mudou ainda.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída.
- Feito: Tipos (`BookProtectionRecord`, `Book.isProtected`), Dexie `version(20)` + repositório, `pinLockout`, `pinCrypto` (PBKDF2), `BookProtectionService`, `bookLockStore`, 61 chaves `bookLock.*` ×3 locales e a guarda do voltar em `useCapacitorAppListener`. Desvio do plano: o store também guarda `setup`/`requestPinSetup` (a criação do PIN passa pelo store para a guarda do voltar cobri-la).
- Testes executados: `npx vitest run` dos 7 arquivos da fase: 50 passando; `npx tsc --noEmit` limpo; `npm run build` ok.
- Pendências: Nenhuma.

---

## Phase 3: User Story 1 - Proteger um livro e exigir PIN para abrir (Priority: P1) 🎯 MVP

**Objetivo**: criar o PIN, proteger livros, e nenhum livro protegido abre, é ouvido, ou é alterado sem PIN; tudo re-bloqueia ao sair do app.

**Independent Test**: sem PIN, proteger um livro pela folha de ações (criando o PIN 1234), tocar nele e ver o PIN; digitar 1234 e ver o livro abrir; mandar o app para segundo plano, voltar e ver o pedido de PIN de novo.

### Implementation

- [x] T019 [P] [US1] Criar `src/components/PinPad.tsx`: teclado numérico, pontos mascarados (4–6), apagar, rótulos acessíveis (FR-022), `disabled` durante a espera. Tokens do design system (sem cores hardcoded).
- [x] T020 [P] [US1] Criar `src/components/PinSetupSheet.tsx`: modos `create` e `change`; digitar o PIN, depois confirmar; erros de "diferentes" e "curto demais" (FR-002). Chama `BookProtectionService.createPin`/`replacePin` e, se concluir, `unlock()` do store (quem acabou de definir o PIN o conhece; o livro recém-protegido fica com cadeado aberto até sair do app).
- [x] T021 [US1] Criar `src/components/PinVerifySheet.tsx`: usa `PinPad`, chama `BookProtectionService.verify`, mostra "PIN incorreto", contagem regressiva da espera (relógio de 1 s a partir de `lockedUntil`) e resolve o prompt do store. Sem o link "Esqueci o PIN" (vem na US2). Registra o handler de voltar pelo caminho do prompt (T011).
- [x] T022 [US1] Criar `src/hooks/useBookLock.ts`: `{ unlocked, guard(book), lockNow() }`, onde `guard` devolve `true` direto se o livro não é protegido ou já está desbloqueado, senão `requestUnlock()`.
- [x] T023 [US1] Criar `src/components/BookLockHost.tsx`: renderiza `PinVerifySheet` quando `prompt !== null`; `useCapacitorAppStateChange` chama `lock()` quando `isActive === false` (D-007). Montar uma única vez.
- [x] T024 [US1] Criar `src/components/BookLockGate.tsx` (props: `book`, `onDenied`, `children`): consulta o registro vivo por `id` com `useLiveQuery` (nunca o snapshot, R-004), renderiza em branco enquanto carrega; se protegido e nunca desbloqueado na montagem, não monta os filhos e pede o PIN (`onDenied` se cancelar); depois do primeiro desbloqueio monta os filhos; se re-bloquear, mantém montado, cobre com overlay opaco acima do `BottomSheet` e aplica `inert` + `aria-hidden` (D-06). Comentar o porquê de não desmontar.
- [x] T025 [US1] Em `src/App.tsx`: envolver as rotas `book-details` e `reader` com `BookLockGate` (`onDenied={pop}`), e montar `BookLockHost` junto ao `renderWithExternalImportFeedback`, só quando logado.
- [x] T026 [P] [US1] Criar `src/components/BookLockBadge.tsx` (cadeado fechado/aberto, rótulo "protegido, bloqueado/desbloqueado") e usá-lo em `src/components/BookCard.tsx`, `src/components/HeroBanner.tsx`, `src/components/LibraryGridView.tsx` e na linha da lista de `src/screens/LibraryScreen.tsx` (`LibraryBookRow`). Livro não protegido: nada muda (FR-020).
- [x] T027 [US1] Em `src/components/QuickBookActionsSheet.tsx`: linha "Proteger com PIN" (sem PIN existente abre `PinSetupSheet` e só protege se concluir, FR-003; com PIN existente protege direto, FR-005) e, para livro protegido já desbloqueado, "Remover proteção" e "Bloquear agora".
- [x] T028 [US1] Em `src/screens/LibraryScreen.tsx` e `src/screens/HomeScreen.tsx`: os pontos que abrem o `QuickBookActionsSheet` (`setOptionsBook`) e o editor de tags (`setTagEditorBook`) passam por `guard(book)` antes de abrir (FR-007).
- [x] T029 [US1] Em `src/screens/BookDetailsScreen.tsx`: ação "Proteger com PIN" / "Remover proteção" / "Bloquear agora" usando o livro vivo (`liveBook`), mesmas regras de T027. A tela já está atrás do gate.
- [x] T055 [US1] Ocultar os dados extras de livro protegido e bloqueado (FR-006, US1-AS4): em `src/hooks/useBookLock.ts` expor `isConcealed(book)` (protegido **e** bloqueado) e usá-lo para esconder autor, progresso (% e barra), status de leitura, chips de tag, favorito, formato/nome de arquivo e aviso de arquivo ausente em `src/components/BookCard.tsx`, `src/components/HeroBanner.tsx`, `src/components/LibraryGridView.tsx` (`GridBookCard`) e `LibraryBookRow` em `src/screens/LibraryScreen.tsx`. Capa, título e cadeado permanecem. Filtros e busca NÃO mudam (spec, Assumptions). Depende de T022 e T026.

### Testes da Fase

- [x] T030 [P] [US1] `src/__tests__/components/PinPad.test.tsx`: digitar monta o PIN, apagar, limite de 6, `disabled` ignora toques, rótulos acessíveis.
- [x] T031 [P] [US1] `src/__tests__/components/PinSetupSheet.test.tsx`: PINs diferentes e curtos demais são rejeitados e nada é criado; PINs iguais chamam `createPin` e deixam o store desbloqueado; cancelar não cria e não desbloqueia; re-renderizar (simula rotação/redimensionamento) nunca expõe o PIN digitado em texto.
- [x] T032 [US1] `src/__tests__/components/PinVerifySheet.test.tsx`: PIN errado mostra erro e limpa o campo; 5 erros mostram a contagem e bloqueiam o teclado (timers falsos); espera continua se o componente remontar; PIN correto resolve `true`.
- [x] T033 [US1] `src/__tests__/components/BookLockGate.test.tsx`: protegido+bloqueado não monta os filhos; cancelar chama `onDenied`; PIN correto monta; re-bloquear mantém os filhos montados com `inert` e overlay (FR-010); **livro protegido depois do snapshot da rota é bloqueado** (R-004); livro sem `id` ou não protegido passa direto.
- [x] T034 [US1] `src/__tests__/components/BookLockHost.test.tsx`: `appStateChange` com `isActive: false` chama `lock()`; com `true` não; mock de `@capacitor/app`. **TTS (FR-010)**: `lock()` e o re-bloqueio **não** chamam `TtsPlaybackSessionService.stop`/`updatePlaybackState` nem nenhum método de pausa do TTS; um `playbackControl` (play, pausar, próximo, anterior) recebido depois do re-bloqueio continua sendo tratado pelo leitor, que segue montado.
- [x] T035 [US1] Editar `src/__tests__/components/QuickBookActionsSheet.test.tsx`: proteger sem PIN abre a criação; com PIN protege direto; desprotegido bloqueado exige PIN; os testes existentes seguem verdes sem edição (FR-020).
- [x] T036 [P] [US1] `src/__tests__/components/BookLockBadge.test.tsx` e regressão: `BookCard`/`LibraryGridView` de livro não protegido não renderizam cadeado.
- [x] T037 [US1] Editar `src/__tests__/App.test.tsx`: abrir livro protegido pede PIN; cancelar volta à tela anterior; PIN correto abre; uma rota `reader` empurrada diretamente para livro protegido (como o fluxo de "abrir com" faz depois de importar) também pede PIN. O "abrir com" de um arquivo já importado continua só mostrando "Este livro já está na biblioteca" e não abre nada (o import rejeita duplicata).
- [x] T056 [US1] `src/__tests__/components/BookLockConcealment.test.tsx`: `BookCard`, `HeroBanner`, `LibraryGridView` e a linha da lista de livro protegido **bloqueado** mostram só capa, título e cadeado (sem autor, %, status, tags, favorito, formato, arquivo ausente); **desbloqueado** mostra tudo como um livro comum; livro não protegido nunca é ocultado (FR-020).
- [x] T057 [US1] `src/__tests__/screens/BookDetailsScreen.protect.test.tsx`: "Proteger com PIN" sem PIN abre a criação; com PIN protege direto; "Remover proteção" e "Bloquear agora" aparecem só para livro protegido e desbloqueado; usa o livro vivo, não o snapshot da rota.

**Critério de Conclusão**: com PIN criado, nenhuma via (lista, grade, Home, busca, Detalhes, leitor) mostra conteúdo ou aplica ação em livro protegido bloqueado sem PIN; enquanto bloqueado o livro mostra só capa, título e cadeado; um PIN libera todos; sair do app re-bloqueia; "Bloquear agora" funciona; livros comuns não mudam. `npx tsc --noEmit`, testes T030–T037, T056 e T057 e `npm run build` limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (código e testes). Validação no aparelho pendente (T054).
- Feito: PinPad, PinVerifySheet, PinSetupSheet, BookLockHost, BookLockGate (wrapper `div.contents` sempre presente), BookLockBadge e `useBookLock`; `App.tsx` com gate nas rotas e host; cartão, hero, grade e linha da lista ocultam dados extras; folha de ações e Detalhes protegem/desprotegem/bloqueiam; guards em Biblioteca e Home. Desvio: FR-017 (seleção recusa livro bloqueado e limpa a seleção ao re-bloquear) foi antecipado da Fase 5, porque sem isso a ação em lote excluiria livro bloqueado sem PIN.
- Testes executados: `npx vitest run` em App.test (30, 6 novos), PinPad, PinSetupSheet, PinVerifySheet, BookLockGate, BookLockHost, BookLockConcealment, QuickBookActionsSheet e BookDetailsScreen (74): todos passando. Suíte completa: 176 arquivos, 1848 testes.
- Pendências: T054 (quickstart no aparelho: re-bloqueio com TTS e tela apagando, controles da notificação, botão voltar).

---

## Phase 4: User Story 2 - Esqueci o PIN, alterar e desativar (Priority: P2)

**Entrega**: parte A (recuperação: T038, T039, T058, T042, T043, T059) na **Release 1**; parte B (alterar/desativar: T040, T041, T044) na **Release 2**.

**Objetivo**: recuperar o acesso, trocar o PIN e desativar a proteção sem perder livros, progresso ou anotações.

**Independent Test**: com PIN 1234 e dois livros protegidos, "Esqueci o PIN" → digitar a credencial de tela do aparelho → definir 5678. Os dois livros seguem protegidos e abrem com 5678.

### Implementation

- [x] T038 [US2] Método nativo em `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`: `@PluginMethod confirmDeviceCredential(PluginCall call)` com `KeyguardManager` (`isDeviceSecure()` / `createConfirmDeviceCredentialIntent`); sem bloqueio de tela ⇒ `{ supported: false }`; senão `saveCall` + `startActivityForResult` com request code `CONFIRM_DEVICE_CREDENTIAL_REQUEST_CODE = 4703`, adicionado a `requestCodes` do `@CapacitorPlugin` e tratado em `handleOnActivityResult` (`RESULT_OK` ⇒ `{ supported: true, confirmed: true }`, senão `confirmed: false`). Recebe `title` e `description` do JS. Comentar o porquê de `KeyguardManager` em vez de `androidx.biometric` (sem Gradle novo). Precisa de rebuild do APK (`npm run android:run`).
- [x] T039 [US2] Criar `src/services/DeviceCredentialService.ts`: `confirm(): Promise<'confirmed' | 'cancelled' | 'unsupported'>`, com `registerPlugin('NeoReaderLibrary')` próprio (precedente: `NativeSystemUiService.ts`, `OpdsCredentialStore.ts`) e checagem `typeof fn === 'function'` para APK antigo. Fora do Android nativo devolve `'unsupported'`. Em `src/services/FirebaseAuthService.ts`, adicionar `reauthenticateGoogleOnWeb()`: `reauthenticateWithPopup` com `prompt: 'login'`, resultado `'confirmed' | 'cancelled' | 'different-account' | 'offline' | 'failed'`, **nunca** troca a sessão. Em `BookProtectionService.confirmOwnership()` orquestrar: nativo ⇒ credencial do aparelho (`unsupported` ⇒ `'no-device-lock'`); web ⇒ Google.
- [x] T058 [US2] Em `src/components/PinVerifySheet.tsx`: link "Esqueci o PIN" → `confirmOwnership()` → `PinSetupSheet` no modo de redefinição → `BookProtectionService.replacePin` (zera a espera) → desbloqueia. `'no-device-lock'` mostra o aviso e exige confirmação explícita antes do `PinSetupSheet`. Mensagens para `cancelled`, `different-account` e `offline` (FR-013). O prompt aberto sobrevive ao re-bloqueio causado pela tela do sistema (R-002).
- [x] T040 [US2] **(R2)** Criar `src/screens/SettingsBookProtectionScreen.tsx`: sem PIN, explica como proteger; com PIN, "Alterar PIN" (pede o PIN atual por `requestUnlock({ force: true })` mesmo desbloqueado, depois `PinSetupSheet` modo `change`), "Bloquear agora" e "Desativar proteção" (PIN atual por `force: true` + confirmação; chama `BookProtectionService.disable`). Seguir `SettingsLayout`/`ListItem` das outras telas.
- [x] T041 [US2] **(R2)** Em `src/screens/SettingsScreen.tsx` adicionar a entrada "Livros protegidos" (`onOpenBookProtection`) e, em `src/App.tsx`, a rota `settings-book-protection` com `ErrorBoundary`.

### Testes da Fase

- [x] T042 [P] [US2] `src/__tests__/services/DeviceCredentialService.test.ts` (plugin mockado): `supported && confirmed` → `confirmed`; `supported && !confirmed` → `cancelled`; `supported: false` → `unsupported`; método ausente (APK antigo) e plataforma web → `unsupported`. E `src/__tests__/services/FirebaseAuthService.reauthWeb.test.ts` (Firebase mockado): uid igual → `confirmed`; uid diferente → `different-account`; popup fechado → `cancelled`; sem rede → `offline`; **nunca** chama `signInWithGoogle`.
- [x] T043 [US2] Editar `src/__tests__/components/PinVerifySheet.test.tsx`: "Esqueci" confirmado define PIN novo e mantém livros protegidos; cancelado, conta diferente e offline não mudam o PIN antigo; `no-device-lock` exige confirmação explícita e só então redefine; **nenhum caminho chama `signInWithGoogle`**.
- [x] T044 [P] [US2] **(R2)** `src/__tests__/screens/SettingsBookProtectionScreen.test.tsx`: alterar exige PIN atual **mesmo com o app já desbloqueado**; desativar também; desativar pede confirmação, limpa livros e registro; cancelar nada muda; sem PIN mostra o texto explicativo.

### Validação no aparelho

- [ ] T059 [US2] Spike manual no Android real, com o APK reconstruído (`npm run android:run`): (a) com bloqueio de tela, "Esqueci o PIN" abre a tela do sistema; (b) credencial correta ⇒ define PIN novo e livros seguem protegidos; (c) voltar/credencial errada ⇒ PIN antigo continua; (d) sem bloqueio de tela ⇒ aviso e confirmação explícita; (e) com a tela do sistema aberta o app vai para segundo plano e o fluxo **não** é derrubado. Registrar em `research.md` → D-004. Se `createConfirmDeviceCredentialIntent` falhar em `targetSdk 36` ou em algum OEM, **parar e voltar ao usuário** (alternativa: `androidx.biometric`, que exige aprovação de dependência).

**Critério de Conclusão**: o usuário nunca fica trancado fora; "Esqueci o PIN" exige a credencial de tela do aparelho (ou aviso explícito sem bloqueio de tela); alterar e desativar funcionam e exigem o PIN atual mesmo desbloqueado; a sessão do Firebase nunca troca durante a recuperação. Testes T042–T044, T059 e `npm run build` limpos.

**Checkpoint**: US1 + US2 publicáveis juntas.

**Registro da Fase**:

- Status: Código e testes concluídos. T059 (aparelho) pendente.
- Feito: `confirmDeviceCredential` em `NeoReaderLibraryPlugin.java` (request code 4703; compila com `gradlew :app:compileDebugJavaWithJavac`), `DeviceCredentialService` (registro preguiçoso do plugin), `reauthenticateGoogleOnWeb`, `confirmOwnership` (Firebase por import dinâmico), "Esqueci o PIN" no PinVerifySheet e `SettingsBookProtectionScreen` com entrada em Configurações e rota.
- Testes executados: DeviceCredentialService (7), FirebaseAuthService (+6 de reautenticação web), BookProtectionService (14), PinVerifySheet (14), SettingsBookProtectionScreen (5), SettingsScreen: todos passando.
- Pendências: T059: validar no aparelho com o APK reconstruído (credencial correta/errada, sem bloqueio de tela, app em segundo plano durante a tela do sistema).

---

## Phase 5: User Story 3 - Grupo "Protegidos" na Biblioteca (Priority: P3) **(R2)**

**Entrega**: Release 2, depois que a feature 023 convergir.

**Objetivo**: ver todos os protegidos juntos e liberá-los com um PIN; seleção múltipla não pega livros bloqueados.

**Independent Test**: com 3 protegidos entre 10, abrir "Protegidos", ver só os 3 com cadeado, "Desbloquear", PIN, ver os 3 sem cadeado; sair do app e voltar vê cadeados de novo.

### Implementation

- [x] T045 [US3] **(R2)** Em `src/hooks/useLibraryCatalog.ts`: adicionar `'protected'` ao tipo `LibraryFilter` e o ramo em `filterBooks` (`book.isProtected === true`). Independente de tags e coleção (FR-018).
- [x] T046 [US3] **(R2)** Em `src/screens/LibraryScreen.tsx`: chip fixo "Protegidos" com cadeado em `FILTERS`, visível só se `books.some(b => b.isProtected)` (FR-015); com o filtro ativo, faixa com "Desbloquear" (`requestUnlock`) ou "Bloquear agora"; efeito que volta o filtro para `'all'` se o último protegido sumir.
- [x] T047 [US3] **(R2)** Em `src/screens/LibraryScreen.tsx`: `onToggleBook` (grade e lista, inclusive long-press) recusa livro protegido bloqueado e mostra o aviso "Desbloqueie para selecionar" (FR-017); efeito que chama `selection.clear()` quando `unlocked` vira `false` para a seleção nunca conter livro bloqueado.

### Testes da Fase

- [x] T048 [P] [US3] **(R2)** `src/__tests__/hooks/useLibraryCatalog.protected.test.ts`: filtro devolve só protegidos; livro protegido com tag e coleção aparece nos três filtros (FR-018); busca por título continua achando.
- [x] T049 [US3] **(R2)** `src/__tests__/screens/LibraryScreen.protected.test.tsx`: chip some sem protegidos; "Desbloquear" libera todos; sair do app volta os cadeados; long-press e toque em protegido bloqueado não seleciona e avisa; desbloqueado seleciona normalmente; re-bloquear com seleção ativa limpa a seleção.

**Critério de Conclusão**: filtro e desbloqueio coletivo funcionam; nenhum livro protegido bloqueado entra em ação em lote da 023. Testes T048–T049 e `npm run build` limpos.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: Filtro `protected` em `useLibraryCatalog`, chip fixo "Protegidos", faixa Desbloquear/Bloquear agora e reset do filtro quando some o último protegido. A recusa de seleção (T047) já tinha entrado na Fase 3.
- Testes executados: useLibraryCatalog.protected (5) e LibraryScreen.protected (10): todos passando.
- Pendências: Nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: gates cross-cutting e verificação em aparelho.

- [x] T050 Verificar FR-019: ler `src/services/BookmarkDriveSyncModel.ts`, `ProgressDriveSyncModel.ts` e `VocabularyDriveSyncModel.ts` e confirmar que nenhum serializa o registro `Book` nem `isProtected`; registrar a conclusão em `plan.md` → Execution Notes.
- [x] T051 Verificar FR-012: buscar por `console.`/`logEvent`/`DiagnosticsLogger` nos arquivos novos e confirmar que nenhum recebe PIN, hash ou salt (o teste T015 cobre o service; aqui a leitura cobre a UI).
- [x] T052 Revisar comentários (Constituição II): PBKDF2 e limite do PIN, overlay + `inert` em vez de desmontar, fechamento adiado do prompt, snapshot vs registro vivo.
- [x] T053 Rodar `npm run lint && npm test && npm run build`; corrigir regressões. Rodar também `npm run test:debug-epubs` se algum arquivo compartilhado do leitor tiver sido tocado (não deveria).
- [ ] T054 Executar `quickstart.md` no aparelho Android real (re-bloqueio com TTS tocando e tela apagando, controles da notificação com o livro re-bloqueado, botão voltar com prompt, recuperação por credencial de tela, aparelho sem bloqueio de tela, importar livro com o app re-bloqueando).

### Checklist de Release

<!--
  Itens marcados pelo sdd-execute conforme cada fase fecha, mais gates
  cross-cutting da feature. Ecoa o pre-acceptance checklist da constitution.md.
-->

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (User Story 1) concluída
- [x] Fase 4, parte A (recuperação do PIN) concluída (código e testes; T059 no aparelho pendente): **obrigatória junto com a US1** (Release 1)
- [x] Fase 4, parte B (alterar/desativar) concluída (Release 2)
- [x] Fase 5 (User Story 3) concluída (Release 2, depois da 023)
- [ ] TTS: re-bloqueio não interrompe o áudio e os controles da notificação seguem funcionando (cenário 2 do quickstart)
- [x] R-001 decidido pelo usuário em 2026-10-12: credencial de bloqueio de tela do aparelho (spec revisada)
- [ ] T059 confirmou `KeyguardManager` no aparelho (ou o usuário aprovou a alternativa)
- [ ] APK reconstruído (`npm run android:run`) com o método nativo novo
- [x] `npm run lint && npm test && npm run build` limpos (1848 testes passando, 2026-10-12)
- [x] Nenhuma dependência nova no `package.json` (git diff vazio)
- [x] Schema: apenas `version(20)` adicionada, v19 intocada (git diff só com adições)
- [ ] `quickstart.md` executado no aparelho Android com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências. T003 pode alterar T006; T001 bloqueia T007; T002 é só leitura e antecede T038.
- **Foundational (Phase 2)**: depende do Setup; BLOQUEIA todas as user stories.
- **US1 (Phase 3)**: depende do Foundational.
- **US2 (Phase 4)**: depende da US1 (`PinVerifySheet`, `PinSetupSheet`, `BookLockHost`). Publicar junto.
- **US3 (Phase 5)**: depende da US1 e, para a seleção (T047), da feature 023 estar estável (R-005).
- **Polish (Phase 6)**: depende das stories desejadas.

### Parallel Opportunities

- Fase 2: T004, T005, T006, T009, T010 em paralelo (arquivos diferentes); T007 depende de T004; T008 depende de T005, T006, T007.
- Fase 3: T019, T020, T026 em paralelo; T021 depende de T019 e T008; T024 depende de T022 e T009; T025 depende de T023 e T024; T055 depende de T022 e T026; T056 e T057 dependem de T055 e T029.
- Fase 4: T038 antes de T039; T058 depende de T039 e de T021; T059 depende de T038, T039 e T058; T042 e T044 em paralelo.

### Parallel Example: Fase 2

```bash
Task: "T004 [P] Tipos em src/types/bookProtection.ts"
Task: "T005 [P] Máquina de espera em src/utils/pinLockout.ts"
Task: "T006 [P] Hash do PIN em src/utils/pinCrypto.ts"
Task: "T009 [P] Store em src/store/bookLockStore.ts"
```

---

## Implementation Strategy

### Release 1 (MVP): US1 + recuperação do PIN

1. Fase 1: confirmar premissas (T001–T003).
2. Fase 2: fundação (T004–T018).
3. Fase 3: US1 (inclui T055–T057, a ocultação de dados extras).
4. Fase 4, parte A: T038, T039, T058, T042, T043, T059 (sem ela não há release: risco de trancar o usuário).
5. Fase 6, itens aplicáveis (T050–T054).
6. **PARAR E VALIDAR**: `quickstart.md` cenários 1 a 5 e 8 a 9.

### Release 2

1. Fase 4, parte B: T040, T041, T044 (Alterar PIN e Desativar proteção).
2. Fase 5 (US3) depois que a 023 convergir.
3. Reexecutar `quickstart.md` cenários 6 e 7.

**Peso real do corte**: a Release 2 são 8 tasks de ~70. A maior parte do esforço
(fundação, gate, testes, i18n, acessibilidade) é a Release 1 e **não** dá para
cortar sem abrir buraco de segurança ou trancar o usuário.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente (em português, `feat: ...`)
- Parar em qualquer checkpoint pra validar a story isoladamente
- Nunca editar `ReaderScreen.tsx`/`EpubViewer.tsx` nesta feature (D-05)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
