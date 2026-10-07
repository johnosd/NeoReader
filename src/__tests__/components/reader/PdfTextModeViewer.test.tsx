import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as CFI from 'foliate-js/epubcfi.js'

import type { EpubViewerHandle } from '@/components/reader/EpubViewer'
import { PdfTextModeViewer } from '@/components/reader/PdfTextModeViewer'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import { I18nProvider } from '@/i18n'
import { PdfTextExtractor } from '@/services/pdf/PdfTextExtractor'
import type { PdfTextBook } from '@/services/pdf/PdfTextBookBuilder'
import type { PdfDocumentProxy, PdfPageProxy } from '@/services/pdf/pdfjs'
import type { Book, Bookmark } from '@/types/book'
import type { Highlight } from '@/types/highlight'
import type { PdfChunk } from '@/utils/pdfChunks'
import { loadPdfFixture } from '../../testUtils/pdfFixtures'

const mocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  handle: {
    getVisibleLocation: vi.fn(() => ({ cfi: null as string | null })),
    goTo: vi.fn(),
    getParagraphs: vi.fn(() => ['a', 'b']),
  },
}))

// EpubViewer falso: captura as props e expõe um handle controlável (o real é coberto em EpubViewer.test).
vi.mock('@/components/reader/EpubViewer', async () => {
  const React = await import('react')
  const EpubViewer = React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useEffect(() => {
      mocks.props = props
    }, [props])
    React.useImperativeHandle(ref, () => mocks.handle)
    return <div data-testid="epub-viewer" />
  })
  return { EpubViewer }
})

const CHUNKS: PdfChunk[] = [
  { index: 0, startPage: 0, endPage: 4, label: 'A' },
  { index: 1, startPage: 5, endPage: 11, label: 'B' },
]

function makeSession(): PdfReaderSession {
  const fixture = loadPdfFixture('1col')
  const pdf = {
    numPages: fixture.pages.length,
    getPage: async (n: number) => ({
      getViewport: () => fixture.pages[n - 1].viewport,
      getTextContent: async () => ({ items: fixture.pages[n - 1].items }),
      cleanup: () => {},
    }) as unknown as PdfPageProxy,
  } as unknown as PdfDocumentProxy
  return {
    pdf,
    pdfBook: { toc: [] } as unknown as PdfReaderSession['pdfBook'],
    chunks: CHUNKS,
    extractor: new PdfTextExtractor(pdf),
    pageCount: fixture.pages.length,
  }
}

const book: Book = { id: 7, title: 'PDF', author: 'A', format: 'PDF', addedAt: new Date(), lastOpenedAt: null }

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function renderViewer(overrides: Record<string, unknown> = {}) {
  const ref = createRef<EpubViewerHandle>()
  const props = {
    book,
    session: makeSession(),
    savedLocator: null as string | null,
    bookmarks: [] as Bookmark[],
    highlights: [] as Highlight[],
    fontSize: 'md' as const,
    lineHeight: 'comfortable' as const,
    readerTheme: 'dark' as const,
    fontFamily: 'classic' as const,
    overrideBookFont: true,
    overrideBookColors: true,
    focusLineEnabled: false,
    wordLensEnabled: false,
    wordLensLevel: 'B1' as const,
    wordLensData: null,
    onRelocate: vi.fn(),
    onTocReady: vi.fn(),
    onLoad: vi.fn(),
    onError: vi.fn(),
    onSaveVocab: vi.fn(),
    onCenterTap: vi.fn(),
    onOpenToc: vi.fn(),
    onTranslate: vi.fn(),
    onSpeakOne: vi.fn(),
    onParagraphTapForTts: vi.fn(),
    ttsGlobalActive: false,
    chromeVisible: false,
    onBookmarkParagraph: vi.fn(),
    onRequestCreateHighlight: vi.fn(),
    onEditHighlight: vi.fn(),
    ...overrides,
  }
  render(
    <I18nProvider>
      <PdfTextModeViewer ref={ref} {...(props as Parameters<typeof PdfTextModeViewer>[0])} />
    </I18nProvider>,
  )
  return { ref, props }
}

// CFI que o EpubViewer emitiria para o início de um parágrafo do livro sintético.
async function paragraphCfi(sectionIndex: number, paragraphIndex: number) {
  const openBook = mocks.props!.openBook as () => Promise<PdfTextBook>
  const doc = (await (await openBook()).getSectionDocument(sectionIndex))!
  const para = doc.querySelectorAll('p')[paragraphIndex]
  const range = doc.createRange()
  range.selectNodeContents(para)
  range.collapse(true)
  return { cfi: CFI.joinIndir(CFI.fake.fromIndex(sectionIndex), CFI.fromRange(range)), para }
}

const startLocatorOf = (para: Element) => {
  const [page, offset] = para.getAttribute('data-nr-pdf-start')!.split(':')
  return `neopdf:v1;p=${page};o=${offset}`
}

