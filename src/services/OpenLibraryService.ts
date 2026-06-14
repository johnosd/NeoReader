import { fetchWithTimeout, getDefaultFetch } from './http'

export interface OpenLibraryBookData {
  title?: string
  subtitle?: string
  authors?: Array<{ name?: string }>
  publishers?: Array<{ name?: string } | string>
  languages?: Array<{ key?: string; name?: string } | string>
  publish_date?: string
  edition_name?: string
  series?: string[] | string
  number_of_pages?: number
  pagination?: string
  subjects?: Array<{ name?: string } | string>
  classifications?: Record<string, string[] | string>
  identifiers?: Record<string, string[] | string>
  excerpts?: Array<{ text?: string }>
  notes?: string | { value?: string }
}

interface OpenLibraryEditionData {
  works?: Array<{ key?: string }>
}

export interface OpenLibraryRatingData {
  average: number
  count?: number
}

interface OpenLibraryRatingResponse {
  summary?: {
    average?: number
    count?: number
  }
}

type OpenLibraryResponse = Record<string, OpenLibraryBookData | undefined>

interface OpenLibraryServiceOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  webBaseUrl?: string
  timeoutMs?: number
}

export class OpenLibraryService {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly webBaseUrl: string
  private readonly timeoutMs: number | undefined
  private diagnostics: string[] = []

  constructor(options: OpenLibraryServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? getDefaultFetch()
    this.baseUrl = options.baseUrl ?? 'https://openlibrary.org/api/books'
    this.webBaseUrl = options.webBaseUrl ?? 'https://openlibrary.org'
    this.timeoutMs = options.timeoutMs
  }

  async fetchBookByIsbn(isbn: string): Promise<OpenLibraryBookData | null> {
    const url = `${this.baseUrl}?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`
    const response = await fetchWithTimeout(url, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    })
    this.diagnostics.push(`Book data ISBN ${isbn}: HTTP ${response.status ?? (response.ok ? 200 : 0)}.`)
    if (!response.ok) return null

    const data = await this.readJson<OpenLibraryResponse>(response, `Book data ISBN ${isbn}`)
    if (!data) return null
    const bookData = data[`ISBN:${isbn}`] ?? Object.values(data)[0] ?? null
    this.diagnostics.push(`Book data ISBN ${isbn}: encontrado=${bookData ? 'sim' : 'nao'}.`)
    return bookData
  }

  async fetchRatingByIsbn(isbn: string): Promise<OpenLibraryRatingData | null> {
    const editionResponse = await fetchWithTimeout(`${this.webBaseUrl}/isbn/${encodeURIComponent(isbn)}.json`, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    })
    this.diagnostics.push(`Edition ISBN ${isbn}: HTTP ${editionResponse.status ?? (editionResponse.ok ? 200 : 0)}.`)
    if (!editionResponse.ok) return null

    const edition = await this.readJson<OpenLibraryEditionData>(editionResponse, `Edition ISBN ${isbn}`)
    if (!edition) return null
    const workKey = edition.works
      ?.map((work) => work.key?.trim())
      .find((key): key is string => Boolean(key))
    if (!workKey) {
      this.diagnostics.push(`Edition ISBN ${isbn}: work nao encontrada.`)
      return null
    }

    const ratingResponse = await fetchWithTimeout(`${this.webBaseUrl}${workKey}/ratings.json`, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    })
    this.diagnostics.push(`Ratings ${workKey}: HTTP ${ratingResponse.status ?? (ratingResponse.ok ? 200 : 0)}.`)
    if (!ratingResponse.ok) return null

    const rating = await this.readJson<OpenLibraryRatingResponse>(ratingResponse, `Ratings ${workKey}`)
    if (!rating) return null
    const average = rating.summary?.average
    if (typeof average !== 'number' || !Number.isFinite(average) || average <= 0) {
      this.diagnostics.push(`Ratings ${workKey}: nota ausente.`)
      return null
    }

    const count = rating.summary?.count
    this.diagnostics.push(`Ratings ${workKey}: average=${average}, count=${count ?? 0}.`)
    return {
      average,
      ...(typeof count === 'number' && Number.isFinite(count) ? { count } : {}),
    }
  }

  resetDiagnostics(): void {
    this.diagnostics = []
  }

  getDiagnostics(): string[] {
    return [...this.diagnostics]
  }

  private async readJson<T>(response: Response, label: string): Promise<T | null> {
    try {
      return await response.json() as T
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.diagnostics.push(`${label}: JSON invalido (${message}).`)
      return null
    }
  }
}
