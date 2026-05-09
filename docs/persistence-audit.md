# Persistence audit

NeoReader persists durable user data in IndexedDB through Dexie. A few browser or
SDK-owned values live outside IndexedDB, and transient UI/runtime state remains in
memory by design.

## Persisted in IndexedDB

- `books`: book metadata, imported EPUB `fileBlob`, file/import metadata and tag links.
- `tags`: user-created library tags.
- `sourceFolders`: folders selected as import sources.
- `bookCovers`: extracted or manually uploaded cover blobs.
- `progress`: current reading CFI, percentage, fraction and section metadata.
- `bookmarks`: user bookmarks, including soft-deleted rows.
- `vocabulary`: saved source text and translation pairs.
- `translations`: translation cache by text hash.
- `settings`: app API keys, translation target and reader defaults.
- `bookSettings`: per-book reader and TTS preferences.
- `ttsVoiceCaches`: compatible TTS voice option caches.
- `authors`: author data cache, linked to local books through `bookIds`.
- `bookInfo`: enriched bibliographic metadata with value, source and confidence.
- `epubExtras`: stable EPUB details extracted from the local file.

## IndexedDB schema diagram

```mermaid
erDiagram
  BOOKS {
    number id PK
    string title
    string author
    Blob fileBlob
    string fileName
    string filePath
    string uri
    number fileSize
    string fileHash
    string format
    Date addedAt
    Date importedAt
    Date lastOpenedAt
    string readingStatus
    boolean isFavorite
    number_array tags FK
    number sourceFolderId FK
    boolean missingFile
  }

  TAGS {
    number id PK
    string name UK
    string color
    Date createdAt
    Date updatedAt
  }

  SOURCE_FOLDERS {
    number id PK
    string name
    string uri
    boolean includeSubfolders
    boolean autoImportEnabled
    Date createdAt
    Date lastScannedAt
  }

  BOOK_COVERS {
    number bookId PK,FK
    Blob blob
    string source
    Date updatedAt
  }

  PROGRESS {
    number id PK
    number bookId FK
    string cfi
    number percentage
    number fraction
    string sectionHref
    string sectionLabel
    Date updatedAt
  }

  BOOKMARKS {
    number id PK
    number bookId FK
    string cfi
    string label
    number percentage
    string snippet
    string color
    Date createdAt
    Date updatedAt
    Date deletedAt
  }

  VOCABULARY {
    number id PK
    number bookId FK
    string bookTitle
    string sourceText
    string translatedText
    string sourceLang
    string targetLang
    Date createdAt
  }

  TRANSLATIONS {
    number id PK
    number textHash
    string sourceText
    string translatedText
    string sourceLang
    string targetLang
    Date createdAt
  }

  SETTINGS {
    number id PK
    object appSettings
    object readerDefaults
    Date updatedAt
  }

  BOOK_SETTINGS {
    number id PK
    number bookId FK
    string fontSize
    string lineHeight
    string readerTheme
    string fontFamily
    boolean overrideBookFont
    boolean overrideBookColors
    string bookLanguage
    string translationTargetLang
    string ttsProvider
    number ttsRate
    string ttsSpeechifyVoiceId
    string ttsElevenLabsVoiceId
    string ttsNativeVoiceKey
    Date updatedAt
  }

  TTS_VOICE_CACHES {
    number id PK
    number cacheKey UK
    string provider
    string language
    array voices
    Date updatedAt
  }

  AUTHORS {
    string authorName PK
    number_array bookIds FK
    object data
    Date fetchedAt
    Date videosFetchedAt
  }

  EPUB_EXTRAS {
    number bookId PK,FK
    string description
    string language
    array toc
    string previewText
    array styleDiagnostics
    Date updatedAt
  }

  BOOK_INFO {
    number bookId PK,FK
    number metadataSchemaVersion
    object category
    object rating
    object synopsis
    object pageCount
    object publishedDate
    object publisher
    object language
    object isbn10
    object isbn13
    object subtitle
    object series
    object edition
    object universalIdentifier
    object reviews
    object lookupHints
    Date createdAt
    Date updatedAt
  }

  BOOKS ||--o| BOOK_COVERS : "has cover"
  SOURCE_FOLDERS ||--o{ BOOKS : "is import source"
  TAGS }o..o{ BOOKS : "linked by tag ids"
  BOOKS ||--o| PROGRESS : "has progress"
  BOOKS ||--o{ BOOKMARKS : "has bookmarks"
  BOOKS ||--o{ VOCABULARY : "has saved terms"
  BOOKS ||--o| BOOK_SETTINGS : "has overrides"
  BOOKS ||--o| BOOK_INFO : "has metadata"
  BOOKS ||--o| EPUB_EXTRAS : "has extracted extras"
  AUTHORS }o..o{ BOOKS : "linked by bookIds array"
```

Notes:

- Dexie indexes are declared in `src/db/database.ts`; the current schema is
  version 13.
- `authors.bookIds` and `books.tags` are multi-entry indexes, not physical join
  tables.
- Stable author fields do not expire automatically; only `authors.data.videos`
  uses `videosFetchedAt` with a 7-day TTL.
- `bookInfo` stores each bibliographic field as an object containing `value`,
  `source` and `confidence`.
- `ttsVoiceCaches` keeps compatible Speechify and ElevenLabs voices for 24h.
- `epubExtras` persists description, language, TOC, preview text and style
  diagnostics until the local book is deleted or the extras cache is invalidated.
- `settings`, `ttsVoiceCaches`, `authors.data`, `bookInfo` and `epubExtras`
  contain nested objects that are persisted as IndexedDB values, even when only
  top-level fields are indexed.

## Persisted outside IndexedDB

- `localStorage`: `neoreader:welcome-seen`.
- `localStorage`: NYT Discover list cache entries, with a 12-hour TTL per list.
- Firebase/Auth SDK persistence: signed-in session state.

## Not persisted by design

- Navigation stack, current route and temporary selected book/menu state.
- Open tabs, sheets, modals, expanded sections and search/filter text.
- Loading, validation and error states.
- Settings form input while the user is editing but has not saved.
- Book details diagnostics, refresh token, optimistic state and voice preview state.
- Live reader state in Zustand: current CFI, percentage, chapter label and TOC.
- Debounced progress that has not flushed yet.
- Reader chrome visibility and auto-hide timers.
- TTS playback state, current chunk/paragraph, fallback notices and sleep timer.
- Generated TTS audio blobs, object URLs and speech marks.
- DOM-only highlights for TTS, selected text and inline translation blocks.
- Inline translations unless the user saves them to vocabulary.
- Derived lists and summaries such as library groups, profile history and achievements.
- Service diagnostics and in-memory request caches.

## Current decision

Durable reading data, user preferences, saved vocabulary, stable author data,
EPUB extras, caches and bibliographic metadata are persisted. UI state, reader
runtime state, generated audio, temporary highlights and unsaved translations
remain temporary so the app does not restore stale interaction state after
restart.
