# Book info architecture

NeoReader should collect book information through source-specific providers and merge
them in priority order. The EPUB file is always the first provider because it is
local, private, and available offline.

## Data contract

Each field is stored as `{ value, source, confidence }`. This keeps display data
separate from provenance and lets the UI show where a value came from.

Required fields:

- category
- rating
- synopsis
- pageCount
- publishedDate
- universalIdentifier
- reviews

Lookup hints such as title, author, and identifiers are collected alongside the
fields. Each provider receives the partial result collected so far, so Google
Books, Open Library, and YouTube can query by ISBN, title, and author without
reparsing the EPUB.

## Provider order

1. EPUB metadata provider
   - Reads `META-INF/container.xml`.
   - Resolves the OPF package document.
   - Extracts Dublin Core fields such as `dc:subject`, `dc:description`,
     `dc:date`, and `dc:identifier`.
   - Reads EPUB-specific page markers from `schema:numberOfPages`, page-list nav,
     and `epub:type="pagebreak"`.
2. Google Books provider
   - Endpoint: `https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`.
   - Complements rating, categories, synopsis, page count, publication date, and
     industry identifiers.
   - Falls back to `intitle:{title} inauthor:{author}` when ISBN is unavailable.
3. Open Library provider
   - Endpoint:
     `https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`.
   - Fallback for subjects, identifiers, publish date, and edition metadata.
   - Uses `number_of_pages` first and `pagination` as a lower-confidence page
     count fallback.
4. YouTube reviews provider
   - Endpoint: YouTube Data API v3 `search.list`.
   - Queries: `"{title} review"`, `"{author} {title} book review"`,
     `"{title} resenha"`, and `"{author} {title} resenha livro"`.
   - Returns video links as review sources.
   - Disabled when `youtubeApiKey` is not available.
5. Manual user input
   - Final fallback for missing or incorrect fields.

## Implementation phases

Phase 1: EPUB provider and merge contract.
Test: fixture EPUBs assert extraction of all local fields and precedence in the
merge service.

Phase 2: Persistence.
Test: Dexie migration and CRUD tests for saved field values and source metadata.

Phase 3: Google Books provider.
Test: mocked fetch by ISBN validates mapping and fallback when EPUB misses fields.
Status: implemented.

Phase 4: Open Library provider.
Test: mocked fetch validates fallback after Google Books misses a field.
Status: implemented.

Phase 5: YouTube reviews provider.
Test: mocked search validates review queries and normalized video links.
Status: implemented.

Phase 6: UI integration.
Test: screen tests validate details rendering, source labels, loading state, and
manual override behavior.
