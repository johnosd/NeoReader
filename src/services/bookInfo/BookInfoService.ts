import { BOOK_INFO_SCHEMA_VERSION, type BookInfoProvider, type BookInfoProviderAttemptDiagnostic, type ResolvedBookInfo } from '../../types/bookInfo'
import { EpubBookInfoProvider } from './EpubBookInfoProvider'
import { GoogleBooksProvider } from './GoogleBooksProvider'
import { OpenLibraryProvider } from './OpenLibraryProvider'
import { YouTubeReviewsProvider } from './YouTubeReviewsProvider'

interface BookInfoServiceOptions {
  onProviderAttempt?: (attempt: BookInfoProviderAttemptDiagnostic) => void
}

const EMPTY_BOOK_INFO: ResolvedBookInfo = {
  metadataSchemaVersion: BOOK_INFO_SCHEMA_VERSION,
  category: null,
  rating: null,
  synopsis: null,
  pageCount: null,
  publishedDate: null,
  publisher: null,
  language: null,
  isbn10: null,
  isbn13: null,
  subtitle: null,
  series: null,
  edition: null,
  universalIdentifier: null,
  reviews: null,
  lookupHints: {
    title: null,
    author: null,
    identifiers: [],
  },
}

export class BookInfoService {
  private readonly providers: BookInfoProvider[]
  private readonly options: BookInfoServiceOptions

  constructor(providers: BookInfoProvider[] = [
    new EpubBookInfoProvider(),
    new GoogleBooksProvider(),
    new OpenLibraryProvider(),
    new YouTubeReviewsProvider(),
  ], options: BookInfoServiceOptions = {}) {
    this.providers = providers
    this.options = options
  }

  async collect(
    fileBlob: Blob | null,
    initialContext?: Partial<ResolvedBookInfo>,
  ): Promise<ResolvedBookInfo> {
    let result: ResolvedBookInfo = { ...EMPTY_BOOK_INFO }

    if (initialContext) {
      result = this.merge(result, initialContext)
    }

    for (const provider of this.providers) {
      try {
        const partial = await provider.collect(fileBlob, result)
        result = this.merge(result, partial)
        const fields = this.extractReturnedFields(partial)
        this.options.onProviderAttempt?.({
          source: provider.source,
          status: fields.length > 0 ? 'success' : 'empty',
          fields,
          details: provider.getDiagnostics?.(),
        })
      } catch (error) {
        console.warn(`Book info provider failed: ${provider.source}`, error)
        this.options.onProviderAttempt?.({
          source: provider.source,
          status: 'failed',
          fields: [],
          message: error instanceof Error ? error.message : 'Erro desconhecido',
          details: provider.getDiagnostics?.(),
        })
      }
    }

    return result
  }

  private merge(
    current: ResolvedBookInfo,
    next: Partial<ResolvedBookInfo>,
  ): ResolvedBookInfo {
    return {
      metadataSchemaVersion: Math.max(
        current.metadataSchemaVersion ?? BOOK_INFO_SCHEMA_VERSION,
        next.metadataSchemaVersion ?? BOOK_INFO_SCHEMA_VERSION,
      ),
      category: current.category ?? next.category ?? null,
      rating: current.rating ?? next.rating ?? null,
      synopsis: current.synopsis ?? next.synopsis ?? null,
      pageCount: current.pageCount ?? next.pageCount ?? null,
      publishedDate: current.publishedDate ?? next.publishedDate ?? null,
      publisher: current.publisher ?? next.publisher ?? null,
      language: current.language ?? next.language ?? null,
      isbn10: current.isbn10 ?? next.isbn10 ?? null,
      isbn13: current.isbn13 ?? next.isbn13 ?? null,
      subtitle: current.subtitle ?? next.subtitle ?? null,
      series: current.series ?? next.series ?? null,
      edition: current.edition ?? next.edition ?? null,
      universalIdentifier: current.universalIdentifier ?? next.universalIdentifier ?? null,
      reviews: this.mergeReviews(current.reviews, next.reviews ?? null),
      lookupHints: {
        title: current.lookupHints.title ?? next.lookupHints?.title ?? null,
        author: current.lookupHints.author ?? next.lookupHints?.author ?? null,
        identifiers: this.mergeIdentifiers(
          current.lookupHints.identifiers,
          next.lookupHints?.identifiers ?? [],
        ),
      },
    }
  }

  private mergeIdentifiers(
    current: ResolvedBookInfo['lookupHints']['identifiers'],
    next: ResolvedBookInfo['lookupHints']['identifiers'],
  ): ResolvedBookInfo['lookupHints']['identifiers'] {
    const seen = new Set<string>()

    return [...current, ...next].filter((identifier) => {
      const key = `${identifier.kind}:${identifier.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private mergeReviews(
    current: ResolvedBookInfo['reviews'],
    next: ResolvedBookInfo['reviews'],
  ): ResolvedBookInfo['reviews'] {
    if (!current) return next ?? null
    if (!next) return current

    const seen = new Set<string>()
    const value = [...current.value, ...next.value].filter((review) => {
      const key = review.url ?? `${review.provider ?? ''}:${review.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      value,
      source: current.source,
      confidence: current.confidence,
    }
  }

  private extractReturnedFields(info: Partial<ResolvedBookInfo>): string[] {
    const fields: string[] = []
    if (info.category) fields.push('categoria')
    if (info.rating) fields.push('rating')
    if (info.synopsis) fields.push('sinopse')
    if (info.pageCount) fields.push('paginas')
    if (info.publishedDate) fields.push('publicacao')
    if (info.publisher) fields.push('editora')
    if (info.language) fields.push('idioma')
    if (info.isbn10) fields.push('isbn-10')
    if (info.isbn13) fields.push('isbn-13')
    if (info.subtitle) fields.push('subtitulo')
    if (info.series) fields.push('serie')
    if (info.edition) fields.push('edicao')
    if (info.universalIdentifier) fields.push('identificador')
    if (info.reviews?.value.length) fields.push('reviews')
    return fields
  }
}
