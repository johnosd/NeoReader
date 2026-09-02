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

**Storage**: IndexedDB via Dexie (`src/db/database.ts`), 2 tabelas novas
introduzidas em `version(17)` — `opdsCatalogs` e `opdsDownloadedEntries` (ver
`data-model.md`); `opdsCatalogs` ganhou o índice `createdAt` que faltava em
`version(18)` (ver R-006). Credencial de auth fica fora do Dexie, no secure
storage nativo Android via extensão de `NeoReaderLibraryPlugin.java`.

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
| Polish (Fase N) | i18n revisado, comentários confirmados, README.md atualizado. T063 (`quickstart.md` em device real) **concluído**, exceto modo avião — todos os 4 cenários e os edge cases verificados (ao vivo quando dependiam de rede/device real, via código+teste unitário quando eram lógica pura). 4 bugs reais só visíveis em device/runtime encontrados e corrigidos: R-006 (`SchemaError` de índice), R-007 (tap morto em pasta da amostra), R-009 (busca do Gutenberg bloqueada por cleartext), R-010 (self-hosted `http://` puro nunca conectava, faltava `network_security_config.xml`). Também implementados a pedido do usuário: tags automáticas de assunto/idioma (T066), ordenação Popular/Latest/Random (T067), layout lista pra página só de pastas (T068) |
| Convergência (Fase 8) | Concluída — T070-T077, todos fechados. Cenário 2 (self-hosted + Basic Auth) fechado ponta a ponta contra um Calibre real; SC-004 verificado empiricamente via inspeção direta do LevelDB no device; Cenário 3 item 5 (download a partir de busca + navegar pra longe e voltar, FR-016) fechado de forma automatizada via `adb`. 4 mudanças novas: validar conexão antes de salvar catálogo (FR-027), ícone de status + atalho pra biblioteca em Settings (FR-028), capas autenticadas pra catálogo com credencial (FR-029), mensagem de erro específica no download (FR-030). `spec.md` sincronizado com FR-024 a FR-030. Suíte completa 747/747 (2 skipped pré-existentes), build limpo, reinstalado e confirmado funcionando ao vivo. Próximo passo: rodar `sdd-converge` de novo pra fechar formalmente |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Amostra de "Clássicos em Inglês" (feed público de novidades do Standard Ebooks) pode mostrar títulos diferentes dos que aparecem no "ver mais" (lista curada estática da feature 002) — usuário pode tocar em "ver mais" esperando ver o título X da amostra e não encontrá-lo. | Baixo/médio — inconsistência de UX aceita conscientemente na assessment (modelo híbrido), não um bug a corrigir aqui. | **Resolvido**: Nenhuma ação nesta fase — comportamento aceito e documentado (`spec.md` User Story 4, `decision.md`). Auditoria do `sdd-converge` (2026-09-01) não achou evidência de violação — mitigação confirmada. Revisitar só se o feed completo do Standard Ebooks deixar de exigir conta paga no futuro. |
| R-002 | `androidx.security:security-crypto` — versão exata compatível com `compileSdk`/`minSdk` do projeto ainda não confirmada (não testado nesta fase de planejamento). | Baixo — biblioteca estável e amplamente usada, mas incompatibilidade de versão só aparece ao rodar `npx cap sync android` / build Gradle real. | **Resolvido**: confirmado pela auditoria do `sdd-converge` — dezenas de builds Gradle (`gradlew installDebug`) ao longo da sessão de verificação em device real, todos com sucesso, incluindo a partir de um `npx cap sync android` limpo. `androidx.security:security-crypto` (`1.1.0-alpha06`) é compatível com o `compileSdk`/`minSdk` do projeto. |
| R-003 | Certificado self-assinado não suportado (`research.md` #4) pode bloquear uma fração real de usuários self-hosted caseiros (Calibre-Web/Kavita atrás de HTTPS self-signed sem reverse proxy). | Médio pro segmento self-hosted mais avançado — não bloqueia o mecanismo em si (HTTP puro ou cert válido continuam funcionando). | **Resolvido**: Nenhuma ação nesta fase — limitação documentada e aceita (`research.md` #4). Auditoria do `sdd-converge` (2026-09-01) não achou evidência de violação — mitigação confirmada; o teste ao vivo desta sessão contra Calibre real usou HTTP puro, não exercitou este caso. Candidato a revisitar numa fase futura via `network_security_config.xml` por domain-config, se virar demanda real. |
| R-004 | SC-002/SC-003 (`spec.md`) exigem telemetria agregada entre usuários pra serem medidos — o NeoReader não tem analytics remoto hoje (local-first, sem backend de dados de uso), mesma lacuna já identificada e aceita na feature 002 (R-005 do `plan.md` dela). Achado do Analyze do `sdd-plan` desta feature. | Baixo pro mecanismo em si (a feature funciona sem isso), mas SC-002/SC-003 ficam inverificáveis em produção. | **Resolvido**: mesma decisão já tomada na 002 aplicada aqui por precedente direto — não adicionar infraestrutura de analytics só por causa desta feature. SC-002/SC-003 marcados como não mensuráveis nesta fase em `spec.md`; sem task de instrumentação em `tasks.md`. Revisitar só se/quando o produto decidir adicionar telemetria de uso de forma geral. |
| R-005 | O feed `standardebooks.org/feeds/atom/new-releases`, usado pra alimentar a amostra de "Clássicos em Inglês", **não é um feed OPDS de verdade** — usa `rel="enclosure"` (Atom/RSS genérico), não `rel="http://opds-spec.org/acquisition"` (OPDS-spec). Descoberto ao inspecionar o XML real ao vivo durante a implementação da Fase 6 (User Story 4). | Médio na hora da descoberta (invalidava a premissa de "reusar OpdsAtomParser" do plano original) — baixo depois de resolvido, já que o formato de saída (`PublicDomainCatalogEntry`) não mudou pra nenhum consumidor. | **Resolvido**: escrito `parseNewReleasesFeed` dedicado em `PublicDomainCatalogService.ts`, extraindo authorSlug/titleSlug do `<id>` de cada entry em vez de depender de `rel` de aquisição. Nenhum outro arquivo (`PublicDomainBookCard`, `PublicDomainDownloadService`, `buildStandardEbooksUrls`) precisou mudar. |
| R-006 | `db.opdsCatalogs.orderBy('createdAt')` (usado por `listCatalogs()`) lançava `SchemaError: KeyPath createdAt on object store opdsCatalogs is not indexed` em runtime real — `version(17)` só declarava `'++id, baseUrl, isDefault'` pra essa tabela, sem indexar `createdAt`. Invisível pra suíte de testes (mocka o Dexie inteiro); só apareceu em teste manual no device real (T063), quebrando silenciosamente tanto a exibição do catálogo padrão (Gutenberg) quanto o cadastro manual de catálogo novo — explica o "deu erro ao tentar cadastrar um catálogo" relatado antes desta verificação. | Alto — bloqueava as duas User Stories mais básicas da feature (P1 e P2) em produção, apesar de 720/720 testes unitários verdes. | **Resolvido**: `version(18)` adiciona só o índice que faltava (`opdsCatalogs: '++id, baseUrl, isDefault, createdAt'`), sem `.upgrade()` — Dexie reindexa os registros existentes sozinho (mesmo padrão da v5, que adicionou `sectionIndex` em `bookmarks`). Verificado ao vivo: row do Gutenberg passou a aparecer em Descobrir após o fix. |
| R-007 | Entries `kind: 'navigation'` (pastas — ex: resultado de busca do Gutenberg que aponta pra um documento OPDS por livro) apareciam corretamente na row de amostra de Descobrir, mas o toque nelas não fazia nada — `DiscoverScreen.tsx` nunca passava `onOpenFolder` pro `OpdsCatalogRow`. Só descoberto testando a amostra real do Gutenberg num device (a maioria dos catálogos de teste sintéticos usados nos testes unitários não exercitava esse caminho especificamente a partir da amostra). | Médio — não bloqueava o fluxo principal (usuário ainda podia usar "ver mais" pra navegar), mas tornava uma pasta visível na amostra inutilizável, uma UX quebrada perceptível. | **Resolvido**: `useOpdsCatalogBrowse`/`OpdsCatalogBrowseScreen`/rota `opds-catalog-browse` em `App.tsx` ganharam um `initialFolder?: BreadcrumbItem` opcional; `DiscoverScreen.tsx` agora passa `onOpenFolder` abrindo a tela de navegação já dentro da pasta tocada, com breadcrumb de 2 níveis correto. Verificado ao vivo: tocar "Pride and Prejudice" na amostra do Gutenberg abre a pasta certa, com 2 edições reais e busca disponível. |
| R-010 | Testando Cenário 2 pela primeira vez (self-hosted + Basic Auth) contra um Calibre-Web real (Docker local): catálogo `http://` puro (sem TLS — configuração comum de self-hosted caseiro na rede local, sem reverse proxy) nunca conectava. Causa dupla: (1) `upgradeToHttps()` (R-009) forçava `https://` incondicionalmente, mas o servidor não fala TLS naquela porta — falha de conexão; (2) mesmo sem esse upgrade, o Android bloqueia **todo** tráfego `http://` por padrão (`targetSdk` 28+) porque o projeto nunca teve `network_security_config.xml` — nenhum catálogo self-hosted em HTTP puro jamais funcionou, desde o início da feature. | Alto — bloqueava por completo o caso de uso mais comum de self-hosted real (instância caseira sem certificado), o motivo original desta feature existir. | **Resolvido**: `android/app/src/main/res/xml/network_security_config.xml` novo (`cleartextTrafficPermitted="true"` global — Android não suporta exceção por faixa de IP/CIDR, só domínio literal; https continua inafetado, só libera o caso `http://` explícito que hoje só acontece num catálogo OPDS self-hosted cadastrado pelo próprio usuário), referenciado em `AndroidManifest.xml`. `upgradeToHttps()` (`OpdsCatalogService.ts`/`OpdsDownloadService.ts`) reescrito pra só fazer upgrade quando **o catálogo em si já é `https://`** (não mais incondicional) — preserva o fix do R-009 (Gutenberg é https, upgrade continua acontecendo) sem quebrar catálogo self-hosted que é `http://` de propósito. Validado contra um Calibre-Web real rodando em Docker local: Basic Auth confirmado funcionando via requisição direta (200 com credencial certa, 401 com credencial errada, `EncryptedSharedPreferences` não entra nesse teste direto mas o fluxo do app usa a mesma credencial). **Não verificado ponta a ponta no device**: o PC de teste e o device Android estão na mesma sub-rede (192.168.0.x) e a porta 8083 está exposta (`docker ps` confirma), mas o device não consegue completar a conexão TCP (`ConnectException`) mesmo com o app corrigido — bloqueio de rede local (firewall do Windows ou isolamento de cliente no roteador Wi-Fi), não um bug do NeoReader; criar regra de firewall exige shell elevado, fora do alcance desta sessão. 4 testes novos (2 em cada service) cobrindo os dois ramos (catálogo https faz upgrade / catálogo http não faz); suíte completa 732/734 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. |
| R-009 | Busca (FR-010) no catálogo Gutenberg falhava sempre, em runtime real, com "Couldn't load" — nunca pego pelos testes unitários (mockam `CapacitorHttp` sem aplicar a política de cleartext do Android). Causa raiz confirmada via logcat: o próprio OpenSearch description document do Gutenberg (`catalog/osd-books.xml`) anuncia um template `http://m.gutenberg.org/ebooks/search.opds/?query={searchTerms}` — HTTP puro, subdomínio diferente do catálogo (`www.`). Android bloqueia cleartext por padrão (`usesCleartextTraffic=false`), e a requisição falhava com `IOException: Cleartext HTTP traffic to m.gutenberg.org not permitted`. Esse exato cenário (servidor real devolvendo link `http://` mesmo servindo HTTPS) já tinha sido **antecipado e decidido em `research.md` #10 durante o planejamento** ("normalizar `http://` → `https://`"), mas a implementação nunca foi escrita — gap entre plano e código só descoberto em teste manual real. | Alto — bloqueava 100% da busca (FR-010) contra o único catálogo pré-configurado por padrão, apesar de research.md já ter essa decisão documentada. | **Resolvido**: `upgradeToHttps()` (pequeno helper duplicado em `OpdsCatalogService.ts` e `OpdsDownloadService.ts`, mesmo precedente de duplicação já usado no resto do módulo) força `https://` em qualquer URL antes de qualquer `CapacitorHttp.request` — mais simples e mais amplo que a formulação original de research.md ("só quando aponta pro mesmo host do catálogo"), já que não precisa comparar hosts e cobre também o caso self-hosted originalmente citado (link absoluto `http://` num feed servido por HTTPS). Verificado ao vivo: busca por "love" no Gutenberg passou a retornar resultados reais e pastas de navegação (Authors/Subjects/Bookshelves) em vez de erro. 2 testes novos (`OpdsCatalogService.test.ts`, `OpdsDownloadService.test.ts`) reproduzindo o cenário exato do bug. |
| R-008 | Feedback direto do usuário após ver a amostra do Gutenberg ao vivo: card de pasta genérico (só ícone, sem capa) é ruim visualmente perto dos cards de publicação (com capa real). Investigação inicial contra 1 entry do feed real pareceu confirmar que o Gutenberg manda capa nas entries de navegação via `rel="http://opds-spec.org/image/thumbnail"` (`foliate-js/opds.js`'s `getFeed()` descarta esse link ao montar `feed.navigation`, mantendo só 1 link por item). Implementado (`collectNavigationCovers()` em `OpdsAtomParser.ts`, suporte a `images` em nav item no `OpdsJsonParser.ts`, capa+badge no `OpdsFolderCard`), redeployado e verificado ao vivo no device — resultado: um ícone borrado/genérico igual em todo card, pior que o ícone de pasta original, não uma capa de verdade. **Causa raiz**: comparação do base64 desse link entre as 25 entries de navegação da mesma página do feed mostrou que é **byte-idêntico em todas** — é um ícone decorativo de tamanho fixo (22×22px) que o Gutenberg anexa uniformemente a toda entry de resultado de busca, não uma miniatura por livro. A checagem original (passo 1 desta pesquisa) só confirmou que o link existia e carregava uma imagem válida, sem comparar entre entries diferentes — validação incompleta que levou a implementar algo que piorava a UI. | Baixo — sem impacto funcional (nunca chegou a ficar visível pro usuário fora desta sessão de verificação), mas custou uma rodada de implementação+revert. Lição de processo: ao usar um dado de um feed de exemplo pra justificar uma feature de UI, comparar esse dado entre múltiplas entries antes de confiar nele, não só confirmar que "existe". | **Revertido**: `collectNavigationCovers()`/suporte a `images` em nav item/capa+badge no `OpdsFolderCard` removidos; `OpdsFolderCard` volta a mostrar só o ícone genérico de pasta pra toda entry de navegação, com comentário curto explicando por que (evita retentativa às cegas no futuro). Nenhum campo de tipo mudou (`coverUrl` já era opcional em `OpdsFeedEntry`, usado só por entries de publicação agora). |
| R-011 | Testando Cenário 2 pela segunda vez (2026-09-01), agora contra um Calibre Content Server real (não Docker Calibre-Web como no R-010) na própria máquina de dev do usuário: (1) o bloqueio de conectividade device↔PC do R-010 **não se repetiu** nesta rede/setup — ping e download completos funcionaram; (2) `Basic Auth` retornava `400 Bad Request: "Unsupported authentication method"` — o Calibre usa Digest Auth por padrão no Content Server, só oferece Basic Auth via uma opção explícita nas preferências; (3) capas nunca carregavam (`<img>` sem header de auth, servidor exige auth em toda URL inclusive imagem); (4) `OpdsCatalogSettingsScreen` salvava o catálogo mesmo com a conexão falhando, sem avisar o motivo — usuário "no escuro" sobre catálogos salvos que nunca funcionavam. | Médio-Alto — (1)/(2) bloqueavam por completo o teste do cenário mais importante da feature (self-hosted real); (3)/(4) são bugs de UX reais que só apareceram contra um servidor real com auth, invisíveis nos testes unitários (que mockam a resposta HTTP). | **Resolvido**: (1) ambiente de rede específico, sem mudança de código — nada a fazer, documentado como não-reprodução do R-010 nesta configuração. (2) resolvido no lado do servidor (Calibre reconfigurado pra Basic Auth) — Digest continua Non-Goal do v1, não é um bug do app. (3) `OpdsCatalogService.fetchCoverDataUrl`/`resolveEntryCovers` novos, busca autenticada + `data:` URI (T076/FR-029). (4) `testConnection` roda ANTES de persistir, só salva em caso de sucesso (T074/FR-027). Tudo verificado ao vivo no device após reinstalar. |

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

| 2026-08-31 | Polish (Fase N) / T065 | Feedback do usuário após ver a amostra ao vivo: card de pasta sem capa é visualmente ruim. Implementado (capa+badge no `OpdsFolderCard`, extração do link de imagem em `OpdsAtomParser.ts`/`OpdsJsonParser.ts`), redeployado e verificado ao vivo — resultado real: ícone genérico borrado, idêntico em toda entry (Gutenberg manda o mesmo ícone 22×22px pra todo resultado de busca, não uma capa por livro; confirmado comparando o base64 entre 25 entries). **Revertido** de volta pro ícone de pasta simples, com comentário documentando a descoberta pra não repetir a tentativa às cegas (ver R-008). Suíte completa de volta a 720/720 (2 skipped pré-existentes); `npx eslint` limpo. | Nenhuma — decisão fechada, R-008 documenta o porquê. |
| 2026-08-31 | Polish (Fase N) / T063 (parcial) | Verificação manual em device real (RXCX103NMVZ) iniciada. 2 bugs reais encontrados e corrigidos (R-006 `SchemaError` de índice faltando, R-007 tap morto em pasta da amostra), cada um com rebuild (`npm run build` → `npx cap sync android` → `gradlew installDebug`) e reverificação ao vivo confirmando o fix. Cenário 1/User Story 1 (P1) verificado ponta a ponta: row do Gutenberg aparece em Descobrir → tocar pasta "Moby Dick" abre `OpdsCatalogBrowseScreen` com breadcrumb e busca corretos → download de uma edição real busca bytes via `CapacitorHttp`, decodifica, importa via `BookImportService.importEpub` e atualiza o card pra "In your library" → abrir o card leva à tela de detalhes do livro com metadata real (capa, título, autor, ano, sinopse) parseada do EPUB baixado. Também confirmado (não é bug): tentar baixar "Pride and Prejudice" (2 edições) falhou com "Este livro ja esta na biblioteca." — o dedup de `BookImportService` (por `title`+`author`, não só `fileHash`) bloqueou corretamente porque esse livro já existia na Biblioteca de testes (124 livros) de uma sessão anterior; comportamento correto e idêntico ao já usado pela feature 002, não uma regressão desta feature. | Cenário 2 (self-hosted+Basic Auth) segue sem servidor de teste disponível nesta sessão. Cenário 3: paginação ("carregar mais") e busca por termo dentro do catálogo ainda não exercitadas ao vivo. Cenário 4 (Standard Ebooks "ver mais") e edge cases (offline, URL duplicada/malformada, remover todos os catálogos, toque duplicado, credencial sobrevive a restart) ainda pendentes. |

| 2026-08-31 | Polish (Fase N) / T066 | Pedido do usuário: que metadado do Gutenberg dava pra virar tag de filtro? Investigado ao vivo o documento OPDS individual de um livro (não só o feed de busca) — achado: `publication.metadata.subject` (LCSH) e `.language` já vêm parseados de graça pelo `foliate-js`, só não estavam sendo lidos por `OpdsAtomParser.ts`/`OpdsJsonParser.ts`. Implementado `pickSubjects()` (cap em 3, exclui scheme DCMIType) + leitura de `language` nos 2 parsers; `foliate.d.ts`/`types/opds.ts` estendidos; `BookImportService.ts`'s `ImportBookOptions` ganhou `tags?: number[]` opcional (antes hardcoded `[]`); `OpdsDownloadService.ts` ganhou `resolveEntryTags()` chamando `createTag()` (idempotente por nome) antes do import. Reusa a UI de filtro por tag já existente na Biblioteca, sem tela nova. Também investigada (a pedido do usuário) ordenação: feed raiz real do Gutenberg (`/ebooks.opds/`, diferente do endpoint de busca usado como `baseUrl`) expõe "Popular"/"Latest"/"Random" como entries de navegação de verdade apontando pra `?sort_order=downloads`/`release_date`/`random` — confirmado ao vivo que `sort_order` funciona (ordens de resultado diferentes). Não implementado ainda — é convenção específica do Gutenberg (não padrão OPDS), decisão de design pendente sobre onde expor (ver `## Riscos e Decisões` novo item se essa discussão avançar). 1 teste novo + assinaturas atualizadas; suíte completa 721/723 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo**: "Crime and Punishment" baixado via Gutenberg ganhou `#Detective and mystery stories`, `#Psychological fiction`, `#Saint Petersburg (Russia) -- Fiction`, `#Inglês` na Biblioteca. | Decisão de ordenação (sort_order) resolvida no checkpoint seguinte (T067). |

| 2026-08-31 | Polish (Fase N) / T063 (continuação) | Cenário 4 (Standard Ebooks "ver mais") verificado: abre a lista curada estática (`PublicDomainCatalogScreen`), não navegação OPDS ao vivo — comportamento correto por design. Cenário 3 itens 3-4 verificados: paginação automática confirmada (busca por "love" no Gutenberg carregou dezenas de resultados rolando, bem além da primeira página, sem ação manual); busca por termo **achou bug real** (R-009 — busca sempre falhava por causa de cleartext HTTP bloqueado, causa e fix documentados em R-009), corrigido e reverificado ao vivo com sucesso. | Item 5 do Cenário 3 (baixar a partir da tela de busca especificamente) ainda não reexercitado. Cenário 2 (self-hosted+Basic Auth) segue sem servidor de teste. Edge cases ainda pendentes. |

| 2026-08-31 | Polish (Fase N) / T067 | Pedido do usuário: implementar "Popular"/"Latest"/"Random". Decisão tomada: controle de sort explícito (4 chips: Padrão/Populares/Recentes/Aleatório) na raiz do `OpdsCatalogBrowseScreen`, em vez de reestruturar a navegação pra usar `/ebooks.opds/` como raiz — mantém a amostra de Descobrir com capas reais de livro (não pastas) e funciona genericamente pra qualquer catálogo (`?sort_order=X` extra, ignorado sem erro por servidor que não reconhece). `appendSortOrder()` em `OpdsCatalogService.ts`; state em `useOpdsCatalogBrowse.ts`. 5 testes novos; suíte completa 727/729 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo**: os 3 chips não-padrão trocam a lista pra resultados genuinamente diferentes (Latest e Random confirmados visualmente contra o Gutenberg real). | Nenhuma — decisão fechada e verificada. |

| 2026-08-31 | Polish (Fase N) / T068 | Pedido do usuário, direto após ver os chips de sort funcionando: página só de pastas (resultado de busca do Gutenberg, sem capa — R-008) fica ruim em grid de cards vazios. Decisão: layout adaptativo por página, não configurável — `entries.every(kind === 'navigation')` decide lista vs. grid automaticamente, sem toggle manual pro usuário (mais simples, e a escolha certa é sempre determinística a partir do conteúdo da própria página). `OpdsFolderListRow` novo em `OpdsEntryCard.tsx`. 2 testes novos; suíte completa 730/732 (2 skipped pré-existentes); `npx eslint`/`npm run build` limpos. **Verificado ao vivo**: busca do Gutenberg (só pastas) mostra lista compacta; drill-down num livro com edições reais volta pro grid com capas verdadeiras — os dois modos alternam corretamente na mesma navegação. | Nenhuma — decisão fechada e verificada. |

| 2026-08-31 | Polish (Fase N) / R-010 | Cenário 2 (self-hosted+Basic Auth) finalmente testado com servidor real: Calibre-Web via Docker local (`lscr.io/linuxserver/calibre-web`), biblioteca real criada com `calibredb` (3 EPUBs do Gutenberg), Basic Auth habilitado. **2 bugs reais de arquitetura encontrados**: catálogo self-hosted `http://` puro nunca conectava (ver R-010) — corrigido com `network_security_config.xml` + `upgradeToHttps()` escopado por catálogo. Validado que o servidor em si aceita/rejeita credencial corretamente (200/401 via request direto). Ponta a ponta no device não fechou por bloqueio de rede local entre o PC de teste e o Android (fora do código do app) — regra de firewall exigiria shell elevado. | Fechar a verificação ponta a ponta no device requer resolver a conectividade de rede local (firewall do PC ou isolamento de cliente no roteador) — não é mais um bug do NeoReader, é ambiente de teste. |

| 2026-08-31 | Polish (Fase N) / T063 (fechamento) | Firewall liberado pelo usuário (regra elevada criada), mas conectividade device↔PC seguiu falhando — diagnosticado como isolamento de cliente do roteador Wi-Fi (fora do alcance da sessão). Sugeri Standard Ebooks como alternativa pra testar Basic Auth contra servidor público real (confirmado `WWW-Authenticate: Basic realm="...email...password vazio"` ao vivo) — usuário optou por não testar agora. Restante do quickstart fechado a pedido do usuário, com prioridade em economizar tokens: item 5 do Cenário 3 (baixar a partir da busca) verificado ao vivo (dedup bloqueou corretamente a 2ª edição de "Moby Dick", mesma lógica já validada); edge cases verificados ao vivo quando dependiam de device/rede real (toque duplicado — confirmado limpo, sem duplicata), e via leitura de código + teste unitário já existente quando eram lógica pura sem risco real de bug oculto (duplicata de URL, catálogo malformado, remover catálogo com download em andamento, remover todos os catálogos, credencial sobrevive a restart — este último também reforçado por observação indireta ao longo da sessão, credencial nunca precisou ser recadastrada nos múltiplos relaunches). | Único item restante: cenário de modo avião ao vivo (mecanismo já coberto por teste unitário). |

| 2026-09-01 | Convergência (Fase 8) | Sessão de teste ao vivo direta do usuário contra um Calibre Content Server real (fora do fluxo `sdd-execute` formal, documentado retroativamente agora). T070 fechado: Cenário 2 completo ponta a ponta (Basic Auth + download real), depois de descobrir e resolver Digest Auth por padrão do Calibre (reconfigurado no servidor, não no app) e o R-010 não se repetir nesta rede. T071 fechado com evidência empírica real (`adb run-as grep` no LevelDB do IndexedDB — zero ocorrências da credencial, controle positivo com `books` confirmando o método). T073 fechado (FR-024/025/026 em `spec.md`). 4 tasks ad-hoc (T074-T077) implementando pedidos diretos do usuário e corrigindo bugs achados no processo: validar conexão antes de salvar catálogo (R-011), status+atalho em Settings, capas autenticadas pra catálogo com credencial, mensagem de erro específica no download (o "erro" reportado era na real o dedup correto de `BookImportService`, só escondido atrás de texto genérico). `spec.md` ganhou FR-027 a FR-030 + nova Clarificação. Suíte 747/747 (2 skipped pré-existentes), `npx tsc --noEmit`/`npx eslint`/`npm run build` limpos, reinstalado via `npm run android:run` e confirmado funcionando ao vivo pelo usuário ("agora deu certo"). | T072 (LOW) segue aberto — não relacionado a esta sessão. |

| 2026-09-01 | Convergência (Fase 8) / T072 | Último item de `Phase 8` fechado — automatizado via `adb shell input tap`/`screencap` (leitura de screenshots) sem precisar do usuário no device: Discover → "See more" Gutenberg → busca "philosophy" → pasta "The Man Who Was Thursday: A Nightmare" → baixou 1ª edição, confirmado na Biblioteca (131 livros, tags automáticas do FR-024 aplicadas: `#Fantasy fiction`, `#Detective and mystery stories`, `#London (England) -- Fiction`, `#Inglês`) → navegou pra outra aba (Library) e voltou pelo caminho completo (Discover → Gutenberg → nova busca → mesma pasta) → item seguiu "In your library" sem re-baixar. `adb logcat` confirma só 1 request de download do `.epub` na sessão inteira. `tasks.md`/`quickstart.md` atualizados; 87/87 tasks. | Nenhuma — `Phase 8` 100% fechada, rodar `sdd-converge` a seguir. |

**PRÓXIMO**: `Phase 8: Convergence` totalmente fechada (T070-T077, 87/87 tasks). Rodar `sdd-converge` de novo pra fechar formalmente o ciclo — deve convergir limpo.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/opds/OpdsCatalogService.ts` (editado — `testConnection()` novo (T074/FR-027), `fetchCoverDataUrl()`/`resolveEntryCovers()` novos (T076/FR-029), refatorado `buildAuthHeaders`/`rawRequest` pra aceitar credencial explícita em vez de derivar só do `OpdsCatalog`)
- `src/screens/OpdsCatalogSettingsScreen.tsx` (editado — `handleSave` testa conexão ANTES de persistir, T074/FR-027; ícone de status + botão `onOpenCatalog`, T075/FR-028)
- `src/hooks/useOpdsCatalogs.ts` / `src/hooks/useOpdsCatalogBrowse.ts` (editados — chamam `resolveEntryCovers` após buscar página, T076/FR-029)
- `src/components/OpdsEntryCard.tsx` (editado — mostra `state.errorMessage` específico em vez de texto genérico, T077/FR-030)
- `src/App.tsx` (editado — `OpdsCatalogSettingsScreen` recebe `onOpenCatalog`)
- `src/i18n/messages.ts` (editado — chaves `settings.opdsCatalogs.form.test*`, `.status.*`, `.open`)
- `sdd/specs/003-opds-catalogos/spec.md` (editado — FR-024 a FR-030, Clarificação 2026-09-01)
- `sdd/specs/003-opds-catalogos/quickstart.md` (editado — Cenário 2 fechado com precisão por item, SC-004 verificado)

Lista da árvore completa da feature (Setup até Polish) fica nas linhas de Execution Notes anteriores — não repetida aqui, foco é só o que este checkpoint tocou.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `vi.useFakeTimers()` + `@testing-library/react`'s `waitFor` não se dão bem juntos nesta suíte — `waitFor` faz polling com timers reais internamente, então fake timers deixam o teste travado até o timeout (visto em `useOpdsCatalogBrowse.test.ts`, testes de busca com debounce). Pra testar debounce, prefira timers reais com um `timeout` maior no `waitFor` (`{ timeout: 2000 }`) em vez de `vi.advanceTimersByTimeAsync`.
- Bugs de schema Dexie (índice faltando pra um `.orderBy()`/`.where()`) só aparecem em `SchemaError` de runtime contra o IndexedDB real — mocks de teste unitário (que mockam o Dexie inteiro) nunca pegam isso. Depois de mudar/adicionar uma `version()`, vale testar pelo menos uma vez num device/emulador real antes de considerar a fase "pronta" (ver R-006).
- Pra depurar em device real: `adb -s <serial> shell pidof com.johnny.neoreader` pra achar o PID, depois `adb -s <serial> logcat -d --pid=<PID> -s Capacitor:* chromium:*` — os erros JS relevantes (incluindo `NeoReaderImport`/`NeoReaderEvent` com stack trace) aparecem como `E Capacitor/Console`, e toda chamada `CapacitorHttp.request` loga a URL completa em `V Capacitor: callback: ..., pluginId: CapacitorHttp`, o que é suficiente pra reconstruir a sequência de requests sem precisar de proxy/mitmproxy.
- `adb shell uiautomator dump` não expõe texto do conteúdo do WebView diretamente na busca por padrão simples de uma linha só (o XML sai numa única linha gigante) — usar `Grep`/`ripgrep` com `-o` ou ler o arquivo via `Get-Content -Raw` e `IndexOf`/`Substring` em vez de `Select-String` linha a linha, senão o match não aparece mesmo existindo.
- O buffer do `logcat` gira rápido (~1-2min) sob spam de tags ruidosas (`I View: setRequestedFrameRate`, a cada frame do WebView), mesmo filtrando por `--pid` — não confiar em captura ampla + vasculhar depois. Rodar `adb logcat -c` (limpa buffer) imediatamente antes de pedir pro usuário reproduzir a ação alvo, não antes disso.
- Pra verificar empiricamente que uma credencial/dado sensível NÃO está em texto puro no Dexie (SC-004): `adb shell run-as com.johnny.neoreader grep -a -c <termo> /data/data/com.johnny.neoreader/app_webview/Default/IndexedDB/https_localhost_0.indexeddb.leveldb/*.log,*.ldb` — grep binário direto nos arquivos brutos do LevelDB funciona (Chromium/V8 serializa strings ASCII em 1 byte por char, não UTF-16, então aparecem como texto puro pesquisável). **Sempre rodar uma busca de controle** por um termo que sabidamente existe (ex: nome de uma tabela com dados reais) pra confirmar que o método encontra coisas — sem isso, "zero resultados" pode ser falso negativo por caminho/origem errado, não ausência real do dado. No Git Bash, prefixar o comando com `MSYS_NO_PATHCONV=1` pra evitar que paths Unix (`/data/data/...`) sejam convertidos pra caminho Windows.

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar convergência limpa (7b). Nunca reescreve o que já existe acima. -->

Feature convergida em 2026-09-01, após duas rodadas de `sdd-execute`/`sdd-converge` e uma sessão adicional de teste ao vivo direta do usuário (fora do fluxo formal, documentada retroativamente via `Phase 8: Convergence` em `tasks.md`, 87/87 tasks).

**O que foi de fato construído**: mecanismo genérico de catálogos OPDS (Atom/OPDS 1.x via `foliate-js`, JSON/OPDS 2.0 via normalizador próprio), com Project Gutenberg pré-configurado, catálogos self-hosted geridos em Settings com Basic Auth opcional (credencial no `EncryptedSharedPreferences` nativo, nunca no Dexie), navegação completa (pastas, paginação, busca, ordenação Popular/Latest/Random, layout adaptativo lista/grid), download reaproveitando `BookImportService.importEpub` sem storage paralelo, tags automáticas de assunto/idioma no livro baixado, e "Clássicos em Inglês" (feature 002) migrado pro mesmo mecanismo visual. Validado ponta a ponta em device real contra o Project Gutenberg (público) **e** um Calibre Content Server real (self-hosted, Basic Auth) — os dois casos de uso centrais que motivaram a feature.

**Desvios acumulados em relação ao plano original** (todos já registrados em `## Riscos e Decisões` com evidência):
- Certificado self-assinado e Digest Auth ficaram de fora do v1 como planejado (Non-Goals confirmados, não contornados) — o teste ao vivo com Calibre até *encontrou* o caso real de Digest Auth por padrão, e a resolução foi reconfigurar o servidor, não o app, confirmando que o limite documentado se sustenta na prática.
- `network_security_config.xml` (R-010) e o upgrade condicional `http://`→`https://` (R-009) não estavam no plano original — descobertos só em teste manual real, onde `CapacitorHttp` mockado nos testes unitários não expõe a política de cleartext do Android.
- Comportamento de "salvar catálogo mesmo com conexão falhando" (decisão original da Fase 4, T030) foi revertido pra "só salva se conectar" (FR-027) — pedido direto do usuário após ver na prática que ficava sem saber se um catálogo salvo funcionava.
- 3 features não previstas no plano original foram adicionadas a pedido do usuário durante a Fase Polish e a Fase de Convergência: tags automáticas (FR-024), ordenação (FR-025), layout adaptativo (FR-026), status de conexão + atalho em Settings (FR-028), capas autenticadas (FR-029) e mensagem de erro específica no download (FR-030) — todas retroativamente documentadas em `spec.md`.

**Métricas não mensuráveis** (SC-002/SC-003) permanecem como estavam — decisão consciente de não adicionar telemetria só por causa desta feature, mesmo precedente da feature 002 (R-004).

**Verificação em device real**: quickstart.md tem todos os 4 cenários fechados (Cenário 2 com 2 sub-itens residuais de baixo risco — "sem autenticação" e "credencial errada" especificamente no self-hosted de teste, cobertos por caminho de código idêntico já provado noutro catálogo + teste de componente) e o edge case de modo avião como único item aceito sem verificação ao vivo (mecanismo unit-testado, risco residual P3 já aceito desde a primeira convergência).
