import type {
  BookCategory,
  BookIdentifier,
  BookInfoProvider,
  BookInfoValue,
  BookRating,
  ResolvedBookInfo,
} from '../../types/bookInfo'
import {
  GoogleBooksService,
  type GoogleBooksIndustryIdentifier,
  type GoogleBooksVolume,
  type GoogleBooksVolumeInfo,
} from '../GoogleBooksService'
import { htmlToPlainText } from '../../utils/textSanitizer'

export class GoogleBooksProvider implements BookInfoProvider {
  readonly source = 'google-books' as const
  private readonly googleBooksService: GoogleBooksService

  constructor(googleBooksService = new GoogleBooksService({
    apiKey: (import.meta.env.VITE_GOOGLE_BOOKS_API_KEY as string | undefined) ?? '',
  })) {
    this.googleBooksService = googleBooksService
  }

  async collect(_fileBlob: Blob | null, context?: ResolvedBookInfo): Promise<Partial<ResolvedBookInfo>> {
    const queries = this.buildQueries(context)
    const volume = await this.googleBooksService.searchFirstVolume(
      queries,
      (volumes) => this.selectBestVolume(volumes, context),
    )
    if (!volume?.volumeInfo) return {}

    const identifiers = this.extractIdentifiers(volume.volumeInfo)
    return {
      category: this.extractCategory(volume.volumeInfo),
      rating: this.extractRating(volume.volumeInfo),
      synopsis: this.extractSynopsis(volume.volumeInfo),
      pageCount: this.extractPageCount(volume.volumeInfo),
      publishedDate: this.extractPublishedDate(volume.volumeInfo),
      publisher: this.extractTextValue(volume.volumeInfo.publisher, 'medium'),
      language: this.extractTextValue(volume.volumeInfo.language, 'medium'),
      isbn10: this.extractIdentifierByKind(identifiers, 'ISBN_10'),
      isbn13: this.extractIdentifierByKind(identifiers, 'ISBN_13'),
      subtitle: this.extractTextValue(volume.volumeInfo.subtitle, 'medium'),
      series: null,
      edition: null,
      universalIdentifier: this.extractUniversalIdentifier(identifiers),
      lookupHints: {
        title: context?.lookupHints.title ?? this.cleanText(volume.volumeInfo.title),
        author: context?.lookupHints.author ?? this.cleanText(volume.volumeInfo.authors?.[0]),
        identifiers,
      },
    }
  }

  getDiagnostics(): string[] {
    return this.googleBooksService.getDiagnostics()
  }

  private buildQueries(context?: ResolvedBookInfo): string[] {
    const isbn = context?.lookupHints.identifiers.find((identifier) => (
      identifier.kind === 'ISBN_13' || identifier.kind === 'ISBN_10'
    ))
    const title = context?.lookupHints.title?.trim()
    const author = context?.lookupHints.author?.trim()
    const queries: string[] = []

    if (title && author) {
      queries.push(`intitle:${title} inauthor:${author}`)
      queries.push(`${title} ${author}`)
    } else if (title) {
      queries.push(`intitle:${title}`)
      queries.push(title)
    }
    if (isbn) queries.push(`isbn:${isbn.value}`)

    return queries
  }

  private selectBestVolume(volumes: GoogleBooksVolume[], context?: ResolvedBookInfo): GoogleBooksVolume | null {
    if (volumes.length === 0) return null

    const requestedTitle = this.normalizeForMatch(context?.lookupHints.title)
    const requestedAuthor = this.normalizeForMatch(context?.lookupHints.author)
    if (!requestedTitle && !requestedAuthor) return volumes[0]

    return [...volumes].sort((left, right) => (
      this.scoreVolume(right, requestedTitle, requestedAuthor)
      - this.scoreVolume(left, requestedTitle, requestedAuthor)
    ))[0]
  }

  private scoreVolume(
    volume: GoogleBooksVolume,
    requestedTitle: string | null,
    requestedAuthor: string | null,
  ): number {
    const volumeInfo = volume.volumeInfo
    if (!volumeInfo) return 0

    const title = this.normalizeForMatch(volumeInfo.title)
    const authors = (volumeInfo.authors ?? [])
      .map((author) => this.normalizeForMatch(author))
      .filter((author): author is string => Boolean(author))
    let score = 0

    if (requestedTitle && title) {
      if (title === requestedTitle) score += 120
      else if (title.includes(requestedTitle)) score += 80
      else if (requestedTitle.includes(title)) score += 30

      const requestedWords = this.significantWords(requestedTitle)
      const matchedWords = requestedWords.filter((word) => title.includes(word)).length
      if (requestedWords.length > 0) score += Math.round((matchedWords / requestedWords.length) * 50)
    }

    if (requestedAuthor && authors.length > 0) {
      const authorMatched = authors.some((author) => (
        author === requestedAuthor
        || author.includes(requestedAuthor)
        || requestedAuthor.includes(author)
      ))
      if (authorMatched) score += 50
      else {
        const requestedWords = this.significantWords(requestedAuthor)
        const matchedWords = requestedWords.filter((word) => authors.some((author) => author.includes(word))).length
        if (requestedWords.length > 0) score += Math.round((matchedWords / requestedWords.length) * 30)
      }
    }

    if (this.extractIdentifiers(volumeInfo).some((identifier) => identifier.kind === 'ISBN_13')) score += 8
    if (typeof volumeInfo.pageCount === 'number' && volumeInfo.pageCount > 0) score += 5
    if (this.cleanText(volumeInfo.description)) score += 3
    return score
  }

