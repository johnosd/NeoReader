# Data Model: Biblioteca de Domínio Público (Standard Ebooks)

Fase 1 do `sdd-plan`. Sem mudança de schema no Dexie (`src/db/database.ts`)
— só um novo dado estático (catálogo bundled) e um estado em memória
(progresso de download), nunca persistidos no IndexedDB.

## Catalog Entry

Item do catálogo curado, vivendo em `public/domain-publico/catalog.json`
(bundled no app, carregado como asset estático — sem fetch de rede pra
exibir a lista).

```ts
interface PublicDomainCatalogEntry {
  id: string            // slug estável, ex: "jane-austen_pride-and-prejudice"
  title: string
  author: string
  authorSlug: string     // ex: "jane-austen" — como aparece na URL do Standard Ebooks
  titleSlug: string      // ex: "pride-and-prejudice"
}
```

URLs de download/capa **não** ficam gravadas no JSON — são derivadas em
runtime a partir de `authorSlug`/`titleSlug`, uma única fórmula (evita
divergência se o padrão de URL do Standard Ebooks mudar em algum título
específico; troca fica num lugar só):

```ts
function buildStandardEbooksUrls(authorSlug: string, titleSlug: string) {
  const base = `https://standardebooks.org/ebooks/${authorSlug}/${titleSlug}/downloads`
  return {
    epubUrl: `${base}/${authorSlug}_${titleSlug}.epub?source=download`,
    coverUrl: `${base}/cover.jpg`,
  }
}
```

Confirmado ao vivo (ver `research.md` #1) contra
`jane-austen/pride-and-prejudice`.

## Download State

Estado de progresso por Catalog Entry, mantido em memória num módulo
singleton (não em `useState` de componente — precisa sobreviver à
navegação entre telas, FR-010). Nunca persistido em Dexie/IndexedDB —
morre com o fechamento do app (Fora de Escopo: continuidade entre sessões).

```ts
type PublicDomainDownloadStatus = 'idle' | 'downloading' | 'success' | 'error'

interface PublicDomainDownloadState {
  entryId: string          // Catalog Entry.id
  status: PublicDomainDownloadStatus
  errorMessage?: string    // só quando status === 'error'
  bookId?: number          // id do Book criado, só quando status === 'success'
}
```

## Extensão de tipo existente: `BookImportSource`

`src/types/book.ts` — `BookImportSource` ganha um literal novo:

```ts
// antes: export type BookImportSource = 'local' | 'drive'
export type BookImportSource = 'local' | 'drive' | 'public-domain'
```

`importSource` no `Book` (`src/types/book.ts`) já existe e **não é
indexado** no schema Dexie (`src/db/database.ts` não lista esse campo em
nenhum `stores(...)`) — confirmado por busca no arquivo. Uma mudança de
união de tipos TS num campo não-indexado não altera o schema do banco:
**não precisa de nova `version()`**.

## Relação com `Book` (entidade já existente)

Nenhuma entidade nova entra no Dexie. Um Catalog Entry só vira um `Book` de
verdade depois de download + import bem-sucedidos, pelo pipeline já
existente (`BookImportService.importEpub`) — capa, metadados, hash e dedupe
continuam vindo do EPUB baixado em si (extração via `EpubService.parseMetadata`),
não do catálogo estático.
