import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookInfoService, GoogleBooksProvider, OpenLibraryProvider } from '@/services/bookInfo'
import { GoogleBooksService } from '@/services/GoogleBooksService'
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

function makeInvalidJsonFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token <')
    },
  })) as unknown as typeof fetch
}

function makeFetchSequence(responses: Array<{ data: unknown, ok?: boolean }>) {
  let index = 0
  return vi.fn(async () => {
    const response = responses[index] ?? responses[responses.length - 1]
    index += 1
    return {
      ok: response.ok ?? true,
      status: response.ok === false ? 404 : 200,
      json: async () => response.data,
    }
  }) as unknown as typeof fetch
}

describe('GoogleBooksProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries by ISBN and maps Google Books volumeInfo into the shared contract', async () => {
    const fetchImpl = makeFetch({
      totalItems: 1,
      items: [{
        id: 'google-volume-id',
        volumeInfo: {
          title: 'Clean Code',
          subtitle: 'A Handbook of Agile Software Craftsmanship',
          authors: ['Robert C. Martin'],
          publisher: 'Prentice Hall',
          language: 'en',
          mainCategory: 'Computers',
          categories: ['Computers / Software Development', 'Computers'],
          averageRating: 4.7,
          ratingsCount: 2500,
          description: '<p>Um guia &amp; pratico para escrever codigo melhor.<br><i>Readers can&rsquo;t stop talking about it.</i></p>',
          pageCount: 464,
          publishedDate: '2008-08-01',
          industryIdentifiers: [
            { type: 'ISBN_13', identifier: '9780132350884' },
            { type: 'ISBN_10', identifier: '0132350882' },
          ],
        },
      }],
    })
    const provider = new GoogleBooksProvider(new GoogleBooksService({
      fetchImpl,
      apiKey: 'google-key',
    }))

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: null,
        author: null,
        identifiers: [{ kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' }],
      },
    }))

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes?q=isbn%3A9780132350884&maxResults=5&key=google-key',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(info.category).toEqual({
      value: [
        { label: 'Computers' },
        { label: 'Computers / Software Development' },
      ],
      source: 'google-books',
      confidence: 'medium',
    })
    expect(info.rating).toEqual({
      value: { average: 4.7, count: 2500, scale: 5 },
      source: 'google-books',
      confidence: 'medium',
    })
    expect(info.synopsis?.value).toBe("Um guia & pratico para escrever codigo melhor. Readers can't stop talking about it.")
    expect(info.pageCount?.value).toBe(464)
    expect(info.publishedDate?.value).toBe('2008-08-01')
    expect(info.publisher?.value).toBe('Prentice Hall')
    expect(info.language?.value).toBe('en')
    expect(info.subtitle?.value).toBe('A Handbook of Agile Software Craftsmanship')
    expect(info.isbn10?.value.value).toBe('0132350882')
    expect(info.isbn13?.value.value).toBe('9780132350884')
    expect(info.universalIdentifier).toEqual({
      value: { kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' },
      source: 'google-books',
      confidence: 'high',
    })
    expect(info.lookupHints?.identifiers).toEqual([
      { kind: 'ISBN_13', value: '9780132350884', raw: '9780132350884' },
      { kind: 'ISBN_10', value: '0132350882', raw: '0132350882' },
    ])
  })

  it('falls back to title and author when ISBN is unavailable', async () => {
    const fetchImpl = makeFetch({
      totalItems: 0,
      items: [],
    })
    const provider = new GoogleBooksProvider(new GoogleBooksService({ fetchImpl }))

    await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Dom Casmurro',
        author: 'Machado de Assis',
        identifiers: [],
      },
    }))

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://www.googleapis.com/books/v1/volumes?q=intitle%3ADom+Casmurro+inauthor%3AMachado+de+Assis&maxResults=5',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('tries a broader title and author query when the structured query has no result', async () => {
    const fetchImpl = makeFetch({
      totalItems: 0,
      items: [],
    })
    const provider = new GoogleBooksProvider(new GoogleBooksService({ fetchImpl }))

    await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Let Them',
        author: 'Mel Robins',
        identifiers: [],
      },
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://www.googleapis.com/books/v1/volumes?q=intitle%3ALet+Them+inauthor%3AMel+Robins&maxResults=5',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/books/v1/volumes?q=Let+Them+Mel+Robins&maxResults=5',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(provider.getDiagnostics()).toEqual([
      'API key Google Books: ausente',
      'Query "intitle:Let Them inauthor:Mel Robins" retornou HTTP 200, totalItems=0, candidatos=0, encontrado=nao.',
      'Query "Let Them Mel Robins" retornou HTTP 200, totalItems=0, candidatos=0, encontrado=nao.',
    ])
  })

  it('selects the best title match among Google candidates before extracting identifiers', async () => {
    const fetchImpl = makeFetch({
      totalItems: 2,
      items: [
        {
          volumeInfo: {
            title: 'Deixa pra lá',
            authors: ['Mel Robbins', 'Sawyer Robbins'],
            pageCount: 251,
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9786557125038' },
            ],
          },
        },
        {
          volumeInfo: {
            title: 'The Let Them Theory',
            authors: ['Mel Robbins', 'Sawyer Robbins'],
            pageCount: 337,
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9781401971373' },
              { type: 'ISBN_10', identifier: '1401971377' },
            ],
          },
        },
      ],
    })
    const provider = new GoogleBooksProvider(new GoogleBooksService({ fetchImpl }))

    const info = await provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Let Them',
        author: 'Mel Robbins',
        identifiers: [],
      },
    }))

    expect(info.pageCount?.value).toBe(337)
    expect(info.universalIdentifier?.value).toEqual({
      kind: 'ISBN_13',
      value: '9781401971373',
      raw: '9781401971373',
    })
    expect(info.lookupHints.identifiers).toEqual([
      { kind: 'ISBN_13', value: '9781401971373', raw: '9781401971373' },
      { kind: 'ISBN_10', value: '1401971377', raw: '1401971377' },
    ])
  })

  it('returns no fields when there are no lookup hints or the request fails', async () => {
    const fetchImpl = makeFetch({}, false)
    const provider = new GoogleBooksProvider(new GoogleBooksService({ fetchImpl }))

    await expect(provider.collect(new Blob(['epub']), makeContext())).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()

    await expect(provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Livro',
        author: null,
        identifiers: [],
      },
    }))).resolves.toEqual({})
  })

  it('returns no fields when Google Books returns invalid JSON', async () => {
    const fetchImpl = makeInvalidJsonFetch()
    const service = new GoogleBooksService({ fetchImpl })
    const provider = new GoogleBooksProvider(service)

    await expect(provider.collect(new Blob(['epub']), makeContext({
      lookupHints: {
        title: 'Livro',
        author: null,
        identifiers: [],
      },
    }))).resolves.toEqual({})

    expect(service.getDiagnostics().some((message) => message.includes('JSON invalido'))).toBe(true)
  })

  it('binds the browser fetch implementation when no fetch mock is passed', async () => {
    const fetchImpl = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ totalItems: 0, items: [] }),
      })
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    try {
      const provider = new GoogleBooksProvider()

      await expect(provider.collect(new Blob(['epub']), makeContext({
        lookupHints: {
          title: 'Let Them',
          author: 'Mel Robbins',
          identifiers: [],
        },
      }))).resolves.toEqual({})
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('BookInfoService with Google Books', () => {
  it('keeps EPUB values and uses Google Books only for missing fields and extra identifiers', async () => {
    const epubProvider = {
      source: 'epub-metadata' as const,
      collect: async () => ({
        synopsis: {
          value: 'Sinopse local.',
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
        synopsis: {
          value: 'Sinopse externa.',
          source: 'google-books' as const,
          confidence: 'medium' as const,
        },
        rating: {
          value: { average: 4.2, scale: 5 as const },
          source: 'google-books' as const,
          confidence: 'medium' as const,
        },
        lookupHints: {
          title: 'Clean Code',
          author: 'Robert C. Martin',
          identifiers: [
            { kind: 'ISBN_13' as const, value: '9780132350884', raw: '9780132350884' },
            { kind: 'ISBN_10' as const, value: '0132350882', raw: '0132350882' },
          ],
        },
      }),
    }
    const service = new BookInfoService([epubProvider, googleProvider])

    const info = await service.collect(new Blob(['epub']))

    expect(info.synopsis?.value).toBe('Sinopse local.')
    expect(info.rating?.source).toBe('google-books')
    expect(info.lookupHints.identifiers).toEqual([
      { kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' },
      { kind: 'ISBN_10', value: '0132350882', raw: '0132350882' },
    ])
  })

  it('uses the best Google candidate so Open Library can fill Let Them rating by ISBN', async () => {
    const googleFetch = makeFetch({
      totalItems: 2,
      items: [
        {
          volumeInfo: {
            title: 'Deixa pra lá',
            authors: ['Mel Robbins', 'Sawyer Robbins'],
            pageCount: 251,
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9786557125038' },
            ],
          },
        },
        {
          volumeInfo: {
            title: 'The Let Them Theory',
            authors: ['Mel Robbins', 'Sawyer Robbins'],
            pageCount: 337,
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9781401971373' },
            ],
          },
        },
      ],
    })
    const openLibraryFetch = makeFetchSequence([
      {
        data: {},
      },
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
          works: [{ key: '/works/OL_NO_RATING' }],
        },
      },
      {
        data: {
          summary: {},
        },
      },
      {
        data: {
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
    const service = new BookInfoService([
      new GoogleBooksProvider(new GoogleBooksService({ fetchImpl: googleFetch })),
      new OpenLibraryProvider(new OpenLibraryService({ fetchImpl: openLibraryFetch })),
    ])

    const info = await service.collect(new Blob(['epub']), {
      lookupHints: {
        title: 'Let Them',
        author: 'Mel Robbins',
        identifiers: [{ kind: 'ISBN_13', value: '9786557125038', raw: '9786557125038' }],
      },
    })

    expect(info.universalIdentifier?.value.value).toBe('9781401971373')
    expect(info.lookupHints.identifiers).toEqual([
      { kind: 'ISBN_13', value: '9786557125038', raw: '9786557125038' },
      { kind: 'ISBN_13', value: '9781401971373', raw: '9781401971373' },
    ])
    expect(info.rating).toEqual({
      value: { average: 4.333333333333333, count: 18, scale: 5 },
      source: 'open-library',
      confidence: 'low',
    })
  })
})