  private significantWords(value: string): string[] {
    return value
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2)
  }

  private normalizeForMatch(value?: string | null): string | null {
    const normalized = value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')

    return normalized || null
  }

  private extractCategory(volumeInfo: GoogleBooksVolumeInfo): BookInfoValue<BookCategory[]> | null {
    const labels = [
      volumeInfo.mainCategory,
      ...(volumeInfo.categories ?? []),
    ]
      .map((label) => this.cleanText(label))
      .filter((label): label is string => Boolean(label))

    const uniqueLabels = [...new Set(labels)]
    return uniqueLabels.length > 0
      ? this.fromGoogle(uniqueLabels.map((label) => ({ label })), 'medium')
      : null
  }

  private extractRating(volumeInfo: GoogleBooksVolumeInfo): BookInfoValue<BookRating> | null {
    const average = volumeInfo.averageRating
    if (typeof average !== 'number' || !Number.isFinite(average) || average <= 0) return null

    return this.fromGoogle({
      average,
      ...(typeof volumeInfo.ratingsCount === 'number' ? { count: volumeInfo.ratingsCount } : {}),
      scale: 5,
    }, 'medium')
  }

  private extractSynopsis(volumeInfo: GoogleBooksVolumeInfo): BookInfoValue<string> | null {
    const description = this.cleanHtml(volumeInfo.description)
    return description ? this.fromGoogle(description, 'medium') : null
  }

  private extractPageCount(volumeInfo: GoogleBooksVolumeInfo): BookInfoValue<number> | null {
    const pageCount = volumeInfo.pageCount
    return typeof pageCount === 'number' && Number.isFinite(pageCount) && pageCount > 0
      ? this.fromGoogle(pageCount, 'medium')
      : null
  }

  private extractPublishedDate(volumeInfo: GoogleBooksVolumeInfo): BookInfoValue<string> | null {
    const publishedDate = this.cleanText(volumeInfo.publishedDate)
    return publishedDate ? this.fromGoogle(publishedDate, 'medium') : null
  }

  private extractTextValue(
    value: string | undefined,
    confidence: BookInfoValue<string>['confidence'],
  ): BookInfoValue<string> | null {
    const cleaned = this.cleanText(value)
    return cleaned ? this.fromGoogle(cleaned, confidence) : null
  }

  private extractIdentifierByKind(
    identifiers: BookIdentifier[],
    kind: 'ISBN_10' | 'ISBN_13',
  ): BookInfoValue<BookIdentifier> | null {
    const identifier = identifiers.find((candidate) => candidate.kind === kind)
    return identifier ? this.fromGoogle(identifier, 'high') : null
  }

  private extractUniversalIdentifier(identifiers: BookIdentifier[]): BookInfoValue<BookIdentifier> | null {
    const identifier = identifiers.find((candidate) => candidate.kind === 'ISBN_13')
      ?? identifiers.find((candidate) => candidate.kind === 'ISBN_10')
      ?? identifiers[0]

    return identifier ? this.fromGoogle(identifier, 'high') : null
  }

  private extractIdentifiers(volumeInfo: GoogleBooksVolumeInfo): BookIdentifier[] {
    const identifiers = (volumeInfo.industryIdentifiers ?? [])
      .map((identifier) => this.normalizeIdentifier(identifier))
      .filter((identifier): identifier is BookIdentifier => Boolean(identifier))

    const seen = new Set<string>()
    return identifiers.filter((identifier) => {
      const key = `${identifier.kind}:${identifier.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private normalizeIdentifier(identifier: GoogleBooksIndustryIdentifier): BookIdentifier | null {
    const rawValue = this.cleanText(identifier.identifier)
    if (!rawValue) return null

    const normalized = rawValue.replace(/[^0-9X]/gi, '').toUpperCase()
    const rawType = this.cleanText(identifier.type)?.toUpperCase()
    const kind = rawType === 'ISBN_13' && /^\d{13}$/.test(normalized)
      ? 'ISBN_13'
      : rawType === 'ISBN_10' && /^\d{9}[\dX]$/.test(normalized)
        ? 'ISBN_10'
        : /^\d{13}$/.test(normalized)
          ? 'ISBN_13'
          : /^\d{9}[\dX]$/.test(normalized)
            ? 'ISBN_10'
            : 'OTHER'

    return {
      kind,
      value: kind === 'OTHER' ? rawValue : normalized,
      raw: rawValue,
    }
  }

  private fromGoogle<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }

  private cleanHtml(value?: string | null): string | null {
    return htmlToPlainText(value)
  }

  private cleanText(value?: string | null): string | null {
    const cleaned = value?.replace(/\s+/g, ' ').trim()
    return cleaned || null
  }
}
