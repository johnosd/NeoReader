import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PDF_TEXT_ATTR_FIGURE,
  PDF_TEXT_ATTR_RANGES,
  PDF_TEXT_ATTR_START,
  arrangeChunkBlocks,
  buildChunkXhtml,
  createPdfTextBook,
  pdfTextSectionHref,
  type PdfTextBookOptions,
  type PdfTextBookSource,
} from '@/services/pdf/PdfTextBookBuilder'
import { PdfTextExtractor } from '@/services/pdf/PdfTextExtractor'
import type { PdfDocumentProxy, PdfPageProxy } from '@/services/pdf/pdfjs'
import { buildPdfChunks, type PdfChunk } from '@/utils/pdfChunks'
import { buildRawPageText } from '@/utils/pdfLocator'
import type { PdfBlock } from '@/utils/pdfParagraphs'
import { loadPdfFixture, type PdfFixture } from '../../testUtils/pdfFixtures'

// pdf.js falso que devolve os itens reais das fixtures: exercita o PdfTextExtractor de verdade.
function fakePdfFromFixture(fixture: PdfFixture): PdfDocumentProxy {
  return {
    numPages: fixture.pages.length,
    getPage: async (pageNumber: number) => {
      const page = fixture.pages[pageNumber - 1]
      return {
        getViewport: () => ({ width: page.viewport.width, height: page.viewport.height }),
        getTextContent: async () => ({ items: page.items }),
        cleanup: () => {},
      } as unknown as PdfPageProxy
    },
  } as unknown as PdfDocumentProxy
}

const OPTIONS: PdfTextBookOptions = {
  title: 'Livro',
  author: 'Autora',
  language: 'en',
  labels: {
    figure: (n) => `Figura (página ${n})`,
    pageAsImage: (n) => `Página ${n} como no original`,
  },
}

function sourceFromFixture(name: string, chunks?: PdfChunk[]): PdfTextBookSource & { renderImage: ReturnType<typeof vi.fn> } {
  const fixture = loadPdfFixture(name)
  const extractor = new PdfTextExtractor(fakePdfFromFixture(fixture))
  return {
    chunks: chunks ?? buildPdfChunks(fixture.pages.length, null),
    reconstructChunk: (chunk) => extractor.reconstructChunk(chunk),
    getPagesShownAsImage: (chunk) => extractor.getPagesShownAsImage(chunk),
    renderImage: vi.fn(async () => new Blob(['img'], { type: 'image/jpeg' })),
  }
}

async function loadDoc(book: ReturnType<typeof createPdfTextBook>, index: number): Promise<Document> {
  return book.sections[index].createDocument()
}

let urlCounter = 0
const created: string[] = []
const revoked: string[] = []

beforeEach(() => {
  urlCounter = 0
  created.length = 0
  revoked.length = 0
  // jsdom não implementa createObjectURL.
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
    createObjectURL: vi.fn(() => {
      const url = `blob:nr/${++urlCounter}`
      created.push(url)
      return url
    }),
    revokeObjectURL: vi.fn((url: string) => { revoked.push(url) }),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Três trechos com rótulo de sumário, incluindo um curtíssimo (só título + 1 linha seria pulado como stub).
const OUTLINE_CHUNKS: PdfChunk[] = [
  { index: 0, startPage: 0, endPage: 1, label: 'Abertura' },
  { index: 1, startPage: 2, endPage: 6, label: 'Capítulo 1' },
  { index: 2, startPage: 7, endPage: 11, label: 'Capítulo 2' },
]

describe('PdfTextBookBuilder — invariantes do EpubViewer (T045a, R-011)', () => {
  it('toda seção tem data-type="chapter" na raiz e nenhum data-pdf-bookmark', async () => {
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS)

    for (let i = 0; i < book.sections.length; i++) {
      const doc = await loadDoc(book, i)
      const root = doc.body.firstElementChild
      expect(root?.getAttribute('data-type')).toBe('chapter')
      expect(doc.querySelector('[data-pdf-bookmark]')).toBeNull()
      expect(doc.querySelector('parsererror')).toBeNull()
    }
  })

  it('não expõe transformTarget, entries nem resources', () => {
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS) as unknown as Record<string, unknown>
    expect(book.transformTarget).toBeUndefined()
    expect(book.entries).toBeUndefined()
    expect(book.resources).toBeUndefined()
  })

  it('cada href do sumário resolve pelo próprio livro para o índice de seção certo', () => {
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS)
    const ids = book.sections.map((s) => s.id)

    expect(book.toc.map((item) => item.label)).toEqual(['Abertura', 'Capítulo 1', 'Capítulo 2'])
    book.toc.forEach((item, chunkIndex) => {
      const [id, fragment] = book.splitTOCHref(item.href)
      expect(ids.indexOf(id)).toBe(chunkIndex)
      expect(fragment).toBeUndefined()
      expect(book.resolveHref(item.href)?.index).toBe(chunkIndex)
    })
    expect(book.resolveHref('nao-existe.xhtml')).toBeNull()
    expect(book.resolveHref(`${pdfTextSectionHref(2)}#x`)?.index).toBe(2)
  })

  it('é reflowable (o foliate usa o paginator de texto, não o de layout fixo)', () => {
    const book = createPdfTextBook(sourceFromFixture('1col'), OPTIONS)
    expect(book.rendition.layout).toBe('reflowable')
    expect(book.metadata.language).toBe('en')
  })
})

