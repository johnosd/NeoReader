import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { EpubService } from '@/services/EpubService'

type EpubEntries = Record<string, string | Uint8Array>

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function makeFile(): File {
  return {
    name: 'sample.epub',
    arrayBuffer: async () => new ArrayBuffer(0),
  } as File
}

function makeEpubFiles(
  opfPath: string,
  opfXml: string,
  entries: EpubEntries,
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'META-INF/container.xml': text(
      `<?xml version="1.0" encoding="UTF-8"?>
       <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
         <rootfiles>
           <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
         </rootfiles>
       </container>`,
    ),
    [opfPath]: text(opfXml),
  }

  for (const [path, content] of Object.entries(entries)) {
    files[path] = typeof content === 'string' ? text(content) : content
  }

  return files
}

function makeOpf(
  manifest: string,
  metadataExtras = '',
  guide = '',
  spine = '<spine />',
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <package version="2.0" xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata>
        <dc:title>Test Book</dc:title>
        <dc:creator>Test Author</dc:creator>
        ${metadataExtras}
      </metadata>
      <manifest>
        ${manifest}
      </manifest>
      ${spine}
      ${guide ? `<guide>${guide}</guide>` : ''}
    </package>`
}

function bytes(label: string): Uint8Array {
  return text(label)
}

async function blobText(blob: Blob | null): Promise<string> {
  expect(blob).not.toBeNull()
  return new TextDecoder().decode(await blob!.arrayBuffer())
}

describe('EpubService.parseMetadata - cover extraction', () => {
  beforeEach(() => {
    fflateState.files = {}
  })

  it('resolves cover-image hrefs with ../ relative to the OPF', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="cover-image" href="../Images/front.jpg" media-type="image/jpeg" properties="cover-image" />
      `),
      {
        'Images/front.jpg': bytes('cover-image'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('cover-image')
  })

  it('follows meta cover ids into XHTML wrappers with encoded image paths', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="cover-page" href="Text/cover.xhtml" media-type="application/xhtml+xml" />
          <item id="img" href="Images/Cover%20Art.jpg" media-type="image/jpeg" />
        `,
        `<meta name="cover" content="cover-page" />`,
      ),
      {
        'OPS/Text/cover.xhtml': `
          <html xmlns="http://www.w3.org/1999/xhtml">
            <body>
              <img src='../Images/Cover%20Art.jpg' />
            </body>
          </html>
        `,
        'OPS/Images/Cover Art.jpg': bytes('meta-wrapper'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('meta-wrapper')
  })

  it('falls back to manifest items with id="cover" even when they point to XHTML', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="cover" href="Text/front.xhtml" media-type="application/xhtml+xml" />
      `),
      {
        'OPS/Text/front.xhtml': `
          <html xmlns="http://www.w3.org/1999/xhtml">
            <body>
              <svg xmlns:xlink="http://www.w3.org/1999/xlink">
                <image xlink:href="../Images/front.png" />
              </svg>
            </body>
          </html>
        `,
        'OPS/Images/front.png': bytes('id-cover'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('id-cover')
  })

  it('falls back to manifest hrefs that look like cover assets', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="chapter-1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        <item id="asset-1" href="Images/book-cover.jpeg" media-type="image/jpeg" />
      `),
      {
        'OPS/Images/book-cover.jpeg': bytes('href-cover'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('href-cover')
  })

  it('uses guide cover references when the manifest does not expose a direct hint', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="frontmatter" href="Text/frontmatter.xhtml" media-type="application/xhtml+xml" />
        `,
        '',
        `<reference type="cover" title="Cover" href="Text/frontmatter.xhtml#cover" />`,
      ),
      {
        'OPS/Text/frontmatter.xhtml': `
          <html xmlns="http://www.w3.org/1999/xhtml">
            <body>
              <img src="../Images/plate01.jpg" />
            </body>
          </html>
        `,
        'OPS/Images/plate01.jpg': bytes('guide-cover'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('guide-cover')
  })

  it('uses the first manifest image as a final fallback', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="chapter-1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        <item id="asset-a" href="Images/page01.png" media-type="image/png" />
        <item id="asset-b" href="Images/page02.png" media-type="image/png" />
      `),
      {
        'OPS/Images/page01.png': bytes('first-image'),
        'OPS/Images/page02.png': bytes('second-image'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('first-image')
  })

  it('tries meta cover ids with extensions before treating them as direct paths', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="x1.png" href="Images/real-cover.jpg" media-type="image/jpeg" />
        `,
        `<meta name="cover" content="x1.png" />`,
      ),
      {
        'OPS/Images/real-cover.jpg': bytes('id-with-extension'),
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(await blobText(metadata.coverBlob)).toBe('id-with-extension')
  })

  it('generates a deterministic SVG cover when the EPUB has no images', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="chapter-1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
      `),
      {
        'OPS/Text/chapter1.xhtml': '<html><body><p>Text-only book.</p></body></html>',
      },
    )

    const metadata = await EpubService.parseMetadata(makeFile())

    expect(metadata.coverBlob?.type).toBe('image/svg+xml')
    expect(await blobText(metadata.coverBlob)).toContain('Test Book')
  })
})

describe('EpubService.parseExtras - toc extraction', () => {
  beforeEach(() => {
    fflateState.files = {}
  })

  it('extracts EPUB3 nav entries with flexible attributes and normalized hrefs', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item
          id='nav'
          href='Navigation/nav.xhtml'
          media-type='application/xhtml+xml'
          properties='nav'
        />
      `),
      {
        'OPS/Navigation/nav.xhtml': `
          <html xmlns:epub="http://www.idpf.org/2007/ops">
            <body>
              <nav epub:type="toc">
                <ol>
                  <li>
                    <a href="../Text/part.xhtml">Part I</a>
                    <ol>
                      <li><a href="../Text/Chapter%201.xhtml#start">Chapter 1</a></li>
                    </ol>
                  </li>
                </ol>
              </nav>
            </body>
          </html>
        `,
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.toc).toEqual([
      {
        label: 'Part I',
        href: 'OPS/Text/part.xhtml',
        subitems: [
          { label: 'Chapter 1', href: 'OPS/Text/Chapter 1.xhtml#start' },
        ],
      },
    ])
  })

  it('uses the first navigable child for EPUB3 span groups', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(`
        <item id="nav" href="Navigation/nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
      `),
      {
        'OPS/Navigation/nav.xhtml': `
          <html xmlns:epub="http://www.idpf.org/2007/ops">
            <body>
              <nav epub:type="toc">
                <ol>
                  <li>
                    <span>Part I</span>
                    <ol>
                      <li><a href="../Text/chapter1.xhtml">Chapter 1</a></li>
                      <li><a href="../Text/chapter2.xhtml">Chapter 2</a></li>
                    </ol>
                  </li>
                </ol>
              </nav>
            </body>
          </html>
        `,
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.toc).toEqual([
      {
        label: 'Part I',
        href: 'OPS/Text/chapter1.xhtml',
        subitems: [
          { label: 'Chapter 1', href: 'OPS/Text/chapter1.xhtml' },
          { label: 'Chapter 2', href: 'OPS/Text/chapter2.xhtml' },
        ],
      },
    ])
  })

  it('extracts EPUB2 toc.ncx entries and preserves fragments', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="ncx" href="Navigation/toc.ncx" media-type="application/x-dtbncx+xml" />
        `,
        '',
        '',
        '<spine toc="ncx" />',
      ),
      {
        'OPS/Navigation/toc.ncx': `
          <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
            <navMap>
              <navPoint id="p1" playOrder="1">
                <navLabel><text>Chapter 1</text></navLabel>
                <content src="../Text/chapter1.xhtml#heading" />
              </navPoint>
            </navMap>
          </ncx>
        `,
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.toc).toEqual([
      { label: 'Chapter 1', href: 'OPS/Text/chapter1.xhtml#heading' },
    ])
  })

  it('extracts a real preview excerpt and style diagnostics from the reading spine', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        `,
        '',
        '',
        '<spine><itemref id="chapter1" /></spine>',
      ),
      {
        'OPS/Text/chapter1.xhtml': `
          <html xmlns="http://www.w3.org/1999/xhtml">
            <head>
              <style>
                body { background-color: #fff; }
                p { color: #000; font-size: 10px; line-height: 1.1; }
              </style>
            </head>
            <body>
              <p>Trecho real do livro usado para conferir a leitura com fonte, tema e espacamento.</p>
            </body>
          </html>
        `,
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.previewText).toContain('Trecho real do livro usado para conferir a leitura')
    expect(extras.styleDiagnostics.map((diagnostic) => diagnostic.issue)).toEqual([
      'hardcoded-text-color',
      'hardcoded-background-color',
      'small-font-size',
      'tight-line-height',
    ])
  })

  it('infers language from reading documents when OPF language is missing or undetermined', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        `,
        '<dc:language>UND</dc:language>',
        '',
        '<spine><itemref idref="chapter1" /></spine>',
      ),
      {
        'OPS/Text/chapter1.xhtml': `
          <html xml:lang="pt-BR">
            <body><p>Texto real do livro para detectar idioma.</p></body>
          </html>
        `,
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.language).toBe('pt-BR')
  })

  it('skips copyright and archive notices when building the reading preview', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="notice" href="Text/notice.xhtml" media-type="application/xhtml+xml" />
          <item id="copyright" href="Text/copyright.xhtml" media-type="application/xhtml+xml" />
          <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        `,
        '',
        '',
        '<spine><itemref idref="notice" /><itemref idref="copyright" /><itemref idref="chapter1" /></spine>',
      ),
      {
        'OPS/Text/notice.xhtml': '<html><body><p>This book was produced in EPUB format by the Internet Archive.</p></body></html>',
        'OPS/Text/copyright.xhtml': '<html><body><p>Copyright 2024 All rights reserved.</p></body></html>',
        'OPS/Text/chapter1.xhtml': '<html><body><p>Actual reading text from the first useful chapter appears here.</p></body></html>',
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.previewText).toContain('Actual reading text')
  })

  it('sanitizes TOC hrefs against the spine and strips missing fragments', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="nav" href="Navigation/nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
          <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
          <item id="chapter2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml" />
        `,
        '',
        '',
        '<spine><itemref idref="chapter1" /><itemref idref="chapter2" /></spine>',
      ),
      {
        'OPS/Navigation/nav.xhtml': `
          <html xmlns:epub="http://www.idpf.org/2007/ops">
            <body>
              <nav epub:type="toc">
                <ol>
                  <li><a href="../Text/missing.xhtml">Missing</a></li>
                  <li><a href="../Text/chapter2.xhtml#absent">Second</a></li>
                  <li><a href="../Text/chapter1.xhtml#start">First</a></li>
                </ol>
              </nav>
            </body>
          </html>
        `,
        'OPS/Text/chapter1.xhtml': '<html><body><h1 id="start">First</h1><p>First chapter text for reading.</p></body></html>',
        'OPS/Text/chapter2.xhtml': '<html><body><h1>Second</h1><p>Second chapter text for reading.</p></body></html>',
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.toc).toEqual([
      { label: 'First', href: 'OPS/Text/chapter1.xhtml#start' },
      { label: 'Second', href: 'OPS/Text/chapter2.xhtml' },
    ])
  })

  it('builds a synthetic TOC from the spine when nav and ncx are empty', async () => {
    fflateState.files = makeEpubFiles(
      'OPS/package.opf',
      makeOpf(
        `
          <item id="chapter1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml" />
        `,
        '',
        '',
        '<spine><itemref idref="chapter1" /></spine>',
      ),
      {
        'OPS/Text/chapter1.xhtml': '<html><head><title>Fallback Chapter</title></head><body><p>Reading text.</p></body></html>',
      },
    )

    const extras = await EpubService.parseExtras(new Blob(['epub']))

    expect(extras.toc).toEqual([
      { label: 'Fallback Chapter', href: 'OPS/Text/chapter1.xhtml' },
    ])
  })
})

describe('EpubService.parseExtras - cache de sessão', () => {
  const MINIMAL_EPUB = makeEpubFiles('package.opf', makeOpf(''), {})

  beforeEach(() => {
    fflateState.files = MINIMAL_EPUB
  })

  it('retorna o mesmo resultado sem reprocessar o ZIP na segunda chamada', async () => {
    const bookId = 9001
    EpubService.invalidateExtrasCache(bookId)

    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    const blob = { arrayBuffer } as unknown as Blob

    await EpubService.parseExtras(blob, bookId)
    await EpubService.parseExtras(blob, bookId)

    // arrayBuffer é chamado apenas na primeira — segunda vem do cache
    expect(arrayBuffer).toHaveBeenCalledTimes(1)
  })

  it('processa o ZIP separadamente para bookIds diferentes', async () => {
    EpubService.invalidateExtrasCache(9002)
    EpubService.invalidateExtrasCache(9003)

    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    const blob = { arrayBuffer } as unknown as Blob

    await EpubService.parseExtras(blob, 9002)
    await EpubService.parseExtras(blob, 9003)

    expect(arrayBuffer).toHaveBeenCalledTimes(2)
  })

  it('sem bookId nunca usa cache — cada chamada processa o ZIP', async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    const blob = { arrayBuffer } as unknown as Blob

    await EpubService.parseExtras(blob)
    await EpubService.parseExtras(blob)

    expect(arrayBuffer).toHaveBeenCalledTimes(2)
  })

  it('invalidateExtrasCache força reprocessamento na próxima chamada', async () => {
    const bookId = 9004
    EpubService.invalidateExtrasCache(bookId)

    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    const blob = { arrayBuffer } as unknown as Blob

    await EpubService.parseExtras(blob, bookId)
    EpubService.invalidateExtrasCache(bookId)
    await EpubService.parseExtras(blob, bookId)

    expect(arrayBuffer).toHaveBeenCalledTimes(2)
  })

  it('chamadas simultâneas com mesmo bookId disparam apenas um unzip', async () => {
    const bookId = 9005
    EpubService.invalidateExtrasCache(bookId)

    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    const blob = { arrayBuffer } as unknown as Blob

    // Dispara as duas sem await intermediário
    await Promise.all([
      EpubService.parseExtras(blob, bookId),
      EpubService.parseExtras(blob, bookId),
    ])

    expect(arrayBuffer).toHaveBeenCalledTimes(1)
  })
})
