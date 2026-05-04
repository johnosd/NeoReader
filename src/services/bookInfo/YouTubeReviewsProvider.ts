import type {
  BookInfoProvider,
  BookInfoValue,
  BookReview,
  ResolvedBookInfo,
} from '../../types/bookInfo'
import { fetchWithTimeout, getDefaultFetch } from '../http'

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

  async collect(_fileBlob: Blob, context?: ResolvedBookInfo): Promise<Partial<ResolvedBookInfo>> {
    if (!this.apiKey) return {}

    const queries = this.buildQueries(context)
    if (queries.length === 0) return {}

    const reviews: BookReview[] = []
    const seenVideoIds = new Set<string>()

    for (const query of queries) {
      if (reviews.length >= this.maxResults) break

      const response = await fetchWithTimeout(this.buildUrl(query), {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      })
      if (!response.ok) continue

      const data = await response.json() as YouTubeSearchResponse
      for (const item of data.items ?? []) {
        const videoId = item.id?.videoId
        if (!videoId || seenVideoIds.has(videoId)) continue

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

  private buildQueries(context?: ResolvedBookInfo): string[] {
    const title = this.cleanText(context?.lookupHints.title)
    const author = this.cleanText(context?.lookupHints.author)
    if (!title) return []

    return [
      `${title} review`,
      author ? `${author} ${title} book review` : null,
      `${title} resenha`,
      author ? `${author} ${title} resenha livro` : null,
    ].filter((query): query is string => Boolean(query))
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
