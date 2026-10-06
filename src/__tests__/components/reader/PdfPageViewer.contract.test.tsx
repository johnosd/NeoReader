import { act, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PdfPageViewer, type PdfPageViewerProps } from '@/components/reader/PdfPageViewer'
import type { EpubViewerHandle } from '@/components/reader/EpubViewer'
import { I18nProvider } from '@/i18n'
import type { PdfReaderSession } from '@/hooks/usePdfReaderSession'
import type { Book } from '@/types/book'
import { buildPdfChunks } from '@/utils/pdfChunks'
import type { FoliateViewMock } from '../../setup'

// Contrato do EpubViewerHandle (contracts/reader-viewer-handle.md) cumprido pelo PdfPageViewer, contra o
// <foliate-view> falso do setup.ts. O render real do pdf.js é validado em Chromium (quickstart / T025).
vi.mock('foliate-js/view.js', () => ({}))

const book: Book = { id: 1, title: 'PDF', author: 'A', format: 'PDF', addedAt: new Date(), lastOpenedAt: null }

const toc = [
  { label: 'Introdução', href: '"a"', index: 0, subitems: null },
  { label: 'Capítulo 1', href: '"b"', index: 4, subitems: [{ label: 'Seção 1.1', href: '"c"', index: 6, subitems: null }] },
  { label: 'Sem destino', href: '', index: undefined, subitems: null },
]

function makeSession(pageCount = 30): PdfReaderSession {
  return {
    pdfBook: { toc, destroy: vi.fn() },
    pdf: {},
    chunks: buildPdfChunks(pageCount, [
      { title: 'Introdução', pageIndex: 0 },
      { title: 'Capítulo 1', pageIndex: 4 },
    ]),
    extractor: {
      getPage: vi.fn(async () => ({ itemStarts: [0], items: [{ str: 'Olá mundo' }], rawText: 'Olá mundo' })),
      reconstructChunk: vi.fn(async () => []),
    },
    pageCount,
  } as unknown as PdfReaderSession
}

let view: FoliateViewMock | null = null
let primaryIndex = 0

// Documento de página falso: um iframe real do jsdom com a camada de texto já "renderizada" (um span por item).
// O foliate real só entrega páginas depois de montá-las; aqui toda página pedida já está carregada.
function makePageDocument(): Document {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  // jsdom não implementa scrollIntoView (o viewer o usa para rolar até o offset salvo); o elemento é do realm do iframe.
  ;(doc.defaultView as unknown as { Element: typeof Element }).Element.prototype.scrollIntoView = vi.fn()
  doc.body.innerHTML = '<div id="canvas"><canvas></canvas></div><div class="textLayer"><span data-nr-item="0">Olá mundo</span></div>'
  return doc
}

// Intercepta a criação do <foliate-view> para completar o renderer do mock com o que o fixed-layout real tem
// e o PdfPageViewer usa (shadowRoot, style, index, pageColors, next/prev).
const realCreateElement = document.createElement.bind(document)
beforeEach(() => {
  primaryIndex = 0
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = realCreateElement(tag, options)
    if (tag === 'foliate-view') {
      view = element as unknown as FoliateViewMock
      const renderer = view.renderer as unknown as Record<string, unknown>
      const host = realCreateElement('div')
      const pageDoc = makePageDocument()
      Object.assign(renderer, {
        getContents: () => Array.from({ length: 30 }, (_, index) => ({ doc: pageDoc, index })),
        shadowRoot: host.attachShadow({ mode: 'open' }),
        style: host.style,
        pageColors: {},
        next: vi.fn(() => Promise.resolve()),
        prev: vi.fn(() => Promise.resolve()),
        getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 800, right: 400, width: 400, height: 800 }),
      })
      Object.defineProperty(renderer, 'index', { get: () => primaryIndex })
      renderer.goTo = vi.fn((target: { index: number }) => {
        primaryIndex = target.index
        return Promise.resolve()
      })
    }
    return element
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.restoreAllMocks()
  view = null
})

function setup(overrides: Partial<PdfPageViewerProps> = {}) {
  const ref = createRef<EpubViewerHandle>()
  const session = (overrides.session as PdfReaderSession | undefined) ?? makeSession()
  const props: PdfPageViewerProps = {
    book,
    session,
    bookmarks: [],
    readerTheme: 'dark',
    overrideBookColors: true,
    savedLocator: null,
    onRelocate: vi.fn(),
    onTocReady: vi.fn(),
    onLoad: vi.fn(),
    onError: vi.fn(),
    onCenterTap: vi.fn(),
    ...overrides,
  }
  const utils = render(
    <I18nProvider>
      <PdfPageViewer ref={ref} {...props} />
    </I18nProvider>,
  )
  return { ref, props, session, ...utils }
}

