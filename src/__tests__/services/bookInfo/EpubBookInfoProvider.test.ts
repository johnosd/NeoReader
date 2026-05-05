import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookInfoService, EpubBookInfoProvider } from '@/services/bookInfo'
import type { BookInfoProvider } from '@/types/bookInfo'

const fflateState = vi.hoisted(() => ({
  files: {} as Record<string, Uint8Array>,
}))

vi.mock('fflate', async () => {
  const actual = await vi.importActual<typeof import('fflate')>('fflate')

  return {
    ...actual,
    unzip: (_data: Uint8Array, cb: (err: Error | null, data: Record<string, Uint8Array>) => void) => {
      cb(null, fflateState.files)
    },
  }
})

function text(content: string): Uint8Array {
  return new TextEncoder().encode(content)
}

function makeEpubBlob(opfPath: string, opfXml: string, entries: Record<string, string> = {}): Blob {
  fflateState.files = {
    'META-INF/container.xml': text(`<?xml version="1.0" encoding="UTF-8"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml" />
        </rootfiles>
      </container>`),
    [opfPath]: text(opfXml),
  }

  for (const [path, content] of Object.entries(entries)) {
    fflateState.files[path] = text(content)
  }

  return new Blob(['epub'], { type: 'application/epub+zip' })
}

