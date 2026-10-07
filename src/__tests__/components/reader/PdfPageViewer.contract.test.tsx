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

  it('ir até um marcador espera a camada de texto da página, não só a imagem (R-050)', async () => {
    // Página recarregada (tinha saído da memória): a imagem aparece ~100 ms antes da camada de texto. Antes o
    // viewer aceitava a imagem como "pronto", não achava o span e parava no topo da página.
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const pageDoc = view!.renderer.getContents()[0].doc as Document
    pageDoc.querySelector('#canvas')!.innerHTML = '<img alt="">'
    pageDoc.querySelector('.textLayer')!.innerHTML = ''
    const renderer = view!.renderer as unknown as { scrollTop: number }
    renderer.scrollTop = 0

    await act(async () => { ref.current!.goTo('neopdf:v1;p=3;o=5') })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(renderer.scrollTop).toBe(0) // sem camada de texto ainda: não rola para lugar nenhum

    // A camada de texto chega; o span do parágrafo está 120 px abaixo do topo da página.
    const span = pageDoc.createElement('span')
    span.dataset.nrItem = '0'
    span.textContent = 'Olá mundo'
    span.getBoundingClientRect = () => ({ top: 120, left: 0, bottom: 140, right: 100, width: 100, height: 20, x: 0, y: 120, toJSON: () => ({}) })
    pageDoc.querySelector('.textLayer')!.append(span)

    await waitFor(() => expect(renderer.scrollTop).toBe(120))
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

  it('métodos de TTS são seguros sem texto no trecho, e os de tradução não fazem nada sem tradução aberta', async () => {
    const { ref, props } = setup()
    await waitFor(() => expect(props.onLoad).toHaveBeenCalled())
    const handle = ref.current!

    // A sessão padrão não tem parágrafos reconstruídos (reconstructChunk → []).
    expect(handle.getParagraphs()).toEqual([])
    expect(handle.getSentenceChunks()).toEqual([])
    expect(handle.getFirstVisibleParagraphIndex()).toBe(0)
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
    // O toque abre o painel de tradução (US3); "Marcar" é uma das ações dele, como no bloco inline do EPUB.
    const button = await waitFor(() => {
      const found = doc.querySelector<HTMLButtonElement>('.nr-pdf-translation [data-nr-action="bookmark"]')
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

// ─── US3: Word Lens e tradução na página fiel (T050) ────────────────────────

describe('PdfPageViewer — Word Lens e tradução (US3)', () => {
  // Página 7 com um parágrafo de 2 frases; "responsibility" e "committee" quebram entre linhas com hífen.
  const ITEMS = [
    { str: 'The traveller described the extraordinary respon-', hasEOL: true },
    { str: 'sibility of the author. Then the com-', hasEOL: true },
    { str: 'mittee left.', hasEOL: true },
  ]
  const RAW = ITEMS.map((i) => `${i.str}\n`).join('')
  const STARTS = [0, ITEMS[0].str.length + 1, ITEMS[0].str.length + ITEMS[1].str.length + 2]
  const BLOCK = {
    kind: 'paragraph' as const,
    text: 'The traveller described the extraordinary responsibility of the author. Then the committee left.',
    pageIndex: 7,
    ranges: [{ pageIndex: 7, start: 0, end: RAW.length - 1 }],
  }
  const FIRST = 'The traveller described the extraordinary responsibility of the author.'
  const SECOND = 'Then the committee left.'
  const WORD_LENS = { levels: { responsibility: 4 as const, committee: 5 as const, extraordinary: 4 as const }, lemmas: {} }

  function makeTranslationSession() {
    const session = makeSession(30)
    vi.mocked(session.extractor.getPage).mockResolvedValue({ itemStarts: STARTS, items: ITEMS, rawText: RAW } as never)
    vi.mocked(session.extractor.reconstructChunk).mockResolvedValue([BLOCK])
    return session
  }

  async function openPage(overrides: Partial<PdfPageViewerProps> = {}) {
    const utils = setup({
      session: makeTranslationSession(),
      onTranslate: vi.fn(),
      onWordLensDefinition: vi.fn(),
      onSaveVocab: vi.fn(),
      onSpeakOne: vi.fn(),
      onBookmarkParagraph: vi.fn(),
      wordLensEnabled: true,
      wordLensLevel: 'B1',
      wordLensData: WORD_LENS,
      ...overrides,
    })
    await waitFor(() => expect(utils.props.onLoad).toHaveBeenCalled())
    const doc = makePageDocument()
    doc.querySelector('.textLayer')!.innerHTML = ITEMS.map((item, i) => `<span data-nr-item="${i}">${item.str}</span>`).join('')
    await act(async () => { view!.fireFoliate('load', { doc, index: 7 }) })
    const tap = async (itemIndex: number) => {
      await act(async () => {
        doc.querySelector(`span[data-nr-item="${itemIndex}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }
    const panel = () => doc.querySelector<HTMLElement>('.nr-pdf-translation')
    return { ...utils, doc, tap, panel }
  }

  it('toque no texto emite a frase reconstruída (sem quebras nem hífen) e abre o painel na própria página', async () => {
    const { props, tap, panel, doc } = await openPage({ wordLensEnabled: false })
    await tap(0)

    await waitFor(() => expect(props.onTranslate).toHaveBeenCalledWith(FIRST))
    expect(panel()).not.toBeNull()
    expect(panel()!.querySelector('.nr-tr-spinner')).not.toBeNull()
    expect(panel()!.closest('.textLayer')).not.toBeNull() // dentro do documento da página (DOM do iframe)
    // Parágrafo ativo destacado nas linhas do bloco.
    await waitFor(() => expect(doc.querySelectorAll('.textLayer span.nr-pdf-active')).toHaveLength(3))
  })

  it('fluxo da ReaderScreen: showTranslationLoading → injectTranslation com selo do provedor; resposta antiga é ignorada', async () => {
    const { ref, tap, panel } = await openPage({ wordLensEnabled: false })
    await tap(2)
    await waitFor(() => expect(panel()).not.toBeNull())

    const selectionId = ref.current!.showTranslationLoading()
    expect(selectionId).toMatch(/^pdf-tr-/)
    act(() => ref.current!.injectTranslation('resposta velha', 'outra-selecao', 'deepl'))
    expect(panel()!.textContent).not.toContain('resposta velha')

    act(() => ref.current!.injectTranslation('Então o comitê saiu.', selectionId, 'deepl'))
    expect(panel()!.querySelector('.nr-tr-text')!.textContent).toBe('Então o comitê saiu.')
    expect(panel()!.textContent).toContain('DeepL')

    act(() => ref.current!.clearTranslation())
    expect(panel()).toBeNull()
  })

  it('palavra hifenizada entre linhas acima do nível abre o Word Lens (tocando a 2ª metade) e mostra a definição', async () => {
    const { ref, props, tap, panel } = await openPage()
    await tap(1) // "sibility of the author..." — início do item = 2ª metade de "respon-sibility"

    await waitFor(() => expect(props.onWordLensDefinition).toHaveBeenCalled())
    const target = vi.mocked(props.onWordLensDefinition!).mock.calls[0][0]
    expect(target).toMatchObject({ surface: 'responsibility', lemma: 'responsibility', level: 'B2' })
    expect(target.selectionId).toBe(ref.current!.showTranslationLoading())
    expect(props.onTranslate).toHaveBeenCalledWith(FIRST)

    act(() => ref.current!.injectWordLensDefinition(target, {
      partsOfSpeech: ['noun'],
      senses: [{ partOfSpeech: 'noun', definition: 'a duty to deal with something', examples: [], synonyms: ['duty'] }],
    }))
    expect(panel()!.querySelector('.nr-wl')!.textContent).toContain('a duty to deal with something')
    // Erro de outra seleção (toque antigo) não apaga a definição atual.
    act(() => ref.current!.injectWordLensDefinitionError({ ...target, selectionId: 'outra' }))
    expect(panel()!.querySelector('.nr-wl')!.textContent).toContain('a duty to deal with something')
  })

  it('ações do painel: ouvir, salvar no vocabulário (frase sem quebras), marcar parágrafo e próxima frase', async () => {
    const { ref, props, tap, panel } = await openPage({ wordLensEnabled: false })
    await tap(0)
    await waitFor(() => expect(panel()).not.toBeNull())
    const selectionId = ref.current!.showTranslationLoading()
    act(() => ref.current!.injectTranslation('O viajante descreveu...', selectionId))
    const click = (action: string) => act(() => {
      panel()!.querySelector<HTMLButtonElement>(`[data-nr-action="${action}"]`)!.click()
    })

    click('speak')
    expect(props.onSpeakOne).toHaveBeenCalledWith(FIRST)
    click('save')
    expect(props.onSaveVocab).toHaveBeenCalledWith(FIRST, 'O viajante descreveu...')
    expect(panel()!.querySelector('[data-nr-action="save"]')!.textContent).toMatch(/Salvo|Saved/)
    click('bookmark')
    expect(props.onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({ cfi: 'neopdf:v1;p=7;o=0' }))
    await act(async () => { panel()!.querySelector<HTMLButtonElement>('[data-nr-action="next"]')!.click() })
    await waitFor(() => expect(props.onTranslate).toHaveBeenLastCalledWith(SECOND))
  })

  it('tocar de novo na mesma frase fecha; tocar fora do texto fecha sem alternar o chrome', async () => {
    const { props, tap, panel, doc } = await openPage({ wordLensEnabled: false })
    await tap(0)
    await waitFor(() => expect(panel()).not.toBeNull())
    await tap(0)
    expect(panel()).toBeNull()

    await tap(2)
    await waitFor(() => expect(panel()).not.toBeNull())
    await act(async () => { doc.body.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(panel()).toBeNull()
    expect(props.onCenterTap).not.toHaveBeenCalled()
    expect(doc.querySelectorAll('.nr-pdf-active')).toHaveLength(0)
  })

  it('sublinha passivamente palavras do Word Lens e vocabulário salvo na camada de texto', async () => {
    const { doc } = await openPage({ vocabWords: ['the author'] })
    await act(async () => { doc.dispatchEvent(new CustomEvent('nr-pdf-rendered')) })

    await waitFor(() => expect([...doc.querySelectorAll('.textLayer .nr-word-lens')].map((el) => el.textContent)).toEqual(['extraordinary']), { timeout: 3000 })
    expect([...doc.querySelectorAll('.textLayer .nr-vocab')].map((el) => el.textContent)).toEqual(['the author'])
    // O sublinhado fica DENTRO do span do item: o toque continua achando o item.
    expect(doc.querySelector('.nr-word-lens')!.closest('span[data-nr-item]')).not.toBeNull()
  })
})

// ─── US4: TTS na página fiel (T057) ─────────────────────────────────────────

describe('PdfPageViewer — TTS (US4)', () => {
  // Trecho 0 (págs. 0–3): título + parágrafo que começa na página 0 e continua na 1, e uma figura (não lida).
  // Trecho 1 (págs. 4–29): um parágrafo. É o último trecho do livro.
  const PAGES: Record<number, Array<{ str: string; hasEOL: boolean }>> = {
    0: [{ str: 'Introdução', hasEOL: true }, { str: 'Primeira frase do livro. Segunda', hasEOL: true }],
    1: [{ str: 'frase continua aqui.', hasEOL: true }],
    4: [{ str: 'Capítulo um começa aqui.', hasEOL: true }],
  }
  const extracted = (pageIndex: number) => {
    const items = PAGES[pageIndex] ?? []
    const itemStarts: number[] = []
    let rawText = ''
    for (const item of items) {
      itemStarts.push(rawText.length)
      rawText += `${item.str}\n`
    }
    return { items, itemStarts, rawText }
  }
  const HEADING = { kind: 'heading' as const, text: 'Introdução', pageIndex: 0, ranges: [{ pageIndex: 0, start: 0, end: 10 }] }
  const PARAGRAPH = {
    kind: 'paragraph' as const,
    text: 'Primeira frase do livro. Segunda frase continua aqui.',
    pageIndex: 0,
    ranges: [{ pageIndex: 0, start: 11, end: 43 }, { pageIndex: 1, start: 0, end: 20 }],
  }
  const FIGURE = { kind: 'figure' as const, text: '', pageIndex: 1, ranges: [] }
  const CHAPTER = { kind: 'paragraph' as const, text: 'Capítulo um começa aqui.', pageIndex: 4, ranges: [{ pageIndex: 4, start: 0, end: 24 }] }

  function makeTtsSession() {
    const session = makeSession(30)
    vi.mocked(session.extractor.getPage).mockImplementation(async (pageIndex: number) => extracted(pageIndex) as never)
    vi.mocked(session.extractor.reconstructChunk).mockImplementation(async (chunk: { index: number }) =>
      (chunk.index === 0 ? [HEADING, FIGURE, PARAGRAPH] : [CHAPTER]) as never)
    return session
  }

  // Documento de página com um span por item, carregado no foliate falso (evento 'load' + getContents).
  function pageWithText(pageIndex: number): Document {
    const doc = makePageDocument()
    doc.querySelector('.textLayer')!.innerHTML = (PAGES[pageIndex] ?? [])
      .map((item, i) => `<span data-nr-item="${i}">${item.str}</span>`).join('')
    return doc
  }

  async function openTts(overrides: Partial<PdfPageViewerProps> = {}) {
    const utils = setup({
      session: makeTtsSession(),
      onSectionReady: vi.fn(),
      onParagraphTapForTts: vi.fn(),
      onTtsUserScrollAway: vi.fn(),
      onTranslate: vi.fn(),
      ...overrides,
    })
    await waitFor(() => expect(utils.props.onLoad).toHaveBeenCalled())
    const docs = { 0: pageWithText(0), 1: pageWithText(1), 4: pageWithText(4) }
    ;(view!.renderer as unknown as { getContents: () => unknown }).getContents = () =>
      Object.entries(docs).map(([index, doc]) => ({ doc, index: Number(index) }))
    for (const [index, doc] of Object.entries(docs)) {
      await act(async () => { view!.fireFoliate('load', { doc, index: Number(index) }) })
    }
    return { ...utils, docs }
  }

  it('parágrafos do trecho = blocos reconstruídos com texto (título incluso, figura fora), já no onLoad', async () => {
    const { ref } = await openTts()
    expect(ref.current!.getParagraphs()).toEqual([HEADING.text, PARAGRAPH.text])
  })

  it('getSentenceChunks no mesmo formato TtsChunk do EPUB, com offsets que apontam para o texto do parágrafo', async () => {
    const { ref } = await openTts()
    const chunks = ref.current!.getSentenceChunks()
    expect(new Set(chunks.map((c) => c.paraIdx))).toEqual(new Set([0, 1]))
    const paragraphs = ref.current!.getParagraphs()
    for (const chunk of chunks) {
      expect(paragraphs[chunk.paraIdx].slice(chunk.offsetInPara, chunk.offsetInPara + chunk.text.length)).toBe(chunk.text)
    }
    // A frase que cruza a virada de página é lida inteira, num só chunk (sem corte na página).
    expect(chunks.some((c) => c.text.includes('Segunda frase continua aqui.'))).toBe(true)
  })

  it('highlightTts destaca o parágrafo nas DUAS páginas e a palavra lida; clearTts limpa', async () => {
    const { ref, docs } = await openTts()
    const segunda = PARAGRAPH.text.indexOf('Segunda')
    act(() => ref.current!.highlightTts(1, segunda, segunda + 'Segunda'.length))

    await waitFor(() => expect(docs[0].querySelector('[data-nr-item="1"]')!.classList.contains('nr-pdf-tts')).toBe(true))
    expect(docs[0].querySelector('[data-nr-item="0"]')!.classList.contains('nr-pdf-tts')).toBe(false) // título
    expect(docs[1].querySelector('[data-nr-item="0"]')!.classList.contains('nr-pdf-tts')).toBe(true) // continuação
    await waitFor(() => expect(docs[0].querySelector('.nr-pdf-tts-word')?.textContent).toBe('Segunda'))

    // Palavra seguinte, já na página 1: a marca anterior some e a nova aparece na página certa.
    const frase = PARAGRAPH.text.indexOf('frase continua')
    act(() => ref.current!.highlightTts(1, frase, frase + 'frase'.length))
    await waitFor(() => expect(docs[1].querySelector('.nr-pdf-tts-word')?.textContent).toBe('frase'))
    expect(docs[0].querySelector('.nr-pdf-tts-word')).toBeNull()

    act(() => ref.current!.clearTts())
    expect(docs[0].querySelector('.nr-pdf-tts, .nr-pdf-tts-word')).toBeNull()
    expect(docs[1].querySelector('.nr-pdf-tts')).toBeNull()
  })

  it('página do parágrafo redesenhada (zoom/tema) recebe o destaque de novo', async () => {
    const { ref, docs } = await openTts()
    act(() => ref.current!.highlightTts(1, 0, 0))
    await waitFor(() => expect(docs[1].querySelector('.nr-pdf-tts')).not.toBeNull())

    // O pdf.js recria a camada de texto: os spans novos não têm classe.
    docs[1].querySelector('.textLayer')!.innerHTML = '<span data-nr-item="0">frase continua aqui.</span>'
    await act(async () => { docs[1].dispatchEvent(new CustomEvent('nr-pdf-rendered')) })
    await waitFor(() => expect(docs[1].querySelector('.nr-pdf-tts')).not.toBeNull())
  })

  it('goToNextTtsSection: vai ao 1º parágrafo do próximo trecho e avisa onSectionReady; false no último', async () => {
    const { ref, props } = await openTts()
    const goTo = view!.renderer.goTo as ReturnType<typeof vi.fn>
    goTo.mockClear()

    let moved = false
    act(() => { moved = ref.current!.goToNextTtsSection() })
    expect(moved).toBe(true)
    await waitFor(() => expect(props.onSectionReady).toHaveBeenCalledWith(1, 'neopdf:v1;p=4;o=0'))
    expect(goTo).toHaveBeenCalledWith({ index: 4 })
    // A ReaderScreen pede os chunks no onSectionReady: já são os do trecho novo.
    expect(ref.current!.getParagraphs()).toEqual([CHAPTER.text])

    expect(ref.current!.goToNextTtsSection()).toBe(false)
  })

  it('com a leitura contínua ativa, tocar num parágrafo leva o TTS até ele (sem abrir tradução)', async () => {
    const { props, docs } = await openTts({ ttsGlobalActive: true })
    await act(async () => {
      docs[1].querySelector('[data-nr-item="0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // Continuação do parágrafo 1 na página 1: o índice é o do parágrafo, não o da página.
    await waitFor(() => expect(props.onParagraphTapForTts).toHaveBeenCalledWith(1))
    expect(props.onTranslate).not.toHaveBeenCalled()
  })

  it('rolagem do usuário durante a leitura para de acompanhar (uma vez); rolagem do próprio app não conta', async () => {
    const { ref, props } = await openTts()
    act(() => ref.current!.resetTtsScroll())

    // Logo depois da navegação inicial: dentro da janela de rolagem programática.
    act(() => { view!.fireRenderer('scroll') })
    expect(props.onTtsUserScrollAway).not.toHaveBeenCalled()

    const later = Date.now() + 10_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(later)
    act(() => { view!.fireRenderer('scroll') })
    act(() => { view!.fireRenderer('scroll') })
    expect(props.onTtsUserScrollAway).toHaveBeenCalledTimes(1)

    // resetTtsScroll (voltar ao trecho lido / novo play) volta a acompanhar.
    act(() => ref.current!.resetTtsScroll({ preservePlaybackSection: true }))
    act(() => { view!.fireRenderer('scroll') })
    expect(props.onTtsUserScrollAway).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })

  it('sem leitura ativa, rolar não dispara nada', async () => {
    const { props } = await openTts()
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000)
    act(() => { view!.fireRenderer('scroll') })
    expect(props.onTtsUserScrollAway).not.toHaveBeenCalled()
    now.mockRestore()
  })
})

// ─── US5: highlights na página fiel (T063) ──────────────────────────────────

describe('PdfPageViewer — highlights (US5)', () => {
  // Mesmo livro do TTS: parágrafo que começa na página 0 ("Primeira frase do livro. Segunda") e continua na 1.
  const PAGES: Record<number, Array<{ str: string; hasEOL: boolean }>> = {
    0: [{ str: 'Introdução', hasEOL: true }, { str: 'Primeira frase do livro. Segunda', hasEOL: true }],
    1: [{ str: 'frase continua aqui.', hasEOL: true }],
  }
  const extracted = (pageIndex: number) => {
    const items = PAGES[pageIndex] ?? []
    const itemStarts: number[] = []
    let rawText = ''
    for (const item of items) {
      itemStarts.push(rawText.length)
      rawText += `${item.str}\n`
    }
    return { items, itemStarts, rawText }
  }
  const PARAGRAPH = {
    kind: 'paragraph' as const,
    text: 'Primeira frase do livro. Segunda frase continua aqui.',
    pageIndex: 0,
    ranges: [{ pageIndex: 0, start: 11, end: 43 }, { pageIndex: 1, start: 0, end: 20 }],
  }
  const base = { bookId: 1, sectionIndex: 0, percentage: 0, createdAt: new Date(), paraCfi: 'neopdf:v1;p=0;o=11' }
  // "Primeira" (só na página 0), e "Segunda frase" atravessando da página 0 para a 1, com nota.
  const ON_PAGE = { ...base, id: 1, cfi: 'neopdf:v1;p=0;o=11,p=0;o=19', text: 'Primeira', color: 'amber', style: 'background' as const }
  const CROSS = { ...base, id: 2, cfi: 'neopdf:v1;p=0;o=36,p=1;o=5', text: 'Segunda frase', color: 'rose', style: 'squiggly' as const, note: 'Ideia central' }

  function makeSessionWithText() {
    const session = makeSession(30)
    vi.mocked(session.extractor.getPage).mockImplementation(async (pageIndex: number) => extracted(pageIndex) as never)
    vi.mocked(session.extractor.reconstructChunk).mockResolvedValue([PARAGRAPH] as never)
    return session
  }

  function pageWithText(pageIndex: number): Document {
    const doc = makePageDocument()
    doc.querySelector('.textLayer')!.innerHTML = (PAGES[pageIndex] ?? [])
      .map((item, i) => `<span data-nr-item="${i}">${item.str}</span>`).join('')
    // jsdom não implementa Range.getBoundingClientRect (âncora do menu de seleção).
    ;(doc.defaultView as unknown as { Range: typeof Range }).Range.prototype.getBoundingClientRect = () =>
      ({ top: 100, bottom: 120, left: 20, right: 200, width: 180, height: 20, x: 20, y: 100, toJSON: () => ({}) }) as DOMRect
    return doc
  }

  async function openWithHighlights(overrides: Partial<PdfPageViewerProps> = {}) {
    const utils = setup({
      session: makeSessionWithText(),
      highlights: [ON_PAGE, CROSS],
      onRequestCreateHighlight: vi.fn(),
      onEditHighlight: vi.fn(),
      onDeleteHighlight: vi.fn(),
      onTranslate: vi.fn(),
      onParagraphTapForTts: vi.fn(),
      ...overrides,
    })
    await waitFor(() => expect(utils.props.onLoad).toHaveBeenCalled())
    const docs = { 0: pageWithText(0), 1: pageWithText(1) }
    ;(view!.renderer as unknown as { getContents: () => unknown }).getContents = () =>
      Object.entries(docs).map(([index, doc]) => ({ doc, index: Number(index) }))
    for (const [index, doc] of Object.entries(docs)) {
      await act(async () => { view!.fireFoliate('load', { doc, index: Number(index) }) })
    }
    const marks = (doc: Document) => [...doc.querySelectorAll<HTMLElement>('span.nr-pdf-hl')]
    const click = async (el: Element) => {
      await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    }
    return { ...utils, docs, marks, click }
  }

  it('pinta os highlights salvos, inclusive o que atravessa páginas, com estilo e indicador de nota', async () => {
    const { docs, marks } = await openWithHighlights()
    await waitFor(() => expect(marks(docs[0]).map((m) => m.textContent)).toEqual(['Primeira', 'Segunda']))
    expect(marks(docs[1]).map((m) => m.textContent)).toEqual(['frase'])
    expect(marks(docs[0])[0].style.backgroundColor).toContain('rgba(245, 158, 11')
    expect(marks(docs[1])[0].style.textDecorationStyle).toBe('wavy')
    // Indicador de nota só no começo do trecho (página 0), não na continuação.
    expect(marks(docs[0])[1].classList.contains('nr-pdf-hl-note')).toBe(true)
    expect(marks(docs[1])[0].classList.contains('nr-pdf-hl-note')).toBe(false)
  })

  it('só pinta texto de parágrafo: cabeçalho/número de página dentro do intervalo ficam de fora', async () => {
    // "Introdução" não pertence a nenhum bloco reconstruído deste trecho (fazendo o papel de cabeçalho corrido);
    // o intervalo vai do começo da página até "Primeira" e passa por ele.
    const OVER_HEADER = { ...base, id: 3, cfi: 'neopdf:v1;p=0;o=0,p=0;o=19', text: 'Primeira', color: 'cyan', style: 'underline' as const }
    const { docs, marks } = await openWithHighlights({ highlights: [OVER_HEADER] })
    await waitFor(() => expect(marks(docs[0]).map((m) => m.textContent)).toEqual(['Primeira']))
  })

  it('a lista mudou (removido em qualquer modo): repinta sem o highlight', async () => {
    const { docs, marks, props, rerender } = await openWithHighlights()
    await waitFor(() => expect(marks(docs[1])).toHaveLength(1))
    rerender(
      <I18nProvider>
        <PdfPageViewer {...props} highlights={[ON_PAGE]} />
      </I18nProvider>,
    )
    await waitFor(() => expect(marks(docs[1])).toHaveLength(0))
    expect(marks(docs[0]).map((m) => m.textContent)).toEqual(['Primeira'])
  })

  it('tocar num highlight abre o menu de gerenciar (com a nota); editar e remover chamam os mesmos callbacks do EPUB', async () => {
    const { docs, marks, click, props } = await openWithHighlights()
    await waitFor(() => expect(marks(docs[0])).toHaveLength(2))

    await click(marks(docs[0])[1])
    const menu = docs[0].querySelector('.nr-pdf-menu')!
    expect(menu.textContent).toContain('Ideia central')
    expect(props.onTranslate).not.toHaveBeenCalled()

    await click(menu.querySelector('[data-nr-pdf-menu-action="edit"]')!)
    expect(props.onEditHighlight).toHaveBeenCalledWith(CROSS)
    expect(docs[0].querySelector('.nr-pdf-menu')).toBeNull()

    await click(marks(docs[0])[0])
    await click(docs[0].querySelector('[data-nr-pdf-menu-action="remove"]')!)
    expect(props.onDeleteHighlight).toHaveBeenCalledWith(ON_PAGE)
  })

  it('selecionar texto abre o menu; "Destacar" entrega o rascunho com intervalo neopdf e início do parágrafo', async () => {
    const { docs, click, props } = await openWithHighlights({ highlights: [] })
    const doc = docs[0]
    const text = doc.querySelector('[data-nr-item="1"]')!.firstChild!
    const range = doc.createRange()
    range.setStart(text, 9) // "frase"
    range.setEnd(text, 23) // "frase do livro"
    doc.getSelection()!.addRange(range)
    await act(async () => { doc.dispatchEvent(new Event('selectionchange')) })

    const menu = doc.querySelector('.nr-pdf-menu')!
    expect(menu.getAttribute('data-kind')).toBe('selection')
    expect([...menu.querySelectorAll('[data-nr-pdf-menu-action]')].map((b) => b.getAttribute('data-nr-pdf-menu-action')))
      .toEqual(['copy', 'share', 'translate', 'highlight'])

    // Android: o toque no botão desfaz a seleção nativa ANTES do clique — o rascunho sai da seleção guardada.
    doc.getSelection()!.removeAllRanges()
    await click(menu.querySelector('[data-nr-pdf-menu-action="highlight"]')!)

    await waitFor(() => expect(props.onRequestCreateHighlight).toHaveBeenCalledWith({
      cfi: 'neopdf:v1;p=0;o=20,p=0;o=34',
      paraCfi: 'neopdf:v1;p=0;o=11',
      text: 'frase do livro',
      sectionIndex: 0,
      percentage: 0,
    }))
    expect(doc.querySelector('.nr-pdf-menu')).toBeNull()
  })

  it('"Traduzir" no menu de seleção abre o painel de tradução com o trecho selecionado', async () => {
    const { docs, click, props } = await openWithHighlights({ highlights: [] })
    const doc = docs[0]
    const range = doc.createRange()
    range.selectNodeContents(doc.querySelector('[data-nr-item="1"]')!)
    doc.getSelection()!.addRange(range)
    await act(async () => { doc.dispatchEvent(new Event('selectionchange')) })
    await click(doc.querySelector('[data-nr-pdf-menu-action="translate"]')!)
    await waitFor(() => expect(props.onTranslate).toHaveBeenCalledWith('Primeira frase do livro. Segunda'))
    expect(doc.querySelector('.nr-pdf-translation')).not.toBeNull()
  })

  it('com a leitura contínua ativa, tocar no highlight leva o TTS ao parágrafo (sem menu), como no EPUB', async () => {
    const { docs, marks, click, props } = await openWithHighlights({ ttsGlobalActive: true })
    await waitFor(() => expect(marks(docs[0])).toHaveLength(2))
    await click(marks(docs[0])[0])
    await waitFor(() => expect(props.onParagraphTapForTts).toHaveBeenCalledWith(0))
    expect(docs[0].querySelector('.nr-pdf-menu')).toBeNull()
  })
})
