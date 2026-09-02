# Research: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

Fase 0 do `sdd-plan`. Cobre só as incertezas técnicas genuínas encontradas na
exploração do repositório — decisões já fechadas na assessment/spec (Basic
Auth apenas, Android-only, filtro EPUB-only) não são repetidas aqui.

## 1. Parsing OPDS 1.x (Atom) — reusar `foliate-js/opds.js`

O projeto já depende de `foliate-js` (parser EPUB) e essa dependência
**já inclui** `node_modules/foliate-js/opds.js`, com `getFeed(doc)`,
`getPublication(entry)`, `isOPDSCatalog(contentType)`, `isOPDSSearch`,
`getSearch`/`getOpenSearch` — cobre parsing de feed Atom completo (entries de
navegação vs. publicação, links por `rel`, agrupamento por `http://opds-spec.org/2010/catalog#group`)
e o mecanismo de busca via OpenSearch. **Decisão**: usar esse módulo pro
caminho Atom em vez de escrever um parser próprio — zero dependência nova,
mesma lib já usada indiretamente pelo leitor.

`getFeed(doc)` espera um `Document` XML já parseado (`doc.documentElement`),
não uma string crua — o fetch precisa passar a resposta por `DOMParser` do
próprio WebView Android antes de chamar essa função.

## 2. Parsing OPDS 2.0 (JSON) — sem lib disponível, normalizador próprio

`foliate-js/opds.js` cobre só Atom/XML — não existe nenhum outro arquivo no
pacote (`node_modules/foliate-js/*.js`) com suporte a `application/opds+json`.
**Decisão**: escrever um normalizador JSON próprio e pequeno
(`OpdsJsonParser.ts`), seguindo a estrutura padrão da spec OPDS 2.0
(`metadata`, `navigation[]`, `publications[]`, `links[]`, cada publicação com
seus próprios `links[]`/`images[]`) — convergindo pro mesmo formato
normalizado interno (`OpdsFeedPage`/`OpdsFeedEntry`, ver `data-model.md`) que
o caminho Atom produz, pra UI nunca precisar saber qual formato originou os
dados.

## 3. Detecção de formato

Pelo `Content-Type` da resposta, como já decidido na spec (Accept:
`application/atom+xml, application/opds+json;q=0.9`):

- `application/atom+xml` (com ou sem `;profile=opds-catalog`) → Atom.
- `application/opds+json` → JSON.
- **Fallback pra servidor self-hosted mal configurado** (`Content-Type`
  genérico/ausente, ex.: `text/xml`, `application/xml`, `application/json`
  cru): inspecionar o primeiro caractere não-whitespace do corpo — `<` → tenta
  Atom, `{`/`[` → tenta JSON. Se nenhum dos dois parsear, erro claro de
  "catálogo em formato inválido" (User Story 5).

## 4. Certificado self-assinado / CA privada — não suportado no v1

`HttpOptions` de `@capacitor/core` (`node_modules/@capacitor/core/types/core-plugins.d.ts`)
não expõe nenhuma flag de tolerância a certificado inválido (diferente de
outros HTTP clients nativos, ex.: `danger.acceptInvalidCerts` do Tauri,
identificado na pesquisa de prior art do Readest). Resolver isso exigiria
mexer em `network_security_config.xml` (escopo de app inteiro, ou
domain-config por host) ou um `TrustManager` customizado — decisão de
segurança maior que esta feature, fora do apetite deste plano.