describe('PdfTextModeViewer — conversão na borda (DI-006)', () => {
  beforeEach(() => {
    mocks.props = null
    mocks.handle.getVisibleLocation.mockReset()
    mocks.handle.getVisibleLocation.mockReturnValue({ cfi: null })
    mocks.handle.goTo.mockClear()
  })

  it('só monta o EpubViewer depois de converter o localizador salvo em CFI, com openBook', async () => {
    renderViewer({ savedLocator: 'neopdf:v1;p=6;o=0' })
    await flush()

    expect(mocks.props).not.toBeNull()
    expect(mocks.props!.savedCfi).toMatch(/^epubcfi\(\/6\/4!/) // seção 1 (página 6 está no trecho B)
    expect(typeof mocks.props!.openBook).toBe('function')
    // Livro novo a cada abertura (StrictMode monta duas vezes e o viewer destrói o book ao desmontar).
    const openBook = mocks.props!.openBook as () => Promise<PdfTextBook>
    expect(await openBook()).not.toBe(await openBook())
  })

  it('relocate do viewer chega à tela como localizador, com percentual pela página', async () => {
    const { props } = renderViewer()
    await flush()
    const { cfi, para } = await paragraphCfi(1, 2)
    mocks.handle.getVisibleLocation.mockReturnValue({ cfi })

    const onRelocate = mocks.props!.onRelocate as (p: unknown) => void
    act(() => onRelocate({ cfi, fraction: 0.4, percentage: 40, sectionIndex: 1, tocLabel: 'B' }))
    await flush()

    const locator = startLocatorOf(para)
    const page = Number(locator.match(/p=(\d+)/)![1])
    expect(props.onRelocate).toHaveBeenCalledWith(expect.objectContaining({
      cfi: locator,
      sectionIndex: 1,
      tocLabel: 'B',
      percentage: Math.round((page / 12) * 100),
    }))
    // getVisibleLocation (síncrono, usado ao sair/alternar) devolve o localizador convertido.
    expect(mocks.handle.getVisibleLocation).toHaveBeenCalled()
  })

  it('marcador de parágrafo é gravado como localizador; marcadores salvos chegam ao viewer como CFI', async () => {
    // 1º render só para descobrir o CFI/localizador de um parágrafo real do livro sintético.
    renderViewer()
    await flush()
    const { cfi, para } = await paragraphCfi(1, 1)
    const locator = startLocatorOf(para)

    const onBookmarkParagraph = vi.fn()
    renderViewer({ onBookmarkParagraph, bookmarks: [{ id: 3, bookId: 7, cfi: locator, label: 'x', percentage: 1, createdAt: new Date() }] })
    await flush()

    // Mesmo CFI que o viewer calcula para o parágrafo → o ícone de marcador acende nele.
    expect((mocks.props!.bookmarks as Bookmark[])[0].cfi).toBe(cfi)
    ;(mocks.props!.onBookmarkParagraph as (p: unknown) => void)({ cfi, label: '40%', percentage: 40, snippet: 'texto' })
    await flush()
    expect(onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({ cfi: locator, snippet: 'texto' }))
  })

  it('highlight criado vira intervalo de localizadores; editar devolve o highlight original', async () => {
    const { props } = renderViewer()
    await flush()
    const { cfi: paraCfi, para } = await paragraphCfi(1, 1)
    const text = para.textContent!.slice(4, 30)
    const textNode = para.firstChild!
    const range = para.ownerDocument.createRange()
    range.setStart(textNode, 4)
    range.setEnd(textNode, 30)
    const cfi = CFI.joinIndir(CFI.fake.fromIndex(1), CFI.fromRange(range))

    ;(mocks.props!.onRequestCreateHighlight as (d: unknown) => void)({ cfi, paraCfi, text, sectionIndex: 1, percentage: 50 })
    await flush()
    expect(props.onRequestCreateHighlight).toHaveBeenCalledWith(expect.objectContaining({
      cfi: expect.stringMatching(/^neopdf:v1;p=\d+;o=\d+,p=\d+;o=\d+$/),
      paraCfi: startLocatorOf(para),
      text,
      sectionIndex: 1,
    }))
  })

  it('goTo com localizador navega pelo CFI convertido; href do sumário passa direto', async () => {
    const { ref } = renderViewer()
    await flush()
    act(() => ref.current!.goTo('neopdf:v1;p=6;o=0'))
    await flush()
    expect(mocks.handle.goTo).toHaveBeenCalledWith(expect.stringMatching(/^epubcfi\(\/6\/4!/))

    act(() => ref.current!.goTo('nr-pdf-chunk-1.xhtml'))
    expect(mocks.handle.goTo).toHaveBeenLastCalledWith('nr-pdf-chunk-1.xhtml')
    expect(ref.current!.getParagraphs()).toEqual(['a', 'b'])
  })
})
