# Implementation Plan: Biblioteca de Domínio Público (Standard Ebooks)

**Slug**: `002-biblioteca-dominio-publico` | **Date**: 2026-08-28 | **Spec**: `sdd/specs/002-biblioteca-dominio-publico/spec.md`

## Summary

Adiciona uma seção "Clássicos em Inglês" dentro da tela Descubra (grid
simples, catálogo curado bundled no app) que deixa o usuário baixar EPUBs
de domínio público do Standard Ebooks direto no Android, sem sair do app.
O download usa `CapacitorHttp` (mesmo padrão já validado em
`FishAudioService.ts`) e alimenta o pipeline de import já existente
(`BookImportService.importEpub`) — o livro baixado vira um `Book` local
normal, com capa/metadados extraídos do próprio EPUB. Nenhuma mudança de
schema no Dexie; nenhuma dependência nova.

## Technical Context

**Language/Version**: TypeScript + React 19, mesma stack do resto do
repositório (Vite 8).

**Primary Dependencies**: `@capacitor/core` (`CapacitorHttp`) — já é
dependência do projeto, sem adição nova.

**Storage**: IndexedDB via Dexie (`src/db/database.ts`), reaproveitando as
tabelas `books`/`bookCovers` já existentes, sem `version()` nova. O
catálogo curado é um JSON estático em `public/domain-publico/catalog.json`
(asset de build, não banco).

**Testing**: Vitest + Testing Library, mockando `@capacitor/core` (padrão
já usado em `src/__tests__/services/NativeLibraryImportService.test.ts`).

**Target Platform**: Android nativo (Capacitor) apenas — Web fica de fora
por decisão de escopo já registrada em `spec.md`.

**Performance Goals**: N/A — arquivos do catálogo são pequenos (~1MB por
título, confirmado em `research.md`), download rápido em qualquer conexão
razoável.

