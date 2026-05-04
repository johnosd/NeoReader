import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookInfoService, YouTubeReviewsProvider } from '@/services/bookInfo'
import type { ResolvedBookInfo } from '@/types/bookInfo'

function makeContext(patch: Partial<ResolvedBookInfo> = {}): ResolvedBookInfo {
  return {
    category: null,
    rating: null,
    synopsis: null,
    pageCount: null,
    publishedDate: null,
    universalIdentifier: null,
    reviews: null,
    lookupHints: {
      title: null,
      author: null,
      identifiers: [],
    },
    ...patch,
    lookupHints: {
      title: patch.lookupHints?.title ?? null,
      author: patch.lookupHints?.author ?? null,
      identifiers: patch.lookupHints?.identifiers ?? [],
    },
  }
}

function makeFetch(responses: unknown[]) {
  let index = 0
  return vi.fn(async () => {
    const data = responses[index] ?? { items: [] }
    index += 1
    return {
      ok: true,
      json: async () => data,
    }
  }) as unknown as typeof fetch
}

function getQueryFromUrl(rawUrl: string): string | null {
  return new URL(rawUrl).searchParams.get('q')
}

describe('YouTubeReviewsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches review and resenha queries and maps video links as reviews', async () => {
    const fetchImpl = makeFetch([
      {
        items: [{
          id: { videoId: 'video-1' },
          snippet: {
            title: 'Clean Code Review',
            channelTitle: 'Book Channel',
            description: 'A review of Clean Code.',
            publishedAt: '2026-01-02T00:00:00Z',
          },
        }],
      },
      {
        items: [{
          id: { videoId: 'video-2' },
          snippet: {
            title: 'Robert C. Martin Clean Code Book Review',
            channelTitle: 'Dev Books',
          },
        }],
      },
      {
        items: [],
      },
      {
        items: [],
      },
    ])
    const provider = new YouTubeReviewsProvider({
      apiKey: 'yt-key',
      fetchImpl,
      maxResults: 5,
    })

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        identifiers: [],
      },
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(getQueryFromUrl((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0])).toBe('Clean Code review')
    expect(getQueryFromUrl((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1][0])).toBe('Robert C. Martin Clean Code book review')
    expect(getQueryFromUrl((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[2][0])).toBe('Clean Code resenha')
    expect(getQueryFromUrl((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[3][0])).toBe('Robert C. Martin Clean Code resenha livro')
    expect(new URL((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0]).searchParams.get('key')).toBe('yt-key')

    expect(info.reviews).toEqual({
      value: [
        {
          title: 'Clean Code Review',
          url: 'https://www.youtube.com/watch?v=video-1',
          provider: 'youtube',
          channelTitle: 'Book Channel',
          description: 'A review of Clean Code.',
          publishedAt: '2026-01-02T00:00:00Z',
        },
        {
          title: 'Robert C. Martin Clean Code Book Review',
          url: 'https://www.youtube.com/watch?v=video-2',
          provider: 'youtube',
          channelTitle: 'Dev Books',
        },
      ],
      source: 'youtube',
      confidence: 'medium',
    })
  })

  it('deduplicates videos and stops at maxResults', async () => {
    const fetchImpl = makeFetch([
      {
        items: [
          { id: { videoId: 'video-1' }, snippet: { title: 'First' } },
          { id: { videoId: 'video-1' }, snippet: { title: 'Duplicate' } },
          { id: { videoId: 'video-2' }, snippet: { title: 'Second' } },
        ],
      },
    ])
    const provider = new YouTubeReviewsProvider({
      apiKey: 'yt-key',
      fetchImpl,
      maxResults: 2,
    })

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Clean Code',
        author: null,
        identifiers: [],
      },
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(info.reviews?.value.map((review) => review.url)).toEqual([
      'https://www.youtube.com/watch?v=video-1',
      'https://www.youtube.com/watch?v=video-2',
    ])
  })

  it('does not call YouTube without an API key or title', async () => {
    const fetchImpl = makeFetch([])
    const withoutKey = new YouTubeReviewsProvider({ fetchImpl })
    const withoutTitle = new YouTubeReviewsProvider({ apiKey: 'yt-key', fetchImpl })

    await expect(withoutKey.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Clean Code',
        author: null,
        identifiers: [],
      },
    }))).resolves.toEqual({})

    await expect(withoutTitle.collect(new Blob(['epub']), makeContext())).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('binds the browser fetch implementation when no fetch mock is passed', async () => {
    const fetchImpl = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [] }),
      })
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    try {
      const provider = new YouTubeReviewsProvider({ apiKey: 'yt-key' })

      await expect(provider.collect(new Blob(['epub']), makeContext({
        lookupHints: {
          title: 'Clean Code',
          author: 'Robert C. Martin',
          identifiers: [],
        },
      }))).resolves.toEqual({})
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('BookInfoService with YouTube reviews', () => {
  it('combines EPUB and YouTube reviews without duplicating the review field', async () => {
    const epubProvider = {
      source: 'epub-metadata' as const,
      collect: async () => ({
        reviews: {
          value: [{ title: 'Review editorial', provider: 'epub' as const }],
          source: 'epub-metadata' as const,
          confidence: 'medium' as const,
        },
        lookupHints: {
          title: 'Clean Code',
          author: 'Robert C. Martin',
          identifiers: [],
        },
      }),
    }
    const youtubeProvider = {
      source: 'youtube' as const,
      collect: async () => ({
        reviews: {
          value: [{ title: 'Video review', provider: 'youtube' as const }],
          source: 'youtube' as const,
          confidence: 'medium' as const,
        },
      }),
    }
    const service = new BookInfoService([epubProvider, youtubeProvider])

    const info = await service.collect(new Blob(['epub']))

    expect(info.reviews).toEqual({
      value: [
        { title: 'Review editorial', provider: 'epub' },
        { title: 'Video review', provider: 'youtube' },
      ],
      source: 'epub-metadata',
      confidence: 'medium',
    })
  })
})
