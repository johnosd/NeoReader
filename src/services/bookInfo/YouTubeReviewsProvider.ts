import type {
  BookInfoProvider,
  BookInfoValue,
  BookReview,
  ResolvedBookInfo,
} from '../../types/bookInfo'
import { fetchWithTimeout, getDefaultFetch } from '../http'
import { hasRelevantOverlap } from '../../utils/textMatch'

interface YouTubeSearchItem {
  id?: {
    videoId?: string
  }
  snippet?: {
    title?: string
    channelTitle?: string
    description?: string
    publishedAt?: string
  }
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[]
}

interface YouTubeReviewsProviderOptions {
  apiKey?: string | null
  fetchImpl?: typeof fetch
  baseUrl?: string
  maxResults?: number
  timeoutMs?: number
}

export class YouTubeReviewsProvider implements BookInfoProvider {
  readonly source = 'youtube' as const
  // Só usa lookupHints.title/author, que já vêm resolvidos de book.title/author
  // antes de qualquer provider rodar — não depende de Google Books/Open
  // Library, então BookInfoService roda esse provider em paralelo com eles.
  readonly runsIndependently = true as const
  private readonly apiKey: string | null
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly maxResults: number
  private readonly timeoutMs: number | undefined

  constructor(options: YouTubeReviewsProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || null
    this.fetchImpl = options.fetchImpl ?? getDefaultFetch()
    this.baseUrl = options.baseUrl ?? 'https://www.googleapis.com/youtube/v3/search'
    this.maxResults = options.maxResults ?? 5
    this.timeoutMs = options.timeoutMs
  }

  async collect(_fileBlob: Blob | null, context?: ResolvedBookInfo): Promise<Partial<ResolvedBookInfo>> {
    if (!this.apiKey) return {}

    const title = this.cleanText(context?.lookupHints.title)
    if (!title) return {}

    const author = this.cleanText(context?.lookupHints.author)
    const queries = this.buildQueries(title, author)

    const reviews: BookReview[] = []
    const seenVideoIds = new Set<string>()

    for (const query of queries) {
      if (reviews.length >= this.maxResults) break

      const response = await fetchWithTimeout(this.buildUrl(query), {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      })
      // 403 normalmente é cota do YouTube Data API estourada — as próximas
      // queries vão falhar do mesmo jeito, então para por aqui em vez de
      // gastar mais round-trips que sabemos que vão dar erro.
      if (response.status === 403) break
      if (!response.ok) continue

      const data = await response.json() as YouTubeSearchResponse
      for (const item of data.items ?? []) {
        const videoId = item.id?.videoId
        if (!videoId || seenVideoIds.has(videoId)) continue
        // A busca do YouTube é por palavra solta — sem essa checagem, um
        // título comum (ou uma das queries "review"/"resenha") devolve vídeo
        // que não tem nada a ver com o livro.
        if (!this.isRelevantToBook(item.snippet, title)) continue

        seenVideoIds.add(videoId)
        reviews.push({
          title: this.cleanText(item.snippet?.title) ?? 'Review',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          provider: 'youtube',
          ...(this.cleanText(item.snippet?.channelTitle) ? { channelTitle: this.cleanText(item.snippet?.channelTitle)! } : {}),
          ...(this.cleanText(item.snippet?.description) ? { description: this.cleanText(item.snippet?.description)! } : {}),
          ...(this.cleanText(item.snippet?.publishedAt) ? { publishedAt: this.cleanText(item.snippet?.publishedAt)! } : {}),
        })

        if (reviews.length >= this.maxResults) break
      }
    }

    return reviews.length > 0
      ? { reviews: this.fromYouTube(reviews, 'medium') }
      : {}
  }

  private buildQueries(title: string, author: string | null): string[] {
    return [
      `${title} review`,
      author ? `${author} ${title} book review` : null,
      `${title} resenha`,
      author ? `${author} ${title} resenha livro` : null,
    ].filter((query): query is string => Boolean(query))
  }

  // Exige o título inteiro como substring (a maioria dos reviews de verdade
  // repete o título) ou pelo menos 60% das palavras significativas dele no
  // título/descrição do vídeo — corta resultado que só bateu por causa de
  // "review"/"resenha" na query, sem relação nenhuma com o livro.
  private isRelevantToBook(snippet: YouTubeSearchItem['snippet'], title: string): boolean {
    const haystack = `${snippet?.title ?? ''} ${snippet?.description ?? ''}`
    return hasRelevantOverlap(haystack, title, 0.6)
  }

  private buildUrl(query: string): string {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(this.maxResults),
      q: query,
      key: this.apiKey ?? '',
    })

    return `${this.baseUrl}?${params.toString()}`
  }

  private fromYouTube<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }

  private cleanText(value?: string | null): string | null {
    const cleaned = value?.replace(/\s+/g, ' ').trim()
    return cleaned || null
  }
}