**Decisão**: fora de escopo do v1. Servidor self-hosted com HTTPS
self-signed falha com erro de rede genérico (User Story 5, sem tolerância
automática) — limitação conhecida, documentada aqui em vez de descoberta
silenciosamente depois. Self-hosted típico costuma expor HTTP puro na rede
local ou um certificado válido via reverse proxy (Let's Encrypt/Caddy) —
cobre a maioria dos casos reais mesmo com essa limitação.

## 5. Basic Auth — header calculado no cliente

`Authorization: Basic ${btoa(\`${user}:${pass}\`)}`, enviado via
`CapacitorHttp.request({ headers })` — mesmo padrão já usado em
`FishAudioService.ts` (`Authorization: Bearer ...`). `btoa`/`atob` já usados
no projeto (`PublicDomainDownloadService.ts`), sem dependência nova.

**Risco conhecido (prior art do Readest)**: mandar Basic preemptivo pode
gerar `400` (não `401`) contra um servidor configurado só pra Digest. Como
Digest não é suportado neste v1 (decisão já registrada em `spec.md`), esse
caso vira um erro de credencial/formato genérico pro usuário — aceitável,
não é um bug a corrigir aqui.

## 6. Credencial fora de texto puro — extensão do plugin nativo existente

`android/app/build.gradle` **não tem** hoje nenhuma dependência de
criptografia (`androidx.security:security-crypto` ausente). **Decisão**
(já validada na assessment, `sdd/assessments/suporte-catlogos-opds-pblicos-self-hosted/decision.md`):
estender `NeoReaderLibraryPlugin.java` (plugin nativo já existente) com 3
métodos novos usando `EncryptedSharedPreferences`/`MasterKey` da lib
`androidx.security:security-crypto` — nova dependência **Gradle/nativa**, não
npm. Justificativa formal em `## Complexity Tracking` de `plan.md`.

**Nota (observação, não bloqueio)**: hoje as chaves de API de TTS
(Speechify/ElevenLabs/FishAudio/YouTube) ficam em `@capacitor/preferences`
(`src/db/settings.ts`) — SharedPreferences simples, não criptografado. Esta
feature propositalmente eleva a barra só pra credencial de catálogo OPDS
(login de terceiro, potencialmente reutilizado pelo usuário em outros
serviços — risco diferente de uma chave de API isolada). Retrofit das
chaves de TTS existentes fica fora de escopo desta feature.

## 7. Vínculo Entry → Livro Baixado — tabela nova, não nome de arquivo determinístico

A feature 002 reconcilia "já baixado" via `findBookByFileName` com um nome
de arquivo determinístico (`authorSlug_titleSlug.epub`), porque o catálogo
Standard Ebooks curado tem slugs limpos e estáveis. Catálogos OPDS
arbitrários (self-hosted, Gutenberg) não garantem isso — `entryId` pode ser
uma URL longa ou um id opaco não filename-safe, e o mesmo `entryId` bruto
pode colidir entre catálogos diferentes.

**Decisão**: tabela Dexie própria (`opdsDownloadedEntries`, ver
`data-model.md`) chaveada por `[catalogId+entryId]`, não por nome de
arquivo. Ao exibir estado "já na biblioteca", validar que o `bookId`
referenciado ainda existe de fato (o usuário pode ter removido o livro da
Biblioteca depois) — reconciliação, mesmo espírito da 002.

## 8. Busca dentro do catálogo

- **Atom (OPDS 1.x)**: `getOpenSearch`/`getSearch` de `foliate-js/opds.js`
  já cobrem o link `rel="search"` com uma descrição OpenSearch — reusar
  diretamente.
- **JSON (OPDS 2.0)**: a spec expõe busca via um Link Object com
  `templated: true` e um template mais simples (`{searchTerms}`) que
  OpenSearch completo — implementar substituição de template própria,
  pequena, só pra essa variável, sem depender de uma lib de URI Template
  inteira.
- **Cuidado (bug real documentado no Readest)**: sempre expandir o template
  **antes** de resolver a URL relativa/absoluta contra a base do catálogo —
  resolver primeiro corrompe chaves de template como `{?query}`.

## 9. Paginação

Seguir o link `rel="next"` do feed (Atom: `<link rel="next" href="...">`;
JSON: `links[] { rel: "next", href: "..." }`) — "carregar mais" busca a
próxima página e concatena ao estado local da lista já carregada, sem
re-buscar páginas anteriores.

## 10. Sanitização de feed malformado

Servidor self-hosted real pode devolver `&` não escapado (quebra parse
XML) ou link absoluto `http://` servido por um host `https://` — ambos
observados como bugs reais no Readest contra servidores de terceiro.
**Decisão**: tratamento best-effort, não uma garantia formal (ver
Assumptions em `spec.md`) — sanitizar `&` solto antes do `DOMParser` e
normalizar `http://` → `https://` quando o link aponta pro mesmo host do
catálogo (HTTPS).
