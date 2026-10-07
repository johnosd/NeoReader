import { describe, expect, it } from 'vitest'
import * as CFI from 'foliate-js/epubcfi.js'

import { PdfLocatorResolver, pdfTextBlocks } from '@/services/pdf/PdfLocatorResolver'
import { createPdfTextBook, PDF_TEXT_ATTR_RANGES, type PdfTextBook } from '@/services/pdf/PdfTextBookBuilder'
import { PdfTextExtractor } from '@/services/pdf/PdfTextExtractor'
import type { PdfDocumentProxy, PdfPageProxy } from '@/services/pdf/pdfjs'
import type { PdfChunk } from '@/utils/pdfChunks'
import { buildRawPageText, formatPdfPoint, formatPdfRange, parsePdfPoint, parsePdfRange, type PdfPoint } from '@/utils/pdfLocator'
import { loadPdfFixture } from '../../testUtils/pdfFixtures'

function fixtureBook(name: string, chunks: PdfChunk[]): { book: PdfTextBook; resolver: PdfLocatorResolver } {
  const fixture = loadPdfFixture(name)
  const pdf = {
    numPages: fixture.pages.length,
    getPage: async (n: number) => ({
      getViewport: () => fixture.pages[n - 1].viewport,
      getTextContent: async () => ({ items: fixture.pages[n - 1].items }),
      cleanup: () => {},
    }) as unknown as PdfPageProxy,
  } as unknown as PdfDocumentProxy
  const extractor = new PdfTextExtractor(pdf)
  const book = createPdfTextBook({
    chunks,
    reconstructChunk: (chunk) => extractor.reconstructChunk(chunk),
    getPagesShownAsImage: (chunk) => extractor.getPagesShownAsImage(chunk),
  }, {
    title: 'T', author: 'A', labels: { figure: (n) => `Figura ${n}`, pageAsImage: (n) => `Página ${n}` },
  })
  return { book, resolver: new PdfLocatorResolver(book, chunks) }
}

const CHUNKS: PdfChunk[] = [
  { index: 0, startPage: 0, endPage: 4, label: 'A' },
  { index: 1, startPage: 5, endPage: 11, label: 'B' },
]

const spansOf = (el: Element) => el.getAttribute(PDF_TEXT_ATTR_RANGES)!.split(';').map((part) => {
  const [page, span] = part.split(':')
  const [start, end] = span.split('-').map(Number)
  return { pageIndex: Number(page), start, end }
})

// O mesmo CFI que o EpubViewer calcula para um parágrafo (view.getCFI com o range no início do <p>).
function viewerParagraphCfi(index: number, para: Element): string {
  const range = para.ownerDocument.createRange()
  range.selectNodeContents(para)
  range.collapse(true)
  return CFI.joinIndir(CFI.fake.fromIndex(index), CFI.fromRange(range))
}

