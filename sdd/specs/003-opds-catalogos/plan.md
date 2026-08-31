# Implementation Plan: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

**Slug**: `003-opds-catalogos` | **Date**: 2026-08-31 | **Spec**: `sdd/specs/003-opds-catalogos/spec.md`

## Summary

Adiciona um mecanismo genérico de catálogos OPDS (protocolo Atom/OPDS 1.x e
JSON/OPDS 2.0, detectado por `Content-Type`) que o usuário configura em
Settings — incluindo servidores self-hosted (Calibre-Web, Kavita) com Basic
Auth opcional — e navega a partir da tela Descobrir: uma row de amostra por
catálogo, com "ver mais" levando à navegação completa (pastas, paginação,
busca). Download reaproveita o pipeline de import já existente
(`BookImportService.importEpub`), sem storage paralelo pro livro em si. O
Project Gutenberg vem pré-configurado por padrão; a seção "Clássicos em
Inglês" (feature 002) migra pra usar o mesmo mecanismo visual, com amostra
alimentada pelo feed público de novidades do Standard Ebooks e "ver mais"
mantendo a lista curada já existente (o feed completo exige conta paga).
Credencial de auth nunca fica em texto puro — vive no secure storage nativo
Android (extensão do plugin já existente), referenciada só por id no Dexie.
Restrito a Android nativo no v1; Digest Auth e certificado self-assinado
ficam fora de escopo, ambos por limitação técnica documentada em
`research.md`.

## Technical Context

**Language/Version**: TypeScript + React 19, mesma stack do resto do
repositório (Vite 8).

**Primary Dependencies**: `@capacitor/core` (`CapacitorHttp`, já
dependência) e `foliate-js/opds.js` (já dependência, cobre parsing
Atom/OPDS 1.x e OpenSearch) — nenhuma dependência npm nova. Uma dependência
**nativa Android** nova: `androidx.security:security-crypto` (Gradle), pra
credencial fora de texto puro — ver `## Complexity Tracking`.

**Storage**: IndexedDB via Dexie (`src/db/database.ts`), 2 tabelas novas em
`version(17)` — `opdsCatalogs` e `opdsDownloadedEntries` (ver
`data-model.md`). Credencial de auth fica fora do Dexie, no secure storage
nativo Android via extensão de `NeoReaderLibraryPlugin.java`.

**Testing**: Vitest + Testing Library, mockando `@capacitor/core`
(`CapacitorHttp`) e o plugin nativo (`registerPlugin`) — mesmo padrão já
usado em `src/__tests__/services/NativeLibraryImportService.test.ts` e
`PublicDomainDownloadService.test.ts`.

**Target Platform**: Android nativo (Capacitor) apenas — Web fica de fora
por decisão de escopo já registrada em `spec.md` (FR-022).

**Performance Goals**: N/A pra MVP — poucos catálogos por usuário, poucas
dezenas/centenas de entries por página. Busca dentro de "ver mais" deve
debounce a digitação (evitar 1 request por tecla), mas sem meta numérica
formal.