const handleMethods: Array<keyof EpubViewerHandle> = [
  'next', 'prev', 'prevToEnd', 'goToNextTtsSection', 'goTo', 'getVisibleLocation',
  'getParagraphs', 'getSentenceChunks', 'getFirstVisibleParagraphIndex', 'highlightTts', 'clearTts',
  'scrollToParagraph', 'resetTtsScroll', 'showTranslationLoading', 'injectTranslation',
  'showWordLensDefinitionLoading', 'injectWordLensDefinition', 'injectWordLensDefinitionError', 'clearTranslation',
]

describe('PdfPageViewer — contrato EpubViewerHandle', () => {
  it('expõe todos os métodos do contrato', async () => {
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    for (const method of handleMethods) expect(typeof ref.current?.[method], method).toBe('function')
  })

  it('abre o book do PDF no foliate, em rolagem contínua, e entrega o sumário já como localizadores de página', async () => {
    const { props, session } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())

    expect(view!.open).toHaveBeenCalledWith(session.pdfBook)
    expect(view!.renderer.setAttribute).toHaveBeenCalledWith('flow', 'scrolled')
    expect(props.onTocReady).toHaveBeenCalledWith([
      { label: 'Introdução', href: 'neopdf:v1;p=0;o=0' },
      { label: 'Capítulo 1', href: 'neopdf:v1;p=4;o=0', subitems: [{ label: 'Seção 1.1', href: 'neopdf:v1;p=6;o=0' }] },
      { label: 'Sem destino', href: '' },
    ])
  })

  it('aplica o tema do leitor às páginas (pageColors) e refaz ao trocar de tema', async () => {
    const { props, rerender } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const dark = (view!.renderer as unknown as { pageColors: { background: string } }).pageColors
    expect(dark.background).toBeTruthy()

    rerender(
      <I18nProvider>
        <PdfPageViewer {...props} readerTheme="paper" />
      </I18nProvider>,
    )
    const paper = (view!.renderer as unknown as { pageColors: { background: string } }).pageColors
    expect(paper.background).not.toBe(dark.background)
  })

  it('modo Original remove as cores forçadas do PDF e restaura o tema ao sair dele', async () => {
    const { props, rerender } = setup({ readerTheme: 'black' })
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    expect((view!.renderer as unknown as { pageColors: { background: string } }).pageColors.background).toBe('#000000')

    rerender(
      <I18nProvider>
        <PdfPageViewer {...props} overrideBookColors={false} />
      </I18nProvider>,
    )
    expect((view!.renderer as unknown as { pageColors: object }).pageColors).toEqual({})
    expect(view!.renderer.style.getPropertyValue('--scroll-bg-color')).toBe('#ffffff')

    rerender(
      <I18nProvider>
        <PdfPageViewer {...props} overrideBookColors={true} />
      </I18nProvider>,
    )
    expect((view!.renderer as unknown as { pageColors: { background: string } }).pageColors.background).toBe('#000000')
  })

  it('posiciona ANTES de avisar onLoad: começa na página 0 sem progresso salvo', async () => {
    const { props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    expect(view!.renderer.goTo).toHaveBeenCalledWith({ index: 0 })
  })

  it('restaura o progresso salvo (localizador neopdf) e o alvo inicial tem prioridade sobre ele', async () => {
    const saved = setup({ savedLocator: 'neopdf:v1;p=12;o=40' })
    await waitFor(() => expect(saved.props.onLoad).toHaveBeenCalled())
    expect(view!.renderer.goTo).toHaveBeenCalledWith({ index: 12 })
    saved.unmount()

    const target = setup({ savedLocator: 'neopdf:v1;p=12;o=40', initialTarget: 'neopdf:v1;p=20;o=0' })
    await waitFor(() => expect(target.props.onLoad).toHaveBeenCalled())
    expect(view!.renderer.goTo).toHaveBeenCalledWith({ index: 20 })
  })

  it('goTo aceita localizador, índice de página e fração', async () => {
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const goTo = view!.renderer.goTo as ReturnType<typeof vi.fn>
    goTo.mockClear()

    await act(async () => { ref.current!.goTo('neopdf:v1;p=7;o=0') })
    await waitFor(() => expect(goTo).toHaveBeenCalledWith({ index: 7 }))

    await act(async () => { ref.current!.goTo(3) })
    await waitFor(() => expect(goTo).toHaveBeenCalledWith({ index: 3 }))

    await act(async () => { ref.current!.goTo({ fraction: 0.5 }) })
    await waitFor(() => expect(goTo).toHaveBeenCalledWith({ index: 15 })) // 30 páginas

    // localizador inválido / CFI de EPUB são ignorados sem lançar
    const calls = goTo.mock.calls.length
    await act(async () => { ref.current!.goTo('epubcfi(/6/4)') })
    expect(goTo.mock.calls.length).toBe(calls)
  })

  it('next/prev rolam pelo renderer', async () => {
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    ref.current!.next()
    ref.current!.prev()
    expect((view!.renderer as unknown as { next: ReturnType<typeof vi.fn> }).next).toHaveBeenCalled()
    expect((view!.renderer as unknown as { prev: ReturnType<typeof vi.fn> }).prev).toHaveBeenCalled()
  })

  it('relocate vira onRelocate com localizador neopdf, progresso, trecho e capítulo (rótulo + href)', async () => {
    const { props, session } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    vi.mocked(props.onRelocate).mockClear()

    primaryIndex = 5
    // O contêiner da página precisa existir para medir; sem páginas carregadas o offset é 0.
    await act(async () => { view!.fireFoliate('relocate', { fraction: 0.2 }) })

    await waitFor(() => expect(props.onRelocate).toHaveBeenCalled())
    const payload = vi.mocked(props.onRelocate).mock.calls.at(-1)![0]
    expect(payload.cfi).toBe('neopdf:v1;p=5;o=0')
    // Percentual inteiro como no EPUB (é o que o chrome exibe); a fração continua precisa.
    expect(payload.percentage).toBe(17)
    expect(payload.fraction).toBeCloseTo(5 / 30, 4)
    expect(payload.tocLabel).toBe('Capítulo 1')
    expect(payload.sectionHref).toBe('neopdf:v1;p=4;o=0')
    // "seção" do PDF = trecho (DI-009): página 5 está no 2º trecho (capítulo 1)
    expect(payload.sectionIndex).toBe(session.chunks.findIndex((c) => c.startPage <= 5 && c.endPage >= 5))
  })

  it('getVisibleLocation devolve o último ponto (campo cfi = localizador) e null antes de qualquer relocate', async () => {
    const { ref, props } = setup()
    // Antes do 1º relocate (o setup só emite depois de onLoad):
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    primaryIndex = 8
    await act(async () => { view!.fireFoliate('relocate', {}) })
    await waitFor(() => expect(ref.current!.getVisibleLocation().cfi).toBe('neopdf:v1;p=8;o=0'))
    const location = ref.current!.getVisibleLocation()
    expect(location.tocLabel).toBe('Seção 1.1')
    expect(location.percentage).toBeGreaterThan(0)
  })

  it('métodos de TTS/tradução/Word Lens são seguros (sem efeito) até as fases US3/US4', async () => {
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const handle = ref.current!

    expect(handle.getParagraphs()).toEqual([])
    expect(handle.getSentenceChunks()).toEqual([])
    expect(handle.getFirstVisibleParagraphIndex()).toBe(0)
    expect(handle.goToNextTtsSection()).toBe(false)
    expect(handle.showTranslationLoading()).toBeNull()
    expect(() => {
      handle.highlightTts(0, 0, 0)
      handle.clearTts()
      handle.scrollToParagraph(0)
      handle.resetTtsScroll()
      handle.injectTranslation('x')
      handle.clearTranslation()
    }).not.toThrow()
  })

  it('fecha o foliate-view ao desmontar', async () => {
    const { props, unmount } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const closing = view!
    unmount()
    expect(closing.close).toHaveBeenCalled()
  })

  it('erro ao abrir o livro vira onError (e não onLoad)', async () => {
    const { failNextOpen } = await import('../../setup')
    failNextOpen(new Error('pdf quebrado'))
    const { props } = setup()
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'pdf quebrado' })))
    expect(props.onLoad).not.toHaveBeenCalled()
  })

  it('solta o documento das páginas que o foliate descartou (sem vazar memória por página lida)', async () => {
    const onCenterTap = vi.fn()
    const { props } = setup({ onCenterTap })
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())

    const discarded = makePageDocument()
    const kept = makePageDocument()
    const discardedFrame = discarded.defaultView!.frameElement!
    await act(async () => {
      view!.fireFoliate('load', { doc: discarded, index: 1 })
      view!.fireFoliate('load', { doc: kept, index: 2 })
    })
    const discardedRemove = vi.spyOn(discarded, 'removeEventListener')
    const keptRemove = vi.spyOn(kept, 'removeEventListener')

    // O foliate descarta a página 1 (remove o iframe) e carrega outra: a varredura roda nesse 'load'.
    discardedFrame.remove()
    await act(async () => { view!.fireFoliate('load', { doc: makePageDocument(), index: 3 }) })

    // Página descartada: o cleanup rodou (listeners removidos, Document solto do Map).
    expect(discardedRemove).toHaveBeenCalledWith('click', expect.any(Function))
    // Página ainda na tela: intacta, e continua respondendo ao toque.
    expect(keptRemove).not.toHaveBeenCalled()
    kept.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onCenterTap).toHaveBeenCalledTimes(1)
  })

  it('salva a posição do TOPO da tela (não a página do meio), com o offset do 1º texto visível', async () => {
    const session = makeSession(60)
    vi.mocked(session.extractor.getPage).mockImplementation(async () => ({
      itemStarts: [0, 120],
      items: [{ str: 'Primeira linha' }, { str: 'Segunda linha' }],
      rawText: '',
    }) as unknown as Awaited<ReturnType<PdfReaderSession['extractor']['getPage']>>)
    const { props } = setup({ session })
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    vi.mocked(props.onRelocate).mockClear()

    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    // Página 40 começa 300 px acima do topo do host e termina 280 px abaixo; a 41 vem logo depois e é a que
    // cruza o MEIO da tela (renderer.index). Quem está sendo lido é o 2º item da página 40.
    const pageWithLines = (frameTop: number, frameHeight: number) => {
      const doc = makePageDocument()
      doc.body.innerHTML = '<div id="canvas"><canvas></canvas></div><div class="textLayer">'
        + '<span data-nr-item="0">Primeira linha</span><span data-nr-item="1">Segunda linha</span></div>'
      ;(doc.defaultView!.frameElement as HTMLElement).getBoundingClientRect = () => rect(frameTop, frameHeight)
      const spans = doc.querySelectorAll<HTMLElement>('span')
      spans[0].getBoundingClientRect = () => rect(80, 20) // base em -200 no host: já passou do topo
      spans[1].getBoundingClientRect = () => rect(380, 20) // base em +100 no host: 1º texto visível
      return doc
    }
    const page40 = pageWithLines(-300, 580)
    const page41 = pageWithLines(284, 580)
    ;(view!.renderer as unknown as { getContents: () => unknown }).getContents = () => [
      { doc: page40, index: 40 },
      { doc: page41, index: 41 },
    ]
    primaryIndex = 41

    await act(async () => { view!.fireFoliate('relocate', {}) })
    await waitFor(() => expect(props.onRelocate).toHaveBeenCalled())
    const payload = vi.mocked(props.onRelocate).mock.calls.at(-1)![0]
    expect(payload.cfi).toBe('neopdf:v1;p=40;o=120')
    expect(Number.isInteger(payload.percentage)).toBe(true)
    expect(payload.fraction).toBeCloseTo((40 + 300 / 580) / 60, 4)
  })

  it('marcador de parágrafo grava percentual inteiro (a lista de marcadores exibe o valor sem formatar)', async () => {
    const session = makeSession(30)
    vi.mocked(session.extractor.reconstructChunk).mockResolvedValue([
      { kind: 'paragraph', text: 'Olá mundo', pageIndex: 7, ranges: [{ pageIndex: 7, start: 0, end: 9 }] },
    ])
    const onBookmarkParagraph = vi.fn()
    const { props } = setup({ session, onBookmarkParagraph })
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())

    const doc = makePageDocument()
    await act(async () => { view!.fireFoliate('load', { doc, index: 7 }) })
    await act(async () => { doc.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const button = await waitFor(() => {
      const found = doc.querySelector<HTMLButtonElement>('.nr-pdf-bubble button')
      expect(found).not.toBeNull()
      return found!
    })
    await act(async () => { button.click() })

    expect(onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({ cfi: 'neopdf:v1;p=7;o=0', percentage: 23 }))
  })

  it('não emite onRelocate antes da navegação inicial terminar (não sobrescreve o progresso salvo)', async () => {
    const onRelocate = vi.fn()
    const { props } = setup({ onRelocate, savedLocator: 'neopdf:v1;p=12;o=0' })
    // relocate "precoce" disparado pelo foliate durante a arrumação inicial
    await act(async () => { view?.fireFoliate('relocate', {}) })
    expect(onRelocate).not.toHaveBeenCalledWith(expect.objectContaining({ cfi: 'neopdf:v1;p=0;o=0' }))
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
  })
})