**Constraints**: URL de download do Standard Ebooks exige o parâmetro
`?source=download` (sem ele devolve uma página HTML interstitial, não o
EPUB — ver `research.md` #1); nenhuma automação deve acessar
`standardebooks.org/ebooks/*/downloads/*` programaticamente (robots.txt
bloqueia agentes de IA nesses caminhos — curadoria do catálogo é manual,
ver `research.md` #3).

**Scale/Scope**: MVP local single-user; catálogo inicial pequeno (ver Fase
Foundational em `tasks.md` — poucos títulos verificados manualmente pra
validar o mecanismo ponta a ponta; expandir pra ~30-50 é trabalho de
conteúdo, não bloqueia o release do mecanismo).

## Decisões Invariantes

- O EPUB baixado é convertido em `File`/`Blob` e importado via
  `BookImportService.importEpub()` já existente — nenhum pipeline de
  import paralelo é criado.
- Download usa `CapacitorHttp.request()` com `responseType: 'arraybuffer'`
  — sem fallback `fetch` pra Web, já que a feature é Android-only por
  spec (mesmo o endpoint tendo CORS liberado, ver `research.md` #2).
- O catálogo curado (`id`, `title`, `author`, `authorSlug`, `titleSlug`)
  é um JSON estático versionado no repositório
  (`public/domain-publico/catalog.json`) — não busca nem sincroniza com
  Standard Ebooks em runtime. URLs de download/capa são derivadas em
  runtime a partir dos slugs por uma função única (`data-model.md`), nunca
  gravadas cruas no JSON.
- Nenhuma automação (script de build ou de runtime) acessa
  `standardebooks.org/ebooks/*/downloads/*` fora de um download individual
  disparado por um toque real do usuário — curadoria do catálogo é manual.
- Capas de exibição no grid (antes do download) carregam sob demanda de
  URL remota, com fallback visual quando indisponível/offline — não são
  bundled localmente (`research.md` #5). A capa "de verdade" salva no
  `Book` continua vindo da extração do próprio EPUB pelo pipeline de
  import já existente, sem mudança ali.
- Indicador de progresso de download é **indeterminado** (spinner), não
  percentual — `CapacitorHttp` não expõe progresso por bytes de forma
  confiável, e arquivos são pequenos o bastante pra não justificar a
  complexidade (`research.md` #4).
- Estado de progresso de download vive num módulo singleton próprio
  (`Map<entryId, DownloadState>` + listeners, mesmo padrão de
  `src/services/ImportCoordinator.ts`), não em `useState` de componente —
  é o que permite ao download sobreviver à navegação entre telas (FR-010)
  sem precisar de uma store Zustand nova.
- Um toque em "baixar" já em andamento pro mesmo Catalog Entry é
  ignorado/idempotente — não empilha nem reinicia (FR-011).
- `BookImportSource` ganha o literal `'public-domain'`; como o campo não é
  indexado no schema Dexie, isso não exige nova `version()`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Pass | Pass | Este `plan.md` + `tasks.md` são o plano proposto pra aprovação antes do `sdd-execute` — nenhum código escrito ainda. |
| II. Comentários só onde o "porquê" não é óbvio | Pass | Pass | Pontos não óbvios identificados pra comentar no código: branch `CapacitorHttp` vs `fetch`, motivo do `?source=download`, motivo do progresso indeterminado. Listados em `tasks.md`. |
| III. Explícito antes de mágico | Pass | Pass | Decisão explícita de **não** extrair um helper HTTP compartilhado com `FishAudioService.ts` (duplicar uma função pequena e local em vez de generalizar cedo) — evita acoplar dois domínios não relacionados (TTS de terceiro vs. download de EPUB) numa abstração prematura. |
| IV. Build limpo é a definição de "pronto" | Pass | Pass | `npm run build` é gate obrigatório em cada fase de `tasks.md` (Estratégia de Testes abaixo). |
| V. Dependências novas exigem justificativa | Pass | Pass | Nenhuma dependência nova — `@capacitor/core` já é dependência do projeto. |

Nenhuma violação — `Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/002-biblioteca-dominio-publico/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── NytBookCard.tsx                    # padrão de referência pro novo card
│   ├── NytBooksRow.tsx                    # padrão de referência pro novo grid
│   ├── PublicDomainBookCard.tsx           # NOVO
│   └── PublicDomainCatalogSection.tsx     # NOVO
├── hooks/
│   └── usePublicDomainCatalog.ts          # NOVO
├── screens/
│   ├── DiscoverScreen.tsx                 # editado: nova seção
│   └── LibraryScreen.tsx                  # editado: atalho no empty state
├── services/
│   ├── BookImportService.ts               # editado: fix de importSource (R-001)
│   ├── ImportCoordinator.ts               # padrão de referência (singleton+listeners)
│   ├── FishAudioService.ts                # padrão de referência (CapacitorHttp), NÃO editado
│   ├── PublicDomainCatalogService.ts      # NOVO: carrega catalog.json
│   ├── PublicDomainDownloadService.ts     # NOVO: download + import
│   └── PublicDomainDownloadCoordinator.ts # NOVO: estado de progresso cross-tela
├── types/
│   └── book.ts                            # editado: BookImportSource += 'public-domain'
└── i18n/
    └── messages.ts                        # editado: novas chaves pt-BR/en/es

public/
└── domain-publico/
    └── catalog.json                       # NOVO: catálogo curado (seed manual)

src/__tests__/
├── services/
│   ├── PublicDomainCatalogService.test.ts       # NOVO
│   ├── PublicDomainDownloadService.test.ts      # NOVO
│   ├── PublicDomainDownloadCoordinator.test.ts  # NOVO
│   └── BookImportService.test.ts                # editado: cobre fix de importSource
├── components/
│   └── PublicDomainBookCard.test.tsx      # NOVO
└── screens/
    ├── DiscoverScreen.test.tsx            # editado
    └── LibraryScreen.test.tsx             # editado
```

**Structure Decision**: projeto único (React + Vite), sem separação
backend/frontend — segue exatamente a árvore já existente em `src/`
(`components/`, `hooks/`, `screens/`, `services/`, `types/`, `i18n/`),
mais um diretório novo de asset estático (`public/domain-publico/`),
mesmo padrão de `public/word-lens/` já usado pro data pack de Word Lens.

## Complexity Tracking

*Sem violações — tabela vazia.*

## Estratégia de Testes

Prioridade: unitário → componente → manual (device Android, já que a
feature depende de `CapacitorHttp` nativo — não há E2E automatizado nesse
ambiente hoje).

- **Unitário**: `PublicDomainDownloadService` (mock de `CapacitorHttp`,
  cobrindo sucesso, falha de rede, resposta HTML-em-vez-de-EPUB),
  `PublicDomainDownloadCoordinator` (dedupe de toque duplo, notificação de
  listeners), `PublicDomainCatalogService` (parse do `catalog.json`,
  derivação de URLs), fix de `importSource` em `BookImportService`.
- **Componente**: `PublicDomainBookCard`/`PublicDomainCatalogSection`
  (estados idle/downloading/error), `LibraryScreen` (atalho no empty
  state), `DiscoverScreen` (seção nova renderiza).
- **Manual**: `quickstart.md` — obrigatório antes de fechar a feature,
  cobre os fluxos que só existem em device real (download de verdade,
  modo avião, navegação durante download em andamento).

Comandos-base:

```powershell
npm run lint
npx vitest run src/__tests__/services/PublicDomainCatalogService.test.ts
npx vitest run src/__tests__/services/PublicDomainDownloadService.test.ts
npx vitest run src/__tests__/services/PublicDomainDownloadCoordinator.test.ts
npm test
npm run build
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída |
| Foundational (Fase 2) | Concluída — smoke-test real em device confirmou download+import ponta a ponta |
| User Story 1 (Fase 3) | Concluída — verificada ao vivo em device real, incluindo 2 ajustes ad-hoc (abrir livro já baixado; reconciliar estado pós-restart) |
| User Stories 2-3 (Fases 4-5) | Não iniciadas |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `importEpubUnlocked` (`BookImportService.ts`, caminho usado por `File`) hoje não propaga `options.importSource` pra `importSingleEpubRecord` — só o caminho nativo (`importNativeEpubUnlocked`) faz isso. Sem o fix, todo livro baixado via catálogo ficaria sem rastro de origem. | Médio — afeta métrica SC-002 (mensuração de ativação) e qualquer feature futura que dependa de saber a origem do livro. | Task dedicada na Fase Foundational: propagar `options.importSource` também no caminho `importEpubUnlocked`. Import manual existente não regride (hoje já não passa esse campo, então nenhum comportamento atual muda). |
| R-002 | Curadoria do catálogo é manual (não scriptada) por causa do `robots.txt` do Standard Ebooks — nenhuma automação pode varrer `/downloads/*` (`research.md` #3). | Baixo pro mecanismo, médio pra operação contínua — expandir/atualizar a lista exige trabalho humano recorrente, não é "rodar um script". | Fase Foundational semeia o catálogo com poucos títulos verificados manualmente (suficiente pra testar a feature ponta a ponta); expandir pra ~30-50 fica como trabalho de conteúdo pós-release, documentado como tal, não bloqueia o merge do mecanismo. |
| R-003 | Download em segundo plano (FR-010) é uma Promise não vinculada ao ciclo de vida do componente React — se o usuário fechar o app (não só navegar) durante o download, o estado se perde. | Baixo — já é um Fora de Escopo aceito e documentado em `spec.md` (sem continuidade entre sessões). | Nenhuma — comportamento aceito, não é bug. |
| R-004 | Alcançabilidade real de `standardebooks.org` via `CapacitorHttp` num device Android nunca foi testada neste projeto (só há precedente com `fish.audio`, domínio diferente). Existe defesa antibot ativa no site deles (honeypot, ver `research.md` #3) — risco pequeno de bloqueio específico a User-Agent de app/WebView. | Médio — se falhar, todo o resto da UI construída em cima fica sem valor até resolver. | **Resolvido**: smoke-test manual (T009) rodado em device real (RXCX103NMVZ) — download de "Pride and Prejudice" via `CapacitorHttp` funcionou de ponta a ponta (`fileSize: 831960` batendo com o real, `file-import-finished`, `bookId: 126`, sem crash). Sem sinal de bloqueio antibot pra esse User-Agent. |
| R-005 | SC-002/SC-003 (`spec.md`) exigem telemetria agregada entre usuários pra serem medidos — o NeoReader não tem analytics remoto hoje (local-first, sem backend de dados de uso; `DiagnosticsLogger`/`ImportDiagnostics` só logam localmente via `console`/`adb logcat`, `firebase/analytics` nunca foi importado no `src/`, só existe como dependência transitiva no `package-lock.json`). Achado A-001 do Analyze do `sdd-plan`. | Baixo pro mecanismo em si (a feature funciona sem isso), mas SC-002/SC-003 ficam inverificáveis em produção. | **Resolvido**: decisão explícita do usuário (2026-08-28) — não adicionar infraestrutura de analytics só por causa desta feature. SC-002/SC-003 marcados como não mensuráveis nesta fase em `spec.md`; sem task de instrumentação em `tasks.md`. Revisitar só se/quando o produto decidir adicionar telemetria de uso de forma geral (decisão maior que esta feature). |
| R-006 | Tocar num card já baixado (estado `success`) não fazia nada — usuário esperava abrir o livro direto dali, sem precisar ir pra Biblioteca. Descoberto na verificação manual da Fase 3 (T031 ad-hoc). | Baixo — UX incompleta, não um bug de dados. | **Resolvido**: `DiscoverScreen` ganhou prop `onOpenBook` (mesmo padrão `push({ name: 'book-details', book })` de `LibraryScreen`/`HomeScreen` em `App.tsx`), encadeada até `PublicDomainBookCard` via hook. Tocar num card `success` agora busca o `Book` (`getBookById`) e abre a tela de detalhes. |
| R-007 | Estado de "já baixado" não sobrevivia a restart do app — `PublicDomainDownloadCoordinator` é só em memória de sessão, sem relação com o que de fato está na Biblioteca. Descoberto ao reinstalar o app pra testar R-006: um livro já baixado voltou a mostrar ícone de download, e tocar nele gerou erro de duplicata em vez de abrir (T032 ad-hoc). | Médio — sem isso, todo restart do app "esquece" downloads anteriores e a nova capacidade de abrir livro (R-006) fica quebrada pra qualquer sessão que não seja a primeira. | **Resolvido**: `usePublicDomainCatalog` reconcilia o estado ao carregar o catálogo — consulta `findBookByFileName` (novo helper em `src/db/books.ts`, usa o índice já existente em `fileName`) pelo nome de arquivo determinístico (`buildPublicDomainFileName`, extraído de `PublicDomainCatalogService.ts`) e marca `success` se o livro já existir. Confirmado ao vivo no device pelo usuário. |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-08-28 | Setup + Foundational | Implementados T001-T008 e T010-T013 (código + testes unitários, 30/30 passando, lint/build limpos). Catálogo semeado com 5 títulos (Pride and Prejudice, Frankenstein, The Adventures of Sherlock Holmes, A Christmas Carol, Dracula), slugs verificados manualmente contra as páginas base do Standard Ebooks. | T009 (smoke-test manual num device Android real) — sem device conectado nesta sessão. |
| 2026-08-28 | Setup + Foundational (fechamento) | T009 rodado com device conectado (RXCX103NMVZ): trigger temporário em `main.tsx` (removido depois) disparou 1 download real via `CapacitorHttp` contra `standardebooks.org`, capturado por `scripts/capture-android-diagnostics.ps1`. Resultado: `fileSize: 831960` (bate com o real), pipeline completo até `file-import-finished`, `bookId: 126`, sem crash. Fase Foundational fechada — todas as 13 tasks feitas. | Nenhuma. |
| 2026-08-28 | User Story 1 (Fase 3) | Implementados T014-T021 (card, hook, seção, integração em Descubra/Biblioteca). Verificado ao vivo em device real: download via UI real funcionou (bookId 127, "A Christmas Carol"). Usuário pediu ajuste: tocar num livro já baixado deveria abrir o livro (T031 ad-hoc) — implementado com `onOpenBook` encadeado até `App.tsx`. Ao reinstalar pra testar isso, surgiu um 2º problema: estado "já baixado" não sobrevive a restart (T032 ad-hoc) — corrigido com reconciliação via `findBookByFileName` novo em `src/db/books.ts`. Ambos reconfirmados ao vivo pelo usuário. Suíte completa (605/2 skipped) sem regressão. | Nenhuma. |

**PRÓXIMO**: Iniciar Fase 4 (User Story 2) — validar que a seção funciona igual com Biblioteca já populada (T022-T023, baixo esforço, reaproveita a infraestrutura da Fase 3).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/PublicDomainCatalogService.ts` (novo — inclui `buildPublicDomainFileName`)
- `src/services/PublicDomainDownloadCoordinator.ts` (novo)
- `src/services/PublicDomainDownloadService.ts` (novo)
- `src/services/BookImportService.ts` (fix R-001 em `importEpubUnlocked`)
- `src/types/book.ts` (`BookImportSource` += `'public-domain'`)
- `src/i18n/messages.ts` (chaves `discover.publicDomain.*`, `library.empty.publicDomainAction`)
- `public/domain-publico/catalog.json` (catálogo seed, 5 títulos)
- `src/components/PublicDomainBookCard.tsx` (novo — estados idle/downloading/success/error, toque abre o livro quando já baixado)
- `src/components/PublicDomainCatalogSection.tsx` (novo)
- `src/hooks/usePublicDomainCatalog.ts` (novo — inclui reconciliação de estado pós-restart)
- `src/db/books.ts` (novo `findBookByFileName`)
- `src/screens/DiscoverScreen.tsx` (nova seção + prop `onOpenBook`)
- `src/screens/LibraryScreen.tsx` (atalho no empty state)
- `src/App.tsx` (wiring de `onOpenBook` pro case `discover`)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- URL de download do Standard Ebooks **precisa** do parâmetro
  `?source=download` — sem ele, o servidor devolve uma página HTML
  interstitial, não o EPUB (ver `research.md` #1). Fácil de esquecer e
  gerar um "import falhou" confuso de debugar.
- Nunca automatizar acesso a `standardebooks.org/ebooks/*/downloads/*` ou
  `/text*` (robots.txt bloqueia agentes de IA nesses caminhos
  especificamente) — inclui scripts de dev/CI, não só o app em produção.
  Curadoria do catálogo é manual, sempre.
- Nem todo título tem slug no formato simples `autor/titulo` que
  `buildStandardEbooksUrls` assume — alguns títulos com múltiplas edições
  (ex: *Alice's Adventures in Wonderland*) usam um segmento extra de
  ilustrador/tradutor (`lewis-carroll/alices-adventures-in-wonderland/john-tenniel`),
  o que quebraria a fórmula de nome de arquivo do download. Ao expandir o
  catálogo (T030), preferir títulos com slug de 2 segmentos (`autor/titulo`)
  e conferir a página base antes de adicionar — títulos com slug aninhado
  ficam de fora até a fórmula de URL suportar esse caso.
