export type BookInfoSource =
  | 'epub-metadata'
  | 'google-books'
  | 'open-library'
  | 'youtube'
  | 'manual'
  | 'derived'

export type BookInfoConfidence = 'high' | 'medium' | 'low'

export const BOOK_INFO_SCHEMA_VERSION = 2

export interface BookInfoValue<T> {
  value: T
  source: BookInfoSource
  confidence: BookInfoConfidence
}

export interface BookCategory {
  label: string
  scheme?: string
  code?: string
}

export interface BookRating {
  average: number
  count?: number
  scale: 5 | 10
}

export type BookIdentifierKind = 'ISBN_13' | 'ISBN_10' | 'UUID' | 'URN' | 'OTHER'

export interface BookIdentifier {
  kind: BookIdentifierKind
  value: string
  raw: string
}

export interface BookReview {
  title: string
  url?: string
  provider?: 'youtube' | 'epub' | 'external'
  channelTitle?: string
  publishedAt?: string
  description?: string
}

export interface BookInfoLookupHints {
  title: string | null
  author: string | null
  identifiers: BookIdentifier[]
}

export interface ResolvedBookInfo {
  metadataSchemaVersion: number
  category: BookInfoValue<BookCategory[]> | null
  rating: BookInfoValue<BookRating> | null
  synopsis: BookInfoValue<string> | null
  pageCount: BookInfoValue<number> | null
  publishedDate: BookInfoValue<string> | null
  publisher: BookInfoValue<string> | null
  language: BookInfoValue<string> | null
  isbn10: BookInfoValue<BookIdentifier> | null
  isbn13: BookInfoValue<BookIdentifier> | null
  subtitle: BookInfoValue<string> | null
  series: BookInfoValue<string> | null
  edition: BookInfoValue<string> | null
  universalIdentifier: BookInfoValue<BookIdentifier> | null
  reviews: BookInfoValue<BookReview[]> | null
  lookupHints: BookInfoLookupHints
}

export interface StoredBookInfo extends ResolvedBookInfo {
  bookId: number
  createdAt: Date
  updatedAt: Date
}

export type BookInfoProviderAttemptStatus = 'success' | 'empty' | 'failed'

export interface BookInfoProviderAttemptDiagnostic {
  source: BookInfoSource
  status: BookInfoProviderAttemptStatus
  fields: string[]
  message?: string
  details?: string[]
}

export interface BookInfoProvider {
  readonly source: BookInfoSource
  collect(fileBlob: Blob, context?: ResolvedBookInfo): Promise<Partial<ResolvedBookInfo>>
  getDiagnostics?(): string[]
}