describe('PdfLocatorResolver — localizador ↔ CFI do livro sintético (T040)', () => {
  it('início de parágrafo: CFI idêntico ao do EpubViewer e ida e volta exata', async () => {
    const { book, resolver } = fixtureBook('1col', CHUNKS)
    const doc = (await book.getSectionDocument(1))!
    const paragraphs = Array.from(doc.querySelectorAll('p'))
    expect(paragraphs.length).toBeGreaterThan(5)

    for (const para of paragraphs) {
      const start = spansOf(para)[0]
      const locator = formatPdfPoint({ pageIndex: start.pageIndex, offset: start.start })
      const cfi = await resolver.locatorToCfi(locator)
      expect(cfi).toBe(viewerParagraphCfi(1, para))
      expect(await resolver.cfiToLocator(cfi)).toBe(locator)
    }
  })

  it('ponto no meio do parágrafo volta ao mesmo parágrafo, perto do offset original', async () => {
    const { book, resolver } = fixtureBook('1col', CHUNKS)
    const doc = (await book.getSectionDocument(1))!
    const para = Array.from(doc.querySelectorAll('p')).find((p) => (p.textContent?.length ?? 0) > 200)!
    const span = spansOf(para)[0]
    const original: PdfPoint = { pageIndex: span.pageIndex, offset: span.start + Math.floor((span.end - span.start) / 2) }

    const back = parsePdfPoint(await resolver.cfiToLocator(await resolver.locatorToCfi(formatPdfPoint(original))))!
    expect(back.pageIndex).toBe(original.pageIndex)
    // Proporcional: o texto exibido não tem as quebras/hífens do bruto, então aceita alguns caracteres.
    expect(Math.abs(back.offset - original.offset)).toBeLessThanOrEqual(3)
  })

  it('intervalo dentro de um parágrafo vira CFI de intervalo e volta como intervalo', async () => {
    const { book, resolver } = fixtureBook('1col', CHUNKS)
    const doc = (await book.getSectionDocument(1))!
    const para = Array.from(doc.querySelectorAll('p')).find((p) => (p.textContent?.length ?? 0) > 200)!
    const span = spansOf(para)[0]
    const range = { start: { pageIndex: span.pageIndex, offset: span.start + 10 }, end: { pageIndex: span.pageIndex, offset: span.start + 60 } }

    const cfi = await resolver.locatorToCfi(formatPdfRange(range))
    expect(cfi).toMatch(/^epubcfi\(.+,.+,.+\)$/)
    const back = parsePdfRange(await resolver.cfiToLocator(cfi))!
    expect(Math.abs(back.start.offset - range.start.offset)).toBeLessThanOrEqual(3)
    expect(Math.abs(back.end.offset - range.end.offset)).toBeLessThanOrEqual(3)
  })

  it('ponto fora de qualquer bloco (número de página removido) cai no próximo parágrafo', async () => {
    const { book, resolver } = fixtureBook('1col', CHUNKS)
    const doc = (await book.getSectionDocument(1))!
    const blocks = pdfTextBlocks(doc).map((el) => ({ el, spans: spansOf(el) }))
    const page = CHUNKS[1].startPage
    const raw = buildRawPageText(loadPdfFixture('1col').pages[page].items)
    // 1º caractere visível da página que nenhum bloco cobre (rodapé/número de página).
    const uncovered = [...raw].findIndex((ch, offset) => ch.trim() &&
      !blocks.some(({ spans }) => spans.some((s) => s.pageIndex === page && offset >= s.start && offset < s.end)))
    expect(uncovered).toBeGreaterThanOrEqual(0)
    const point = { pageIndex: page, offset: uncovered }
    const next = blocks.map(({ spans }) => spans[0]).find((s) => s.pageIndex > page || (s.pageIndex === page && s.start >= uncovered))!

    const cfi = await resolver.locatorToCfi(formatPdfPoint(point))
    expect(await resolver.cfiToLocator(cfi)).toBe(formatPdfPoint({ pageIndex: next.pageIndex, offset: next.start }))
  })

  it('parágrafo que atravessa a virada de trecho é achado no trecho onde começa (DI-009)', async () => {
    // Na fixture, o parágrafo que começa no fim da pág. 5 continua na pág. 6.
    const chunks: PdfChunk[] = [
      { index: 0, startPage: 0, endPage: 5, label: 'A' },
      { index: 1, startPage: 6, endPage: 11, label: 'B' },
    ]
    const { book, resolver } = fixtureBook('1col', chunks)
    const doc0 = (await book.getSectionDocument(0))!
    const crossing = pdfTextBlocks(doc0).find((el) => spansOf(el).some((s) => s.pageIndex === 6))
    expect(crossing).toBeDefined()
    const tail = spansOf(crossing!).find((s) => s.pageIndex === 6)!

    const cfi = await resolver.locatorToCfi(formatPdfPoint({ pageIndex: 6, offset: tail.start + 1 }))
    expect(cfi?.startsWith('epubcfi(/6/2!')).toBe(true) // seção 0
    expect(parsePdfPoint(await resolver.cfiToLocator(cfi))?.pageIndex).toBe(6)
  })

  it('CFI do documento ao vivo (bloco de tradução antes + spans de Word Lens) acha o parágrafo certo', async () => {
    const { book, resolver } = fixtureBook('1col', CHUNKS)
    const live = (await book.getSectionDocument(1))!
    const paragraphs = Array.from(live.querySelectorAll('p'))
    const target = paragraphs[3]
    const expected = spansOf(target)[0]

    // Como o EpubViewer faz: bloco de tradução logo após um parágrafo anterior (desloca índices)...
    const translation = live.createElement('div')
    translation.id = 'nr-translation-block'
    paragraphs[1].after(translation)
    // ...e a 2ª palavra do alvo embrulhada num span (Word Lens).
    const text = target.firstChild as Text
    const secondWord = text.data.indexOf(' ') + 1
    const wordEnd = text.data.indexOf(' ', secondWord)
    const word = text.splitText(secondWord)
    word.splitText(wordEnd - secondWord)
    const span = live.createElement('span')
    span.className = 'nr-wl'
    word.replaceWith(span)
    span.append(word)

    expect(await resolver.cfiToLocator(viewerParagraphCfi(1, target))).toBe(formatPdfPoint({ pageIndex: expected.pageIndex, offset: expected.start }))

    // Seleção começando dentro do span: o texto selecionado (dica) recupera o início exato.
    const selection = live.createRange()
    selection.setStart(word, 0)
    selection.setEnd(target.lastChild!, 5)
    const selectedText = selection.toString()
    const cfi = CFI.joinIndir(CFI.fake.fromIndex(1), CFI.fromRange(selection))
    const back = parsePdfRange(await resolver.cfiToLocator(cfi, selectedText))!
    const clean = (await book.getSectionDocument(1))!
    const cleanPara = clean.getElementById(target.id)!
    const expectedStart = parsePdfPoint(await resolver.cfiToLocator(
      CFI.joinIndir(CFI.fake.fromIndex(1), CFI.fromRange((() => {
        const r = clean.createRange()
        r.setStart(cleanPara.firstChild!, secondWord)
        return r
      })())),
    ))!
    expect(back.start).toEqual(expectedStart)
    expect(back.end.offset).toBeGreaterThan(back.start.offset)
  })

  it('localizador inválido ou fora do livro devolve null', async () => {
    const { resolver } = fixtureBook('1col', CHUNKS)
    expect(await resolver.locatorToCfi('lixo')).toBeNull()
    expect(await resolver.locatorToCfi(formatPdfPoint({ pageIndex: 99, offset: 0 }))).toBeNull()
    expect(await resolver.cfiToLocator('epubcfi(/6/40!/4/2/2)')).toBeNull()
    expect(await resolver.cfiToLocator(null)).toBeNull()
  })
})
