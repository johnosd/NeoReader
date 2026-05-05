import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookInfoService, OpenLibraryProvider } from '@/services/bookInfo'
import { OpenLibraryService } from '@/services/OpenLibraryService'
import { BOOK_INFO_SCHEMA_VERSION, type ResolvedBookInfo } from '@/types/bookInfo'

function makeContext(patch: Partial<ResolvedBookInfo> = {}): ResolvedBookInfo {
  return {
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
    ...patch,
    lookupHints: {
      title: patch.lookupHints?.title ?? null,
      author: patch.lookupHints?.author ?? null,
      identifiers: patch.lookupHints?.identifiers ?? [],
    },
  }
}

function makeFetch(data: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => data,
  })) as unknown as typeof fetch
}

function makeFetchSequence(responses: Array<{ data: unknown, ok?: boolean }>) {
  let index = 0
  return vi.fn(async () => {
    const response = responses[index] ?? responses[responses.length - 1]
    index += 1
    return {
      ok: response.ok ?? true,
      json: async () => response.data,
    }
  }) as unknown as typeof fetch
}

describe('OpenLibraryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries Open Library by ISBN and maps edition data into the shared contract', async () => {
    const fetchImpl = makeFetch({
      'ISBN:9780132350884': {
        title: 'Clean Code',
        subtitle: 'A Handbook of Agile Software Craftsmanship',
        authors: [{ name: 'Robert C. Martin' }],
        publishers: [{ name: 'Prentice Hall' }],
        languages: [{ key: '/languages/eng' }],
        publish_date: 'August 1, 2008',
        edition_name: '1st edition',
        series: ['Robert C. Martin Series'],
        number_of_pages: 464,
        subjects: [
          { name: 'Software engineering' },
          'Programming',
        ],
        classifications: {
          dewey_decimal_class: ['005.1'],
        },
        identifiers: {
          isbn_13: ['9780132350884'],
          isbn_10: ['0132350882'],
          openlibrary: ['OL12345M'],
        },
        excerpts: [{ text: 'A handbook of agile software craftsmanship.' }],
      },
    })
    const provider = new OpenLibraryProvider(new OpenLibraryService({ fetchImpl }))

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Clean Code',
        author: 'Robert C. Martin',
        identifiers: [{ kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' }],
      },
    }))

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openlibrary.org/api/books?bibkeys=ISBN:9780132350884&format=json&jscmd=data',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(info.category).toEqual({
      value: [
        { label: 'Software engineering' },
        { label: 'Programming' },
        { label: '005.1', scheme: 'dewey_decimal_class' },
      ],
      source: 'open-library',
      confidence: 'medium',
    })
    expect(info.synopsis).toEqual({
      value: 'A handbook of agile software craftsmanship.',
      source: 'open-library',
      confidence: 'low',
    })
    expect(info.pageCount).toEqual({
      value: 464,
      source: 'open-library',
      confidence: 'medium',
    })
    expect(info.publishedDate).toEqual({
      value: 'August 1, 2008',
      source: 'open-library',
      confidence: 'medium',
    })
    expect(info.publisher?.value).toBe('Prentice Hall')
    expect(info.language?.value).toBe('eng')
    expect(info.subtitle?.value).toBe('A Handbook of Agile Software Craftsmanship')
    expect(info.series?.value).toBe('Robert C. Martin Series')
    expect(info.edition?.value).toBe('1st edition')
    expect(info.isbn10?.value.value).toBe('0132350882')
    expect(info.isbn13?.value.value).toBe('9780132350884')
    expect(info.universalIdentifier).toEqual({
      value: { kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' },
      source: 'open-library',
      confidence: 'high',
    })
    expect(info.lookupHints?.identifiers).toEqual([
      { kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' },
      { kind: 'ISBN_10', value: '0132350882', raw: '0132350882' },
      { kind: 'OTHER', value: 'OL12345M', raw: 'OL12345M' },
    ])
  })

  it('uses pagination as a low-confidence page count fallback', async () => {
    const fetchImpl = makeFetch({
      'ISBN:0132350882': {
        pagination: '464 pages',
      },
    })
    const provider = new OpenLibraryProvider(new OpenLibraryService({ fetchImpl }))

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Clean Code',
        author: null,
        identifiers: [{ kind: 'ISBN_10', value: '0132350882', raw: '0132350882' }],
      },
    }))

    expect(info.pageCount).toEqual({
      value: 464,
      source: 'open-library',
      confidence: 'low',
    })
  })

  it('maps Open Library work ratings as a low-confidence rating fallback', async () => {
    const fetchImpl = makeFetchSequence([
      {
        data: {
          'ISBN:9781401971373': {
            title: 'The Let Them Theory',
            identifiers: {
              isbn_13: ['9781401971373'],
            },
          },
        },
      },
      {
        data: {
          key: '/books/OL61173896M',
          works: [{ key: '/works/OL39181496W' }],
        },
      },
      {
        data: {
          summary: {
            average: 4.333333333333333,
            count: 18,
          },
        },
      },
    ])
    const provider = new OpenLibraryProvider(new OpenLibraryService({ fetchImpl }))

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'The Let Them Theory',
        author: 'Mel Robbins',
        identifiers: [{ kind: 'ISBN_13', value: '9781401971373', raw: '9781401971373' }],
      },
    }))

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://openlibrary.org/isbn/9781401971373.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://openlibrary.org/works/OL39181496W/ratings.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(info.rating).toEqual({
      value: { average: 4.333333333333333, count: 18, scale: 5 },
      source: 'open-library',
      confidence: 'low',
    })
  })

  it('returns no fields when ISBN is unavailable or the request fails', async () => {
    const fetchImpl = makeFetch({}, false)
    const provider = new OpenLibraryProvider(new OpenLibraryService({ fetchImpl }))

    await expect(provider.collect(new Blob(['epub']), makeContext())).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()

    await expect(provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: null,
        author: null,
        identifiers: [{ kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' }],
      },
    }))).resolves.toEqual({})
  })

  it('binds the browser fetch implementation when no fetch mock is passed', async () => {
    const fetchImpl = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    try {
      const provider = new OpenLibraryProvider()

      await expect(provider.collect(new Blob(['epub']), makeContext({
        lookupHints: {
          title: 'Clean Code',
          author: 'Robert C. Martin',
          identifiers: [{ kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' }],
        },
      }))).resolves.toEqual({})
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('BookInfoService with Open Library', () => {
  it('uses Open Library only for fields still missing after earlier providers', async () => {
    const epubProvider = {
      source: 'epub-metadata' as const,
      collect: async () => ({
        synopsis: {
          value: 'Sinopse do EPUB.',
          source: 'epub-metadata' as const,
          confidence: 'high' as const,
        },
        lookupHints: {
          title: 'Clean Code',
          author: 'Robert C. Martin',
          identifiers: [{ kind: 'ISBN_13' as const, value: '9780132350884', raw: 'urn:isbn:9780132350884' }],
        },
      }),
    }
    const googleProvider = {
      source: 'google-books' as const,
      collect: async () => ({
        rating: {
          value: { average: 4.3, scale: 5 as const },
          source: 'google-books' as const,
          confidence: 'medium' as const,
        },
      }),
    }
    const openLibraryProvider = {
      source: 'open-library' as const,
      collect: async () => ({
        synopsis: {
          value: 'Sinopse da Open Library.',
          source: 'open-library' as const,
          confidence: 'low' as const,
        },
        pageCount: {
          value: 464,
          source: 'open-library' as const,
          confidence: 'medium' as const,
        },
      }),
    }
    const service = new BookInfoService([epubProvider, googleProvider, openLibraryProvider])

    const info = await service.collect(new Blob(['epub']))

    expect(info.synopsis?.value).toBe('Sinopse do EPUB.')
    expect(info.rating?.source).toBe('google-books')
    expect(info.pageCount).toEqual({
      value: 464,
      source: 'open-library',
      confidence: 'medium',
    })
  })
})