function makeOpf(metadata: string, manifest = '', spine = '<spine />'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <package
      version="3.0"
      unique-identifier="book-id"
      xmlns="http://www.idpf.org/2007/opf"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata>
        <dc:title>Clean Code</dc:title>
        <dc:creator>Robert C. Martin</dc:creator>
        ${metadata}
      </metadata>
      <manifest>${manifest}</manifest>
      ${spine}
    </package>`
}

describe('EpubBookInfoProvider', () => {
  beforeEach(() => {
    fflateState.files = {}
  })

  it('extracts the required book info fields from OPF metadata', async () => {
    const provider = new EpubBookInfoProvider()
    const epub = makeEpubBlob(
      'OPS/package.opf',
      makeOpf(`
        <dc:identifier id="book-id">urn:isbn:9780132350884</dc:identifier>
        <dc:identifier>urn:isbn:0132350882</dc:identifier>
        <dc:identifier>urn:uuid:550e8400-e29b-41d4-a716-446655440000</dc:identifier>
        <dc:publisher>Prentice Hall</dc:publisher>
        <dc:language>en</dc:language>
        <dc:title id="subtitle-title">A Handbook of Agile Software Craftsmanship</dc:title>
        <meta refines="#subtitle-title" property="title-type">subtitle</meta>
        <dc:subject id="subject-1">COMPUTERS / Software Development</dc:subject>
        <meta refines="#subject-1" property="authority">BISAC</meta>
        <meta refines="#subject-1" property="term">COM051230</meta>
        <dc:description>&lt;b&gt;Um guia pratico para escrever codigo melhor.&lt;br&gt;&lt;i&gt;Readers can&amp;rsquo;t stop talking about it.&lt;/i&gt;&lt;/b&gt;</dc:description>
        <dc:date>2008-08-01</dc:date>
        <meta property="schema:numberOfPages">464</meta>
        <meta property="schema:ratingValue">4.7</meta>
        <meta property="schema:ratingCount">2500</meta>
        <meta property="belongs-to-collection">Robert C. Martin Series</meta>
        <meta property="schema:bookEdition">1st edition</meta>
        <meta property="schema:review">Review editorial incluida no EPUB.</meta>
        <link rel="review" href="https://example.com/reviews/clean-code" title="Review externa" />
      `),
    )

    const info = await provider.collect(epub)

    expect(info.lookupHints).toEqual({
      title: 'Clean Code',
      author: 'Robert C. Martin',
      identifiers: [
        { kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' },
        { kind: 'ISBN_10', value: '0132350882', raw: 'urn:isbn:0132350882' },
        {
          kind: 'UUID',
          value: '550e8400-e29b-41d4-a716-446655440000',
          raw: 'urn:uuid:550e8400-e29b-41d4-a716-446655440000',
        },
      ],
    })
    expect(info.universalIdentifier).toEqual({
      value: { kind: 'ISBN_13', value: '9780132350884', raw: 'urn:isbn:9780132350884' },
      source: 'epub-metadata',
      confidence: 'high',
    })
    expect(info.category?.value).toEqual([
      {
        label: 'COMPUTERS / Software Development',
        scheme: 'BISAC',
        code: 'COM051230',
      },
    ])
    expect(info.rating?.value).toEqual({ average: 4.7, count: 2500, scale: 5 })
    expect(info.synopsis?.value).toBe("Um guia pratico para escrever codigo melhor. Readers can't stop talking about it.")
    expect(info.pageCount?.value).toBe(464)
    expect(info.publishedDate?.value).toBe('2008-08-01')
    expect(info.publisher?.value).toBe('Prentice Hall')
    expect(info.language?.value).toBe('en')
    expect(info.subtitle?.value).toBe('A Handbook of Agile Software Craftsmanship')
    expect(info.series?.value).toBe('Robert C. Martin Series')
    expect(info.edition?.value).toBe('1st edition')
    expect(info.isbn10?.value.value).toBe('0132350882')
    expect(info.isbn13?.value.value).toBe('9780132350884')
    expect(info.reviews?.value).toEqual([
      {
        title: 'Review',
        description: 'Review editorial incluida no EPUB.',
        provider: 'epub',
      },
      {
        title: 'Review externa',
        url: 'https://example.com/reviews/clean-code',
        provider: 'epub',
      },
    ])
  })

  it('uses the EPUB page-list nav when numberOfPages metadata is absent', async () => {
    const provider = new EpubBookInfoProvider()
    const epub = makeEpubBlob(
      'OPS/package.opf',
      makeOpf(
        '<dc:identifier id="book-id">urn:isbn:9780132350884</dc:identifier>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
      ),
      {
        'OPS/nav.xhtml': `
          <html xmlns:epub="http://www.idpf.org/2007/ops">
            <body>
              <nav epub:type="page-list">
                <ol>
                  <li><a href="chapter.xhtml#p1">1</a></li>
                  <li><a href="chapter.xhtml#p2">2</a></li>
                  <li><a href="chapter.xhtml#p3">3</a></li>
                </ol>
              </nav>
            </body>
          </html>
        `,
      },
    )

    const info = await provider.collect(epub)

    expect(info.pageCount).toEqual({
      value: 3,
      source: 'epub-metadata',
      confidence: 'medium',
    })
  })

  it('counts pagebreak markers as the final EPUB page fallback', async () => {
    const provider = new EpubBookInfoProvider()
    const epub = makeEpubBlob(
      'OPS/package.opf',
      makeOpf(
        '<dc:identifier id="book-id">urn:isbn:9780132350884</dc:identifier>',
        '<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />',
      ),
      {
        'OPS/chapter.xhtml': `
          <html xmlns:epub="http://www.idpf.org/2007/ops">
            <body>
              <span epub:type="pagebreak" id="p1" title="1"></span>
              <p>Conteudo.</p>
              <span epub:type="pagebreak" id="p2" title="2"></span>
            </body>
          </html>
        `,
      },
    )

    const info = await provider.collect(epub)

    expect(info.pageCount?.value).toBe(2)
    expect(info.pageCount?.confidence).toBe('medium')
  })
})

describe('BookInfoService', () => {
  it('preserves earlier provider values and fills only missing fields from later providers', async () => {
    const epubProvider: BookInfoProvider = {
      source: 'epub-metadata',
      collect: async () => ({
        synopsis: {
          value: 'Sinopse do EPUB',
          source: 'epub-metadata',
          confidence: 'high',
        },
        lookupHints: {
          title: 'Livro',
          author: 'Autor',
          identifiers: [],
        },
      }),
    }
    const externalProvider: BookInfoProvider = {
      source: 'google-books',
      collect: async () => ({
        synopsis: {
          value: 'Sinopse externa',
          source: 'google-books',
          confidence: 'medium',
        },
        rating: {
          value: { average: 4.2, scale: 5 },
          source: 'google-books',
          confidence: 'medium',
        },
      }),
    }
    const service = new BookInfoService([epubProvider, externalProvider])

    const info = await service.collect(new Blob(['epub']))

    expect(info.synopsis?.value).toBe('Sinopse do EPUB')
    expect(info.rating?.value.average).toBe(4.2)
    expect(info.lookupHints.title).toBe('Livro')
  })

  it('continua usando os providers seguintes quando um provider falha', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const attempts: unknown[] = []
    const failingProvider: BookInfoProvider = {
      source: 'epub-metadata',
      collect: async () => {
        throw new Error('Falha ao ler EPUB')
      },
    }
    const googleProvider: BookInfoProvider = {
      source: 'google-books',
      collect: async () => ({
        pageCount: {
          value: 337,
          source: 'google-books',
          confidence: 'medium',
        },
        lookupHints: {
          title: 'The Let Them Theory',
          author: 'Mel Robbins',
          identifiers: [],
        },
      }),
    }
    const service = new BookInfoService([failingProvider, googleProvider], {
      onProviderAttempt: (attempt) => attempts.push(attempt),
    })

    const info = await service.collect(new Blob(['epub']))

    expect(info.pageCount?.value).toBe(337)
    expect(info.lookupHints.title).toBe('The Let Them Theory')
    expect(warnSpy).toHaveBeenCalledWith(
      'Book info provider failed: epub-metadata',
      expect.any(Error),
    )
    expect(attempts).toEqual([
      {
        source: 'epub-metadata',
        status: 'failed',
        fields: [],
        message: 'Falha ao ler EPUB',
        details: undefined,
      },
      {
        source: 'google-books',
        status: 'success',
        fields: ['paginas'],
        details: undefined,
      },
    ])

    warnSpy.mockRestore()
  })
})
