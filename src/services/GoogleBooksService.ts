import { fetchWithTimeout, getDefaultFetch } from './http'

export interface GoogleBooksIndustryIdentifier {
  type?: string
  identifier?: string
}

export interface GoogleBooksVolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  description?: string
  publisher?: string
  publishedDate?: string
  language?: string
  pageCount?: number
  averageRating?: number
  ratingsCount?: number
  mainCategory?: string
  categories?: string[]
  industryIdentifiers?: GoogleBooksIndustryIdentifier[]
}

export interface GoogleBooksVolume {
  id?: string
  volumeInfo?: GoogleBooksVolumeInfo
}

interface GoogleBooksResponse {
  totalItems?: number
  items?: GoogleBooksVolume[]
}

interface GoogleBooksServiceOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  apiKey?: string
  maxResults?: number
  timeoutMs?: number
}

type GoogleBooksVolumeSelector = (volumes: GoogleBooksVolume[]) => GoogleBooksVolume | null

export class GoogleBooksService {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly maxResults: number
  private readonly timeoutMs: number | undefined
  private diagnostics: string[] = []

  constructor(options: GoogleBooksServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? getDefaultFetch()
    this.baseUrl = options.baseUrl ?? 'https://www.googleapis.com/books/v1/volumes'
    this.apiKey = options.apiKey?.trim() || null
    this.maxResults = options.maxResults ?? 5
    this.timeoutMs = options.timeoutMs
  }

  async searchFirstVolume(
    queries: string[],
    selectVolume?: GoogleBooksVolumeSelector,
  ): Promise<GoogleBooksVolume | null> {
    this.diagnostics = [
      `API key Google Books: ${this.apiKey ? 'configurada' : 'ausente'}`,
    ]

    if (queries.length === 0) {
      this.diagnostics.push('Nenhuma query criada: titulo, autor e ISBN ausentes.')
      return null
    }

    for (const query of queries) {
      const response = await fetchWithTimeout(this.buildUrl(query), {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      })
      const status = response.status ?? (response.ok ? 200 : 0)
      if (!response.ok) {
        this.diagnostics.push(`Query "${query}" retornou HTTP ${status}.`)
        continue
      }

      const data = await response.json() as GoogleBooksResponse
      const volumes = (data.items ?? []).filter((volume) => volume.volumeInfo)
      const volume = selectVolume?.(volumes) ?? volumes[0]
      this.diagnostics.push(
        `Query "${query}" retornou HTTP ${status}, totalItems=${data.totalItems ?? 0}, candidatos=${volumes.length}, encontrado=${volume?.volumeInfo ? 'sim' : 'nao'}.`,
      )
      if (volume?.volumeInfo) return volume
    }

    return null
  }

  getDiagnostics(): string[] {
    return [...this.diagnostics]
  }

  private buildUrl(query: string): string {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(this.maxResults),
    })

    if (this.apiKey) params.set('key', this.apiKey)
    return `${this.baseUrl}?${params.toString()}`
  }
}