describe('PdfTextBookBuilder — conteúdo (T039)', () => {
  it('gera uma seção por trecho, com parágrafos e títulos reconstruídos', async () => {
    const source = sourceFromFixture('1col', OUTLINE_CHUNKS)
    const book = createPdfTextBook(source, OPTIONS)
    expect(book.sections).toHaveLength(OUTLINE_CHUNKS.length)

    const doc = await loadDoc(book, 1)
    const blocks = await source.reconstructChunk(OUTLINE_CHUNKS[1])
    const paragraphs = Array.from(doc.querySelectorAll('p'))
    expect(paragraphs.length).toBe(blocks.filter((b) => b.kind === 'paragraph').length)
    expect(paragraphs.length).toBeGreaterThan(5)
    // Texto do HTML = texto reconstruído (sem hífen de quebra nem quebra física de linha).
    expect(paragraphs[0].textContent).toBe(blocks.find((b) => b.kind === 'paragraph')?.text)
    expect(paragraphs.every((p) => !p.textContent?.includes('\n'))).toBe(true)
    const headings = doc.querySelectorAll('h1, h2, h3')
    expect(headings.length).toBe(blocks.filter((b) => b.kind === 'heading').length)
  })

  it('grava offsets do texto bruto em cada bloco (localizador independente da heurística)', async () => {
    const fixture = loadPdfFixture('1col')
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS)
    const doc = await loadDoc(book, 1)

    for (const el of Array.from(doc.querySelectorAll('p'))) {
      const [page, offset] = el.getAttribute(PDF_TEXT_ATTR_START)!.split(':').map(Number)
      const ranges = el.getAttribute(PDF_TEXT_ATTR_RANGES)!.split(';').map((r) => {
        const [p, span] = r.split(':')
        const [start, end] = span.split('-').map(Number)
        return { p: Number(p), start, end }
      })
      expect(ranges[0]).toMatchObject({ p: page, start: offset })
      // A primeira palavra do parágrafo está no texto bruto exatamente nesse offset.
      const raw = buildRawPageText(fixture.pages[page].items)
      const firstWord = el.textContent!.split(/\s/)[0].replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4)
      if (firstWord) expect(raw.slice(offset, ranges[0].end)).toContain(firstWord)
    }
  })

  it('figura vira placeholder com imagem recortada e legenda (FR-009)', async () => {
    const source = sourceFromFixture('tabelas')
    const book = createPdfTextBook(source, OPTIONS)
    const doc = await loadDoc(book, 0)

    const figures = Array.from(doc.querySelectorAll(`figure[${PDF_TEXT_ATTR_FIGURE}="figure"]`))
    expect(figures.length).toBeGreaterThan(0)
    for (const figure of figures) {
      expect(figure.querySelector('img')?.getAttribute('src')).toMatch(/^blob:nr\//)
      expect(figure.querySelector('figcaption')?.textContent).toMatch(/^Figura \(página \d+\)$/)
    }
    expect(source.renderImage).toHaveBeenCalledWith(expect.objectContaining({ region: expect.objectContaining({ yTop: expect.any(Number) }) }))
  })

  it('página sem texto aparece como imagem da página inteira, no lugar certo da leitura', async () => {
    // misto.pdf: páginas escaneadas no meio de páginas com texto.
    const fixture = loadPdfFixture('misto')
    const noText = fixture.pages.filter((p) => !p.items.some((i) => i.str.trim())).map((p) => p.pageIndex)
    expect(noText.length).toBeGreaterThan(0)

    const source = sourceFromFixture('misto', [{ index: 0, startPage: 0, endPage: fixture.pages.length - 1, label: 'Tudo' }])
    const book = createPdfTextBook(source, OPTIONS)
    const doc = await loadDoc(book, 0)

    const pageFigures = Array.from(doc.querySelectorAll(`figure[${PDF_TEXT_ATTR_FIGURE}="page"]`))
    expect(pageFigures.map((f) => Number(f.getAttribute(PDF_TEXT_ATTR_START)!.split(':')[0]))).toEqual(noText)
    expect(pageFigures[0].querySelector('img')).not.toBeNull()
    expect(source.renderImage).toHaveBeenCalledWith({ pageIndex: noText[0], region: null })

    // Ordem de leitura: tudo antes da página-imagem é de páginas anteriores, tudo depois, de posteriores.
    const all = Array.from(doc.querySelectorAll(`[${PDF_TEXT_ATTR_START}]`))
    const pages = all.map((el) => Number(el.getAttribute(PDF_TEXT_ATTR_START)!.split(':')[0]))
    expect([...pages].sort((a, b) => a - b)).toEqual(pages)
  })

  it('ordem de colunas incerta: os blocos da página saem e entra a página como na original', () => {
    const blocks: PdfBlock[] = [
      { kind: 'paragraph', text: 'a', pageIndex: 3, ranges: [{ pageIndex: 3, start: 0, end: 1 }] },
      { kind: 'paragraph', text: 'b', pageIndex: 4, ranges: [{ pageIndex: 4, start: 0, end: 1 }] },
      { kind: 'paragraph', text: 'c', pageIndex: 4, ranges: [{ pageIndex: 4, start: 2, end: 3 }] },
      { kind: 'paragraph', text: 'd', pageIndex: 5, ranges: [{ pageIndex: 5, start: 0, end: 1 }] },
    ]
    const arranged = arrangeChunkBlocks(blocks, [{ pageIndex: 4, rawLength: 900 }])
    expect(arranged.map((item) => (item.type === 'page' ? `page${item.pageIndex}` : item.block.text))).toEqual(['a', 'page4', 'd'])

    const chunk: PdfChunk = { index: 0, startPage: 3, endPage: 5, label: 'T' }
    const doc = new DOMParser().parseFromString(buildChunkXhtml(chunk, arranged, OPTIONS), 'application/xhtml+xml')
    const page = doc.querySelector(`figure[${PDF_TEXT_ATTR_FIGURE}="page"]`)!
    expect(page.getAttribute(PDF_TEXT_ATTR_RANGES)).toBe('4:0-900')
    expect(page.querySelector('figcaption')?.textContent).toBe('Página 5 como no original')
  })

  it('escapa texto e remove caracteres inválidos em XML (o parse da seção não quebra)', () => {
    const chunk: PdfChunk = { index: 0, startPage: 0, endPage: 0, label: 'A & B <c>' }
    const block: PdfBlock = { kind: 'paragraph', text: 'x < y && "z"\u0001\u000B', pageIndex: 0, ranges: [{ pageIndex: 0, start: 0, end: 9 }] }
    const xhtml = buildChunkXhtml(chunk, [{ type: 'block', block }], OPTIONS)
    const doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('p')?.textContent).toBe('x < y && "z"')
    expect(doc.title).toBe('A & B <c>')
  })

  it('sem renderer de imagem a figura fica só com a legenda', async () => {
    const source = sourceFromFixture('tabelas')
    const book = createPdfTextBook({ ...source, renderImage: undefined }, OPTIONS)
    const doc = await loadDoc(book, 0)
    const figure = doc.querySelector(`figure[${PDF_TEXT_ATTR_FIGURE}]`)!
    expect(figure.querySelector('img')).toBeNull()
    expect(figure.querySelector('figcaption')).not.toBeNull()
  })
})