**Constraints**: `CapacitorHttp` não expõe tolerância a certificado
self-assinado nem suporte nativo a Digest Auth (`research.md` #4-5) — ambos
fora de escopo do v1, documentados como limitação conhecida, não bug.
`foliate-js/opds.js` cobre só Atom, não OPDS 2.0 JSON — normalizador JSON
próprio necessário (`research.md` #2). Parsing XML via `DOMParser` do
WebView Android (Chromium) — engine único e consistente, mas feed
self-hosted malformado (`&` não escapado) é esperado, não exceção
(`research.md` #10).

**Scale/Scope**: MVP local single-user; usuário típico com poucos catálogos
(padrão + 1-3 self-hosted/públicos adicionados). Sem paginação profunda
testada em escala — "carregar mais" cobre o caso comum, sem otimização de
virtualização de lista nesta fase.

## Decisões Invariantes

- Credencial de catálogo nunca fica em texto puro no Dexie — sempre via
  `EncryptedSharedPreferences`/`MasterKey` (`androidx.security:security-crypto`)
  no plugin nativo já existente, referenciada só pelo `id` numérico do
  catálogo (`data-model.md`).
- Filtro de EPUB-only (manter só `type` contendo `application/epub+zip`,
  1 formato por entry, entries de navegação sempre passam) acontece só na
  camada de normalização (`OpdsAtomParser`/`OpdsJsonParser`/`OpdsCatalogService`),
  nunca em componente de UI (FR-011/FR-012/FR-013).
- Download de qualquer catálogo OPDS reaproveita
  `BookImportService.importEpub(file, { importSource: 'opds' })` — sem
  pipeline de import paralelo. Livro baixado é um `Book` local normal.
- Só Basic Auth no v1. Digest Auth fica explicitamente fora de escopo —
  `CapacitorHttp` não tem suporte nativo, e implementar exigiria MD5 do
  zero (ausente do Web Crypto). Ver Non-Goals em `spec.md`.
- Certificado self-assinado/CA privada não é tolerado no v1 — servidor
  self-hosted com HTTPS self-signed falha com erro de rede genérico, sem
  workaround automático (`research.md` #4).
- OPDS 2.0 JSON é parseado por um normalizador próprio pequeno (`foliate-js/opds.js`
  só cobre Atom); ambos os caminhos convergem pro mesmo `OpdsFeedPage`/
  `OpdsFeedEntry` normalizado antes de chegar na UI (`data-model.md`).
- Vínculo "já baixado" usa uma tabela Dexie própria
  (`opdsDownloadedEntries`, chave composta `[catalogId+entryId]`), não um
  nome de arquivo determinístico como a feature 002 — `entryId` de
  catálogo arbitrário não garante ser filename-safe (`research.md` #7). Ao
  exibir o estado, reconciliar contra `getBookById` (o livro pode ter sido
  removido da Biblioteca depois).
- "Ver mais" de "Clássicos em Inglês" é um caso especial hardcoded — abre
  a lista curada já existente da feature 002, não o
  `OpdsCatalogBrowseScreen` genérico (que faria navegação OPDS ao vivo,
  inviável porque o feed completo do Standard Ebooks exige conta paga).
  Decisão explícita de **não** generalizar um campo "destino do ver mais"
  configurável por catálogo só pra acomodar esse único caso (Princípio
  III da constitution — explícito antes de mágico).
- Nenhuma tabela existente (`books`, `bookCovers` etc.) é alterada — tudo
  de OPDS fica em tabelas próprias, adicionadas via `version(17)` nova
  (schema append-only, Restrição do Projeto na constitution).
- `OpdsCatalogService` implementa seu próprio helper de requisição
  `CapacitorHttp`, sem reusar o helper privado de `FishAudioService.ts`
  nem de `PublicDomainDownloadService.ts` — mesmo precedente já registrado
  no `plan.md` da feature 002 (domínios não relacionados, extrair cedo
  acoplaria sem necessidade real).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Pass | Pass | Este `plan.md` + `tasks.md` são o plano proposto pra aprovação antes do `sdd-execute` — nenhum código escrito ainda. |
| II. Comentários só onde o "porquê" não é óbvio | Pass | Pass | Pontos não óbvios mapeados: ausência de suporte a cert self-assinado, ausência de Digest Auth, motivo do vínculo por tabela (não fileName), caso especial hardcoded do "ver mais" de Standard Ebooks, motivo de não reusar helper HTTP de outro service. Listados em `tasks.md`. |
| III. Explícito antes de mágico | Pass | Pass | Decisão explícita de **não** generalizar "destino do ver mais" configurável só pro caso do Standard Ebooks (hardcoded direto); sem "auth strategy pattern" já que só existe 1 esquema (Basic); sem abstração de "provider genérico de storage" — só extensão pequena e direta do plugin nativo já existente. |
| IV. Build limpo é a definição de "pronto" | Pass | Pass | `npm run build` é gate obrigatório em cada fase de `tasks.md`. |
| V. Dependências novas exigem justificativa | **Violação justificada** | **Violação justificada** | `androidx.security:security-crypto` (Gradle/nativo, não npm) — necessária pra FR-004 (credencial fora de texto puro). Já discutida e aprovada pelo usuário durante a assessment (`sdd/assessments/suporte-catlogos-opds-pblicos-self-hosted/decision.md`). Ver `## Complexity Tracking`. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/003-opds-catalogos/
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
├── types/
│   ├── book.ts                             # editado: BookImportSource += 'opds'
│   └── opds.ts                             # NOVO: OpdsCatalog, OpdsDownloadedEntry, OpdsFeedEntry, OpdsFeedPage
├── db/
│   ├── database.ts                         # editado: version(17), opdsCatalogs + opdsDownloadedEntries
│   ├── opdsCatalogs.ts                     # NOVO: CRUD + seed do Gutenberg padrão
│   └── opdsDownloadedEntries.ts            # NOVO: recordDownload, findDownloadedEntry
├── services/
│   ├── BookImportService.ts                # NÃO editado (reuso direto de importEpub)
│   ├── FishAudioService.ts                 # padrão de referência (CapacitorHttp), NÃO editado
│   ├── PublicDomainCatalogService.ts       # editado: sample via feed OPDS público (US4)
│   ├── PublicDomainCatalogSection.tsx      # ver components/ abaixo (reskin sample+vermais)
│   └── opds/
│       ├── OpdsAtomParser.ts               # NOVO: wrapper sobre foliate-js/opds.js
│       ├── OpdsJsonParser.ts               # NOVO: normalizador OPDS 2.0 JSON próprio
│       ├── OpdsCatalogService.ts           # NOVO: fetch + detecção de formato + normalização + filtro EPUB
│       ├── OpdsCredentialStore.ts          # NOVO: bridge fino pro plugin nativo
│       ├── OpdsDownloadService.ts          # NOVO: download + import + grava vínculo
│       └── OpdsDownloadCoordinator.ts      # NOVO: estado de progresso cross-tela (padrão PublicDomainDownloadCoordinator)
├── hooks/
│   ├── useOpdsCatalogs.ts                  # NOVO: catálogos + amostra por catálogo (Descobrir)
│   └── useOpdsCatalogBrowse.ts             # NOVO: navegação completa (pastas, paginação, busca)
├── components/
│   ├── NytBooksRow.tsx                     # padrão de referência pro row de amostra, NÃO editado
│   ├── PublicDomainBookCard.tsx            # padrão de referência pro card, NÃO editado
│   ├── OpdsCatalogRow.tsx                  # NOVO: row de amostra + "ver mais"
│   └── OpdsEntryCard.tsx                   # NOVO: card genérico (estados idle/baixando/baixado/erro)
├── screens/
│   ├── DiscoverScreen.tsx                  # editado: rows OPDS + "Clássicos em Inglês" reskin
│   ├── SettingsScreen.tsx                  # editado: item de menu "Catálogos OPDS"
│   ├── OpdsCatalogSettingsScreen.tsx       # NOVO: listar/adicionar/editar/remover catálogos
│   └── OpdsCatalogBrowseScreen.tsx         # NOVO: navegação completa ("ver mais" genérico)
├── App.tsx                                 # editado: rotas 'opds-catalog-settings', 'opds-catalog-browse'
└── i18n/
    └── messages.ts                         # editado: novas chaves pt-BR/en/es

android/app/
├── build.gradle                            # editado: androidx.security:security-crypto
└── src/main/java/com/johnny/neoreader/
    └── NeoReaderLibraryPlugin.java         # editado: storeOpdsCredential/getOpdsCredential/deleteOpdsCredential

src/__tests__/
├── db/
│   ├── database.test.ts                    # editado, se existir cobertura de version() — checar na exploração da Fase 1
│   ├── opdsCatalogs.test.ts                # NOVO
│   └── opdsDownloadedEntries.test.ts       # NOVO
├── services/
│   ├── opds/
│   │   ├── OpdsAtomParser.test.ts          # NOVO
│   │   ├── OpdsJsonParser.test.ts          # NOVO
│   │   ├── OpdsCatalogService.test.ts      # NOVO
│   │   ├── OpdsDownloadService.test.ts     # NOVO
│   │   └── OpdsDownloadCoordinator.test.ts # NOVO
│   └── PublicDomainCatalogService.test.ts  # editado: cobre sample via feed
├── hooks/
│   ├── useOpdsCatalogs.test.ts             # NOVO
│   └── useOpdsCatalogBrowse.test.ts        # NOVO
├── components/
│   ├── OpdsCatalogRow.test.tsx             # NOVO
│   └── OpdsEntryCard.test.tsx              # NOVO
└── screens/
    ├── DiscoverScreen.test.tsx             # editado
    ├── SettingsScreen.test.tsx             # editado
    ├── OpdsCatalogSettingsScreen.test.tsx  # NOVO
    └── OpdsCatalogBrowseScreen.test.tsx    # NOVO
```

**Structure Decision**: projeto único (React + Vite), sem separação
backend/frontend — segue a árvore já existente em `src/`, com um
subdiretório novo `services/opds/` (mesmo padrão de agrupamento já usado em
`services/bookInfo/` pra um conjunto coeso de arquivos de uma única área).
Parte nativa toca só o plugin Android já existente, sem plugin novo.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Nova dependência Gradle `androidx.security:security-crypto` (nativa Android, não npm) | FR-004 exige credencial fora de texto puro; é a lib oficial Google pra storage criptografado com Keystore (`EncryptedSharedPreferences`), evita reimplementar criptografia à mão | Guardar em `@capacitor/preferences` (texto puro — mesmo padrão hoje usado pras chaves de API de TTS em `src/db/settings.ts`) rejeitada por violar FR-004 diretamente; implementar Android Keystore cru sem a lib rejeitada por reinventar uma superfície de segurança crítica com mais risco de bug sutil |

## Estratégia de Testes

Prioridade: unitário → componente → manual (device Android — feature
depende de `CapacitorHttp` e do plugin nativo, sem E2E automatizado nesse
ambiente hoje).

- **Unitário**: `OpdsAtomParser`/`OpdsJsonParser` (feeds reais de exemplo —
  Gutenberg, e um feed self-hosted sintético cobrindo `&` não escapado e
  paginação), `OpdsCatalogService` (detecção de formato por Content-Type,
  filtro EPUB-only, múltiplos formatos por entry, fallback de detecção),
  `OpdsDownloadService`/`OpdsDownloadCoordinator` (mock `CapacitorHttp`,
  sucesso/falha/offline/toque duplo), `opdsCatalogs.ts`/`opdsDownloadedEntries.ts`
  (CRUD, seed do Gutenberg, reconciliação por `getBookById`),
  `OpdsCredentialStore` (mock do plugin nativo, incluindo
  `typeof method !== 'function'`).
- **Componente**: `OpdsEntryCard`/`OpdsCatalogRow` (estados idle/baixando/
  baixado/erro), `OpdsCatalogSettingsScreen` (CRUD, erro de credencial
  inválida), `OpdsCatalogBrowseScreen` (navegação, paginação, busca),
  `DiscoverScreen` (rows novas + "Clássicos em Inglês" reskin).
- **Manual**: `quickstart.md` — obrigatório antes de fechar a feature,
  cobre os fluxos que só existem em device real com servidor self-hosted
  de teste (Calibre-Web/Kavita), incluindo Basic Auth correto/incorreto e
  credencial sobrevivendo a restart do app.

Comandos-base:

```powershell
npm run lint
npx vitest run src/__tests__/services/opds/OpdsAtomParser.test.ts
npx vitest run src/__tests__/services/opds/OpdsJsonParser.test.ts
npx vitest run src/__tests__/services/opds/OpdsCatalogService.test.ts
npx vitest run src/__tests__/services/opds/OpdsDownloadService.test.ts
npm test
npm run build
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída — `src/types/opds.ts` novo, `BookImportSource += 'opds'`, `npx tsc --noEmit` limpo |
| Foundational (Fase 2) | Concluída — Dexie v17, secure storage nativo, parsers Atom/JSON, `OpdsCatalogService`. 37/37 testes novos passando, lint/typecheck limpos |
| User Story 1 (Fase 3) | Concluída — row do Gutenberg em Descobrir + download ponta a ponta até a Biblioteca. 38/38 testes novos, suíte completa 676/676, build limpo. Verificação em device real pendente (sem device conectado nesta sessão) |
| User Story 2 (Fase 4) | Concluída — CRUD de catálogo self-hosted em Settings, sugestões reais (Standard Ebooks/Internet Archive), validação de credencial pós-save. 24/24 testes novos, suíte completa 686/686, build limpo. Verificação em device real pendente |
| User Story 3 (Fase 5) | Concluída — navegação completa (breadcrumb, paginação via IntersectionObserver, busca com debounce), "ver mais" ligado. 23/23 testes novos, suíte completa 701/701, build limpo. Verificação em device real pendente |
| User Story 4 (Fase 6) | Concluída — "Clássicos em Inglês" migrado pro layout row+ver-mais, amostra ao vivo via parser dedicado (feed real não é OPDS — usa rel="enclosure", descoberta em campo). Suíte completa 714/714, build limpo. Verificação em device real pendente |
| User Story 5 (Fase 7) | Concluída — erro isolado por catálogo com retry, offline detectado, estado vazio geral com CTA (FR-023). Corrigido comportamento incorreto herdado da US1 (rows com erro ficavam escondidas em vez de mostrar erro claro). Suíte completa 720/720, build limpo. Verificação em device real pendente |
| Polish (Fase N) | Concluída, exceto T063 — i18n revisado (sem chave órfã, sem chave faltando), comentários confirmados, README.md atualizado. `quickstart.md` em device real **não executado** (sem device Android conectado nesta sessão) — pendência explícita antes de produção |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Amostra de "Clássicos em Inglês" (feed público de novidades do Standard Ebooks) pode mostrar títulos diferentes dos que aparecem no "ver mais" (lista curada estática da feature 002) — usuário pode tocar em "ver mais" esperando ver o título X da amostra e não encontrá-lo. | Baixo/médio — inconsistência de UX aceita conscientemente na assessment (modelo híbrido), não um bug a corrigir aqui. | Nenhuma ação nesta fase — comportamento aceito e documentado (`spec.md` User Story 4, `decision.md`). Revisitar só se o feed completo do Standard Ebooks deixar de exigir conta paga no futuro. |
| R-002 | `androidx.security:security-crypto` — versão exata compatível com `compileSdk`/`minSdk` do projeto ainda não confirmada (não testado nesta fase de planejamento). | Baixo — biblioteca estável e amplamente usada, mas incompatibilidade de versão só aparece ao rodar `npx cap sync android` / build Gradle real. | Confirmar versão na Fase Foundational do `sdd-execute`, antes de escrever os métodos do plugin — task dedicada em `tasks.md`. |
| R-003 | Certificado self-assinado não suportado (`research.md` #4) pode bloquear uma fração real de usuários self-hosted caseiros (Calibre-Web/Kavita atrás de HTTPS self-signed sem reverse proxy). | Médio pro segmento self-hosted mais avançado — não bloqueia o mecanismo em si (HTTP puro ou cert válido continuam funcionando). | Nenhuma ação nesta fase — limitação documentada e aceita (`research.md` #4). Candidato a revisitar numa fase futura via `network_security_config.xml` por domain-config, se virar demanda real. |
| R-004 | SC-002/SC-003 (`spec.md`) exigem telemetria agregada entre usuários pra serem medidos — o NeoReader não tem analytics remoto hoje (local-first, sem backend de dados de uso), mesma lacuna já identificada e aceita na feature 002 (R-005 do `plan.md` dela). Achado do Analyze do `sdd-plan` desta feature. | Baixo pro mecanismo em si (a feature funciona sem isso), mas SC-002/SC-003 ficam inverificáveis em produção. | **Resolvido**: mesma decisão já tomada na 002 aplicada aqui por precedente direto — não adicionar infraestrutura de analytics só por causa desta feature. SC-002/SC-003 marcados como não mensuráveis nesta fase em `spec.md`; sem task de instrumentação em `tasks.md`. Revisitar só se/quando o produto decidir adicionar telemetria de uso de forma geral. |
| R-005 | O feed `standardebooks.org/feeds/atom/new-releases`, usado pra alimentar a amostra de "Clássicos em Inglês", **não é um feed OPDS de verdade** — usa `rel="enclosure"` (Atom/RSS genérico), não `rel="http://opds-spec.org/acquisition"` (OPDS-spec). Descoberto ao inspecionar o XML real ao vivo durante a implementação da Fase 6 (User Story 4). | Médio na hora da descoberta (invalidava a premissa de "reusar OpdsAtomParser" do plano original) — baixo depois de resolvido, já que o formato de saída (`PublicDomainCatalogEntry`) não mudou pra nenhum consumidor. | **Resolvido**: escrito `parseNewReleasesFeed` dedicado em `PublicDomainCatalogService.ts`, extraindo authorSlug/titleSlug do `<id>` de cada entry em vez de depender de `rel` de aquisição. Nenhum outro arquivo (`PublicDomainBookCard`, `PublicDomainDownloadService`, `buildStandardEbooksUrls`) precisou mudar. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-08-31 | Setup (Fase 1) | T001-T002 implementadas: `src/types/opds.ts` novo (OpdsCatalog, OpdsDownloadedEntry, OpdsFeedEntry, OpdsFeedPage, OpdsDownloadState, OpdsCatalogError), `BookImportSource += 'opds'`. `npx tsc --noEmit` sem erros. | Nenhuma. |
| 2026-08-31 | Foundational (Fase 2) | T003-T017 implementadas. Dexie v17 com seed do Gutenberg; secure storage nativo completo (Gradle, 3 métodos Java com `EncryptedSharedPreferences`, bridge TS); `opdsCatalogs.ts`/`opdsDownloadedEntries.ts` (CRUD, dedupe de URL, reconciliação); `OpdsAtomParser.ts` (reusa `foliate-js/opds.js`, já dependência do projeto — zero dependência nova nesse ponto) e `OpdsJsonParser.ts` (normalizador próprio); `OpdsCatalogService.ts` orquestrando fetch/auth/detecção de formato/busca (2 hops Atom, 1 hop JSON). 2 bugs reais (capa não resolvida pra URL absoluta) pegos pelos próprios testes escritos nesta fase e corrigidos antes de fechar. 37/37 testes novos passando, lint/typecheck limpos. Achado fora de escopo (não corrigido, só logado): `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4 (warning de depreciação, não bloqueia) — registrado em `.planning/backlog.md` como `[Bug]`. | R-002 (versão do `androidx.security:security-crypto`) segue não validada contra build Gradle real. |

| 2026-08-31 | User Story 1 (Fase 3) | T018-T029 implementadas. Row do Gutenberg em Descobrir, download real via `CapacitorHttp` alimentando `BookImportService.importEpub`, vínculo gravado em `opdsDownloadedEntries`, erro isolado por catálogo (não derruba as demais rows). 1 bug de lint pego e corrigido: `setState` síncrono em efeito no `useOpdsCatalogs`. 38/38 testes novos passando; suíte completa 676/676 (2 skipped pré-existentes) sem regressão; `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos. | Verificação manual em device Android real (download de fato) ainda não feita — sem device conectado nesta sessão (`adb devices` vazio); fica pro `quickstart.md` no Polish. |

| 2026-08-31 | User Story 2 (Fase 4) | T030-T037 implementadas. `OpdsCatalogSettingsScreen` completa (CRUD via `useLiveQuery`, sugestões de Standard Ebooks/Internet Archive com URLs verificadas ao vivo nesta sessão, validação de credencial pós-save mostrando erro específico FR-005). Descoberta: mecanismo de "refresh após CRUD" em `useOpdsCatalogs` não tinha nenhum chamador real (a navegação em pilha do `App.tsx` já remonta a tela ao voltar de Settings) — removido em vez de mantido como abstração morta (T033/T036 viraram, na prática, uma simplificação em vez de uma feature nova). Remoção de catálogo é direta (sem passo de confirmação), mesmo precedente de `CollectionManagerSheet`. 24/24 testes novos passando; suíte completa 686/686 sem regressão; `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos. | Verificação manual em device real (Cenário 2 do quickstart, incluindo Basic Auth correto/incorreto) ainda pendente — sem device conectado nesta sessão. |

| 2026-08-31 | User Story 3 (Fase 5) | T038-T045 implementadas. `useOpdsCatalogBrowse` (breadcrumb com jump direto, paginação, busca debounced via ref pra evitar fetch duplicado), `OpdsCatalogBrowseScreen` ("carregar mais" automático por `IntersectionObserver`, não botão — releitura literal de FR-009/AC3), rota nova, "ver mais" ligado de ponta a ponta. `fetchPage`/`search` de `OpdsCatalogService` já tinham sido implementados por completo na Foundational (T039 virou só confirmação). 23/23 testes novos passando; suíte completa 701/701 sem regressão; `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos. | Verificação manual em device real (Cenário 3 do quickstart) ainda pendente. |

| 2026-08-31 | User Story 4 (Fase 6) | T046-T053 implementadas. **Descoberta importante**: `standardebooks.org/feeds/atom/new-releases` inspecionado ao vivo — NÃO é OPDS de verdade (`rel="enclosure"`, não `rel="http://opds-spec.org/acquisition"`); `OpdsAtomParser` classificaria tudo como navegação. Escrito um parser pequeno dedicado (`parseNewReleasesFeed`) extraindo authorSlug/titleSlug do `<id>` de cada entry, devolvendo o mesmo formato `PublicDomainCatalogEntry` da lista curada — `buildStandardEbooksUrls`/`PublicDomainDownloadService`/`PublicDomainBookCard` ficaram 100% intocados. Nova tela `PublicDomainCatalogScreen` (não prevista no plano original) como destino do "ver mais", já que a lista completa virou algo que precisa de um lugar próprio pra morar. Bug de timing real pego por teste: fallback do feed-ao-vivo-falhou usava `entries` via ref, mas a ordem de resolução entre os 2 efeitos paralelos não é garantida — corrigido re-chamando `listCatalog()` direto no `.catch()`. 20/20 testes novos passando; suíte completa 714/714 sem regressão; `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos. | Verificação manual em device real (Cenário 4 do quickstart) ainda pendente. |

| 2026-08-31 | User Story 5 (Fase 7) | T054-T060 implementadas. Erro isolado por catálogo com offline detection e retry por row; estado vazio geral (FR-023) com CTA pra Settings. **Correção de comportamento incorreto** herdado da própria Fase 3 desta feature: `DiscoverScreen` escondia inteiramente a row de um catálogo com erro (`error ? null : ...`) em vez de mostrar erro claro nela — corrigido agora que existe UI de erro de verdade. `OpdsCatalogService`/`OpdsCatalogFetchError` (T057) já estavam prontos desde a Foundational, só faltava a UI consumir. 25/25 testes editados passando; suíte completa 720/720 sem regressão; `npx tsc --noEmit`, `npx eslint` e `npm run build` limpos. | Verificação manual em device real (edge cases do quickstart) ainda pendente. |

| 2026-08-31 | Polish (Fase N) | T061, T062, T064 concluídas: i18n confirmado sem chave órfã/faltando (`satisfies Record<MessageKey, string>` já garante paridade en/es; grep confirmou uso real de toda chave nova), comentários dos pontos não óbvios confirmados presentes em todos os arquivos-chave, `README.md` atualizado (Descubra, Configuracoes, Stack, Persistencia local — v17, Proximos passos). `npm run lint` (projeto inteiro), `npm test` (720/720, 2 skipped) e `npm run build` limpos como fechamento. T063 (`quickstart.md` em device real) **não executado** — sem device Android conectado nesta sessão (`adb devices` vazio o dia inteiro). | T063 — validação manual em device real com servidor Calibre-Web/Kavita de teste, incluindo Basic Auth correto/incorreto e credencial sobrevivendo a restart do app. |

**PRÓXIMO**: Feature funcionalmente completa (T001-T064, exceto T063 como pendência explícita de verificação manual em device real). Rodar `sdd-converge` pra confirmar convergência, e/ou conectar um device Android + servidor Calibre-Web/Kavita de teste pra fechar o `quickstart.md`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/db/database.ts` (`version(17)`: `opdsCatalogs`, `opdsDownloadedEntries`, seed Gutenberg)
- `src/db/opdsCatalogs.ts` (novo — CRUD)
- `src/db/opdsDownloadedEntries.ts` (novo)
- `android/app/build.gradle` (`androidx.security:security-crypto`)
- `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java` (3 métodos de credencial)
- `src/services/opds/OpdsCredentialStore.ts` (novo)
- `src/services/opds/OpdsAtomParser.ts` (novo)
- `src/services/opds/OpdsJsonParser.ts` (novo)
- `src/services/opds/OpdsCatalogService.ts` (novo)
- `src/types/foliate.d.ts` (editado — `declare module 'foliate-js/opds.js'`)
- `src/services/opds/OpdsDownloadCoordinator.ts` (novo)
- `src/services/opds/OpdsDownloadService.ts` (novo)
- `src/components/OpdsEntryCard.tsx` (novo)
- `src/components/OpdsCatalogRow.tsx` (novo)
- `src/hooks/useOpdsCatalogs.ts` (novo)
- `src/screens/DiscoverScreen.tsx` (editado — rows OPDS)
- `src/i18n/messages.ts` (editado — chaves `discover.opds.*`, `settings.opdsCatalogs.*`)
- `src/screens/OpdsCatalogSettingsScreen.tsx` (novo)
- `src/screens/SettingsScreen.tsx` (editado — item de menu)
- `src/App.tsx` (editado — rotas `opds-catalog-settings` e `opds-catalog-browse`)
- `src/hooks/useOpdsCatalogBrowse.ts` (novo)
- `src/screens/OpdsCatalogBrowseScreen.tsx` (novo)
- `src/services/PublicDomainCatalogService.ts` (editado — `fetchNewReleasesSample`, parser dedicado não-OPDS)
- `src/hooks/usePublicDomainCatalog.ts` (editado — `sampleEntries`/fallback)
- `src/components/PublicDomainCatalogSection.tsx` (editado — reskin row+vermais)
- `src/screens/PublicDomainCatalogScreen.tsx` (novo — destino do "ver mais")
- `src/hooks/useOpdsCatalogs.ts` (editado — offline/retryCatalog)
- `src/components/OpdsCatalogRow.tsx` (editado — estado de erro/retry)
- `README.md` (editado — seções Descubra/Configuracoes/Stack/Persistencia local/Proximos passos)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `vi.useFakeTimers()` + `@testing-library/react`'s `waitFor` não se dão bem juntos nesta suíte — `waitFor` faz polling com timers reais internamente, então fake timers deixam o teste travado até o timeout (visto em `useOpdsCatalogBrowse.test.ts`, testes de busca com debounce). Pra testar debounce, prefira timers reais com um `timeout` maior no `waitFor` (`{ timeout: 2000 }`) em vez de `vi.advanceTimersByTimeAsync`.
