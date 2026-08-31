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

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