describe('PdfTextBookBuilder — ciclo de vida', () => {
  it('load devolve URL blob estável; unload e destroy soltam as URLs (sem tocar no PDF)', async () => {
    const source = sourceFromFixture('tabelas')
    const reconstruct = vi.spyOn(source, 'reconstructChunk')
    const book = createPdfTextBook(source, OPTIONS)

    const [a, b] = await Promise.all([book.sections[0].load(), book.sections[0].load()])
    expect(a).toBe(b)
    expect(reconstruct).toHaveBeenCalledTimes(1) // cargas simultâneas compartilham o trabalho

    book.sections[0].unload()
    expect(revoked).toContain(a)
    // Imagens das figuras também foram soltas.
    expect(revoked.length).toBe(created.length)

    const again = await book.sections[0].load()
    expect(again).not.toBe(a)
    book.destroy()
    expect(revoked).toContain(again)
    expect(revoked.length).toBe(created.length)
  })

  it('entrega o conteúdo por loadContent (srcdoc → documento HTML), onde o bloco de tradução do EpubViewer cabe', async () => {
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS)
    const content = await book.sections[1].loadContent()
    expect(content).toContain('data-type="chapter"')

    // Em documento XML este innerHTML lança ("invalid XML") — achado no E2E do Word Lens no modo texto.
    const doc = await book.sections[1].createDocument()
    expect(doc.contentType).toBe('text/html')
    const block = doc.createElement('div')
    expect(() => { block.innerHTML = '<section class="nr-wl-definition-slot" hidden></section>' }).not.toThrow()
  })

  it('seção com tamanho estimado proporcional às páginas do trecho', () => {
    const book = createPdfTextBook(sourceFromFixture('1col', OUTLINE_CHUNKS), OPTIONS)
    expect(book.sections[1].size).toBeGreaterThan(book.sections[0].size)
    expect(book.sections.every((s) => s.linear === 'yes')).toBe(true)
  })
})
