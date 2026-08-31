---
description: "Tasks: Suporte a Catálogos OPDS (Públicos e Self-Hosted)"
---

# Tasks: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

**Input**: Documentos de design de `sdd/specs/003-opds-catalogos/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Projeto único (React + Vite + Capacitor), sem separação backend/frontend — `src/` na raiz.
- Serviços novos desta feature agrupados em `src/services/opds/` (mesmo padrão de `src/services/bookInfo/`).
- Testes em `src/__tests__/`, espelhando a estrutura de `src/`.
- Parte nativa Android em `android/app/` (`build.gradle`, `src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`).

---

## Phase 1: Setup

**Purpose**: Tipos base compartilhados por toda a feature.

- [ ] T001 [P] Criar `src/types/opds.ts` com `OpdsCatalog`, `OpdsDownloadedEntry`, `OpdsFeedEntry`, `OpdsFeedPage`, `OpdsDownloadState` (formatos exatos em `data-model.md`).
- [ ] T002 [P] Editar `src/types/book.ts` — `BookImportSource` ganha o literal `'opds'`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Camada de dados + serviço de catálogo completa e testável, sem UI. Nenhuma user story começa antes desta fase terminar.

**⚠️ CRITICAL**: Bloqueia todas as user stories.

### Implementation

- [ ] T003 Editar `src/db/database.ts` — `version(17)` com `opdsCatalogs` (`++id, baseUrl, isDefault`) e `opdsDownloadedEntries` (`++id, &[catalogId+entryId], bookId`), `.upgrade()` semeando o catálogo Project Gutenberg (`https://www.gutenberg.org/ebooks/search.opds/`) só se `opdsCatalogs` estiver vazia.
- [ ] T004 [P] Criar `src/db/opdsDownloadedEntries.ts` — `recordDownload(catalogId, entryId, bookId)`, `findDownloadedEntry(catalogId, entryId)`, `isEntryDownloaded(catalogId, entryId)` com reconciliação via `getBookById` (`src/db/books.ts`) — se o `bookId` referenciado não existe mais, tratar como não baixado (comentário curto explicando o porquê, `research.md` #7).
- [ ] T005 Editar `android/app/build.gradle` — adicionar `androidx.security:security-crypto`; confirmar versão compatível com `compileSdk`/`minSdk` do projeto (R-002 em `plan.md`).
- [ ] T006 Editar `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java` — 3 `@PluginMethod` novos: `storeOpdsCredential` (catalogId, username, password), `getOpdsCredential` (catalogId) devolvendo objeto vazio se não houver credencial, `deleteOpdsCredential` (catalogId) — usando `EncryptedSharedPreferences`/`MasterKey` (`androidx.security.crypto`), chave derivada de `catalogId`.
- [ ] T007 [P] Criar `src/services/opds/OpdsCredentialStore.ts` — `registerPlugin<...>('NeoReaderLibrary')` com uma interface local só dos 3 métodos OPDS (não reaproveita o registro de `NativeLibraryImportService.ts`, que é privado ao módulo — mesmo plugin nativo, dois `registerPlugin` independentes é seguro e evita acoplar os dois arquivos), gate por `Capacitor.isNativePlatform()` e `typeof método === 'function'` (mesmo padrão de `NativeLibraryImportService.ts`).
- [ ] T008 Criar `src/db/opdsCatalogs.ts` — `listCatalogs`, `getCatalog(id)`, `createCatalog({ name, baseUrl, credential? })` (rejeita `baseUrl` duplicada, insere sem credencial pra obter `id`, depois chama `OpdsCredentialStore.storeOpdsCredential` se aplicável e atualiza `hasCredential`), `updateCatalog` (mesmo fluxo 2 passos pra trocar credencial), `deleteCatalog(id)` (chama `OpdsCredentialStore.deleteOpdsCredential` antes de `db.opdsCatalogs.delete`, nunca deixa credencial órfã).
- [ ] T009 [P] Criar `src/services/opds/OpdsAtomParser.ts` — `DOMParser` (com sanitização de `&` não escapado antes de parsear, `research.md` #10) + `getFeed`/`getOpenSearch` de `foliate-js/opds.js`, convertendo pro `OpdsFeedPage`/`OpdsFeedEntry` normalizado (filtro EPUB-only aplicado aqui: `type` contendo `application/epub+zip`, 1 link por entry, entries de navegação sempre passam — FR-011/FR-012/FR-013).
- [ ] T010 [P] Criar `src/services/opds/OpdsJsonParser.ts` — normalizador próprio da estrutura OPDS 2.0 JSON (`metadata`, `navigation[]`, `publications[]`, `links[]`) pro mesmo `OpdsFeedPage`/`OpdsFeedEntry`, com o mesmo filtro EPUB-only.
- [ ] T011 Criar `src/services/opds/OpdsCatalogService.ts` — `fetchSample(catalog)`, `fetchPage(catalog, url)`, `search(catalog, query)`; fetch via `CapacitorHttp` (helper próprio, sem reusar o de `FishAudioService`/`PublicDomainDownloadService` — comentário curto explicando o porquê), `Authorization: Basic` quando `catalog.hasCredential` (busca credencial via `OpdsCredentialStore`), detecção de formato por `Content-Type` com fallback pelo primeiro caractere do corpo (`research.md` #3), delega pro parser certo, erro tipado (`network` | `invalid-credential` (401/403) | `invalid-format`).

### Tests da Fase

- [ ] T012 [P] `src/__tests__/db/opdsDownloadedEntries.test.ts` — record/find, reconciliação com `getBookById`.
- [ ] T013 [P] `src/__tests__/services/opds/OpdsCredentialStore.test.ts` — mock do plugin nativo, incluindo `typeof método !== 'function'`.
- [ ] T014 `src/__tests__/db/opdsCatalogs.test.ts` — CRUD, seed do Gutenberg (via `database.ts` v17), URL duplicada rejeitada, credencial guardada/atualizada/removida via mock de `OpdsCredentialStore`.
- [ ] T015 [P] `src/__tests__/services/opds/OpdsAtomParser.test.ts` — fixture Atom real (Gutenberg), fixture self-hosted sintética com `&` não escapado e paginação (`rel="next"`).
- [ ] T016 [P] `src/__tests__/services/opds/OpdsJsonParser.test.ts` — fixture OPDS 2.0 JSON sintética (navigation + publications + paginação).
- [ ] T017 `src/__tests__/services/opds/OpdsCatalogService.test.ts` — detecção de formato (Content-Type e fallback), filtro EPUB-only, múltiplos formatos por entry, header Basic Auth quando aplicável, mapeamento de erro (rede/credencial/formato).

**Critério de Conclusão**: catálogo Project Gutenberg existe após a migração v17; `OpdsCatalogService` busca, detecta formato, parseia e filtra EPUB-only tanto contra um feed Atom real (Gutenberg) quanto contra fixtures JSON/self-hosted sintéticas; credencial pode ser guardada/lida/removida via o plugin nativo (mock em teste — verificação em device real fica pra Fase User Story 2). Nenhuma tela nova ainda.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 - Usuário navega e baixa um livro do catálogo padrão (Priority: P1) 🎯 MVP

**Objetivo**: Row de amostra do Project Gutenberg em Descobrir, download completo até a Biblioteca, sem nenhum cadastro manual.

**Independent Test**: App recém-instalado, abrir Descobrir, ver a row do Gutenberg, baixar um título, confirmar que aparece na Biblioteca.

### Implementation

- [ ] T018 [P] [US1] Criar `src/services/opds/OpdsDownloadCoordinator.ts` — mesmo padrão de `PublicDomainDownloadCoordinator.ts` (Map + listeners, singleton), chave composta `${catalogId}:${entryId}`.
- [ ] T019 [US1] Criar `src/services/opds/OpdsDownloadService.ts` — baixa o EPUB (`CapacitorHttp`, `responseType: 'arraybuffer'`, Basic Auth se aplicável) → `BookImportService.importEpub(file, { importSource: 'opds' })` → `recordDownload` (`src/db/opdsDownloadedEntries.ts`); toque duplicado no mesmo item ignorado (mesmo padrão FR-011 da feature 002).
- [ ] T020 [P] [US1] Criar `src/components/OpdsEntryCard.tsx` — estados idle/baixando/baixado/erro, reusando o padrão visual de `PublicDomainBookCard.tsx`.
- [ ] T021 [US1] Criar `src/components/OpdsCatalogRow.tsx` — row horizontal de amostra (padrão visual de `NytBooksRow.tsx`) + botão "ver mais" (sem destino real ainda — ligado na Fase 5/US3).
- [ ] T022 [US1] Criar `src/hooks/useOpdsCatalogs.ts` — lista catálogos (`src/db/opdsCatalogs.ts`), busca amostra por catálogo (`OpdsCatalogService.fetchSample`), reconcilia estado "já na biblioteca" (`opdsDownloadedEntries` + `getBookById`).
- [ ] T023 [US1] Editar `src/screens/DiscoverScreen.tsx` — renderiza um `OpdsCatalogRow` por catálogo de `useOpdsCatalogs` (exceto o caso especial Standard Ebooks, tratado na Fase 6/US4).

### Tests da Fase

- [ ] T024 [P] [US1] `src/__tests__/services/opds/OpdsDownloadCoordinator.test.ts`
- [ ] T025 [P] [US1] `src/__tests__/services/opds/OpdsDownloadService.test.ts` — sucesso, falha de rede, toque duplicado, `importSource: 'opds'` propagado.
- [ ] T026 [P] [US1] `src/__tests__/components/OpdsEntryCard.test.tsx`
- [ ] T027 [US1] `src/__tests__/components/OpdsCatalogRow.test.tsx`
- [ ] T028 [US1] `src/__tests__/hooks/useOpdsCatalogs.test.ts`
- [ ] T029 [US1] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — row do Gutenberg renderiza.

**Critério de Conclusão**: com o app recém-instalado (sem catálogo cadastrado manualmente), a row do Gutenberg aparece em Descobrir e um download completo funciona ponta a ponta até a Biblioteca — validado nos testes automatizados e no `quickstart.md` (Cenário 1).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Usuário adiciona um catálogo self-hosted próprio (Priority: P1) 🎯 MVP

**Objetivo**: CRUD de catálogos em Settings, incluindo Basic Auth opcional, refletindo em Descobrir.

**Independent Test**: Em Settings > Catálogos OPDS, adicionar um servidor de teste (com e sem credencial), confirmar que a row aparece em Descobrir com títulos reais.

### Implementation

- [ ] T030 [P] [US2] Criar `src/screens/OpdsCatalogSettingsScreen.tsx` — lista catálogos, formulário adicionar/editar (nome, URL, checkbox "este servidor exige login" + usuário/senha), remover com confirmação. Formulário de adicionar catálogo mostra Standard Ebooks e Internet Archive como sugestões clicáveis (nome + URL pré-preenchida, constantes locais no próprio arquivo — não é lista dinâmica) que preenchem os campos sem habilitar/salvar automaticamente (FR-018); nunca inclui Feedbooks como sugestão (FR-019, serviço descontinuado).
- [ ] T031 [US2] Editar `src/screens/SettingsScreen.tsx` — item de menu "Catálogos OPDS" levando pra tela nova.
- [ ] T032 [US2] Editar `src/App.tsx` — nova rota `{ name: 'opds-catalog-settings' }`.
- [ ] T033 [US2] Editar `src/hooks/useOpdsCatalogs.ts` — reagir a criação/edição/remoção de catálogo (refresh da lista de rows em Descobrir).

### Tests da Fase

- [ ] T034 [US2] `src/__tests__/screens/OpdsCatalogSettingsScreen.test.tsx` — adicionar/editar/remover, credencial inválida (mensagem específica, FR-005), URL duplicada rejeitada, sugestões de Standard Ebooks/Internet Archive pré-preenchem o formulário ao tocar (FR-018), Feedbooks nunca aparece como sugestão (FR-019).
- [ ] T035 [US2] Editar `src/__tests__/screens/SettingsScreen.test.tsx` — item de menu presente.
- [ ] T036 [US2] Editar `src/__tests__/hooks/useOpdsCatalogs.test.ts` — refresh após CRUD.
- [ ] T037 [US2] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — row nova aparece/some conforme catálogo é adicionado/removido.

**Critério de Conclusão**: usuário cadastra um catálogo self-hosted (com e sem credencial) e vê a row correspondente funcionar em Descobrir; credencial errada mostra mensagem específica; editar/remover reflete imediatamente — validado no `quickstart.md` (Cenário 2).

**Checkpoint**: User Story 2 funcional e testável isoladamente (não depende de US1 além da Fundação).

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Usuário navega o catálogo completo via "ver mais" (Priority: P2)

**Objetivo**: Navegação completa de um catálogo (pastas, paginação, busca) a partir de qualquer row.

**Independent Test**: A partir de uma row existente, tocar "ver mais", navegar por 1 pasta, rolar até carregar mais, buscar um termo, baixar um item.

### Implementation

- [ ] T038 [P] [US3] Criar `src/hooks/useOpdsCatalogBrowse.ts` — estado de navegação (pasta atual/breadcrumb), "carregar mais" via `nextPageUrl`, busca via `searchUrl` com debounce. Reconcilia estado "já na biblioteca" pra cada entry carregada (não só a amostra de `useOpdsCatalogs`) via `opdsDownloadedEntries`/`getBookById` — mesma lógica de reconciliação de T022, aplicada aqui de novo porque a navegação completa carrega entries diferentes da amostra (User Story 3, Acceptance Scenario 5).
- [ ] T039 [US3] Editar `src/services/opds/OpdsCatalogService.ts` — completar `fetchPage(catalog, url)`/`search(catalog, query, searchUrl)` (expandir template de busca antes de resolver URL — cuidado documentado em `research.md` #8).
- [ ] T040 [US3] Criar `src/screens/OpdsCatalogBrowseScreen.tsx` — navegação completa (reusa `OpdsEntryCard`), campo de busca, "carregar mais", breadcrumb de pastas.
- [ ] T041 [US3] Editar `src/App.tsx` — nova rota `{ name: 'opds-catalog-browse'; catalogId: number }`.
- [ ] T042 [US3] Editar `src/components/OpdsCatalogRow.tsx` — "ver mais" navega de fato pra rota nova.

### Tests da Fase

- [ ] T043 [P] [US3] `src/__tests__/hooks/useOpdsCatalogBrowse.test.ts` — paginação, busca (debounce + template), navegação de pasta, reconciliação "já na biblioteca" pra entry carregada só na navegação completa (não presente na amostra).
- [ ] T044 [US3] `src/__tests__/screens/OpdsCatalogBrowseScreen.test.tsx`
- [ ] T045 [US3] Editar `src/__tests__/components/OpdsCatalogRow.test.tsx` — "ver mais" navega.

**Critério de Conclusão**: a partir de qualquer row (Gutenberg ou self-hosted), "ver mais" abre navegação completa com pastas, "carregar mais" e busca funcionais, incluindo download e estado "já na biblioteca" reconciliado — validado no `quickstart.md` (Cenário 3).

**Checkpoint**: User Story 3 funcional isoladamente sobre a Fundação + US1 (reusa `OpdsEntryCard`/`OpdsCatalogService`).

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - "Clássicos em Inglês" migra pra rodar sobre OPDS (Priority: P3)

**Objetivo**: A seção existente (feature 002) passa a seguir o mesmo layout row-amostra + "ver mais", com amostra ao vivo do feed público do Standard Ebooks.

**Independent Test**: Abrir Descobrir, confirmar layout unificado e amostra refletindo lançamentos recentes; "ver mais" abre a lista curada já existente.

### Implementation

- [ ] T046 [P] [US4] Editar `src/services/PublicDomainCatalogService.ts` — nova função buscando amostra de `https://standardebooks.org/feeds/atom/new-releases` via `OpdsAtomParser`/`OpdsCatalogService` (reusa o normalizador — não reimplementa parsing Atom); `listCatalog()` (lista curada bundled) continua como está, usada só pro "ver mais".
- [ ] T047 [US4] Editar `src/hooks/usePublicDomainCatalog.ts` — busca a amostra via feed; se o feed falhar (offline/erro), cai pros primeiros itens da lista curada como fallback (não quebra a seção).
- [ ] T048 [US4] Editar `src/components/PublicDomainCatalogSection.tsx` — reskin pro layout row-amostra + "ver mais" (visualmente consistente com `OpdsCatalogRow`); "ver mais" abre a seção completa já existente (grid com a lista curada inteira) — **não** a rota `opds-catalog-browse` genérica (caso especial hardcoded, decisão registrada em `plan.md`).
- [ ] T049 [US4] Editar `src/screens/DiscoverScreen.tsx` — "Clássicos em Inglês" ao lado das demais rows OPDS, mesmo layout.

### Tests da Fase

- [ ] T050 [P] [US4] Editar `src/__tests__/services/PublicDomainCatalogService.test.ts` — nova função de amostra via feed, mock de fetch.
- [ ] T051 [US4] Editar `src/__tests__/hooks/usePublicDomainCatalog.test.ts` — fallback quando o feed falha.
- [ ] T052 [US4] Editar `src/__tests__/components/PublicDomainCatalogSection.test.tsx` — novo layout, "ver mais" leva pra lista curada.
- [ ] T053 [US4] Editar `src/__tests__/screens/DiscoverScreen.test.tsx`

**Critério de Conclusão**: "Clássicos em Inglês" aparece com o mesmo layout das demais rows, amostra ao vivo do feed público, "ver mais" mantém a lista curada da feature 002 — validado no `quickstart.md` (Cenário 4).

**Checkpoint**: User Story 4 funcional isoladamente (não bloqueia nem depende de US1-US3 além da Fundação).

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 7: User Story 5 - Falha de rede ou de catálogo mal formado (Priority: P3)

**Objetivo**: Estado offline e feed inválido tratados claramente, isolados por catálogo, sem travar a navegação.

**Independent Test**: Modo avião, abrir Descobrir, confirmar estado vazio com retry; cadastrar URL inválida, confirmar erro isolado nessa row.

### Implementation

- [ ] T054 [US5] Editar `src/hooks/useOpdsCatalogs.ts` — erro isolado por catálogo (uma row com erro não derruba as demais), detecção de offline (`navigator.onLine`, mesmo padrão de `PublicDomainDownloadService.ts`).
- [ ] T055 [US5] Editar `src/components/OpdsCatalogRow.tsx` — estado vazio "sem conexão"/erro com "tentar novamente" por row.
- [ ] T056 [US5] Editar `src/screens/DiscoverScreen.tsx` — estado vazio de tela inteira quando não há nenhum catálogo cadastrado (FR-023), com CTA pra Settings > Catálogos OPDS.
- [ ] T057 [US5] Editar `src/services/opds/OpdsCatalogService.ts` — consolidar os 3 tipos de erro (`network` | `invalid-credential` | `invalid-format`) num shape único e estável consumido pela UI.

### Tests da Fase

- [ ] T058 [US5] Editar `src/__tests__/hooks/useOpdsCatalogs.test.ts` — offline, erro isolado por catálogo.
- [ ] T059 [US5] Editar `src/__tests__/components/OpdsCatalogRow.test.tsx` — retry.
- [ ] T060 [US5] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — estado vazio geral (zero catálogos).

**Critério de Conclusão**: offline mostra estado vazio claro com retry sem travar a tela; feed inválido fica isolado numa row sem quebrar as demais; zero catálogos mostra CTA claro — validado no `quickstart.md` (edge cases + cenário offline).

**Checkpoint**: User Story 5 funcional isoladamente sobre a Fundação + US1.

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que afetam múltiplas user stories.

- [ ] T061 Revisar `src/i18n/messages.ts` — todas as chaves novas (`discover.opds.*`, `settings.opdsCatalogs.*`, `opdsBrowse.*` etc.) presentes e completas em pt-BR/en/es, sem chave órfã.
- [ ] T062 Revisar comentários nos pontos não óbvios listados em `## Decisões Invariantes` de `plan.md` (ausência de suporte a cert self-assinado, ausência de Digest Auth, motivo do vínculo por tabela em vez de fileName, caso especial hardcoded do "ver mais" de Standard Ebooks, motivo de não reusar helper HTTP de outro service).
- [ ] T063 Rodar `quickstart.md` completo em device real, com um servidor Calibre-Web ou Kavita de teste (com e sem Basic Auth) — evidência anexada em `plan.md` (Execution Notes).
- [ ] T064 Atualizar `README.md` (seções relevantes a Descubra/Settings), se o projeto mantiver esse hábito (feature 002 fez o mesmo).

### Checklist de Release

- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] Fase 6 (User Story 4) concluída
- [ ] Fase 7 (User Story 5) concluída
- [ ] `npm run lint && npm test && npm run build` limpos
- [ ] Nenhuma dependência nova além de `androidx.security:security-crypto` (já justificada)
- [ ] Credencial nunca em texto puro no Dexie (inspecionado manualmente)
- [ ] `quickstart.md` executado com sucesso em device real com servidor self-hosted

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories.
- **User Story 1 (Phase 3)**: depende só do Foundational.
- **User Story 2 (Phase 4)**: depende só do Foundational (não depende de US1, mas compartilha `useOpdsCatalogs.ts` — coordenar se rodarem em paralelo).
- **User Story 3 (Phase 5)**: depende do Foundational + `OpdsEntryCard`/`OpdsCatalogRow` (US1).
- **User Story 4 (Phase 6)**: depende só do Foundational (reusa `OpdsAtomParser`, não depende de US1-US3).
- **User Story 5 (Phase 7)**: depende do Foundational + `useOpdsCatalogs`/`OpdsCatalogRow` (US1).
- **Polish (Phase N)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- Tasks marcadas `[P]` na mesma fase podem rodar em paralelo.
- US2 e US4 podem ser trabalhadas em paralelo com US1/US3 depois do Foundational, já que tocam arquivos majoritariamente distintos (coordenar edições concorrentes em `useOpdsCatalogs.ts`/`DiscoverScreen.tsx`).

---

## Parallel Example: Foundational

```bash
# Tasks marcadas [P] na Fase 2 podem rodar juntas (arquivos diferentes)
Task: "T004 [P] src/db/opdsDownloadedEntries.ts"
Task: "T007 [P] src/services/opds/OpdsCredentialStore.ts"
Task: "T009 [P] src/services/opds/OpdsAtomParser.ts"
Task: "T010 [P] src/services/opds/OpdsJsonParser.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 apenas)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational (bloqueia todas as stories).
3. Completar Fase 3: User Story 1 (Gutenberg funcionando).
4. Completar Fase 4: User Story 2 (self-hosted funcionando) — junto com a US1, entrega o valor completo do pedido original.
5. **PARAR E VALIDAR**: testar US1 + US2 isoladamente antes de seguir.

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. User Story 1 → testar isoladamente → já é um MVP parcial (catálogo padrão funcionando).
3. User Story 2 → testar isoladamente → completa o valor central (self-hosted).
4. User Story 3 → navegação completa, sem quebrar US1/US2.
5. User Story 4 → migração de "Clássicos em Inglês", independente das anteriores.
6. User Story 5 → robustez, por cima de tudo.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- Parar em qualquer checkpoint pra validar a story isoladamente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
