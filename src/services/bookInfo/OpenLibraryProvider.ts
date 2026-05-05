import type {
  BookCategory,
  BookIdentifier,
  BookInfoProvider,
  BookInfoValue,
  BookRating,
  ResolvedBookInfo,
} from '../../types/bookInfo'
import { htmlToPlainText } from '../../utils/textSanitizer'
import { OpenLibraryService, type OpenLibraryBookData, type OpenLibraryRatingData } from '../OpenLibraryService'

export class OpenLibraryProvider implements BookInfoProvider {
  readonly source = 'open-library' as const
  private readonly openLibraryService: OpenLibraryService

  constructor(openLibraryService = new OpenLibraryService()) {
    this.openLibraryService = openLibraryService
  }

  async collect(_fileBlob: Blob, context?: ResolvedBookInfo): Promise<Partial<ResolvedBookInfo>> {
    this.openLibraryService.resetDiagnostics()
    const isbns = this.findIsbns(context)
    if (isbns.length === 0) return {}

    const bookMatch = await this.fetchFirstBookData(isbns)
    const rating = await this.fetchFirstRating(isbns)

    if (!bookMatch && !rating) return {}

    const bookData = bookMatch?.bookData
    const identifiers = bookData
      ? this.extractIdentifiers(bookData, bookMatch.isbn)
      : isbns
    return {
      category: bookData ? this.extractCategory(bookData) : null,
      rating: this.extractRating(rating),
      synopsis: bookData ? this.extractSynopsis(bookData) : null,
      pageCount: bookData ? this.extractPageCount(bookData) : null,
      publishedDate: bookData ? this.extractPublishedDate(bookData) : null,
      publisher: bookData ? this.extractPublisher(bookData) : null,
      language: bookData ? this.extractLanguage(bookData) : null,
      isbn10: this.extractIdentifierByKind(identifiers, 'ISBN_10'),
      isbn13: this.extractIdentifierByKind(identifiers, 'ISBN_13'),
      subtitle: bookData ? this.extractTextValue(bookData.subtitle, 'medium') : null,
      series: bookData ? this.extractSeries(bookData) : null,
      edition: bookData ? this.extractTextValue(bookData.edition_name, 'medium') : null,
      universalIdentifier: this.extractUniversalIdentifier(identifiers),
      lookupHints: {
        title: context?.lookupHints.title ?? this.cleanText(bookData?.title),
        author: context?.lookupHints.author ?? this.cleanText(bookData?.authors?.[0]?.name),
        identifiers,
      },
    }
  }

  getDiagnostics(): string[] {
    return this.openLibraryService.getDiagnostics()
  }

  private findIsbns(context?: ResolvedBookInfo): BookIdentifier[] {
    const identifiers = context?.lookupHints.identifiers ?? []
    return [
      ...identifiers.filter((identifier) => identifier.kind === 'ISBN_13'),
      ...identifiers.filter((identifier) => identifier.kind === 'ISBN_10'),
    ]
  }

  private async fetchFirstBookData(
    isbns: BookIdentifier[],
  ): Promise<{ bookData: OpenLibraryBookData, isbn: BookIdentifier } | null> {
    for (const isbn of isbns) {
      const bookData = await this.openLibraryService.fetchBookByIsbn(isbn.value)
      if (bookData) return { bookData, isbn }
    }
    return null
  }

  private async fetchFirstRating(isbns: BookIdentifier[]): Promise<OpenLibraryRatingData | null> {
    for (const isbn of isbns) {
      const rating = await this.openLibraryService.fetchRatingByIsbn(isbn.value)
      if (rating) return rating
    }
    return null
  }

