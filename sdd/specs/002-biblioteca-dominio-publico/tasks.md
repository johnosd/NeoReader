---
description: "Tasks: Biblioteca de Domínio Público (Standard Ebooks)"
---

# Tasks: Biblioteca de Domínio Público (Standard Ebooks)

**Input**: Documentos de design de `sdd/specs/002-biblioteca-dominio-publico/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`

**Organization**: Tasks agrupadas por user story (P1 → P2 → P3) pra permitir
implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

Projeto único (React + Vite), sem separação backend/frontend — mesma
estrutura já usada no resto do repositório:

- Serviços novos em `src/services/`
- Componentes novos em `src/components/`
- Hook novo em `src/hooks/`
- Telas editadas em `src/screens/`
- Testes espelhando em `src/__tests__/{services,components,screens}/`
- Catálogo estático em `public/domain-publico/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Groundwork trivial que não depende de nenhuma lógica de negócio.

- [X] T001 Estender `BookImportSource` em `src/types/book.ts` com o literal `'public-domain'`.
- [X] T002 Criar o diretório `public/domain-publico/` (estrutura pro catálogo estático, mesmo padrão de `public/word-lens/`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura que DEVE estar pronta antes de qualquer user story — serviço de catálogo, serviço de download, coordenador de estado, e o fix necessário no pipeline de import existente.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar. Em particular, o smoke-test manual (T009) deve rodar **antes** de qualquer UI ser construída em cima — mitiga o risco R-004 do `plan.md`.

### Implementation

- [X] T003 [R-001] Corrigir `importEpubUnlocked` em `src/services/BookImportService.ts` (~linha 137-185) pra propagar `options.importSource` em vez de deixá-lo cair no chão — hoje só o caminho nativo (`importNativeEpubUnlocked`) passa esse campo adiante.
- [X] T004 [P] `src/services/PublicDomainCatalogService.ts` — carrega/parseia `public/domain-publico/catalog.json`, expõe `listCatalog()` e a função `buildStandardEbooksUrls(authorSlug, titleSlug)` (fórmula documentada em `data-model.md`).
- [X] T005 [P] `src/services/PublicDomainDownloadCoordinator.ts` — singleton `Map<entryId, PublicDomainDownloadState>` + listeners, mesmo padrão de `src/services/ImportCoordinator.ts` (subscribe/notify), garantindo que o estado sobrevive à navegação entre telas (FR-010) e que um toque duplicado no mesmo `entryId` é ignorado enquanto já `downloading` (FR-011).
- [X] T006 `src/services/PublicDomainDownloadService.ts` — baixa o EPUB via `CapacitorHttp.request()` (`responseType: 'arraybuffer'`, URL com `?source=download` conforme `research.md` #1), converte a resposta em `File`, chama `BookImportService.importEpub(file, { importSource: 'public-domain' })`, e atualiza o `PublicDomainDownloadCoordinator` em cada etapa. Comentário curto explicando por que não reusa o helper HTTP do `FishAudioService.ts` (Decisão Invariante do `plan.md`) e por que `?source=download` é obrigatório.
- [X] T007 [P] Adicionar chaves i18n novas em `src/i18n/messages.ts` (pt-BR, en, es) — título/subtítulo da seção (deixando claro que é em inglês, FR-008), rótulo do botão de download, mensagens de progresso/erro/retry, texto do atalho no empty state da Biblioteca.
- [X] T008 Semear `public/domain-publico/catalog.json` com 3-5 títulos **verificados manualmente por um humano** navegando `standardebooks.org` (nunca por script/scraping — ver `research.md` #3) — usar clássicos bem conhecidos e seguros (ex: Jane Austen, Mary Shelley, Arthur Conan Doyle), conferindo `authorSlug`/`titleSlug` reais na página de cada livro. Feito: 5 títulos (Pride and Prejudice, Frankenstein, The Adventures of Sherlock Holmes, A Christmas Carol, Dracula), slugs confirmados batendo só a página base `/ebooks/<slug>` (200 OK), nunca `/downloads/*`.

### Testes da Fase

- [X] T009 [MANUAL] Smoke-test num device Android real: baixar 1 EPUB de verdade via `CapacitorHttp` usando a URL com `?source=download`, confirmar que o arquivo resultante importa corretamente pelo `BookImportService` (mitiga risco R-004 — fazer **antes** de avançar pra Fase 3). Não é teste automatizado; documentar o resultado (título testado, sucesso/falha) no Registro da Fase. **Sucesso**: testado em device real (RXCX103NMVZ, Galaxy S23), título "Pride and Prejudice" — `fileSize: 831960` bytes (bate com o real), pipeline completo até `file-import-finished`, `bookId: 126`. Trigger temporário usado só pra isso já foi removido de `main.tsx`.
- [X] T010 [P] Teste unitário de `PublicDomainCatalogService.test.ts` — parse do `catalog.json`, derivação correta de `epubUrl`/`coverUrl` a partir dos slugs.
- [X] T011 [P] Teste unitário de `PublicDomainDownloadCoordinator.test.ts` — transições de estado, notificação de listeners, dedupe de toque duplicado.
- [X] T012 Teste unitário de `PublicDomainDownloadService.test.ts` (mock de `@capacitor/core`, padrão de `src/__tests__/services/NativeLibraryImportService.test.ts`) — caminho de sucesso (bytes viram `File`, `importEpub` chamado com `importSource: 'public-domain'`).
- [X] T013 Estender `src/__tests__/services/BookImportService.test.ts` cobrindo o fix da T003 — `importEpub` com `options.importSource` definido agora persiste no `Book` salvo.

**Critério de Conclusão**: catálogo carrega e deriva URLs corretamente; coordenador de estado funciona isolado (sem UI); download real de pelo menos 1 título funciona ponta a ponta num device Android e o livro resultante importa com `importSource: 'public-domain'` gravado. Sem isso confirmado, nenhuma user story deve começar.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída — todas as 11 tasks (T001-T013, exceto T009 que era manual) feitas e verificadas, incluindo o smoke-test real em device.
- Feito: T001-T013 completas. Tipo `BookImportSource` estendido, fix de `importSource` em `BookImportService`, `PublicDomainCatalogService`/`PublicDomainDownloadCoordinator`/`PublicDomainDownloadService` implementados, chaves i18n (pt-BR/en/es), catálogo semeado com 5 títulos verificados. Smoke-test manual (T009) confirmou download+import real funcionando ponta a ponta num device Android (RXCX103NMVZ) contra o `standardebooks.org` de verdade.
- Testes executados: `npx vitest run` nos 4 arquivos novos/estendidos — 30/30 passando; `npm run lint` limpo; `npm run build` limpo; smoke-test manual em device real — sucesso (ver T009 acima pros detalhes/evidência).
- Pendências: nenhuma. Fase fechada.

---

## Phase 3: User Story 1 - Usuário novo sem livros baixa seu primeiro clássico (Priority: P1) 🎯 MVP

**Objetivo**: Usuário com a Biblioteca vazia consegue chegar a um livro pronto pra ler via o catálogo embutido, sem trazer arquivo próprio.

**Independent Test**: Com a Biblioteca vazia num device Android, tocar no atalho, escolher um título no grid, tocar em baixar, aguardar a conclusão, e confirmar que o livro aparece na Biblioteca e abre normalmente no leitor.

### Implementation

- [X] T014 [P] [US1] `src/components/PublicDomainBookCard.tsx` — card visual (capa com fallback quando ausente/offline, título, autor, estado idle/downloading com spinner indeterminado), estrutura mirando `src/components/NytBookCard.tsx`. Também já cobre estado de sucesso (badge "Na biblioteca", não tappable) e erro (badge de retry, tappable de novo) — adiantado de T025 pra não deixar o componente incompleto/quebrado nesses estados.
- [X] T015 [US1] `src/hooks/usePublicDomainCatalog.ts` — hook que carrega o catálogo (`PublicDomainCatalogService`) e assina o `PublicDomainDownloadCoordinator`, expondo lista + estado de download por entry pra UI.
- [X] T016 [US1] `src/components/PublicDomainCatalogSection.tsx` — grid simples (sem busca/filtro, FR-001) usando `usePublicDomainCatalog` + `PublicDomainBookCard`, copy deixando explícito que o conteúdo é em inglês (FR-008).
- [X] T017 [US1] Inserir `PublicDomainCatalogSection` em `src/screens/DiscoverScreen.tsx` (próximo ao topo, antes das rows do NYT — prioriza o conteúdo que o usuário pode realmente ler no app sobre os links externos do NYT). Colocada fora do gate `hasNytApiKey` de propósito: funciona mesmo sem a env var do NYT configurada.
- [X] T018 [US1] Adicionar atalho no empty state de `src/screens/LibraryScreen.tsx` (~linha 498-508, dentro do bloco `EmptyState` de biblioteca vazia) chamando `onOpenDiscover` (FR-007).

### Testes da Fase

- [X] T019 [P] [US1] `src/__tests__/components/PublicDomainBookCard.test.tsx` — estados idle/downloading, fallback de capa quando a imagem falha/está ausente. Também cobre success/error (adiantado junto com T014).
- [X] T020 [US1] Estender `src/__tests__/screens/DiscoverScreen.test.tsx` — nova seção renderiza; lista aparece mesmo com `allowNetwork`/rede indisponível (FR-009), só a capa remota degrada graciosamente.
- [X] T021 [US1] `src/__tests__/screens/LibraryScreen.test.tsx` — **não existia** (a suposição do plano de que já existia estava errada); criado do zero, mas escopo mantido mínimo (só a story do atalho no empty state, mockando `useLibraryCatalog`/native services, sem cobrir o resto do screen).

### Ad-hoc (descobertas na verificação manual em device real)

- [X] T031 [US1] [AD-HOC] Tocar num card já baixado (estado `success`) deve abrir o livro, não ficar inerte — pedido pelo usuário depois de testar o fluxo ao vivo. Novo prop `onOpenBook` encadeado `DiscoverScreen` → `PublicDomainCatalogSection` → hook `usePublicDomainCatalog` → `PublicDomainBookCard`; usa `getBookById` (`src/db/books.ts`) + `push({ name: 'book-details', book })` em `App.tsx`, mesmo padrão já usado por `LibraryScreen`/`HomeScreen`. Testes: `PublicDomainBookCard.test.tsx` (retry do estado success vira "abre" em vez de "baixa de novo") + novo teste em `DiscoverScreen.test.tsx`.
- [X] T032 [US1] [AD-HOC] Corrigir estado "já baixado" não sobrevivendo a restart do app — `PublicDomainDownloadCoordinator` é só em memória da sessão; reinstalar o app pra testar T031 resetou o estado e um livro já baixado ("A Christmas Carol") voltou a mostrar ícone de download, e tocar nele gerou erro de duplicata em vez de abrir. Adiciona reconciliação: `usePublicDomainCatalog` consulta `findBookByFileName` (novo em `src/db/books.ts`) usando o nome de arquivo determinístico (`buildPublicDomainFileName`, extraído de `PublicDomainCatalogService.ts` e reusado por `PublicDomainDownloadService.ts`) e marca o estado como `success` se o livro já existir na Biblioteca. Confirmado corrigido ao vivo no device pelo usuário. Teste novo em `DiscoverScreen.test.tsx`.

**Critério de Conclusão**: fluxo completo do `Independent Test` acima reproduzido manualmente num device real (passos 1-8 de `quickstart.md`), incluindo os dois ajustes ad-hoc acima; testes automatizados da fase passam; `npm run build` limpo.

**Checkpoint**: User Story 1 funcional e testável isoladamente — já é um MVP entregável.

**Registro da Fase**:

- Status: Concluída — verificada ao vivo num device Android real pelo usuário (fluxo de download, abrir livro já baixado, e reconciliação pós-restart), todos os ajustes pedidos aplicados e reconfirmados.
- Feito: T014-T021 + T031-T032 (ad-hoc). Componentes de UI, hook, integração em Descubra/Biblioteca, mais os dois ajustes de UX descobertos na verificação manual (abrir livro já baixado; reconciliar estado com a Biblioteca real após restart do app).
- Testes executados: 21 testes automatizados nos 4 arquivos afetados (100% passando), `npm run lint` limpo, `npm run build` limpo, suíte completa (`npm test`) sem regressão (605 passando/2 skipped antes dos ajustes ad-hoc, reconfirmado depois). Verificação manual em device real (RXCX103NMVZ) confirmada pelo usuário duas vezes (fluxo principal, depois os ajustes).
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Usuário já com livros baixa clássicos adicionais (Priority: P2)

**Objetivo**: A mesma seção funciona igual pra um usuário que já tem livros na Biblioteca — sem branch condicional novo, reaproveitando 100% da infraestrutura da US1.

**Independent Test**: Com a Biblioteca já populada, navegar até Descubra > Clássicos em Inglês, baixar um título, e confirmar que ele aparece na Biblioteca ao lado dos livros já existentes.

### Implementation

- [X] T022 [US2] Confirmar que `PublicDomainCatalogSection` (T016-T017) renderiza igual independente de `books.length` em `DiscoverScreen` — não deveria exigir código novo; se algum estado condicional vazou da Biblioteca pra Descubra, corrigir aqui. **Confirmado sem mudança**: a seção é renderizada incondicionalmente logo no início de `<main>`, sem nenhuma dependência do estado da Biblioteca.

### Testes da Fase

- [X] T023 [US2] Teste de integração (extensão de `BookImportService.test.ts` ou dedicado): baixar um título cujo hash já existe na Biblioteca (simulando import prévio de outra fonte) e confirmar que o pipeline de dedupe já existente decide corretamente, sem duplicar nem travar — comportamento herdado, sem regra nova. Implementado em `PublicDomainDownloadService.test.ts`: simula `BookImportService.importEpub` rejeitando com o erro real de duplicata, confirma que o coordinator vira `error` (não `success` falso) e que `importEpub` é chamado só 1 vez (sem retry automático nem duplo registro).

**Critério de Conclusão**: usuário com livros existentes baixa um título adicional da seção com sucesso; dedupe herdado do pipeline de import não regride pra imports não relacionados a esta feature.

**Checkpoint**: User Story 2 funcional — validação de que a US1 generaliza sem trabalho extra de UI.

**Registro da Fase**:

- Status: Concluída — sem código novo necessário além do teste; a Fase 3 já cobriu isso na prática (a Biblioteca do device de teste nunca esteve vazia durante as verificações manuais, e os downloads ali já aconteceram "ao lado" de livros existentes).
- Feito: T022 (confirmação, sem mudança de código), T023 (teste de dedupe herdado).
- Testes executados: `npx vitest run src/__tests__/services/PublicDomainDownloadService.test.ts` — 4/4 passando (3 anteriores + o novo de duplicata).
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - Falha de rede durante o download (Priority: P3)

**Objetivo**: Falha de rede (ou de armazenamento) durante o download é comunicada com clareza e permite tentar novamente, sem travar a navegação.

**Independent Test**: Com o device em modo avião, tentar baixar um título, confirmar mensagem de erro clara com opção de tentar novamente; desativar o modo avião e confirmar que o retry funciona.

### Implementation

- [X] T024 [US3] Tratamento de erro em `PublicDomainDownloadService.ts` (T006) — capturar falha de rede/timeout do `CapacitorHttp` e qualquer erro propagado do `BookImportService` (incluindo espaço insuficiente, FR-012 — reaproveita o erro genérico existente, sem mensagem dedicada), atualizando o `PublicDomainDownloadCoordinator` para `status: 'error'` com `errorMessage`. Adicionado também: detecção de `navigator.onLine === false` no momento da falha, marcando `offline: true` no estado pra diferenciar "sem conexão" de erro genérico (Acceptance Scenario 1 da US3).
- [X] T025 [US3] UI de erro + retry em `PublicDomainBookCard.tsx` (T014/T031) — já era tappable no estado `error` desde T014 (retry = tocar de novo, reinicia do zero via `beginPublicDomainDownload`). Adicionado nesta fase: mensagem de erro visível diferenciada ("Sem conexão..." vs "Não foi possível baixar...", chaves i18n `discover.publicDomain.offline`/`.error`) em vez do rótulo genérico "Tentar novamente" que havia antes.
- [X] T026 [P] [US3] Estender `PublicDomainDownloadService.test.ts` — falha de rede simulada (`CapacitorHttp` rejeitando/timeout), e confirma que "tentar novamente" reinicia do zero. Falha de rede já coberta (teste de erro genérico + novo teste offline-específico); "retry reinicia do zero" já estava coberto no nível do coordinator (T011: `beginPublicDomainDownload` aceita novo begin após `error`) e agora também no nível do card (T027) — não duplicado aqui pra evitar teste redundante.
- [X] T027 [US3] Estender `PublicDomainBookCard.test.tsx` — estado de erro exibe mensagem + botão retry, retry dispara novo download. Cobre também o caso offline específico.

**Critério de Conclusão**: falha de rede simulada em teste automatizado mostra erro claro com retry funcional; confirmado manualmente em modo avião num device real (`quickstart.md`).

**Checkpoint**: Todas as 3 user stories completas e testáveis independentemente.

**Registro da Fase**:

- Status: Concluída — falha de rede real confirmada em device (wifi + dados móveis desligados via `adb shell svc wifi/data disable`, cold start forçado com `am force-stop`), não só simulada em teste unitário.
- Feito: T024-T027. Detecção de `navigator.onLine` no momento da falha, mensagens diferenciadas (offline vs erro genérico) no card, chave i18n `discover.publicDomain.offline` nova.
- Testes executados: 20 testes automatizados nos 3 arquivos afetados (100% passando), `npx tsc --noEmit` e `npm run lint` limpos, `npm run build` limpo. **Verificação manual real em device** (RXCX103NMVZ): com wifi+dados desligados, tentativa de baixar "Dracula" falhou em ~600ms com o erro real do Android (`Unable to resolve host "standardebooks.org": No address associated with hostname`), capturado corretamente como `status: error, offline: true`. Rede restaurada logo em seguida; confirmado também que o caminho online continua funcionando (download de "Dracula" com sucesso após restaurar a rede).
- Pendências: nenhuma.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que afetam múltiplas user stories, mais os gates finais.

- [X] T028 Revisar comentários curtos nos pontos não óbvios identificados no Constitution Check de `plan.md` (branch `CapacitorHttp`, motivo do `?source=download`, motivo do progresso indeterminado, motivo de não compartilhar helper com `FishAudioService.ts`). Faltavam 2 (progresso indeterminado, motivo de não compartilhar helper) — adicionados em `PublicDomainBookCard.tsx` e `PublicDomainDownloadService.ts`.
- [X] T029 Rodar `quickstart.md` completo num device Android real (todos os edge cases: navegação durante download, toque duplo, import concorrente). Feito via screenshots + `adb shell input tap` (sem precisar do usuário interagir fisicamente) — FR-009 (grid offline) e FR-010 (download em segundo plano) confirmados ao vivo com evidência visual; ver seção "Execução real" em `quickstart.md`. Toque duplo/import concorrente ficam só com cobertura automatizada (ver notas ali).
- [ ] T030 [FOLLOW-UP, não bloqueia release] Expandir `catalog.json` além do seed inicial (T009) pra ~30-50 títulos — trabalho de curadoria de conteúdo, manual, fora do escopo de código desta feature (ver R-002 em `plan.md`).

### Checklist de Release

- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] `npm run lint && npm test && npm run build` passam sem erro
- [X] `quickstart.md` executado com sucesso num device Android real
- [X] Nenhum código desta feature acessa `standardebooks.org/.../downloads/*` fora de um download individual disparado por toque real do usuário (checagem manual do diff) — confirmado: só `PublicDomainDownloadService.fetchEpubBytes`/`buildStandardEbooksUrls` tocam esse domínio, sempre disparados por `PublicDomainDownloadService.download()` a partir de um toque de usuário (`PublicDomainBookCard.handleTap`).
- [X] `catalog.json` contém só entradas verificadas manualmente por um humano (nenhum script de scraping usado)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories. T009 (smoke-test manual) deve rodar antes de qualquer task da Fase 3+.
- **User Story 1 (Phase 3)**: depende do Foundational — é o MVP
- **User Story 2 (Phase 4)**: depende do Foundational + reaproveita a UI da US1 (T016-T017); pode rodar em paralelo à US3 depois da US1
- **User Story 3 (Phase 5)**: depende do Foundational + do serviço de download da US1 (T006, T014) já existir
- **Polish (Phase N)**: depende de todas as user stories desejadas estarem completas

### Parallel Opportunities

- T004, T005, T007 (Foundational) podem rodar em paralelo — arquivos diferentes, sem dependência entre si.
- T010, T011 (testes da Foundational) podem rodar em paralelo.
- T014 (US1) pode começar em paralelo a T004/T005 já que só depende do design do card, não da implementação do serviço — mas integração final (T016) depende de T004/T005/T006 prontos.
- User Stories 2 e 3 podem ser trabalhadas em paralelo depois que a US1 fechar (dependem só do Foundational + da UI/serviço já existentes da US1, não uma da outra).

---

## Parallel Example: Foundational

```bash
# T004, T005, T007 podem rodar juntas — arquivos diferentes, sem dependência
Task: "T004 [P] PublicDomainCatalogService.ts"
Task: "T005 [P] PublicDomainDownloadCoordinator.ts"
Task: "T007 [P] chaves i18n novas em messages.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (inclui o smoke-test manual T008 — não pular)
3. Completar Fase 3: User Story 1
4. **PARAR E VALIDAR**: rodar `quickstart.md` (cenário ponta a ponta) num device real

### Incremental Delivery

1. Setup + Foundational → fundação pronta, download real confirmado funcionando
2. User Story 1 → testar isoladamente → considerar entrega (MVP)
3. User Story 2 → validação de generalização, baixo esforço
4. User Story 3 → tratamento de erro, fecha a experiência

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- T008/T030: curadoria de catálogo é sempre manual — nunca delegar a um script/agente que acesse `standardebooks.org/ebooks/*/downloads/*` programaticamente (ver `research.md` #3 e `plan.md` R-002)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 6: Convergence

**Purpose**: Fechar as lacunas encontradas pelo `sdd-converge` (2026-08-28) entre `spec.md`/constitution e o código real — ver Convergence Findings CONV-001/CONV-002 (CONV-003 é só observação de estilo, sem task associada).

- [ ] T033 [CONV-001] Atualizar a linha de Assumption em `spec.md` ("O catálogo curado do MVP tem algo entre 30 e 50 títulos...") pra refletir que o MVP entregue tem 5 títulos verificados manualmente, com referência a T030 como o caminho de expansão pra ~30-50 (trabalho de curadoria de conteúdo, ainda não feito).
- [ ] T034 [CONV-002] Remover a chave i18n órfã `discover.publicDomain.download` dos 3 blocos de locale (pt-BR/en/es) em `src/i18n/messages.ts` — não é consumida por nenhum componente hoje. Alternativa aceitável: usá-la como `aria-label` no ícone de download de `PublicDomainBookCard.tsx` em vez de remover, se preferir manter e ganhar acessibilidade.

**Critério de Conclusão**: `spec.md` reflete o catálogo real; nenhuma chave i18n órfã relacionada a esta feature. `npm run lint && npm test && npm run build` continuam limpos depois da mudança.

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:
