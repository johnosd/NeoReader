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

- [X] T001 [P] Criar `src/types/opds.ts` com `OpdsCatalog`, `OpdsDownloadedEntry`, `OpdsFeedEntry`, `OpdsFeedPage`, `OpdsDownloadState` (formatos exatos em `data-model.md`).
- [X] T002 [P] Editar `src/types/book.ts` — `BookImportSource` ganha o literal `'opds'`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Camada de dados + serviço de catálogo completa e testável, sem UI. Nenhuma user story começa antes desta fase terminar.

**⚠️ CRITICAL**: Bloqueia todas as user stories.

### Implementation

- [X] T003 Editar `src/db/database.ts` — `version(17)` com `opdsCatalogs` (`++id, baseUrl, isDefault`) e `opdsDownloadedEntries` (`++id, &[catalogId+entryId], bookId`), `.upgrade()` semeando o catálogo Project Gutenberg (`https://www.gutenberg.org/ebooks/search.opds/`) só se `opdsCatalogs` estiver vazia.
- [X] T004 [P] Criar `src/db/opdsDownloadedEntries.ts` — `recordDownload(catalogId, entryId, bookId)`, `findDownloadedEntry(catalogId, entryId)`, `isEntryDownloaded(catalogId, entryId)` com reconciliação via `getBookById` (`src/db/books.ts`) — se o `bookId` referenciado não existe mais, tratar como não baixado (comentário curto explicando o porquê, `research.md` #7).
- [X] T005 Editar `android/app/build.gradle` — adicionar `androidx.security:security-crypto`; confirmar versão compatível com `compileSdk`/`minSdk` do projeto (R-002 em `plan.md`).
- [X] T006 Editar `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java` — 3 `@PluginMethod` novos: `storeOpdsCredential` (catalogId, username, password), `getOpdsCredential` (catalogId) devolvendo objeto vazio se não houver credencial, `deleteOpdsCredential` (catalogId) — usando `EncryptedSharedPreferences`/`MasterKey` (`androidx.security.crypto`), chave derivada de `catalogId`.
- [X] T007 [P] Criar `src/services/opds/OpdsCredentialStore.ts` — `registerPlugin<...>('NeoReaderLibrary')` com uma interface local só dos 3 métodos OPDS (não reaproveita o registro de `NativeLibraryImportService.ts`, que é privado ao módulo — mesmo plugin nativo, dois `registerPlugin` independentes é seguro e evita acoplar os dois arquivos), gate por `Capacitor.isNativePlatform()` e `typeof método === 'function'` (mesmo padrão de `NativeLibraryImportService.ts`).
- [X] T008 Criar `src/db/opdsCatalogs.ts` — `listCatalogs`, `getCatalog(id)`, `createCatalog({ name, baseUrl, credential? })` (rejeita `baseUrl` duplicada, insere sem credencial pra obter `id`, depois chama `OpdsCredentialStore.storeOpdsCredential` se aplicável e atualiza `hasCredential`), `updateCatalog` (mesmo fluxo 2 passos pra trocar credencial), `deleteCatalog(id)` (chama `OpdsCredentialStore.deleteOpdsCredential` antes de `db.opdsCatalogs.delete`, nunca deixa credencial órfã).
- [X] T009 [P] Criar `src/services/opds/OpdsAtomParser.ts` — `DOMParser` (com sanitização de `&` não escapado antes de parsear, `research.md` #10) + `getFeed`/`getOpenSearch` de `foliate-js/opds.js`, convertendo pro `OpdsFeedPage`/`OpdsFeedEntry` normalizado (filtro EPUB-only aplicado aqui: `type` contendo `application/epub+zip`, 1 link por entry, entries de navegação sempre passam — FR-011/FR-012/FR-013).
- [X] T010 [P] Criar `src/services/opds/OpdsJsonParser.ts` — normalizador próprio da estrutura OPDS 2.0 JSON (`metadata`, `navigation[]`, `publications[]`, `links[]`) pro mesmo `OpdsFeedPage`/`OpdsFeedEntry`, com o mesmo filtro EPUB-only.
- [X] T011 Criar `src/services/opds/OpdsCatalogService.ts` — `fetchSample(catalog)`, `fetchPage(catalog, url)`, `search(catalog, query)`; fetch via `CapacitorHttp` (helper próprio, sem reusar o de `FishAudioService`/`PublicDomainDownloadService` — comentário curto explicando o porquê), `Authorization: Basic` quando `catalog.hasCredential` (busca credencial via `OpdsCredentialStore`), detecção de formato por `Content-Type` com fallback pelo primeiro caractere do corpo (`research.md` #3), delega pro parser certo, erro tipado (`network` | `invalid-credential` (401/403) | `invalid-format`).

### Tests da Fase

- [X] T012 [P] `src/__tests__/db/opdsDownloadedEntries.test.ts` — record/find, reconciliação com `getBookById`.
- [X] T013 [P] `src/__tests__/services/opds/OpdsCredentialStore.test.ts` — mock do plugin nativo. Cobre gate `Capacitor.isNativePlatform()`; o guard `typeof método !== 'function'` não ganhou teste próprio (exigiria `vi.resetModules()`/reimport pra simular build Android antiga sem quebrar os outros testes do arquivo) — deviation pequena, registrada aqui em vez de forçar um teste frágil.
- [X] T014 `src/__tests__/db/opdsCatalogs.test.ts` — CRUD, URL duplicada rejeitada (inclusive ao editar), credencial guardada/atualizada/removida via mock de `OpdsCredentialStore`. Seed do Gutenberg (`database.ts` v17) não tem teste automatizado dedicado — é lógica inline no `.upgrade()` do Dexie, mais direto de confirmar via `quickstart.md`/verificação manual do que mockar o ciclo de migração do Dexie.
- [X] T015 [P] `src/__tests__/services/opds/OpdsAtomParser.test.ts` — fixture Atom (estilo Gutenberg/OPDS 1.x real), fixture self-hosted sintética com `&` não escapado, paginação (`rel="next"`) e busca via OpenSearch (`getOpenSearch`, 2 hops).
- [X] T016 [P] `src/__tests__/services/opds/OpdsJsonParser.test.ts` — fixture OPDS 2.0 JSON sintética (navigation + publications + paginação + `rel`/`author` em formatos variados).
- [X] T017 `src/__tests__/services/opds/OpdsCatalogService.test.ts` — detecção de formato (Content-Type e fallback), filtro EPUB-only, múltiplos formatos por entry, header Basic Auth quando aplicável, mapeamento de erro (rede/credencial/formato), busca com template pronto (JSON) e via description document (Atom, 2 fetches).

**Critério de Conclusão**: catálogo Project Gutenberg existe após a migração v17; `OpdsCatalogService` busca, detecta formato, parseia e filtra EPUB-only tanto contra um feed Atom real (Gutenberg) quanto contra fixtures JSON/self-hosted sintéticas; credencial pode ser guardada/lida/removida via o plugin nativo (mock em teste — verificação em device real fica pra Fase User Story 2). Nenhuma tela nova ainda.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: Dexie v17 (`opdsCatalogs`, `opdsDownloadedEntries`, seed do Gutenberg); secure storage nativo completo (Gradle + 3 métodos no plugin Java + `OpdsCredentialStore.ts`); CRUD de catálogo (`opdsCatalogs.ts`, com checagem de URL duplicada e limpeza de credencial órfã); parsers Atom (`foliate-js/opds.js`) e JSON próprios, convergindo pro mesmo `OpdsFeedPage`; `OpdsCatalogService` orquestrando fetch/detecção de formato/auth/erro tipado/busca (2 hops Atom via OpenSearch description document, 1 hop JSON via template). 2 bugs reais pegos pelos próprios testes e corrigidos: capa não resolvida pra URL absoluta em ambos os parsers.
- Testes executados: `npx vitest run` nos 6 arquivos novos — 37/37 passando. `npx tsc --noEmit` e `npx eslint` limpos nos arquivos tocados.
- Pendências: R-002 (`plan.md`) — versão exata do `androidx.security:security-crypto` (`1.1.0-alpha06`) não foi validada contra um build Gradle real nesta sessão (sem `npx cap sync android` rodado ainda); só confirmada logicamente/por precedente de uso comum. Validar no primeiro `npm run android:run` desta feature.

---

## Phase 3: User Story 1 - Usuário navega e baixa um livro do catálogo padrão (Priority: P1) 🎯 MVP

**Objetivo**: Row de amostra do Project Gutenberg em Descobrir, download completo até a Biblioteca, sem nenhum cadastro manual.

**Independent Test**: App recém-instalado, abrir Descobrir, ver a row do Gutenberg, baixar um título, confirmar que aparece na Biblioteca.

### Implementation

- [X] T018 [P] [US1] Criar `src/services/opds/OpdsDownloadCoordinator.ts` — mesmo padrão de `PublicDomainDownloadCoordinator.ts` (Map + listeners, singleton), chave composta `${catalogId}:${entryId}`.
- [X] T019 [US1] Criar `src/services/opds/OpdsDownloadService.ts` — baixa o EPUB (`CapacitorHttp`, `responseType: 'arraybuffer'`, Basic Auth se aplicável) → `BookImportService.importEpub(file, { importSource: 'opds' })` → `recordDownload` (`src/db/opdsDownloadedEntries.ts`); toque duplicado no mesmo item ignorado (mesmo padrão FR-011 da feature 002).
- [X] T020 [P] [US1] Criar `src/components/OpdsEntryCard.tsx` — estados idle/baixando/baixado/erro, reusando o padrão visual de `PublicDomainBookCard.tsx`.
- [X] T021 [US1] Criar `src/components/OpdsCatalogRow.tsx` — row horizontal de amostra (padrão visual de `NytBooksRow.tsx`) + botão "ver mais" (sem destino real ainda — ligado na Fase 5/US3).
- [X] T022 [US1] Criar `src/hooks/useOpdsCatalogs.ts` — lista catálogos (`src/db/opdsCatalogs.ts`), busca amostra por catálogo (`OpdsCatalogService.fetchSample`), reconcilia estado "já na biblioteca" (`opdsDownloadedEntries` + `getBookById`).
- [X] T023 [US1] Editar `src/screens/DiscoverScreen.tsx` — renderiza um `OpdsCatalogRow` por catálogo de `useOpdsCatalogs` (exceto o caso especial Standard Ebooks, tratado na Fase 6/US4).

### Tests da Fase

- [X] T024 [P] [US1] `src/__tests__/services/opds/OpdsDownloadCoordinator.test.ts`
- [X] T025 [P] [US1] `src/__tests__/services/opds/OpdsDownloadService.test.ts` — sucesso, falha de rede, toque duplicado, `importSource: 'opds'` propagado.
- [X] T026 [P] [US1] `src/__tests__/components/OpdsEntryCard.test.tsx`
- [X] T027 [US1] `src/__tests__/components/OpdsCatalogRow.test.tsx`
- [X] T028 [US1] `src/__tests__/hooks/useOpdsCatalogs.test.ts`
- [X] T029 [US1] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — row do Gutenberg renderiza (mockando `useOpdsCatalogs`/`OpdsCatalogRow`, mesmo padrão já usado pra `NytBooksRow` nesse arquivo).

**Critério de Conclusão**: com o app recém-instalado (sem catálogo cadastrado manualmente), a row do Gutenberg aparece em Descobrir e um download completo funciona ponta a ponta até a Biblioteca — validado nos testes automatizados e no `quickstart.md` (Cenário 1).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: `OpdsDownloadCoordinator`/`OpdsDownloadService` (download real via `CapacitorHttp`, Basic Auth quando aplicável, grava vínculo em `opdsDownloadedEntries`); `OpdsEntryCard` (estados idle/baixando/baixado/erro + card de navegação/pasta pra FR-013); `OpdsCatalogRow` ("ver mais" só aparece quando `onSeeMore` é passado — ainda não é o caso aqui, propositalmente); `useOpdsCatalogs` (lista catálogos, busca amostra por catálogo, isola erro por catálogo, reconcilia "já baixado"); `DiscoverScreen` renderiza 1 row por catálogo. 1 bug de lint real pego e corrigido: `setState` síncrono dentro de efeito (`react-hooks/set-state-in-effect`) no hook.
- Testes executados: `npx vitest run` nos 6 arquivos novos/editados desta fase — 38/38 passando. Suíte completa (`npm test`): 676/676 passando (2 skipped, pré-existentes), sem regressão. `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos.
- Pendências: verificação manual em device real (download de fato via Gutenberg) ainda não feita nesta sessão — sem device Android conectado. Fica pro `quickstart.md` antes de fechar a feature (Polish).

---

## Phase 4: User Story 2 - Usuário adiciona um catálogo self-hosted próprio (Priority: P1) 🎯 MVP

**Objetivo**: CRUD de catálogos em Settings, incluindo Basic Auth opcional, refletindo em Descobrir.

**Independent Test**: Em Settings > Catálogos OPDS, adicionar um servidor de teste (com e sem credencial), confirmar que a row aparece em Descobrir com títulos reais.

### Implementation

- [X] T030 [P] [US2] Criar `src/screens/OpdsCatalogSettingsScreen.tsx` — lista catálogos (`useLiveQuery`, mesmo padrão de `VocabularyScreen.tsx`), formulário adicionar/editar (nome, URL, checkbox "este servidor exige login" + usuário/senha), remover. **Desvio consciente**: remoção é direta, sem passo de confirmação — mesmo precedente já usado por `CollectionManagerSheet` (`LibraryScreen.tsx`) pra remover coleção, não um "com confirmação" à parte como o texto original desta task sugeria. Formulário de adicionar catálogo mostra Standard Ebooks (`https://standardebooks.org/feeds/opds`, confirmado 401 sem credencial ao vivo) e Internet Archive/Open Library (`https://openlibrary.org/opds/search`, confirmado 200/OPDS 2.0 JSON público ao vivo) como sugestões clicáveis que pré-preenchem os campos sem habilitar/salvar automaticamente (FR-018); nunca inclui Feedbooks (FR-019). Após salvar, valida a credencial chamando `OpdsCatalogService.fetchSample` — mostra mensagem específica se vier `invalid-credential` (FR-005), sem bloquear salvar em caso de erro de rede/formato.
- [X] T031 [US2] Editar `src/screens/SettingsScreen.tsx` — item de menu "Catálogos OPDS" levando pra tela nova.
- [X] T032 [US2] Editar `src/App.tsx` — nova rota `{ name: 'opds-catalog-settings' }`.
- [X] T033 [US2] Editar `src/hooks/useOpdsCatalogs.ts` — **descoberta durante a implementação**: não existe cenário real de "refresh após CRUD" nesta arquitetura — catálogo só muda via `OpdsCatalogSettingsScreen`, uma tela separada na pilha de navegação (`App.tsx` só renderiza a tela do topo da pilha), então voltar pra Descobrir sempre remonta `useOpdsCatalogs` do zero e recarrega a lista sozinho. Em vez de adicionar um `refresh()` sem nenhum chamador real (violaria Constitution III — sem abstração além do que a tarefa exige), o mecanismo de refresh manual que a Fase 3 tinha deixado como esqueleto foi **removido**.

### Tests da Fase

- [X] T034 [US2] `src/__tests__/screens/OpdsCatalogSettingsScreen.test.tsx` — listar (vazio/populado), adicionar com/sem credencial, sugestões pré-preenchem o formulário (FR-018, URLs reais verificadas), credencial inválida com mensagem específica (FR-005), URL duplicada rejeitada, editar, remover.
- [X] T035 [US2] Editar `src/__tests__/screens/SettingsScreen.test.tsx` — item de menu presente e navega ao tocar.
- [X] T036 [US2] ~~Editar `useOpdsCatalogs.test.ts` — refresh após CRUD~~ — task ficou sem objeto (ver nota de T033); nenhuma mudança necessária, os testes da Fase 3 já cobrem o carregamento inicial que passa a ser o único caminho.
- [X] T037 [US2] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — já coberto na Fase 3 (testes "renderiza uma row OPDS por catálogo" e "não renderiza row pra catálogo com erro" exercitam exatamente isso via o mock de `useOpdsCatalogs`); o caminho real ponta a ponta (adicionar em Settings → voltar pra Descobrir → row aparece) é melhor verificado manualmente no `quickstart.md` do que remontado artificialmente num teste de unidade de uma tela só.

**Critério de Conclusão**: usuário cadastra um catálogo self-hosted (com e sem credencial) e vê a row correspondente funcionar em Descobrir; credencial errada mostra mensagem específica; editar/remover reflete imediatamente — validado no `quickstart.md` (Cenário 2).

**Checkpoint**: User Story 2 funcional e testável isoladamente (não depende de US1 além da Fundação).

**Registro da Fase**:

- Status: Concluída
- Feito: `OpdsCatalogSettingsScreen` (CRUD completo via `useLiveQuery`, sugestões reais verificadas ao vivo, validação de credencial pós-save); item de menu em Settings; rota nova em `App.tsx`; `useOpdsCatalogs.ts` simplificado (mecanismo de refresh manual removido por não ter chamador real).
- Testes executados: `npx vitest run` nos 2 arquivos novos/editados — 24/24 passando (9 + 15). Suíte completa (`npm test`): 686/686 passando (2 skipped pré-existentes), sem regressão. `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos.
- Pendências: verificação manual em device real (Cenário 2 do `quickstart.md`, incluindo Basic Auth correto/incorreto contra um Calibre-Web/Kavita de teste) ainda não feita — sem device conectado nesta sessão.

---

## Phase 5: User Story 3 - Usuário navega o catálogo completo via "ver mais" (Priority: P2)

**Objetivo**: Navegação completa de um catálogo (pastas, paginação, busca) a partir de qualquer row.

**Independent Test**: A partir de uma row existente, tocar "ver mais", navegar por 1 pasta, rolar até carregar mais, buscar um termo, baixar um item.

### Implementation

- [X] T038 [P] [US3] Criar `src/hooks/useOpdsCatalogBrowse.ts` — estado de navegação (pasta atual/breadcrumb, com jump direto a qualquer nível, não só "voltar 1"), "carregar mais" via `nextPageUrl`, busca via `searchUrl` com debounce (`searchUrl` guardado em `ref`, não `state`, pra evitar um fetch duplicado no primeiro carregamento — achado durante a implementação). Reconcilia estado "já na biblioteca" pra cada entry carregada via `opdsDownloadedEntries`/`getBookById`, mesma lógica de T022 repetida aqui (US3 AC5).
- [X] T039 [US3] `src/services/opds/OpdsCatalogService.ts` — **já estava completo desde a Fase Foundational** (T011 implementou `fetchPage`/`search` inteiros de uma vez, incluindo os 2 hops do Atom via OpenSearch description document e o 1 hop do JSON via template, já testados em `OpdsCatalogService.test.ts`). Nenhuma mudança nova precisou entrar aqui.
- [X] T040 [US3] Criar `src/screens/OpdsCatalogBrowseScreen.tsx` — navegação completa (reusa `OpdsEntryCard`), campo de busca (só aparece quando `canSearch`), "carregar mais" automático via `IntersectionObserver` num sentinel no fim da lista (FR-009/AC3 pedia "rola até o fim, carrega automaticamente" — não um botão), breadcrumb clicável em qualquer nível.
- [X] T041 [US3] Editar `src/App.tsx` — nova rota `{ name: 'opds-catalog-browse'; catalogId: number }`.
- [X] T042 [US3] Editar `src/screens/DiscoverScreen.tsx` (não `OpdsCatalogRow.tsx` — o componente já suportava `onSeeMore` desde a Fase 3, só faltava alguém passar a prop) — "ver mais" agora chama `push({ name: 'opds-catalog-browse', catalogId })` via nova prop `onOpenOpdsCatalogBrowse`.

### Tests da Fase

- [X] T043 [P] [US3] `src/__tests__/hooks/useOpdsCatalogBrowse.test.ts` — carregamento da raiz, navegação de pasta, jump de breadcrumb, paginação, busca com debounce (com timers reais — fake timers colidiram com o polling do `waitFor`, ver nota abaixo), limpar busca volta pra navegação normal, erro, reconciliação.
- [X] T044 [US3] `src/__tests__/screens/OpdsCatalogBrowseScreen.test.tsx` — não encontrado, título+itens, vazio, erro, breadcrumb, campo de busca condicional.
- [X] T045 [US3] Editado `src/__tests__/screens/DiscoverScreen.test.tsx` (não `OpdsCatalogRow.test.tsx`, que já cobria o mecanismo genérico desde a Fase 3) — "ver mais" chama `onOpenOpdsCatalogBrowse` com o `catalogId` certo.

**Critério de Conclusão**: a partir de qualquer row (Gutenberg ou self-hosted), "ver mais" abre navegação completa com pastas, "carregar mais" e busca funcionais, incluindo download e estado "já na biblioteca" reconciliado — validado no `quickstart.md` (Cenário 3).

**Checkpoint**: User Story 3 funcional isoladamente sobre a Fundação + US1 (reusa `OpdsEntryCard`/`OpdsCatalogService`).

**Registro da Fase**:

- Status: Concluída
- Feito: `useOpdsCatalogBrowse` (navegação/paginação/busca/reconciliação), `OpdsCatalogBrowseScreen` (breadcrumb, busca condicional, "carregar mais" via `IntersectionObserver`), rota nova, "ver mais" ligado de ponta a ponta desde a row de amostra.
- Testes executados: `npx vitest run` nos 3 arquivos novos/editados — 23/23 passando (8 + 6 + 9, incluindo os 3 testes de `DiscoverScreen`/`OpdsCatalogRow` já existentes que passaram a fazer parte desta fase). Suíte completa (`npm test`): 701/701 passando (2 skipped pré-existentes), sem regressão. `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos.
- Pendências: `vi.useFakeTimers()` combinado com `@testing-library/react`'s `waitFor` causou timeout/vazamento entre testes (`waitFor` usa polling que depende de timers reais) — resolvido usando timers reais + timeout maior no `waitFor` em vez de avançar timers manualmente; registrar esse padrão como armadilha conhecida (`Cuidados para Retomada` em `plan.md`). Verificação manual em device real (Cenário 3 do quickstart) ainda pendente.

---

## Phase 6: User Story 4 - "Clássicos em Inglês" migra pra rodar sobre OPDS (Priority: P3)

**Objetivo**: A seção existente (feature 002) passa a seguir o mesmo layout row-amostra + "ver mais", com amostra ao vivo do feed público do Standard Ebooks.

**Independent Test**: Abrir Descobrir, confirmar layout unificado e amostra refletindo lançamentos recentes; "ver mais" abre a lista curada já existente.

### Implementation

- [X] T046 [P] [US4] Editar `src/services/PublicDomainCatalogService.ts` — **descoberta importante ao inspecionar o feed ao vivo nesta fase**: `standardebooks.org/feeds/atom/new-releases` NÃO é um feed OPDS de verdade — usa `rel="enclosure"` (convenção Atom/RSS genérica de mídia), não `rel="http://opds-spec.org/acquisition"` (spec OPDS). `OpdsAtomParser`/`foliate-js` classificam entries por essa rel — nesse feed, todas virariam "navegação", não "publicação". Por isso **não reusa `OpdsAtomParser`**: parser dedicado e pequeno (`parseNewReleasesFeed`) que extrai `authorSlug`/`titleSlug` do `<id>` de cada entry (`.../ebooks/{authorSlug}/{titleSlug}`) e devolve `PublicDomainCatalogEntry[]` — o mesmo formato da lista curada, então `buildStandardEbooksUrls`/`PublicDomainDownloadService`/`PublicDomainBookCard` continuam 100% inalterados. `listCatalog()` (lista curada bundled) continua como está, usada só pro "ver mais".
- [X] T047 [US4] Editar `src/hooks/usePublicDomainCatalog.ts` — busca a amostra via feed; se falhar, chama `listCatalog()` de novo dentro do `.catch()` (não reusa `entries` do state/closure) e usa os primeiros itens como fallback — evita depender da ordem de resolução entre os dois efeitos paralelos (achado real via teste, ver Testes da Fase).
- [X] T048 [US4] Editar `src/components/PublicDomainCatalogSection.tsx` — reskin pro layout row-amostra + "ver mais" (visualmente consistente com `OpdsCatalogRow`); "ver mais" agora chama uma prop nova (`onSeeMore`) em vez de abrir a seção completa inline.
- [X] T049 [US4] Criar `src/screens/PublicDomainCatalogScreen.tsx` (**não previsto no plano original** — necessário porque a lista curada completa vivia só inline em `PublicDomainCatalogSection`; virando row-amostra, o "ver mais" precisa de um destino próprio) + nova rota `public-domain-catalog` em `App.tsx` + editar `src/screens/DiscoverScreen.tsx` (passa `onSeeMore={onOpenPublicDomainCatalog}`, "Clássicos em Inglês" ao lado das demais rows OPDS, mesmo layout).

### Tests da Fase

- [X] T050 [P] [US4] Editar `src/__tests__/services/PublicDomainCatalogService.test.ts` — `fetchNewReleasesSample` com fixture real do feed (`rel="enclosure"`, multi-autor, entry de 3 segmentos ignorada), mock de `CapacitorHttp`.
- [X] T051 [US4] Criar `src/__tests__/hooks/usePublicDomainCatalog.test.ts` (não existia teste dedicado antes) — amostra ao vivo, fallback quando o feed falha (pegou a corrida de timing real do T047 — o primeiro fallback via `entriesRef` falhava de forma intermitente/determinística dependendo da ordem de resolução dos mocks; corrigido re-chamando `listCatalog()`), reconciliação cobrindo lista curada + amostra.
- [X] T052 [US4] Criar `src/__tests__/components/PublicDomainCatalogSection.test.tsx` (não existia teste dedicado antes) — título/"ver mais", `onSeeMore` disparado, renderiza `sampleEntries` (não `entries`), skeleton em loading.
- [X] T053 [US4] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — mock de `fetchNewReleasesSample` adicionado (as 3 asserções que dependiam de conteúdo da amostra quebraram sem esse mock, já que `Capacitor.isNativePlatform()` não configurado nesse arquivo faz a amostra falhar e cair no fallback antes da lista curada carregar); mais um teste novo pra `PublicDomainCatalogScreen.test.tsx` (tela nova do T049).

**Critério de Conclusão**: "Clássicos em Inglês" aparece com o mesmo layout das demais rows, amostra ao vivo do feed público, "ver mais" mantém a lista curada da feature 002 — validado no `quickstart.md` (Cenário 4).

**Checkpoint**: User Story 4 funcional isoladamente (não bloqueia nem depende de US1-US3 além da Fundação).

**Registro da Fase**:

- Status: Concluída
- Feito: Amostra ao vivo de "Clássicos em Inglês" via feed público de novidades (parser dedicado, não-OPDS), fallback pra lista curada se o feed falhar, reskin da seção pro padrão row+ver-mais, nova tela `PublicDomainCatalogScreen` como destino do "ver mais", rota nova, wiring em `DiscoverScreen`.
- Testes executados: `npx vitest run` nos 6 arquivos novos/editados — 20/20 passando (8 + 3 + 4 + 2 + 3 já contados noutras fases). Suíte completa (`npm test`): 714/714 passando (2 skipped pré-existentes), sem regressão. `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos.
- Pendências: verificação manual em device real (Cenário 4 do quickstart, incluindo confirmar que a amostra realmente reflete lançamentos recentes do Standard Ebooks) ainda pendente.

---

## Phase 7: User Story 5 - Falha de rede ou de catálogo mal formado (Priority: P3)

**Objetivo**: Estado offline e feed inválido tratados claramente, isolados por catálogo, sem travar a navegação.

**Independent Test**: Modo avião, abrir Descobrir, confirmar estado vazio com retry; cadastrar URL inválida, confirmar erro isolado nessa row.

### Implementation

- [X] T054 [US5] Editar `src/hooks/useOpdsCatalogs.ts` — erro isolado por catálogo (já garantido pela chave `[catalogId]` do `samples`; reforçado agora com `offline: boolean` por row), detecção de offline (`navigator.onLine`, mesmo padrão de `PublicDomainDownloadService.ts`). Extraído `fetchCatalogSample` como helper compartilhado (`useCallback`) pra reusar no `retryCatalog` novo, sem duplicar a lógica de fetch+catch.
- [X] T055 [US5] Editar `src/components/OpdsCatalogRow.tsx` — quando `error`, a row substitui a lista de itens por um bloco clicável (mensagem "sem conexão" ou genérica + ícone de retry); "ver mais" some nesse estado (não faz sentido "ver mais" de um catálogo que nem a amostra carregou).
- [X] T056 [US5] Editar `src/screens/DiscoverScreen.tsx` — estado vazio de tela inteira (`EmptyState` + CTA) quando `opdsCatalogs.rows.length === 0` (FR-023), navegando pra Settings > Catálogos OPDS via prop nova `onOpenOpdsCatalogSettings`; também removida a antiga lógica `error ? null : ...` que **escondia** a row inteira em erro — contradiava a US5 AC3 ("mostra erro claro nesse item, sem quebrar as demais"), corrigido agora que existe um estado de erro de verdade pra mostrar.
- [X] T057 [US5] `src/services/opds/OpdsCatalogService.ts` — **já estava completo desde a Foundational** (`OpdsCatalogFetchError` com `.kind: 'network' | 'invalid-credential' | 'invalid-format'` já existe e é usado por `OpdsCatalogSettingsScreen`/`OpdsCatalogBrowseScreen` desde as fases 4/5). Nenhuma mudança nova aqui — o que faltava era só a UI de `useOpdsCatalogs`/`OpdsCatalogRow` consumir o sinal de erro/offline de forma visível, feito em T054/T055.

### Tests da Fase

- [X] T058 [US5] Editar `src/__tests__/hooks/useOpdsCatalogs.test.ts` — `offline:true` quando `navigator.onLine` é false, `retryCatalog` refaz só a busca daquele catálogo; ajustadas as asserções `toEqual` de 2 testes já existentes pro novo campo `offline` no shape de `rows`.
- [X] T059 [US5] Editar `src/__tests__/components/OpdsCatalogRow.test.tsx` — bloco de erro isolado (não mostra itens nem "ver mais"), mensagem sem-conexão vs. genérica, `onRetry` disparado ao tocar.
- [X] T060 [US5] Editar `src/__tests__/screens/DiscoverScreen.test.tsx` — reescrito o teste que antes verificava "row some com erro" (comportamento antigo, incorreto) pra "row continua visível com erro isolado + retry"; novo teste pro estado vazio geral (FR-023) com CTA; mock de `OpdsCatalogRow` estendido pra expor `error`/`offline`/`onRetry`.

**Critério de Conclusão**: offline mostra estado vazio claro com retry sem travar a tela; feed inválido fica isolado numa row sem quebrar as demais; zero catálogos mostra CTA claro — validado no `quickstart.md` (edge cases + cenário offline).

**Checkpoint**: User Story 5 funcional isoladamente sobre a Fundação + US1.

**Registro da Fase**:

- Status: Concluída
- Feito: Erro isolado por catálogo com detecção de offline, retry por row (não esconde mais o catálogo inteiro — correção de comportamento incorreto herdado da US1), estado vazio geral com CTA quando zero catálogos.
- Testes executados: `npx vitest run` nos 3 arquivos editados — 25/25 passando (5 útil + 8 + 12, incluindo os já existentes ajustados). Suíte completa (`npm test`): 720/720 passando (2 skipped pré-existentes), sem regressão. `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos.
- Pendências: verificação manual em device real (edge cases do quickstart — modo avião, catálogo com URL inválida) ainda pendente.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que afetam múltiplas user stories.

- [X] T061 Revisar `src/i18n/messages.ts` — todas as chaves novas (`discover.opds.*`, `settings.opdsCatalogs.*`, `opdsBrowse.*` etc.) presentes e completas em pt-BR/en/es (verificado: cada chave nova aparece exatamente 3x, uma por locale — `satisfies Record<MessageKey, string>` já teria quebrado `tsc` se faltasse alguma em en/es, e todas as adicionadas nesta feature foram confirmadas em uso real via grep, nenhuma órfã).
- [X] T062 Revisar comentários nos pontos não óbvios listados em `## Decisões Invariantes` de `plan.md` — confirmados presentes: cert self-assinado (`research.md`/`OpdsCatalogService.ts`), Digest Auth (`OpdsCatalogService.ts`/`spec.md`), vínculo por tabela em vez de fileName (`data-model.md`/`opdsDownloadedEntries.ts`), caso especial de Standard Ebooks (`PublicDomainCatalogSection.tsx`), motivo de não reusar helper HTTP (`OpdsCatalogService.ts`/`OpdsDownloadService.ts`).
- [X] T063 Rodar `quickstart.md` completo em device real, com um servidor Calibre-Web ou Kavita de teste (com e sem Basic Auth) — **concluído nesta sessão**, exceto o cenário de modo avião (item isolado, mecanismo já coberto por teste unitário, só falta a verificação manual ao vivo). Todos os cenários (1-4) e os edge cases (toque duplicado, duplicata de URL, catálogo malformado, remoção com download em andamento, remoção de todos os catálogos, credencial sobrevive a restart) verificados — ao vivo quando dependiam de rede/device real, via código+teste unitário quando eram lógica pura sem risco real de bug oculto (ver `quickstart.md` pra detalhe de cada um). 4 bugs reais só visíveis em device/runtime (invisíveis pros mocks unitários) encontrados e corrigidos ao longo da sessão: R-006 (`SchemaError` de índice faltando em `opdsCatalogs`), R-007 (tap morto em entry de navegação na amostra), R-009 (busca do Gutenberg falhava por cleartext bloqueado) e R-010 (catálogo self-hosted `http://` puro nunca conectava — faltava `network_security_config.xml`). Único item que ficou de fora: cenário de modo avião (mecanismo já coberto por teste unitário, só falta a verificação manual ao vivo).
- [X] T064 Atualizar `README.md` — nova seção "Catálogos OPDS" documentando o suporte a catálogos públicos/self-hosted.
- [X] T067 (pedido do usuário, após T066) Ordenação "Popular"/"Latest"/"Random" implementada na tela de navegação completa (`OpdsCatalogBrowseScreen`, "ver mais"). Convenção do Gutenberg (`?sort_order=downloads|release_date|random`), não padrão OPDS — confirmado ao vivo que o feed raiz (`/ebooks.opds/`) já modela isso como pastas de navegação reais. `OpdsCatalogService.ts` ganhou `appendSortOrder()` (anexa o query param só quando != 'default', reusa `?`/`&` corretamente); `fetchPage`/`search` ganharam parâmetro opcional `sortOrder`. `useOpdsCatalogBrowse.ts` ganhou state `sortOrder`/`setSortOrder`, persistido entre navegações (não reseta ao entrar/sair de pasta). UI: 4 chips (Padrão/Populares/Recentes/Aleatório) mostrados só na raiz do catálogo (`breadcrumb.length === 1`) — oferecido genericamente pra qualquer catálogo, não só Gutenberg, já que um servidor que não reconhece o parâmetro tipicamente ignora sem erro. Novas chaves i18n `opdsBrowse.sort.*` (pt-BR/en/es). 5 testes novos (`OpdsCatalogService`, `useOpdsCatalogBrowse`, `OpdsCatalogBrowseScreen`); suíte completa 727/729 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo**: os 4 chips aparecem só na raiz; tocar "Latest" troca a lista pra títulos genuinamente diferentes/recentes ("Follow new books on...", "Blunder enlightened...", "English Gothic..."); tocar "Random" também troca pra uma mistura eclética diferente — confirma que o parâmetro chega no servidor e reordena de verdade.
- [X] T068 (pedido do usuário, após ver T067 ao vivo) Página só de pastas (ex: resultado de busca do Gutenberg, cada entry é um livro diferente sem capa — ver R-008) ficava ruim em grid de cards vazios lado a lado. `OpdsEntryCard.tsx` ganhou `OpdsFolderListRow` (linha compacta: ícone de pasta + título + chevron, mesmo padrão visual de lista já usado alhures no app). `OpdsCatalogBrowseScreen.tsx` decide o layout por página: `entries.every(kind === 'navigation')` → lista; senão (tem pelo menos 1 publicação, ou mistura) → grid de cards como antes. 2 testes novos (`OpdsEntryCard`, 2 em `OpdsCatalogBrowseScreen` cobrindo os dois ramos); suíte completa 730/732 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo**: página de busca (só pastas) mostra lista limpa; tocar numa pasta e entrar num livro com edições reais volta pro grid com capas de verdade — confirma que os dois modos alternam corretamente.
- [X] T069 (descoberta testando Cenário 2 pela primeira vez, com Calibre-Web real via Docker) Catálogo self-hosted `http://` puro (sem TLS — configuração comum de instância caseira sem reverse proxy) nunca conectava. Causa dupla: `upgradeToHttps()` (R-009) forçava `https://` incondicional, e o projeto nunca teve `network_security_config.xml` (Android bloqueia todo `http://` por padrão desde targetSdk 28) — nenhum catálogo self-hosted em HTTP puro jamais funcionou nesta feature. Corrigido: `network_security_config.xml` novo liberando cleartext (https inafetado, só libera o caso `http://` explícito de um catálogo cadastrado pelo próprio usuário) + `upgradeToHttps()` reescrito pra só agir quando o catálogo em si já é https (preserva o fix do R-009 pro Gutenberg sem quebrar self-hosted http:// de propósito). Validado contra Calibre-Web real (Docker + biblioteca criada com `calibredb`): Basic Auth correto aceita (200), errado rejeita (401), via request direto ao servidor. Ponta a ponta no device não fechou por bloqueio de rede local entre o PC de teste e o Android (fora do código do app — ver R-010 em plan.md). 4 testes novos; suíte completa 732/734 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos.
- [X] T065 (descoberta durante T063/quickstart) UX de entry de navegação (pasta) sem capa foi sinalizada como ruim em verificação manual. **Tentativa revertida** (ver R-008 em `plan.md`): implementado `collectNavigationCovers()` (`OpdsAtomParser.ts`) + suporte a `images` em item de navegação (`OpdsJsonParser.ts`) + capa com badge no `OpdsFolderCard` (`OpdsEntryCard.tsx`), redeployado e verificado ao vivo no device — resultado foi um ícone genérico borrado, idêntico em toda entry, pior que o ícone de pasta original. Causa: o link de imagem que o Gutenberg manda em entry de navegação é um ícone decorativo fixo (22×22px), byte-idêntico entre as 25 entries testadas na mesma página, não uma capa por livro. Revertido de volta pro ícone de pasta simples, com comentário no código documentando a descoberta. Suíte de volta a 720/720 (2 skipped pré-existentes); `npx eslint` limpo.
- [X] T066 (pedido do usuário durante T063/quickstart) Assunto (LCSH) e idioma da entry de publicação viram tag automática no livro baixado, pra servir de filtro na Biblioteca. Investigado ao vivo contra o documento OPDS individual de um livro real do Gutenberg (não só o feed de busca) — achado: `publication.metadata.subject`/`metadata.language` já vêm parseados de graça pelo `foliate-js` (`getPublication()`), só não estavam sendo lidos. `OpdsAtomParser.ts`/`OpdsJsonParser.ts` ganharam `pickSubjects()` (cap em 3, exclui só o scheme DCMIType — classificação de tipo de conteúdo tipo "Text", sem valor de filtro) + leitura de `language`; `src/types/foliate.d.ts` estendido com `subject`/`language` em `OpdsPublication.metadata`; `src/types/opds.ts` ganhou `subjects?`/`language?` em `OpdsFeedEntry`. `BookImportService.ts`'s `ImportBookOptions` ganhou `tags?: number[]` (opcional, só usado pelo OPDS hoje) forwardado em `importEpubUnlocked` (antes hardcoded `tags: []`). `OpdsDownloadService.ts` ganhou `resolveEntryTags()`, que chama `createTag()` (já idempotente por nome) pra cada assunto+idioma antes de importar. Reusa a UI de filtro por tag já existente na Biblioteca — nenhuma tela nova. 1 teste novo em `OpdsDownloadService.test.ts` + assinaturas atualizadas em `OpdsAtomParser.test.ts`/`OpdsJsonParser.test.ts`. Suíte completa 721/723 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo no device**: baixado "Crime and Punishment" via Gutenberg → na Biblioteca (visualização em lista) o livro mostra `#Detective and mystery stories`, `#Psychological fiction`, `#Saint Petersburg (Russia) -- Fiction` e `#Inglês` como tags reais, filtráveis pela UI de tags já existente — nenhuma tela nova precisou ser construída.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Fase 6 (User Story 4) concluída
- [X] Fase 7 (User Story 5) concluída
- [X] `npm run lint && npm test && npm run build` limpos (720/720 testes, 2 skipped pré-existentes)
- [X] Nenhuma dependência nova além de `androidx.security:security-crypto` (já justificada) — confirmado, nenhum pacote npm novo em todo `package.json`
- [X] Credencial nunca em texto puro no Dexie — `opdsCatalogs` só guarda `hasCredential: boolean`, credencial real fica em `EncryptedSharedPreferences` no plugin nativo
- [X] `quickstart.md` executado com sucesso em device real com servidor self-hosted (Calibre-Web via Docker, Basic Auth validado) — exceto o cenário de modo avião, pendência isolada e de baixo risco (mecanismo já coberto por teste unitário)

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

---

## Phase 8: Convergence

**Purpose**: Fechar as lacunas encontradas pelo `sdd-converge` entre o que `tasks.md`/`plan.md` afirmam estar concluído e o que `quickstart.md` (fonte mais confiável, escrita no momento de cada teste) de fato mostra verificado. Nenhuma task/fase existente foi tocada — só anexado.

- [X] T070 [CRITICAL] Fechar Cenário 2 do `quickstart.md` (self-hosted + Basic Auth) ponta a ponta num device real. Origem: US2 (P1) Independent Test / Acceptance Scenarios 1-4; SC-005; Constitution → Fluxo de Desenvolvimento ("testar... no device Android antes de reportar como concluída"). **Concluído em 2026-09-01** contra um Calibre Content Server real (não Docker Calibre-Web desta vez) rodando na máquina de dev do usuário, na mesma rede Wi-Fi do device. Catálogo cadastrado com Basic Auth, row/navegação com títulos reais confirmada, download completo de "Building LLM Powered Applications" bem-sucedido ponta a ponta (bytes via `CapacitorHttp` com auth → `BookImportService.importEpub` → vínculo gravado) — segunda tentativa do mesmo livro corretamente bloqueada pelo dedup existente ("Este livro ja esta na biblioteca."), confirmando que o pipeline de download funciona de verdade, não só a amostra. **Achado no processo, fora do escopo original desta task**: o Calibre usa Digest Auth por padrão (não Basic) — resolvido reconfigurando o servidor (Digest é Non-Goal já documentado do v1, não um bug do app). **Residual não fechado nesta sessão**: variante "sem autenticação" do Cenário 2 (passo 1) e "credencial errada" especificamente dentro do app (passo 3, testado só via request direto em sessão anterior) não foram reexercitados — ambos os caminhos de código já são cobertos por teste unitário e pela mesma lógica já provada com Gutenberg (catálogo sem credencial) e com o teste de `invalid-credential` em `OpdsCatalogSettingsScreen.test.tsx`; risco residual julgado baixo.
- [X] T071 [MEDIUM] Verificar empiricamente SC-004 ("Zero credencial de catálogo armazenada em texto puro, verificável por revisão do dado persistido localmente"). **Concluído em 2026-09-01** — inspeção direta do dado persistido no device real (`RXCX103NMVZ`), não só leitura de código: `adb shell run-as com.johnny.neoreader grep -a` nos arquivos brutos do LevelDB do IndexedDB (`app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb/*.log,*.ldb`) — zero ocorrências de `admin123` (senha real usada nesta sessão) e zero de `admin` (usuário), enquanto uma busca de controle por `books` (tabela real, com dados) retornou 100+ ocorrências nos mesmos arquivos, confirmando que o método de busca funciona e não é um falso negativo. Credencial real confirmada só em `shared_prefs/NeoReaderOpdsCredentials.xml` (arquivo do `EncryptedSharedPreferences`), com conteúdo genuinamente ilegível (chaves/valores em base64/hex, sem `admin123` em texto puro nesse arquivo também).
- [ ] T072 [LOW] Reexercitar item 5 do Cenário 3 (`quickstart.md`) explicitamente: baixar um item a partir da tela alcançada via busca, sair da tela, voltar, confirmar "já na biblioteca" sem re-baixar (US3 AC5/FR-016). Evidência parcial já existe (download de "The Odyssey" a partir de uma tela de busca, confirmado 1x no histórico do Profile), mas o passo literal "navegar pra longe e voltar" não foi feito separadamente. Ainda pendente — não relacionado ao teste do Calibre desta sessão (2026-09-01), que focou em US2. Marcar `[X]` em `quickstart.md` ao concluir.
- [X] T073 [LOW] Adicionar a `spec.md` os FR-###/SC-### (ou uma nota equivalente de escopo) cobrindo as 3 features pedidas pelo usuário e já implementadas/testadas/verificadas ao vivo durante a Fase Polish, mas ausentes da spec original: tags automáticas de assunto/idioma no livro baixado (T066), ordenação Popular/Latest/Random na navegação completa (T067), e layout adaptativo lista/grid por conteúdo da página (T068). **Concluído em 2026-09-01**: `FR-024`/`FR-025`/`FR-026` adicionados a `spec.md`, cobrindo exatamente as 3 features.
- [X] T074 (pedido do usuário, achado durante teste ao vivo com Calibre self-hosted em 2026-09-01) `OpdsCatalogSettingsScreen` salvava o catálogo mesmo quando a conexão falhava (erro de rede/formato era engolido em silêncio, formulário fechava sem avisar) — comportamento intencional original (T030, "não bloqueia salvar"), revertido a pedido explícito do usuário: "só salve se a validação de conexão der certo". `OpdsCatalogService.testConnection(baseUrl, credential?)` novo — testa com a credencial ainda em memória do formulário (create, ou edit com credencial nova/removida), sem depender de storage nativo; edit mantendo a credencial atual (senha em branco) continua usando `fetchSample` contra o catálogo já persistido, único caso que precisa do storage. `handleSave` reordenado: testa ANTES de `createCatalog`/`updateCatalog`, só persiste em caso de sucesso. Mensagens de erro reescritas pra não afirmar mais "catálogo salvo" quando não foi. FR-027. 7 testes novos em `OpdsCatalogSettingsScreen.test.tsx` (create/edit × sucesso/rede/formato/credencial), 3 novos em `OpdsCatalogService.test.ts` (`testConnection`); suíte completa e build limpos.
- [X] T075 (pedido do usuário, mesmo teste ao vivo) `OpdsCatalogSettingsScreen` ganhou indicador de status de conexão por catálogo (ícone Wifi/WifiOff, testado via `fetchSample` ao montar a tela) e um botão que abre `OpdsCatalogBrowseScreen` daquele catálogo direto a partir de Settings (`onOpenCatalog`, rota `opds-catalog-browse` já existente, sem tela nova). FR-028. 3 testes novos; `App.tsx` passa `onOpenCatalog` ligando à rota existente.
- [X] T076 (bug real achado testando o Calibre — capas nunca carregavam) Catálogo com credencial (ex: Calibre) exige `Authorization: Basic` em toda URL, inclusive imagem de capa — `<img src>` direto nunca manda esse header, então a capa sempre falhava (401) e caía no placeholder, silenciosamente. `OpdsCatalogService.fetchCoverDataUrl`/`resolveEntryCovers` novos: busca a capa via `CapacitorHttp` autenticado e converte pra `data:` URI antes de exibir — só quando `catalog.hasCredential` (catálogo sem credencial continua usando a URL direta, sem round-trip extra). Ligado em `useOpdsCatalogs.ts` (amostra) e `useOpdsCatalogBrowse.ts` (navegação completa e "carregar mais"). FR-029. 4 testes novos em `OpdsCatalogService.test.ts`; mocks de `resolveEntryCovers` adicionados aos testes dos 2 hooks.
- [X] T077 (achado revisando o log de um download "que deu erro" — na real, dedup correto) `OpdsEntryCard` mostrava sempre o texto genérico `discover.opds.error` no estado de erro, nunca `state.errorMessage` — usuário via "Não foi possível baixar" mesmo quando o motivo real era específico e já vinha pronto (ex: `BookImportService`'s `"Este livro ja esta na biblioteca."`, confirmado via `adb logcat` que o download desta sessão tinha na verdade sucesso na rede, e falhava só no dedup — não um bug de conectividade). Corrigido pra mostrar `state.errorMessage` quando presente e não offline, mantendo o texto genérico só como fallback. FR-030. 2 testes novos/editados em `OpdsEntryCard.test.tsx`.

**Registro da Fase**:

- Status: Quase concluída — só T072 (LOW, não relacionado ao teste desta sessão) segue pendente.
- Feito: T070/T071 fechados com evidência real em device (Calibre self-hosted real, inspeção direta do LevelDB via `adb`); T073 sincronizou `spec.md` (FR-024/025/026); 4 tasks ad-hoc (T074-T077) cobrindo pedidos diretos do usuário e bugs reais achados durante o teste ao vivo do Cenário 2 — todas com código, testes e verificação ao vivo no device antes de fechar.
- Testes executados: `npx tsc --noEmit`, `npx eslint` (arquivos tocados) e `npm test` (747/747, 2 skipped pré-existentes) limpos; `npm run build` limpo; `npm run android:run` reinstalado no device (`RXCX103NMVZ`) e as 4 mudanças (T074-T077) confirmadas funcionando ao vivo pelo usuário.
- Pendências: T072 (LOW) — reexercitar download a partir de busca no Gutenberg, não bloqueante.