  private extractCategory(bookData: OpenLibraryBookData): BookInfoValue<BookCategory[]> | null {
    const subjectLabels = (bookData.subjects ?? [])
      .map((subject) => typeof subject === 'string' ? subject : subject.name)
      .map((label) => this.cleanText(label))
      .filter((label): label is string => Boolean(label))

    const classificationLabels = Object.entries(bookData.classifications ?? {})
      .flatMap(([scheme, values]) => this.toArray(values)
        .map((value) => ({
          label: value,
          scheme,
        })))
      .filter((category) => category.label)

    const categories: BookCategory[] = [
      ...subjectLabels.map((label) => ({ label })),
      ...classificationLabels,
    ]

    const seen = new Set<string>()
    const deduped = categories.filter((category) => {
      const key = `${category.scheme ?? ''}:${category.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return deduped.length > 0 ? this.fromOpenLibrary(deduped, 'medium') : null
  }

  private extractSynopsis(bookData: OpenLibraryBookData): BookInfoValue<string> | null {
    const excerpt = bookData.excerpts
      ?.map((item) => this.cleanText(item.text))
      .find(Boolean)
    const notes = typeof bookData.notes === 'string'
      ? this.cleanText(bookData.notes)
      : this.cleanText(bookData.notes?.value)
    const synopsis = htmlToPlainText(excerpt ?? notes)

    return synopsis ? this.fromOpenLibrary(synopsis, 'low') : null
  }

  private extractRating(rating: OpenLibraryRatingData | null): BookInfoValue<BookRating> | null {
    if (!rating) return null
    return this.fromOpenLibrary({
      average: rating.average,
      ...(typeof rating.count === 'number' ? { count: rating.count } : {}),
      scale: 5,
    }, 'low')
  }

  private extractPageCount(bookData: OpenLibraryBookData): BookInfoValue<number> | null {
    if (typeof bookData.number_of_pages === 'number' && bookData.number_of_pages > 0) {
      return this.fromOpenLibrary(bookData.number_of_pages, 'medium')
    }

    const pagination = this.cleanText(bookData.pagination)
    const parsed = pagination?.match(/\d+/)?.[0]
    const pageCount = parsed ? Number.parseInt(parsed, 10) : null

    return pageCount && pageCount > 0 ? this.fromOpenLibrary(pageCount, 'low') : null
  }

  private extractPublishedDate(bookData: OpenLibraryBookData): BookInfoValue<string> | null {
    const publishedDate = this.cleanText(bookData.publish_date)
    return publishedDate ? this.fromOpenLibrary(publishedDate, 'medium') : null
  }

  private extractPublisher(bookData: OpenLibraryBookData): BookInfoValue<string> | null {
    const publisher = bookData.publishers
      ?.map((item) => typeof item === 'string' ? item : item.name)
      .map((item) => this.cleanText(item))
      .find(Boolean)

    return publisher ? this.fromOpenLibrary(publisher, 'medium') : null
  }

  private extractLanguage(bookData: OpenLibraryBookData): BookInfoValue<string> | null {
    const language = bookData.languages
      ?.map((item) => {
        if (typeof item === 'string') return item
        return item.name ?? item.key?.replace(/^\/languages\//, '')
      })
      .map((item) => this.cleanText(item))
      .find(Boolean)

    return language ? this.fromOpenLibrary(language, 'medium') : null
  }

  private extractTextValue(
    value: string | undefined,
    confidence: BookInfoValue<string>['confidence'],
  ): BookInfoValue<string> | null {
    const cleaned = this.cleanText(value)
    return cleaned ? this.fromOpenLibrary(cleaned, confidence) : null
  }

  private extractSeries(bookData: OpenLibraryBookData): BookInfoValue<string> | null {
    const series = this.toArray(bookData.series).find(Boolean)
    return series ? this.fromOpenLibrary(series, 'medium') : null
  }

  private extractIdentifierByKind(
    identifiers: BookIdentifier[],
    kind: 'ISBN_10' | 'ISBN_13',
  ): BookInfoValue<BookIdentifier> | null {
    const identifier = identifiers.find((candidate) => candidate.kind === kind)
    return identifier ? this.fromOpenLibrary(identifier, 'high') : null
  }

  private extractUniversalIdentifier(identifiers: BookIdentifier[]): BookInfoValue<BookIdentifier> | null {
    const identifier = identifiers.find((candidate) => candidate.kind === 'ISBN_13')
      ?? identifiers.find((candidate) => candidate.kind === 'ISBN_10')
      ?? identifiers[0]

    return identifier ? this.fromOpenLibrary(identifier, 'high') : null
  }

  private extractIdentifiers(bookData: OpenLibraryBookData, fallbackIsbn: BookIdentifier): BookIdentifier[] {
    const rawIdentifiers = bookData.identifiers ?? {}
    const identifiers = [
      ...this.toArray(rawIdentifiers.isbn_13).map((value) => this.normalizeIdentifier('ISBN_13', value)),
      ...this.toArray(rawIdentifiers.isbn_10).map((value) => this.normalizeIdentifier('ISBN_10', value)),
      ...this.toArray(rawIdentifiers.openlibrary).map((value) => ({
        kind: 'OTHER' as const,
        value,
        raw: value,
      })),
      fallbackIsbn,
    ].filter((identifier): identifier is BookIdentifier => Boolean(identifier))

    const seen = new Set<string>()
    return identifiers.filter((identifier) => {
      const key = `${identifier.kind}:${identifier.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private normalizeIdentifier(kind: 'ISBN_13' | 'ISBN_10', rawValue: string): BookIdentifier | null {
    const normalized = this.cleanText(rawValue)?.replace(/[^0-9X]/gi, '').toUpperCase()
    if (!normalized) return null
    if (kind === 'ISBN_13' && !/^\d{13}$/.test(normalized)) return null
    if (kind === 'ISBN_10' && !/^\d{9}[\dX]$/.test(normalized)) return null

    return {
      kind,
      value: normalized,
      raw: rawValue,
    }
  }

  private toArray(value?: string[] | string): string[] {
    if (Array.isArray(value)) return value.map((item) => this.cleanText(item)).filter((item): item is string => Boolean(item))
    const item = this.cleanText(value)
    return item ? [item] : []
  }

  private fromOpenLibrary<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }

  private cleanText(value?: string | null): string | null {
    const cleaned = value?.replace(/\s+/g, ' ').trim()
    return cleaned || null
  }
}
