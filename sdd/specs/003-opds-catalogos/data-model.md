# Data Model: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

Fase 1 do `sdd-plan`. Duas tabelas novas no Dexie (`src/db/database.ts`,
`version(17)`), zero mudança nas tabelas existentes, mais tipos normalizados
em memória (nunca persistidos) e a extensão do plugin nativo pra credencial.

## `opdsCatalogs` (Dexie, novo)

```ts
interface OpdsCatalog {
  id?: number
  name: string
  baseUrl: string
  hasCredential: boolean   // true se o usuário configurou usuário/senha
  isDefault: boolean       // true só pro Project Gutenberg pré-configurado
  createdAt: Date
  updatedAt: Date
}
```

Índice: `++id, baseUrl, isDefault`.

**A credencial em si (usuário/senha) nunca fica nesta tabela nem em nenhuma
outra do Dexie** — vive só no secure storage nativo (ver seção 3), chaveada
pelo `id` numérico do catálogo. Fluxo de criação com credencial é
necessariamente 2 passos: (1) `db.opdsCatalogs.add({ ..., hasCredential: false })`
pra obter o `id` auto-incrementado, (2) se o usuário informou usuário/senha,
chamar o secure storage nativo com esse `id` e só então
`db.opdsCatalogs.update(id, { hasCredential: true })`. Editar/remover
credencial segue o mesmo padrão (native call primeiro, depois o flag).

Remover um catálogo (`db.opdsCatalogs.delete(id)`) também chama a limpeza da
credencial no secure storage nativo, se `hasCredential` for `true` — nunca
deixa uma credencial órfã.

## `opdsDownloadedEntries` (Dexie, novo)

```ts
interface OpdsDownloadedEntry {
  id?: number
  catalogId: number
  entryId: string      // id/URL do entry OPDS, como veio do feed
  bookId: number        // FK pro Book resultante do download
  downloadedAt: Date
}
```

Índice: `++id, &[catalogId+entryId], bookId` — chave composta única pra
lookup rápido "esse entry já foi baixado nesse catálogo?" (FR-016) e reverse
lookup por `bookId`.

**Reconciliação obrigatória ao exibir estado "já na biblioteca"**: o
`bookId` referenciado pode apontar pra um livro que o usuário já removeu da
Biblioteca depois do download. Antes de marcar um item como "já na
biblioteca" na UI, validar com `getBookById(bookId)` que o livro ainda
existe — se não existir mais, tratar como não baixado (mesmo espírito da
reconciliação por `findBookByFileName` da feature 002).

## `src/db/database.ts` — `version(17)`

```ts
this.version(17).stores({
  // ...todas as tabelas de v16 repetidas (Dexie exige o schema completo por versão)...
  opdsCatalogs:          '++id, baseUrl, isDefault',
  opdsDownloadedEntries: '++id, &[catalogId+entryId], bookId',
}).upgrade(async (tx) => {
  // Seed do catálogo padrão (Project Gutenberg) só na primeira vez que
  // esta versão roda — não repetir se o usuário já tiver 1+ catálogo
  // (upgrade de uma instalação que, por algum motivo, já tenha dado seed
  // via outro caminho; na prática isso só acontece uma vez, na migração
  // de v16→v17 de qualquer instalação existente).
  const catalogsTable = tx.table('opdsCatalogs') as Table<OpdsCatalog, number>
  const count = await catalogsTable.count()
  if (count === 0) {
    const now = new Date()
    await catalogsTable.add({
      name: 'Project Gutenberg',
      baseUrl: 'https://www.gutenberg.org/ebooks/search.opds/',
      hasCredential: false,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    })
  }
})
```

## Extensão de tipo existente: `BookImportSource`

`src/types/book.ts`:

```ts
// antes: export type BookImportSource = 'local' | 'drive' | 'public-domain'
export type BookImportSource = 'local' | 'drive' | 'public-domain' | 'opds'
```

## Tipos normalizados em memória (nunca persistidos)

Produzidos por `OpdsAtomParser.ts`/`OpdsJsonParser.ts`, consumidos só pela
UI/serviço de download — o mesmo formato independente de o catálogo ter
respondido Atom ou JSON:

```ts
interface OpdsFeedEntry {
  id: string                          // id/URL do entry no feed de origem
  title: string
  author?: string
  coverUrl?: string
  kind: 'publication' | 'navigation'  // pasta/seção vs. livro
  navigationUrl?: string              // só quando kind === 'navigation'
  acquisitionUrl?: string             // só quando kind === 'publication' e passou o filtro EPUB (FR-011/FR-012)
}

interface OpdsFeedPage {
  title?: string
  entries: OpdsFeedEntry[]
  nextPageUrl?: string   // presente quando o feed indica mais páginas (FR-009)
  searchUrl?: string     // template de busca já resolvido, se o catálogo expuser (FR-010)
}
```

Entries de aquisição sem link EPUB (`FR-011`) simplesmente não entram no
array `entries` — o filtro acontece na camada de normalização
(`OpdsAtomParser`/`OpdsJsonParser`/`OpdsCatalogService`), nunca em
componente de UI.

## Estado de download (em memória, cross-tela)

Mesmo padrão de `PublicDomainDownloadCoordinator.ts` (Map + listeners,
singleton fora do ciclo de vida de componente React), generalizado pra
qualquer entry de qualquer catálogo via chave composta:

```ts
type OpdsDownloadStatus = 'idle' | 'downloading' | 'success' | 'error'

interface OpdsDownloadState {
  key: string   // `${catalogId}:${entryId}`
  status: OpdsDownloadStatus
  errorMessage?: string
  offline?: boolean
  bookId?: number
}
```

## Secure storage nativo — contrato do plugin

Extensão de `NeoReaderLibraryPlugin.java` (`android/app/src/main/java/com/johnny/neoreader/`),
usando `EncryptedSharedPreferences`/`MasterKey` (`androidx.security:security-crypto`):

```ts
// src/services/opds/OpdsCredentialStore.ts
interface OpdsCredential {
  username: string
  password: string
}

interface NeoReaderLibraryOpdsMethods {
  storeOpdsCredential(options: { catalogId: number; username: string; password: string }): Promise<void>
  getOpdsCredential(options: { catalogId: number }): Promise<Partial<OpdsCredential>>
  deleteOpdsCredential(options: { catalogId: number }): Promise<void>
}
```

`getOpdsCredential` devolve objeto vazio (não erro) quando não há credencial
guardada pra aquele `catalogId` — mesma convenção de retorno tolerante já
usada pelos métodos existentes do plugin (`consumePendingFolderSelection`
etc.), verificados com `typeof NeoReaderLibrary.method === 'function'` antes
de chamar (compatibilidade com builds Android mais antigos, mesmo padrão de
`NativeLibraryImportService.ts`). Fora do Android nativo (build Web, embora
a feature seja Android-only por escopo), essas chamadas nunca são
disparadas — gate por `Capacitor.isNativePlatform()`.

## Relação com `Book` (entidade já existente)

Nenhuma entidade nova entra em `books`/`bookCovers`. Um `OpdsFeedEntry` só
vira um `Book` de verdade depois de download + import bem-sucedidos, pelo
pipeline já existente (`BookImportService.importEpub`) — capa, metadados,
hash e dedupe continuam vindo do EPUB baixado em si, não do feed OPDS.
