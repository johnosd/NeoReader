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
- [ ] T063 Rodar `quickstart.md` completo em device real, com um servidor Calibre-Web ou Kavita de teste (com e sem Basic Auth) — **não feito nesta sessão**: nenhum device Android conectado (`adb devices` vazio). Fica como pendência explícita pro usuário rodar antes de considerar a feature pronta pra produção.
- [X] T064 Atualizar `README.md` — nova seção "Catálogos OPDS" documentando o suporte a catálogos públicos/self-hosted.

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
- [ ] `quickstart.md` executado com sucesso em device real com servidor self-hosted — **não feito nesta sessão** (sem device Android conectado); pendência explícita pro usuário antes de considerar a feature pronta pra produção

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
