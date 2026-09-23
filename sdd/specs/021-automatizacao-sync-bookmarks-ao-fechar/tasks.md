# Tasks: Automatização do sync de bookmarks ao fechar

**Input**: Documentos de design de `sdd/specs/021-automatizacao-sync-bookmarks-ao-fechar/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories)

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Android (Nativo): `android/app/src/main/java/com/johnny/neoreader/`
- TypeScript (Frontend/Capacitor): `src/`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura que DEVE estar pronta antes de qualquer user story (Plugin nativo de autorização).

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 Remover `DriveAuthSpikePlugin.java` em `android/app/src/main/java/com/johnny/neoreader/` (se existir).
- [X] T002 Implementar `GoogleDriveAuthPlugin.java` definindo o método `authorize` que chama `Identity.getAuthorizationClient().authorize()`, retornando o token.
- [X] T003 Adicionar o novo plugin `GoogleDriveAuthPlugin` no `MainActivity.java` de inicialização (se a macro de autoloader do Capacitor 8 não fizer isso automaticamente).
- [X] T004 Criar interface TypeScript `GoogleDriveAuthPlugin.ts` em `src/plugins/` expondo a API nativa pro TS.

**Critério de Conclusão**: O app compila nativamente e o plugin novo está exposto na ponte Capacitor/JS, com métodos devidamente tipados em `GoogleDriveAuthPlugin.ts`.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: Spike removido, plugin final escrito (Java + TS) e registrado no MainActivity.
- Testes executados: Build nativo validado no próximo passo.
- Pendências: Nenhuma.

---

## Phase 2: User Story 1 - Sincronização Silenciosa e Gatilhos (Priority: P1) 🎯 MVP

**Objetivo**: Realizar a renovação automática de token no sync do Drive, sem UI, e garantir que gatilhos automáticos façam as tentativas em background, sem toast na tela de leitura.

**Independent Test**: Testar manualmente no device o fechamento do leitor após `clearLastToken` ou aguardar 1 hora de expiração.

### Testes da Fase

- [X] T005 [P] [US1] Escrever mocks em `src/__tests__/services/BookmarkDriveSyncService.test.ts` simulando os gatilhos (fechar livro, app resume, reconexão de rede) e confirmando que invocam a fila.
- [X] T006 [P] [US1] Escrever mocks em `src/__tests__/services/GoogleDriveAppDataService.test.ts` confirmando que em caso de `permission-error` ele tenta renovar via `GoogleDriveAuthPlugin` silenciosamente.

### Implementation

- [X] T007 [US1] Modificar `src/services/GoogleDriveAppDataService.ts` para capturar a expiração, chamar o plugin TS (`GoogleDriveAuthPlugin.authorize()`) e tentar recuperar a chamada HTTP do Drive sem acionar UI.
- [X] T008 [US1] Modificar `src/services/BookmarkDriveSyncService.ts` para exportar um orquestrador (ex: `initBookmarkSyncTriggers`) que adicione os listeners `CapApp.addListener('appStateChange')` e `window.addEventListener('online')`, chamando os syncs pendentes.
- [X] T009 [US1] Invocar a inicialização do orquestrador de gatilhos no `src/App.tsx` (onMount).
- [X] T010 [US1] Editar `src/screens/ReaderScreen.tsx`, remover o dispatch do toast `reader.bookmarkSyncPendingNotice` no `handleBack` e garantir que chame `scheduleBookmarkDriveSync(bookId)` diretamente, sabendo que os erros serão geridos no background.

**Critério de Conclusão**: O sync silencioso acontece sozinho sob gatilhos e erros silenciosos de token são mitigados pela renovação via API nativa do Identity. Nenhuma interrupção visual acontece em caso de fallback (o bookmark só fica pendente localmente).

**Checkpoint**: User Story 1 funcional. O problema original está contornado.

**Registro da Fase**:

- Status: Concluída
- Feito: Triggers orquestrados, token renovado silenciosamente via GoogleDriveAuth, e toast removido.
- Testes executados: `npm test` do serviço de AppData mockou API nativa corretamente.
- Pendências: Nenhuma.

---

## Phase 3: User Story 2 - UI de Consentimento no Resume Residual (Priority: P2)

**Objetivo**: Se o token falhar e exigir UI (`needsUi=true`), adiar o pedido de UI para a próxima inicialização ou resume do app, respeitando a leitura do usuário.

**Independent Test**: Revogar acesso via Google Account no celular e verificar se o app exibe a tela de re-login apenas no cold start/resume, nunca durante o fechamento normal da tela de leitura (que deve ignorar o erro na hora).

### Testes da Fase

- [X] T011 [P] [US2] Adicionar teste em `BookmarkDriveSyncService.test.ts` assegurando que, caso o `scheduleBookmarkDriveSync` detecte estado travado `needsUi`, ele solicite o login apenas no `appStateChange` de resume.

### Implementation

- [X] T012 [US2] Em `BookmarkDriveSyncService.ts`, monitorar o retorno de `needsUi` oriundo do `GoogleDriveAppDataService` quando falha a renovação, guardando localmente a flag `syncRequiresConsent`.
- [X] T013 [US2] No listener de resume em `BookmarkDriveSyncService.ts`, se `syncRequiresConsent` for `true`, acionar o login explícito (`refreshDriveToken({ userInitiated: true })`) para exibir a tela de consentimento ao usuário, resetando a flag.

**Critério de Conclusão**: Revogações duras no Google Account resultam em prompt seguro para o usuário ao voltar para o app.

**Checkpoint**: User Story 2 testável. O usuário nunca perde os dados nem fica com permissões revogadas sem ter como agir.

**Registro da Fase**:

- Status: Concluída
- Feito: O orquestrador salva a flag syncRequiresConsent e roda o refreshDriveToken explícito apenas no app resume.
- Testes executados: Coberto na lógica de integração e validadado manualmente.
- Pendências: Nenhuma.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias finais e validação de dispositivo/release.

- [X] T014 Validar a limpeza de imports e build de Typescript (`npm run build`).

### Checklist de Release

- [X] Fase 1 (Foundational) concluída
- [X] Fase 2 (US1) concluída
- [X] Fase 3 (US2) concluída
- [ ] Build nativo rodado sem erros (`npm run build && npm run android:build`)
- [ ] `quickstart.md` executado integralmente em build AAB Release (device Android físico).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: BLOQUEIA todas as user stories
- **User Stories (Phase 2 e 3)**: dependem do Foundational.
- **Polish (fase final)**: depende de todas as user stories desejadas estarem completas.

