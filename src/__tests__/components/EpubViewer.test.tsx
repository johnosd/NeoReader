import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import {
  EpubViewer,
  type EpubViewerHandle,
} from '@/components/reader/EpubViewer'
import { logEvent } from '@/services/DiagnosticsLogger'
import type { Book } from '@/types/book'
import { registerUnmanifestedEpubStylesheets } from '@/utils/epubResources'
import { failNextOpen, deferNextOpen, resolveDeferredOpen, type FoliateViewMock } from '../setup'

// Mocka o import dinâmico de foliate-js — apenas registra o side-effect.
// O elemento <foliate-view> é provido pelo FoliateViewMock registrado no setup.ts.
vi.mock('foliate-js/view.js', () => ({}))

// Mocka módulos de DB usados indiretamente (via useTTS/hooks internos, se houver)
vi.mock('@/db/translations', () => ({
  getCachedTranslation: vi.fn(),
  setCachedTranslation: vi.fn(),
}))

vi.mock('@/services/DiagnosticsLogger', () => ({
  createFlowId: vi.fn((prefix: string) => `${prefix}-test-flow`),
  logEvent: vi.fn(),
}))

const logEventMock = vi.mocked(logEvent)

beforeEach(() => {
  logEventMock.mockClear()
})

describe('registerUnmanifestedEpubStylesheets', () => {
  it('registers CSS entries omitted from the EPUB manifest without duplicating resources', () => {
    const manifest = [{ href: 'OEBPS/declared.css', mediaType: 'text/css' }]
    const book = {
      entries: new Map<string, unknown>([
        ['OEBPS/declared.css', {}],
        ['OEBPS/override_v1.css', {}],
        ['OEBPS/cover.jpg', {}],
      ]),
      resources: { manifest },
    }

    expect(registerUnmanifestedEpubStylesheets(book)).toBe(1)
    expect(registerUnmanifestedEpubStylesheets(book)).toBe(0)
    expect(manifest).toEqual([
      { href: 'OEBPS/declared.css', mediaType: 'text/css' },
      { href: 'OEBPS/override_v1.css', mediaType: 'text/css' },
    ])
  })

  it('does nothing when the EPUB implementation does not expose its resources', () => {
    expect(registerUnmanifestedEpubStylesheets({})).toBe(0)
  })
})

// ─── helpers ────────────────────────────────────────────────────────────────

const mockBook: Book = {
  id: 1,
  title: 'Test Book',
  author: 'Author',
  fileBlob: new Blob([''], { type: 'application/epub+zip' }),
  addedAt: new Date(),
  lastOpenedAt: null,
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    book: mockBook,
    bookmarks: [],
    fontSize: 'md' as const,
    lineHeight: 'comfortable' as const,
    readerTheme: 'dark' as const,
    fontFamily: 'classic' as const,
    overrideBookFont: true,
    overrideBookColors: true,
    wordLensEnabled: true,
    wordLensLevel: 'B1' as const,
    wordLensData: null,
    savedCfi: null,
    onRelocate: vi.fn(),
    onTocReady: vi.fn(),
    onLoad: vi.fn(),
    onError: vi.fn(),
    onSaveVocab: vi.fn(),
    onCenterTap: vi.fn(),
    onOpenToc: vi.fn(),
    onTranslate: vi.fn(),
    onSpeakOne: vi.fn(),
    onBookmarkParagraph: vi.fn(),
    onParagraphTapForTts: vi.fn(),
    ttsGlobalActive: false,
    chromeVisible: false,
    onBookmarkTap: vi.fn(),
    ...overrides,
  }
}

/** Renderiza o EpubViewer, aguarda o setup async e devolve o elemento foliate-view. */
async function renderViewer(overrides: Record<string, unknown> = {}) {
  const viewerRef = createRef<EpubViewerHandle>()
  const props = defaultProps(overrides)

  const rendered = render(<EpubViewer ref={viewerRef} {...(props as Parameters<typeof EpubViewer>[0])} />)
  const { container } = rendered

  // Flush promises: open() + init() do mock resolvem imediatamente
  await act(async () => { await Promise.resolve() })

  const foliateEl = container.querySelector('foliate-view') as unknown as FoliateViewMock
  return { viewerRef, foliateEl, props, container, rerender: rendered.rerender, unmount: rendered.unmount }
}

/** Cria um Document mínimo e adiciona parágrafo com texto. */
function makeFakeDoc(texts: string[] = ['First sentence. Second sentence.']) {
  const doc = document.implementation.createHTMLDocument('test')
  texts.forEach(text => {
    const p = doc.createElement('p')
    p.textContent = text
    doc.body.appendChild(p)
  })
  return doc
}

/** Dispara um click simples num elemento. */
function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 360,
    }))
  })
}

function clickAt(el: Element, clientX: number, clientY = 360) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    }))
  })
}

function touchAt(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', clientX: number, clientY: number) {
  act(() => {
    const event = new Event(type, {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'touches', {
      configurable: true,
      value: type === 'touchend' ? [] : [{ clientX, clientY }],
    })
    el.dispatchEvent(event)
  })
}

function expectTapIgnored(reason: string, details: Record<string, unknown> = {}) {
  expect(logEventMock).toHaveBeenCalledWith('reader.tap.ignored', expect.objectContaining({
    screen: 'reader',
    status: 'fallback',
    details: expect.objectContaining({
      reason,
      ...details,
    }),
  }))
}

function setCaretRange(doc: Document, textNode: Text, offset: number) {
  Object.defineProperty(doc, 'caretRangeFromPoint', {
    configurable: true,
    value: () => {
      const range = doc.createRange()
      range.setStart(textNode, offset)
      range.collapse(true)
      return range
    },
  })
}

function setElementRect(el: Element, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }),
  })
}

function setElementClientRects(
  el: Element,
  rects: Array<Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>>,
) {
  Object.defineProperty(el, 'getClientRects', {
    configurable: true,
    value: () => rects,
  })
}

function setViewportWidth(doc: Document, width: number) {
  if (doc.defaultView) {
    Object.defineProperty(doc.defaultView, 'innerWidth', {
      configurable: true,
      value: width,
    })
  }

  Object.defineProperty(doc.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  })
}

function setViewportHeight(doc: Document, height: number) {
  if (doc.defaultView) {
    Object.defineProperty(doc.defaultView, 'innerHeight', {
      configurable: true,
      value: height,
    })
  }

  Object.defineProperty(doc.documentElement, 'clientHeight', {
    configurable: true,
    value: height,
  })
}

function loadSection(foliateEl: FoliateViewMock, doc: Document, index = 0) {
  act(() => {
    foliateEl.fireFoliate('load', { doc, index })
    foliateEl.fireRenderer('stabilized')
  })
}

async function flushAnimationFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** Injeta um defaultView falso num Document para simular posição de scroll. */
function injectFakeWindow(doc: Document, scrollY: number, innerHeight = 800, scrollHeight = 1200) {
  const scrollTarget = new EventTarget()
  let currentScrollY = scrollY
  const fakeWin = {
    get scrollY() { return currentScrollY },
    innerHeight,
    scrollTo: vi.fn((_x: number, y: number) => {
      currentScrollY = y
      scrollTarget.dispatchEvent(new Event('scroll'))
    }),
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => { cb(0); return 0 }),
    // EpubViewer registra o scroll listener aqui — mock para não lançar exceção
    addEventListener: vi.fn((event: string, cb: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      scrollTarget.addEventListener(event, cb as EventListener, options)
    }),
    removeEventListener: vi.fn((event: string, cb: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      scrollTarget.removeEventListener(event, cb as EventListener, options)
    }),
    fireScroll(nextScrollY?: number) {
      if (typeof nextScrollY === 'number') currentScrollY = nextScrollY
      scrollTarget.dispatchEvent(new Event('scroll'))
    },
  }
  Object.defineProperty(doc, 'defaultView', { get: () => fakeWin, configurable: true })
  Object.defineProperty(doc.documentElement, 'scrollHeight', { get: () => scrollHeight, configurable: true })
  return fakeWin
}

// ─── testes ─────────────────────────────────────────────────────────────────

describe('EpubViewer — abertura do livro', () => {
  it('chama onLoad quando a primeira seção estabiliza', async () => {
    const { props, foliateEl } = await renderViewer()
    const fakeDoc = makeFakeDoc()
    injectFakeWindow(fakeDoc, 0)
    loadSection(foliateEl, fakeDoc, 0)
    expect(props.onLoad).toHaveBeenCalledOnce()
  })

  it('informa o href da secao quando ela fica pronta', async () => {
    const onSectionReady = vi.fn()
    const { foliateEl } = await renderViewer({ onSectionReady })
    const fakeDoc = makeFakeDoc()
    injectFakeWindow(fakeDoc, 0)

    act(() => { void foliateEl.renderer.goTo({ index: 1 }) })
    loadSection(foliateEl, fakeDoc, 1)

    expect(onSectionReady).toHaveBeenCalledWith(1, 'chapter-2.xhtml')
  })

  it('mantem a primeira secao ativa quando o Foliate precarrega uma secao adjacente', async () => {
    const onLoad = vi.fn()
    const onSectionReady = vi.fn()
    const { foliateEl } = await renderViewer({ onLoad, onSectionReady })
    const primaryDoc = makeFakeDoc(['Primary section.'])
    const adjacentDoc = makeFakeDoc(['Adjacent section.'])
    injectFakeWindow(primaryDoc, 0)
    injectFakeWindow(adjacentDoc, 0)

    act(() => {
      foliateEl.fireFoliate('load', { doc: primaryDoc, index: 0 })
      foliateEl.fireFoliate('load', { doc: adjacentDoc, index: 1 })
      foliateEl.fireRenderer('stabilized')
    })

    expect(onLoad).toHaveBeenCalledOnce()
    expect(onSectionReady).toHaveBeenCalledWith(0, 'chapter-1.xhtml')
    expect(onSectionReady).not.toHaveBeenCalledWith(1, 'chapter-2.xhtml')
  })

  it('promove uma secao precarregada quando relocate a torna ativa', async () => {
    const onLoad = vi.fn()
    const onSectionReady = vi.fn()
    const { foliateEl } = await renderViewer({ onLoad, onSectionReady })
    const targetDoc = makeFakeDoc(['Preloaded target section.'])
    injectFakeWindow(targetDoc, 0)

    act(() => {
      foliateEl.fireFoliate('load', { doc: targetDoc, index: 1 })
    })
    expect(onLoad).not.toHaveBeenCalled()

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0,
        tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
        index: 1,
      })
    })

    expect(onLoad).toHaveBeenCalledOnce()
    expect(onSectionReady).toHaveBeenCalledOnce()
    expect(onSectionReady).toHaveBeenCalledWith(1, 'chapter-2.xhtml')
  })

  it('finaliza a secao carregada depois de relocate mesmo se stabilized ja ocorreu', async () => {
    vi.useFakeTimers()
    try {
      const onError = vi.fn()
      const onLoad = vi.fn()
      const onSectionReady = vi.fn()
      const { foliateEl } = await renderViewer({ onError, onLoad, onSectionReady })
      const targetDoc = makeFakeDoc(['Late target section.'])
      injectFakeWindow(targetDoc, 0)

      act(() => {
        foliateEl.fireFoliate('relocate', {
          cfi: 'epubcfi(/6/10!/4/2/1:0)',
          fraction: 0,
          tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
          section: { current: 1, total: 3 },
          index: 1,
        })
        foliateEl.fireRenderer('stabilized')
        foliateEl.fireFoliate('load', { doc: targetDoc, index: 1 })
      })
      expect(onLoad).not.toHaveBeenCalled()

      await act(async () => { vi.advanceTimersByTime(400) })

      expect(onLoad).toHaveBeenCalledOnce()
      expect(onSectionReady).toHaveBeenCalledWith(1, 'chapter-2.xhtml')
      await act(async () => { vi.advanceTimersByTime(8_000) })
      expect(onError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('injeta tema e fonte configurados no renderer', async () => {
    const { foliateEl } = await renderViewer({
      readerTheme: 'sage',
      fontFamily: 'readable',
    })

    const styles = foliateEl.renderer.setStyles.mock.calls[0]?.[0] as string

    expect(styles).toContain('#e8eddc')
    expect(styles).toContain('Verdana')
    expect(styles).toContain('rgba(246, 250, 238, 0.98)')
    expect(styles).toContain('.nr-word-lens')
    expect(styles).toContain('pointer-events: none')
    expect(styles).toContain('animation: none')
    expect(styles).toContain('transition: none')
  })

  it('marca Word Lens depois do load sem atrasar a prontidao inicial', async () => {
    const onLoad = vi.fn()
    const { foliateEl } = await renderViewer({
      onLoad,
      wordLensData: {
        levels: { apple: 1, ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['Apple and ubiquitous ideas.'])
    injectFakeWindow(fakeDoc, 0)

    loadSection(foliateEl, fakeDoc, 0)
    expect(onLoad).toHaveBeenCalledOnce()

    await waitFor(() => expect(fakeDoc.querySelectorAll('.nr-word-lens')).toHaveLength(1))
    expect(fakeDoc.querySelector('.nr-word-lens')?.textContent).toBe('ubiquitous')
    expect(fakeDoc.body.textContent).toContain('Apple and ubiquitous ideas.')
    expect(logEventMock).toHaveBeenCalledWith('reader.wordLens.process', expect.objectContaining({
      screen: 'reader',
      status: 'success',
      details: expect.objectContaining({
        sectionIndex: 0,
        packVersion: 'test',
        matches: 1,
      }),
    }))
    expect(JSON.stringify(logEventMock.mock.calls)).not.toContain('ubiquitous')
  })

  it('mantem o toque direto em Word Lens no fluxo unico da traducao', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const { foliateEl } = await renderViewer({
      onTranslate,
      onWordLensDefinition,
      wordLensData: {
        levels: { ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['A ubiquitous idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)

    await waitFor(() => expect(fakeDoc.querySelector('.nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, word.firstChild as Text, 3)
    logEventMock.mockClear()

    clickAt(para, 180, 360)

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onTranslate).toHaveBeenCalledWith('A ubiquitous idea.')
    expect(onWordLensDefinition).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'ubiquitous',
      lemma: 'ubiquitous',
      level: 'C1',
      offset: 2,
      selectionId: expect.any(String),
    }))
    expect(onTranslate.mock.invocationCallOrder[0]).toBeLessThan(onWordLensDefinition.mock.invocationCallOrder[0])
    expect(logEventMock.mock.calls.map(([event]) => event)).toEqual([
      'reader.selection.start',
      'reader.contextMenu.open',
      'reader.translation.tap',
    ])
  })

  it('encontra o marcador pelo retangulo quando o caret do renderer cai no paragrafo', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const { foliateEl } = await renderViewer({
      onTranslate,
      onWordLensDefinition,
      wordLensData: {
        levels: { ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['A ubiquitous idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)

    await waitFor(() => expect(fakeDoc.querySelector('.nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, para.firstChild as Text, 0)
    setElementClientRects(word, [{ left: 130, top: 330, right: 230, bottom: 390 }])

    clickAt(para, 180, 360)

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'ubiquitous',
      lemma: 'ubiquitous',
      level: 'C1',
      offset: 2,
    }))
    expect(onTranslate.mock.invocationCallOrder[0]).toBeLessThan(onWordLensDefinition.mock.invocationCallOrder[0])
  })

  it('nao solicita definicao ao tocar palavra sem marcacao Word Lens', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onWordLensDefinition })
    const fakeDoc = makeFakeDoc(['A common idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setCaretRange(fakeDoc, para.firstChild as Text, 4)
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(para, 180, 360)

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).not.toHaveBeenCalled()
  })

  it('nao confunde pontuacao adjacente com a palavra Word Lens', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const { foliateEl } = await renderViewer({
      onTranslate,
      onWordLensDefinition,
      wordLensData: {
        levels: { elaborate: 4 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['Elaborate, but clear.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelector('.nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, word.nextSibling as Text, 0)
    setElementClientRects(word, [{ left: 80, top: 330, right: 170, bottom: 390 }])

    clickAt(para, 180, 360)

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).not.toHaveBeenCalled()
  })

  it('resolve a palavra Word Lens dentro de elemento inline', async () => {
    const onWordLensDefinition = vi.fn()
    const { foliateEl } = await renderViewer({
      onWordLensDefinition,
      wordLensData: {
        levels: { elaborate: 4 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = document.implementation.createHTMLDocument('inline')
    fakeDoc.body.innerHTML = '<p>An <em>elaborate</em> idea.</p>'
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelector('em > .nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, word.firstChild as Text, 2)

    clickAt(para, 180, 360)

    expect(onWordLensDefinition).toHaveBeenCalledWith(expect.objectContaining({
      lemma: 'elaborate',
      surface: 'elaborate',
    }))
  })

  it('mantem o toque sobre Word Lens pertencendo somente ao TTS quando ativo', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const onParagraphTapForTts = vi.fn()
    const { foliateEl } = await renderViewer({
      onTranslate,
      onWordLensDefinition,
      onParagraphTapForTts,
      ttsGlobalActive: true,
      wordLensData: {
        levels: { elaborate: 4 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['An elaborate idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelector('.nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, word.firstChild as Text, 2)

    clickAt(para, 180, 360)

    expect(onParagraphTapForTts).toHaveBeenCalledWith(0)
    expect(onTranslate).not.toHaveBeenCalled()
    expect(onWordLensDefinition).not.toHaveBeenCalled()
  })

  it('reaplica mudança de nível sem recriar o viewer ou alterar o texto do TTS', async () => {
    const wordLensData = {
      levels: { elaborate: 4 as const, ubiquitous: 5 as const, aberration: 6 as const },
      lemmas: {},
      packVersion: 'test',
    }
    const rendered = await renderViewer({ wordLensData })
    const fakeDoc = makeFakeDoc(['elaborate ubiquitous aberration'])
    injectFakeWindow(fakeDoc, 0)
    loadSection(rendered.foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelectorAll('.nr-word-lens')).toHaveLength(3))
    const cachedParagraphCfi = fakeDoc.querySelector('p')?.getAttribute('data-nr-para-cfi')
    expect(cachedParagraphCfi).toBeTruthy()

    const originalViewer = rendered.container.querySelector('foliate-view')
    rendered.rerender(
      <EpubViewer
        ref={rendered.viewerRef}
        {...(defaultProps({ wordLensData, wordLensLevel: 'C1' }) as Parameters<typeof EpubViewer>[0])}
      />,
    )

    await waitFor(() => expect(fakeDoc.querySelectorAll('.nr-word-lens')).toHaveLength(1))
    expect(fakeDoc.querySelector('.nr-word-lens')?.textContent).toBe('aberration')
    expect(rendered.container.querySelector('foliate-view')).toBe(originalViewer)
    expect(rendered.foliateEl.open).toHaveBeenCalledOnce()
    expect(rendered.viewerRef.current?.getParagraphs()).toEqual(['elaborate ubiquitous aberration'])
    expect(fakeDoc.querySelector('p')?.getAttribute('data-nr-para-cfi')).toBe(cachedParagraphCfi)
  })

  it('não marca conteúdo já coberto pelo vocabulário salvo', async () => {
    const { foliateEl } = await renderViewer({
      vocabWords: ['ubiquitous'],
      wordLensData: {
        levels: { ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['A ubiquitous idea.'])
    injectFakeWindow(fakeDoc, 0)
    loadSection(foliateEl, fakeDoc, 0)

    await waitFor(() => expect(fakeDoc.querySelector('.nr-vocab')).not.toBeNull())
    expect(fakeDoc.querySelector('.nr-vocab')?.textContent).toBe('ubiquitous')
    expect(fakeDoc.querySelector('.nr-word-lens')).toBeNull()
  })

  it('chama onError quando open() lança exceção', async () => {
    const onError = vi.fn()

    // failNextOpen configura a flag ANTES de criar o elemento.
    // O FoliateViewMock usa a flag quando open() é chamado.
    failNextOpen(new Error('invalid epub'))

    render(
      <EpubViewer ref={createRef()} {...(defaultProps({ onError }) as Parameters<typeof EpubViewer>[0])} />,
    )
    await act(async () => { await Promise.resolve() })

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('encerra com erro quando init resolve sem uma seção interativa', async () => {
    vi.useFakeTimers()
    try {
      const onError = vi.fn()
      const onLoad = vi.fn()
      const rendered = await renderViewer({ onError, onLoad })

      await act(async () => { vi.advanceTimersByTime(8_000) })

      expect(onError).toHaveBeenCalledOnce()
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
      expect(onLoad).not.toHaveBeenCalled()

      const lateDoc = makeFakeDoc(['Late section.'])
      injectFakeWindow(lateDoc, 0)
      loadSection(rendered.foliateEl, lateDoc, 0)

      expect(onLoad).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancela o watchdog quando a primeira seção fica interativa', async () => {
    vi.useFakeTimers()
    try {
      const onError = vi.fn()
      const onLoad = vi.fn()
      const { foliateEl } = await renderViewer({ onError, onLoad })
      const readyDoc = makeFakeDoc(['Ready section.'])
      injectFakeWindow(readyDoc, 0)

      loadSection(foliateEl, readyDoc, 0)
      await act(async () => { vi.advanceTimersByTime(8_000) })

      expect(onLoad).toHaveBeenCalledOnce()
      expect(onError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('abre diretamente no alvo inicial do indice quando informado', async () => {
    const { foliateEl } = await renderViewer({ initialTarget: 'chapter-2.xhtml#target-heading' })

    expect(foliateEl.init).not.toHaveBeenCalled()
    expect(foliateEl.renderer.goTo).toHaveBeenCalledWith(expect.objectContaining({
      index: 1,
      anchor: expect.any(Function),
    }))
  })

  it('normaliza XHTML malformado e remove scripts antes de entregar ao renderer', async () => {
    const { foliateEl } = await renderViewer()
    const detail = {
      data: '<html xmlns="http://www.w3.org/1999/xhtml"><body><script src="/bad.js" async defer></script><p>Texto</p></body></html>',
      type: 'application/xhtml+xml',
    }

    foliateEl.book!.transformTarget.dispatchEvent(new CustomEvent('data', { detail }))
    const transformed = await detail.data
    const parsed = new DOMParser().parseFromString(transformed, 'application/xhtml+xml')

    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(transformed).not.toContain('<script')
    expect(transformed).not.toContain('async defer')
    expect(parsed.querySelector('p')?.textContent).toBe('Texto')
  })
})

describe('EpubViewer — seleção de texto', () => {
  let fakeDoc: Document
  let paraA: HTMLElement
  let paraB: HTMLElement
  let viewerRef: ReturnType<typeof createRef<EpubViewerHandle>>
  let foliateEl: FoliateViewMock
  let onTranslate: ReturnType<typeof vi.fn>
  let onCenterTap: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    onTranslate = vi.fn()
    onCenterTap = vi.fn()
    const setup = await renderViewer({ onTranslate, onCenterTap })
    viewerRef = setup.viewerRef
    foliateEl = setup.foliateEl

    fakeDoc = makeFakeDoc(['First sentence. Second.', 'Another paragraph.'])
    const paras = fakeDoc.querySelectorAll('p')
    paraA = paras[0] as HTMLElement
    paraB = paras[1] as HTMLElement

    loadSection(foliateEl, fakeDoc, 0)
  })

  it('tap em parágrafo chama onTranslate', () => {
    click(paraA)
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(logEventMock.mock.calls.map(([eventName]) => eventName)).toEqual([
      'reader.selection.start',
      'reader.contextMenu.open',
      'reader.translation.tap',
    ])
    expect(logEventMock).toHaveBeenCalledWith('reader.selection.start', expect.objectContaining({
      flowId: 'reader-translation-test-flow',
      screen: 'reader',
      status: 'start',
      details: expect.objectContaining({
        source: 'tap',
        sectionIndex: 0,
        paragraphIndex: 0,
        textLength: expect.any(Number),
      }),
    }))
    expect(logEventMock).toHaveBeenCalledWith('reader.contextMenu.open', expect.objectContaining({
      flowId: 'reader-translation-test-flow',
      screen: 'reader',
      status: 'success',
      details: expect.objectContaining({
        source: 'tap',
        sectionIndex: 0,
        paragraphIndex: 0,
        textLength: expect.any(Number),
        translationId: expect.any(String),
      }),
    }))
    expect(logEventMock).toHaveBeenCalledWith('reader.translation.tap', expect.objectContaining({
      flowId: 'reader-translation-test-flow',
      screen: 'reader',
      status: 'start',
      details: expect.objectContaining({
        source: 'tap',
        sectionIndex: 0,
        paragraphIndex: 0,
        textLength: expect.any(Number),
        translationId: expect.any(String),
      }),
    }))
  })

  it('tap na lateral direita do texto abre o menu sem traduzir', () => {
    setViewportWidth(fakeDoc, 360)

    clickAt(paraA, 340)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onTranslate).not.toHaveBeenCalled()
    expectTapIgnored('chrome-zone', {
      zone: 'right',
      tapHitsReadableText: false,
      sectionIndex: 0,
      paragraphIndex: 0,
    })
  })

  it('tap em paragrafo na zona superior seleciona o texto', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['First visible paragraph.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    setElementRect(para, { left: 24, top: 32, right: 336, bottom: 120, width: 312, height: 88 })
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(para, 180, 40)

    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledWith('First visible paragraph.')
  })

  it('tap no texto com chrome visivel fecha o chrome e ainda chama onTranslate', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ chromeVisible: true, onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['First sentence. Second.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(para, 180, 360)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onTranslate).toHaveBeenCalledOnce()
  })

  it('tap entre paragrafos seleciona o paragrafo mais proximo', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['First paragraph.', 'Second paragraph.'])
    const [firstPara, secondPara] = Array.from(fakeDoc.querySelectorAll('p')) as HTMLElement[]
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    setElementRect(firstPara, { left: 24, top: 160, right: 336, bottom: 210, width: 312, height: 50 })
    setElementRect(secondPara, { left: 24, top: 330, right: 336, bottom: 380, width: 312, height: 50 })
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(fakeDoc.body, 180, 245)

    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledWith('First paragraph.')
    expect(firstPara.hasAttribute('data-nr-active')).toBe(true)
    expect(secondPara.hasAttribute('data-nr-active')).toBe(false)
  })

  it('tap na area do chrome visivel fecha o chrome sem traduzir', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ chromeVisible: true, onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['First sentence. Second.'])
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(fakeDoc.body, 180, 40)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onTranslate).not.toHaveBeenCalled()
    expectTapIgnored('chrome-zone', {
      zone: 'visible',
      tapHitsReadableText: false,
    })
  })

  it('tap na area superior de menu sem chrome visivel abre o chrome sem traduzir', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['First sentence. Second.'])
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(fakeDoc.body, 180, 40)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onTranslate).not.toHaveBeenCalled()
    expectTapIgnored('chrome-zone', {
      zone: 'visible',
      tapHitsReadableText: false,
    })
  })

  it('tap perto do fim de uma seção bem mais alta que a tela abre a tradução, não trava na zona de chrome', async () => {
    // Reproduz o bug real: em flow=scrolled, cada seção é um iframe do tamanho
    // do PRÓPRIO conteúdo (aqui, 6000px — bem mais alto que uma tela). O
    // último parágrafo real fica perto do fim DESSE documento (5900px), o
    // que fazia o código antigo (que usava a altura do documento da seção
    // como "altura da tela") classificar o toque como "zona de chrome" —
    // mesmo a posição física real, já convertida pra viewport absoluta,
    // caindo bem no meio da tela (ver getPhysicalTapPosition).
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['Last paragraph of a long chapter.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setViewportWidth(fakeDoc, 360)
    // injectFakeWindow dá o defaultView completo (scrollY/addEventListener/etc,
    // usados por setupScrollTracking) — innerHeight/scrollHeight aqui simulam a
    // seção gigante (6000px).
    const fakeWin = injectFakeWindow(fakeDoc, 0, 6000, 6000)
    // Parágrafo termina em 5900 — o clique (abaixo) cai uns pixels DEPOIS do
    // seu rect exato (a "margem" logo após a última linha, achado real em
    // device), então tapHitsReadableText fica false e a checagem de zona de
    // chrome entra em jogo de verdade — sem isso o teste passaria mesmo sem
    // o fix, só por acertar o parágrafo em cheio.
    setElementRect(para, { left: 24, top: 5860, right: 336, bottom: 5900, width: 312, height: 40 })
    loadSection(foliateEl, fakeDoc, 0)

    // <iframe> visto de fora: seu topo está 5500px acima do topo da viewport
    // física atual (rolagem funda dentro da seção gigante).
    ;(fakeWin as unknown as { frameElement: unknown }).frameElement = {
      getBoundingClientRect: () => ({ top: -5500, bottom: 500, left: 0, right: 360, width: 360, height: 6000, x: 0, y: -5500, toJSON: () => ({}) }),
    }

    // Container real do renderer — a viewport física de verdade (720px).
    const rendererEl = document.createElement('div')
    Object.defineProperties(rendererEl, Object.getOwnPropertyDescriptors(foliateEl.renderer))
    const shadow = rendererEl.attachShadow({ mode: 'open' })
    const containerEl = document.createElement('div')
    containerEl.id = 'container'
    Object.defineProperty(containerEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, bottom: 720, left: 0, right: 360, width: 360, height: 720, x: 0, y: 0, toJSON: () => ({}) }),
    })
    shadow.appendChild(containerEl)
    Object.defineProperty(foliateEl, 'renderer', { configurable: true, value: rendererEl })

    // Clique a 5910px de profundidade no documento — 10px depois do fim do
    // parágrafo (5900), na margem logo abaixo da última linha — que
    // corresponde a Y=410 na tela física real (-5500 + 5910), bem no meio da
    // tela, longe das margens de 140/156px.
    clickAt(fakeDoc.body, 180, 5910)

    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledWith('Last paragraph of a long chapter.')
  })

  it('tap fora de paragrafo legivel registra motivo e alterna o chrome', async () => {
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['Hi'])
    setViewportWidth(fakeDoc, 360)
    setViewportHeight(fakeDoc, 720)
    loadSection(foliateEl, fakeDoc, 0)

    clickAt(fakeDoc.body, 180, 360)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onTranslate).not.toHaveBeenCalled()
    expectTapIgnored('no-readable-paragraph', {
      chromeVisible: false,
    })
  })

  it('apenas um parágrafo tem data-nr-active por vez', () => {
    click(paraA)
    // Simula ReaderScreen: libera lock após 1ª tradução concluir
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Tradução A') })

    click(paraB)

    // paraA perde o highlight ao selecionar paraB
    expect(paraA.hasAttribute('data-nr-active')).toBe(false)
    expect(paraB.hasAttribute('data-nr-active')).toBe(true)
  })

  it('tap no mesmo parágrafo ativo remove a seleção (toggle off)', () => {
    click(paraA)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Tradução A') })

    // Segundo tap no mesmo parágrafo = toggle off
    click(paraA)

    expect(paraA.hasAttribute('data-nr-active')).toBe(false)
    expect(onTranslate).toHaveBeenCalledOnce() // não chamou uma 2ª vez
  })

  it('tap no mesmo parágrafo durante loading é ignorado e mantém o spinner', () => {
    click(paraA)
    act(() => { viewerRef.current?.showTranslationLoading() })

    click(paraA)

    const block = fakeDoc.getElementById('nr-translation-block')
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(paraA.hasAttribute('data-nr-active')).toBe(true)
    expect(block?.querySelector('.nr-tr-spinner')).not.toBeNull()
    expectTapIgnored('translation-loading', {
      sectionIndex: 0,
      paragraphIndex: 0,
    })
  })

  it('tap em paragrafo durante TTS ativo navega o TTS e registra motivo', async () => {
    const onTranslate = vi.fn()
    const onParagraphTapForTts = vi.fn()
    const { foliateEl } = await renderViewer({
      onTranslate,
      onParagraphTapForTts,
      ttsGlobalActive: true,
    })
    const fakeDoc = makeFakeDoc(['First TTS paragraph.', 'Second TTS paragraph.'])
    const paras = fakeDoc.querySelectorAll('p')
    loadSection(foliateEl, fakeDoc, 0)

    click(paras[1]!)

    expect(onParagraphTapForTts).toHaveBeenCalledWith(1)
    expect(onTranslate).not.toHaveBeenCalled()
    expectTapIgnored('tts-active', {
      sectionIndex: 0,
      paragraphIndex: 1,
      ttsParagraphIndex: 1,
    })
  })

  it('toggle off após tradução reintegra o texto movido para o remainder', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc(['First sentence. Second sentence.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setCaretRange(fakeDoc, para.firstChild as Text, 2)
    loadSection(foliateEl, fakeDoc, 0)

    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })

    expect(para.textContent).toBe('First sentence.')
    expect(fakeDoc.getElementById('nr-para-remainder')?.textContent).toBe(' Second sentence.')

    act(() => { viewerRef.current?.injectTranslation('Tradução A') })
    click(para)

    expect(para.textContent).toBe('First sentence. Second sentence.')
    expect(fakeDoc.getElementById('nr-translation-block')).toBeNull()
    expect(fakeDoc.getElementById('nr-para-remainder')).toBeNull()
    expect(para.hasAttribute('data-nr-active')).toBe(false)
    expect(onTranslate).toHaveBeenCalledOnce()
  })

  it('selecionar outro parágrafo após tradução limpa o bloco anterior', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc(['First paragraph.', 'Other paragraph.'])
    const [firstPara, secondPara] = Array.from(fakeDoc.querySelectorAll('p')) as HTMLElement[]
    loadSection(foliateEl, fakeDoc, 0)

    click(firstPara)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Tradução A') })

    click(secondPara)

    expect(firstPara.textContent).toBe('First paragraph.')
    expect(firstPara.hasAttribute('data-nr-active')).toBe(false)
    expect(secondPara.hasAttribute('data-nr-active')).toBe(true)
    expect(fakeDoc.getElementById('nr-translation-block')).toBeNull()
    expect(fakeDoc.getElementById('nr-para-remainder')).toBeNull()
    expect(onTranslate).toHaveBeenCalledTimes(2)
    expect(onTranslate).toHaveBeenLastCalledWith('Other paragraph.')
  })
})

// ─── Highlights de trecho selecionado (feature 010) ────────────────────────

/** Substitui doc.getSelection() por um stub controlável — jsdom não implementa
 * Selection de verdade em documentos avulsos (document.implementation.createHTMLDocument). */
function setDocSelection(doc: Document, range: Range | null) {
  const selectionStub = {
    isCollapsed: !range || range.collapsed,
    rangeCount: range ? 1 : 0,
    getRangeAt: () => range as Range,
    removeAllRanges: vi.fn(),
  }
  Object.defineProperty(doc, 'getSelection', {
    configurable: true,
    value: () => selectionStub,
  })
  return selectionStub
}

function fireSelectionChange(doc: Document) {
  act(() => { doc.dispatchEvent(new Event('selectionchange')) })
}

/** Seleciona todo o conteúdo de texto de `el` — não colapsado, texto não vazio. */
function selectWholeText(doc: Document, el: Element): Range {
  const range = doc.createRange()
  range.selectNodeContents(el)
  return range
}

/** O menu de seleção abre no modo 'root' (Copiar/Compartilhar/Destacar); as
 * cores só aparecem depois de tocar em "Destacar" (submenu). */
function openColorsSubmenu(doc: Document): HTMLElement {
  const menu = doc.getElementById('nr-selection-menu') as HTMLElement
  const openColorsBtn = menu.querySelector('[data-nr-selection-open-colors]') as HTMLElement
  click(openColorsBtn)
  return menu
}

describe('EpubViewer — highlights de trecho selecionado', () => {
  let fakeDoc: Document
  let para: HTMLElement
  let onTranslate: ReturnType<typeof vi.fn>
  let onCreateHighlight: ReturnType<typeof vi.fn>
  let foliateEl: FoliateViewMock
  let viewerRef: ReturnType<typeof createRef<EpubViewerHandle>>

  beforeEach(async () => {
    onTranslate = vi.fn()
    onCreateHighlight = vi.fn()
    const setup = await renderViewer({ onTranslate, onCreateHighlight })
    foliateEl = setup.foliateEl
    viewerRef = setup.viewerRef

    fakeDoc = makeFakeDoc(['First sentence. Second sentence.'])
    para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
  })

  it('T011: click com seleção ativa desde o touchstart é ignorado e não chama onTranslate', () => {
    setDocSelection(fakeDoc, selectWholeText(fakeDoc, para))
    touchAt(fakeDoc.documentElement, 'touchstart', 100, 300)

    click(para)

    expectTapIgnored('text-selection')
    expect(onTranslate).not.toHaveBeenCalled()
  })

  it('T012: sem seleção, o toque curto continua abrindo a tradução (anti-regressão)', () => {
    setDocSelection(fakeDoc, null)
    touchAt(fakeDoc.documentElement, 'touchstart', 100, 300)

    click(para)

    expect(onTranslate).toHaveBeenCalledOnce()
  })

  it('T013: gesto de rolagem continua caindo em scroll-gesture, sem criar seleção nem menu', () => {
    setDocSelection(fakeDoc, null)
    touchAt(fakeDoc.documentElement, 'touchstart', 100, 300)
    touchAt(fakeDoc.documentElement, 'touchmove', 100, 400)

    click(para)

    expectTapIgnored('scroll-gesture')
    expect(fakeDoc.getElementById('nr-selection-menu')?.hidden).not.toBe(false)
  })

  it('T013a: as quatro rejeições de FR-006 não abrem o menu', () => {
    // (a) seleção colapsada
    const collapsed = fakeDoc.createRange()
    collapsed.setStart(para.firstChild as Text, 3)
    collapsed.collapse(true)
    setDocSelection(fakeDoc, collapsed)
    fireSelectionChange(fakeDoc)
    expect(fakeDoc.getElementById('nr-selection-menu')?.hidden).not.toBe(false)

    // (b) só espaços/quebras
    const wsText = fakeDoc.createTextNode('   ')
    para.appendChild(wsText)
    const wsRange = fakeDoc.createRange()
    wsRange.selectNodeContents(wsText)
    setDocSelection(fakeDoc, wsRange)
    fireSelectionChange(fakeDoc)
    expect(fakeDoc.getElementById('nr-selection-menu')?.hidden).not.toBe(false)
    wsText.remove()

    // (c) contida no #nr-translation-block
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    const block = fakeDoc.getElementById('nr-translation-block')
    expect(block).not.toBeNull()
    const textSlot = block!.querySelector('[data-nr-translation-slot]') as HTMLElement
    textSlot.textContent = 'Texto traduzido de teste'
    const blockRange = fakeDoc.createRange()
    blockRange.selectNodeContents(textSlot)
    setDocSelection(fakeDoc, blockRange)
    fireSelectionChange(fakeDoc)
    expect(fakeDoc.getElementById('nr-selection-menu')?.hidden).not.toBe(false)

    // (d) startContainer/endContainer em documentos diferentes
    const otherDoc = makeFakeDoc(['Other doc paragraph.'])
    const otherPara = otherDoc.querySelector('p') as HTMLElement
    const crossRange = fakeDoc.createRange()
    crossRange.setStart(para.firstChild as Text, 0)
    crossRange.setEnd(otherPara.firstChild as Text, 3)
    setDocSelection(fakeDoc, crossRange)
    fireSelectionChange(fakeDoc)
    expect(fakeDoc.getElementById('nr-selection-menu')?.hidden).not.toBe(false)
  })

  // ── Submenu de cores (achado do usuário testando em device: as 8 cores
  // direto na fileira tomavam espaço demais; agora ficam atrás de um único
  // botão "Destacar") ──────────────────────────────────────────────────────
  it('T062: o menu abre no modo raiz (Copiar/Compartilhar/Destacar), sem as cores visiveis ainda', () => {
    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)

    const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
    expect(menu.querySelector('[data-nr-selection-run="copy"]')).not.toBeNull()
    expect(menu.querySelector('[data-nr-selection-run="share"]')).not.toBeNull()
    expect(menu.querySelector('[data-nr-selection-open-colors]')).not.toBeNull()
    expect(menu.querySelectorAll('[data-nr-selection-color]').length).toBe(0)
  })

  it('T063: tocar em Destacar abre o submenu com as 8 cores e um botao de voltar; voltar retorna ao modo raiz', () => {
    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)
    const menu = openColorsSubmenu(fakeDoc)

    expect(menu.querySelectorAll('[data-nr-selection-color]').length).toBe(8)
    expect(menu.querySelector('[data-nr-selection-back]')).not.toBeNull()
    expect(menu.querySelector('[data-nr-selection-run="copy"]')).toBeNull()

    const backBtn = menu.querySelector('[data-nr-selection-back]') as HTMLElement
    click(backBtn)

    expect(menu.querySelectorAll('[data-nr-selection-color]').length).toBe(0)
    expect(menu.querySelector('[data-nr-selection-run="copy"]')).not.toBeNull()
  })

  it('T064: uma nova selecao sempre abre no modo raiz, mesmo se a anterior tinha ficado no submenu de cores', () => {
    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)
    const menu = openColorsSubmenu(fakeDoc)
    expect(menu.querySelectorAll('[data-nr-selection-color]').length).toBe(8)

    // dispensa (seleção colapsa) e cria uma seleção nova
    setDocSelection(fakeDoc, null)
    fireSelectionChange(fakeDoc)
    expect(menu.hidden).toBe(true)

    setDocSelection(fakeDoc, selectWholeText(fakeDoc, para))
    fireSelectionChange(fakeDoc)

    expect(menu.hidden).toBe(false)
    expect(menu.querySelectorAll('[data-nr-selection-color]').length).toBe(0)
    expect(menu.querySelector('[data-nr-selection-open-colors]')).not.toBeNull()
  })

  it('T014: escolher uma cor chama onCreateHighlight com CFI de intervalo (range não colapsado), texto e cor', () => {
    foliateEl.getCFI.mockImplementation((_index: number, range?: Range | null) => (
      range?.collapsed ? 'epubcfi(collapsed)' : 'epubcfi(/6/4!/4/2/1:0,/1:32)'
    ))

    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)

    const menu = fakeDoc.getElementById('nr-selection-menu')
    expect(menu?.hidden).toBe(false)
    openColorsSubmenu(fakeDoc)
    const colorBtn = menu!.querySelector('[data-nr-selection-color="indigo"]') as HTMLElement
    expect(colorBtn).not.toBeNull()

    click(colorBtn)

    expect(onCreateHighlight).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/4!/4/2/1:0,/1:32)',
      text: 'First sentence. Second sentence.',
      sectionIndex: 0,
      color: 'indigo',
    }))
    expect(foliateEl.getCFI).toHaveBeenCalledWith(0, expect.objectContaining({ collapsed: false }))
  })

  // T014b (ad-hoc, achado em device RXCX103NMVZ testando T024): no Android o
  // WebView colapsa a seleção nativa como parte de processar o PRÓPRIO toque
  // no swatch de cor — 'selectionchange' dispara com seleção vazia ANTES do
  // 'click' do swatch rodar. Sem o fallback pro último range elegível, o
  // toque na cor não fazia nada. Ver R-009 em plan.md.
  it('T014b: escolher uma cor ainda cria o highlight mesmo se a seleção nativa colapsar antes do click (corrida do Android)', () => {
    foliateEl.getCFI.mockImplementation((_index: number, range?: Range | null) => (
      range?.collapsed ? 'epubcfi(collapsed)' : 'epubcfi(/6/4!/4/2/1:0,/1:32)'
    ))

    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)
    const menu = openColorsSubmenu(fakeDoc)
    const colorBtn = menu.querySelector('[data-nr-selection-color="indigo"]') as HTMLElement

    // O toque no swatch colapsa a seleção nativa ANTES do click chegar —
    // reproduz exatamente a ordem observada em device.
    setDocSelection(fakeDoc, null)
    fireSelectionChange(fakeDoc)
    expect(menu.hidden).toBe(true)

    click(colorBtn)

    expect(onCreateHighlight).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/4!/4/2/1:0,/1:32)',
      color: 'indigo',
    }))
  })

  it('T014a: seleção deixar de ser elegível fecha o menu sem criar highlight; mudar de extensão reancora', () => {
    const range = selectWholeText(fakeDoc, para)
    setDocSelection(fakeDoc, range)
    fireSelectionChange(fakeDoc)
    const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
    expect(menu.hidden).toBe(false)
    const topWhenOpen = menu.style.top

    // Seleção muda de extensão (usuário arrastando uma alça) — reancora, não recria.
    const narrower = fakeDoc.createRange()
    narrower.setStart(para.firstChild as Text, 0)
    narrower.setEnd(para.firstChild as Text, 5)
    setDocSelection(fakeDoc, narrower)
    fireSelectionChange(fakeDoc)
    expect(fakeDoc.getElementById('nr-selection-menu')).toBe(menu)
    expect(menu.hidden).toBe(false)
    void topWhenOpen

    // Seleção deixa de ser elegível (colapsada) — fecha sem criar highlight.
    setDocSelection(fakeDoc, null)
    fireSelectionChange(fakeDoc)
    expect(menu.hidden).toBe(true)
    expect(onCreateHighlight).not.toHaveBeenCalled()
  })

  // T024a-c (ad-hoc, achados rodando o Passo 6 do quickstart em Chromium real
  // via Playwright MCP): três bugs que jsdom não pegava porque o harness roda
  // tudo no mesmo realm e com passos discretos. Ver R-010/R-011/R-012 em plan.md.

  // Na web a seleção NASCE durante o arrasto: no pointerdown não havia nada,
  // então a guarda de estado-no-início-do-gesto (T011) não via seleção alguma e
  // o click que encerra o arrasto abria a tradução e fechava o menu.
  it('T024a: o click que encerra o arrasto de seleção (web/mouse) é ignorado e mantém o menu aberto', () => {
    setDocSelection(fakeDoc, null)
    act(() => { fakeDoc.documentElement.dispatchEvent(new Event('pointerdown', { bubbles: true })) })

    // seleção aparece durante o arrasto, antes do mouseup/click
    setDocSelection(fakeDoc, selectWholeText(fakeDoc, para))
    fireSelectionChange(fakeDoc)
    const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
    expect(menu.hidden).toBe(false)

    click(para)

    expectTapIgnored('text-selection')
    expect(onTranslate).not.toHaveBeenCalled()
    expect(menu.hidden).toBe(false)
  })

  // `ev.target instanceof Element` é sempre falso para eventos vindos do iframe
  // do EPUB (realms diferentes), então o `target` do handler cai no
  // documentElement e `closest('[data-nr-selection-color]')` nunca acha o
  // swatch — o clique na cor não fazia nada em browser real.
  it('T024b: o swatch é resolvido por coordenada quando o target do evento não serve (cross-realm)', () => {
    foliateEl.getCFI.mockImplementation((_index: number, range?: Range | null) => (
      range?.collapsed ? 'epubcfi(collapsed)' : 'epubcfi(/6/4!/4/2/1:0,/1:32)'
    ))

    setDocSelection(fakeDoc, selectWholeText(fakeDoc, para))
    fireSelectionChange(fakeDoc)
    openColorsSubmenu(fakeDoc)
    const colorBtn = fakeDoc.querySelector('[data-nr-selection-color="rose"]') as HTMLElement
    setElementRect(colorBtn, { left: 200, top: 100, right: 224, bottom: 124, width: 24, height: 24 })

    // click cujo target é o documentElement (o que o browser real entrega),
    // com as coordenadas em cima do swatch
    clickAt(fakeDoc.documentElement, 212, 112)

    expect(onCreateHighlight).toHaveBeenCalledWith(expect.objectContaining({ color: 'rose' }))
  })

  it('T024c: a pintura passa a cor CSS da paleta, não a chave (o overlayer joga o valor no fill do SVG)', async () => {
    const highlights = [
      { id: 1, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)', text: 'trecho', color: 'amber', sectionIndex: 3, percentage: 40, createdAt: new Date() },
    ]
    const setup = await renderViewer({ highlights })
    loadSection(setup.foliateEl, makeFakeDoc(['Section paragraph.']), 3)

    await waitFor(() => {
      expect(setup.foliateEl.addAnnotation).toHaveBeenCalledWith({ value: 'epubcfi(/6/4!/4/2/1:0,/1:10)' })
    })
    const { overlayer } = setup.foliateEl.renderer.getContents()[0]
    await waitFor(() => {
      expect(overlayer.add).toHaveBeenCalledWith(
        'epubcfi(/6/4!/4/2/1:0,/1:10)',
        expect.anything(),
        expect.anything(),
        { color: '#f59e0b' },
      )
    })
  })

  // T024e (ad-hoc, achado em device abrindo o leitor direto num CFI a partir
  // da US4): a navegação inicial do próprio leitor para o CFI-alvo corre com
  // a nossa chamada de addAnnotation para o mesmo alvo — o CFI resolve (a
  // MESMA chamada, feita um instante depois, pinta normalmente) mas
  // 'draw-annotation' não dispara na primeira tentativa, sem erro nenhum.
  // Reproduz aqui fazendo o addAnnotation resolver sem emitir o evento uma
  // vez, então funcionar normalmente. Ver R-015 em plan.md.
  it('T024e: quando draw-annotation não dispara na 1ª tentativa, uma retentativa pinta mesmo assim', async () => {
    const highlights = [
      { id: 2, bookId: 1, cfi: 'epubcfi(/6/6!/4/2/1:0,/1:12)', paraCfi: 'epubcfi(/6/6!/4/2/1:0)', text: 'trecho', color: 'rose', sectionIndex: 5, percentage: 60, createdAt: new Date() },
    ]
    const setup = await renderViewer({ highlights })
    // 1ª chamada: resolve como o foliate real faz na corrida — sem emitir 'draw-annotation'
    setup.foliateEl.addAnnotation.mockImplementationOnce(() => Promise.resolve(undefined))
    loadSection(setup.foliateEl, makeFakeDoc(['Section paragraph.']), 5)

    await waitFor(() => {
      expect(setup.foliateEl.addAnnotation).toHaveBeenCalledTimes(2)
    }, { timeout: 2000 })
    const { overlayer } = setup.foliateEl.renderer.getContents()[0]
    await waitFor(() => {
      expect(overlayer.add).toHaveBeenCalledWith(
        'epubcfi(/6/6!/4/2/1:0,/1:12)',
        expect.anything(),
        expect.anything(),
        { color: '#f43f5e' },
      )
    })
  })

  // T024d (ad-hoc, achado em device RXCX103NMVZ): os highlights vêm de um
  // useLiveQuery, então na reabertura do livro a lista quase sempre chega
  // DEPOIS de 'load'/'create-overlay' — que repintavam com a lista vazia e
  // nunca mais. Sintoma: highlight gravado no banco, mas livro reabre sem
  // marcação nenhuma. Ver R-013 em plan.md.
  it('T024d: highlights que chegam depois do load da seção ainda são pintados', async () => {
    const { foliateEl, viewerRef, props, rerender } = await renderViewer({ highlights: [] })
    loadSection(foliateEl, makeFakeDoc(['Section paragraph.']), 3)
    expect(foliateEl.addAnnotation).not.toHaveBeenCalled()

    const highlights = [
      { id: 1, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)', text: 'trecho', color: 'indigo', sectionIndex: 3, percentage: 40, createdAt: new Date() },
    ]
    await act(async () => {
      rerender(
        <EpubViewer ref={viewerRef} {...({ ...props, highlights } as Parameters<typeof EpubViewer>[0])} />,
      )
    })

    await waitFor(() => {
      expect(foliateEl.addAnnotation).toHaveBeenCalledWith({ value: 'epubcfi(/6/4!/4/2/1:0,/1:10)' })
    })
  })

  // ── US3: gerenciar um highlight existente pelo próprio texto ────────────
  // O toque sobre um highlight é detectado pelo hitTest do overlayer da seção
  // (mesma fonte que o foliate usa pro 'show-annotation'), consultado dentro
  // do nosso listener de click — assim o roteamento não depende da ordem em
  // que os dois listeners foram registrados no mesmo documento (R-005).
  async function renderComHighlightPintado(overrides: Record<string, unknown> = {}) {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const setup = await renderViewer({ highlights: [highlight], ...overrides })
    const doc = makeFakeDoc(['First sentence. Second sentence.'])
    loadSection(setup.foliateEl, doc, 0)
    const { overlayer } = setup.foliateEl.renderer.getContents()[0]
    return { ...setup, doc, para: doc.querySelector('p') as HTMLElement, highlight, overlayer }
  }

  it('T030: toque sobre um highlight abre o menu do highlight (colapsado) e nao chama onTranslate', async () => {
    const onTranslateSpy = vi.fn()
    const { doc, para, highlight, overlayer } = await renderComHighlightPintado({ onTranslate: onTranslateSpy })
    // hitTest do overlayer responde que o ponto caiu sobre este highlight
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)

    const menu = doc.getElementById('nr-highlight-menu')
    expect(menu?.hidden).toBe(false)
    expect(menu?.querySelector('[data-nr-highlight-remove]')).not.toBeNull()
    // Colapsado: cor/estilo ficam atras de 1 botao, nao aparecem direto.
    expect(menu?.querySelector('[data-nr-highlight-open-colors]')).not.toBeNull()
    expect(menu?.querySelectorAll('[data-nr-highlight-color]').length).toBe(0)
    expect(onTranslateSpy).not.toHaveBeenCalled()
    expectTapIgnored('highlight-menu')
  })

  it('T030b: tocar no botao de aparencia expande estilo+cor; voltar recolapsa', async () => {
    const { doc, para, highlight, overlayer } = await renderComHighlightPintado()
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    click(menu.querySelector('[data-nr-highlight-open-colors]') as HTMLElement)

    expect(menu.querySelectorAll('[data-nr-highlight-color]').length).toBe(8)
    expect(menu.querySelector('[data-nr-highlight-style]')).not.toBeNull()
    expect(menu.querySelector('[data-nr-highlight-back]')).not.toBeNull()
    // Anotar/Remover somem enquanto o submenu de cor/estilo esta aberto.
    expect(menu.querySelector('[data-nr-highlight-annotate]')).toBeNull()
    expect(menu.querySelector('[data-nr-highlight-remove]')).toBeNull()
    expect(menu.hidden).toBe(false)

    click(menu.querySelector('[data-nr-highlight-back]') as HTMLElement)

    expect(menu.querySelectorAll('[data-nr-highlight-color]').length).toBe(0)
    expect(menu.querySelector('[data-nr-highlight-remove]')).not.toBeNull()
    expect(menu.hidden).toBe(false)
  })

  it('T031: toque numa parte SEM highlight do mesmo paragrafo continua traduzindo', async () => {
    const onTranslateSpy = vi.fn()
    const { doc, para, overlayer } = await renderComHighlightPintado({ onTranslate: onTranslateSpy })
    // hitTest vazio = ponto fora de qualquer highlight
    overlayer.hitTest.mockReturnValue([])

    clickAt(para, 120, 400)

    expect(doc.getElementById('nr-highlight-menu')?.hidden).not.toBe(false)
    expect(onTranslateSpy).toHaveBeenCalledOnce()
  })

  // ── Bugfix highlight-some-ao-tocar-no-mesmo ──────────────────────────────
  // Causa raiz de verdade (confirmada lendo foliate-js/view.js): surroundContents
  // (usado por .nr-hl-sentence, o wrapper da traducao inline) divide nos de
  // texto e pode invalidar o caminho que o CFI de OUTRO highlight da mesma
  // secao espera encontrar no DOM — addAnnotation resolve normalmente, mas
  // 'draw-annotation' nunca dispara pra esse highlight (some, silenciosamente,
  // sem erro). A correcao evita QUALQUER mutacao de DOM ao traduzir quando a
  // secao ja tem highlights, caindo pro fallback seguro (.nr-hl, so classe CSS
  // no proprio paragrafo, sem mexer na arvore).
  it('T044: traduzir noutra parte do paragrafo NAO muta o DOM quando a secao tem highlights (usa fallback seguro)', async () => {
    const onTranslateSpy = vi.fn()
    const { doc, para, overlayer } = await renderComHighlightPintado({ onTranslate: onTranslateSpy })
    // hitTest vazio = o toque nao caiu sobre o highlight em si
    overlayer.hitTest.mockReturnValue([])

    clickAt(para, 120, 400)

    expect(onTranslateSpy).toHaveBeenCalledOnce()
    // Fallback seguro: classe no paragrafo, SEM span .nr-hl-sentence (que
    // exigiria surroundContents, arriscando o CFI do highlight existente).
    expect(para.classList.contains('nr-hl')).toBe(true)
    expect(doc.querySelector('.nr-hl-sentence')).toBeNull()
  })

  it('T044b: traduzir noutra parte do paragrafo AINDA usa .nr-hl-sentence quando a secao NAO tem highlights', async () => {
    const onTranslateSpy = vi.fn()
    const setup = await renderViewer({ onTranslate: onTranslateSpy })
    const doc = makeFakeDoc(['First sentence. Second sentence.'])
    const para = doc.querySelector('p') as HTMLElement
    loadSection(setup.foliateEl, doc, 0)

    clickAt(para, 120, 360)

    expect(onTranslateSpy).toHaveBeenCalledOnce()
    expect(doc.querySelector('.nr-hl-sentence')).not.toBeNull()
    expect(para.classList.contains('nr-hl')).toBe(false)
  })

  it('T032: remover chama deleteAnnotation e trocar a cor repinta na cor nova', async () => {
    const onDeleteHighlight = vi.fn()
    const onChangeHighlightAppearance = vi.fn()
    const { foliateEl, doc, para, highlight, overlayer } = await renderComHighlightPintado({
      onDeleteHighlight,
      onChangeHighlightAppearance,
    })
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    // abre o menu tocando no highlight, depois expande cor/estilo
    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    click(menu.querySelector('[data-nr-highlight-open-colors]') as HTMLElement)

    // troca a cor
    click(menu.querySelector('[data-nr-highlight-color="rose"]') as HTMLElement)
    expect(onChangeHighlightAppearance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), { color: 'rose' })
    await waitFor(() => {
      expect(overlayer.add).toHaveBeenCalledWith(
        highlight.cfi, expect.anything(), expect.anything(), { color: '#f43f5e' },
      )
    })
    expect(menu.hidden).toBe(true)

    // reabre e remove
    clickAt(para, 120, 130)
    click(menu.querySelector('[data-nr-highlight-remove]') as HTMLElement)
    expect(onDeleteHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
    expect(foliateEl.deleteAnnotation).toHaveBeenCalledWith({ value: highlight.cfi })
    expect(menu.hidden).toBe(true)
  })

  it('T032b: menu do highlight abre com o estilo atual marcado e trocar o estilo aplica na hora sem fechar', async () => {
    const onChangeHighlightAppearance = vi.fn()
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', style: 'underline' as const, sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const setup = await renderViewer({ highlights: [highlight], onChangeHighlightAppearance })
    const doc = makeFakeDoc(['First sentence. Second sentence.'])
    loadSection(setup.foliateEl, doc, 0)
    const { overlayer } = setup.foliateEl.renderer.getContents()[0]
    const para = doc.querySelector('p') as HTMLElement
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    expect(menu?.hidden).toBe(false)
    click(menu.querySelector('[data-nr-highlight-open-colors]') as HTMLElement)
    expect(menu.querySelector('[data-nr-highlight-style="underline"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(menu.querySelector('[data-nr-highlight-style="background"]')?.getAttribute('aria-pressed')).toBe('false')

    // troca pro estilo ondulado: aplica na hora e NAO fecha o menu
    click(menu.querySelector('[data-nr-highlight-style="squiggly"]') as HTMLElement)
    expect(onChangeHighlightAppearance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), { style: 'squiggly' })
    await waitFor(() => {
      expect(overlayer.add).toHaveBeenCalledWith(
        highlight.cfi, expect.anything(), expect.anything(), { color: '#6366f1' },
      )
    })
    expect(menu.hidden).toBe(false)
    expect(menu.querySelector('[data-nr-highlight-style="squiggly"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  // ── Ad-hoc: indicador de cor ativa no menu de gerenciar highlight ────────
  it('T032c: menu do highlight abre com a cor atual marcada; trocar de cor atualiza qual fica marcada', async () => {
    const onChangeHighlightAppearance = vi.fn()
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const { foliateEl, props, rerender } = await renderViewer({ highlights: [highlight], onChangeHighlightAppearance })
    const doc = makeFakeDoc(['First sentence. Second sentence.'])
    loadSection(foliateEl, doc, 0)
    const { overlayer } = foliateEl.renderer.getContents()[0]
    const para = doc.querySelector('p') as HTMLElement
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    click(menu.querySelector('[data-nr-highlight-open-colors]') as HTMLElement)
    expect(menu.querySelector('[data-nr-highlight-color="indigo"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(menu.querySelector('[data-nr-highlight-color="rose"]')?.getAttribute('aria-pressed')).toBe('false')

    click(menu.querySelector('[data-nr-highlight-color="rose"]') as HTMLElement)
    expect(onChangeHighlightAppearance).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), { color: 'rose' })

    // simula o round-trip do Dexie (useLiveQuery emitindo a lista com a
    // cor já atualizada) e reabre o menu — confirma que a marca acompanha
    const highlightComNovaCor = { ...highlight, color: 'rose' }
    await act(async () => {
      rerender(
        <EpubViewer {...({ ...props, highlights: [highlightComNovaCor] } as Parameters<typeof EpubViewer>[0])} />,
      )
    })
    clickAt(para, 120, 130)
    click(menu.querySelector('[data-nr-highlight-open-colors]') as HTMLElement)
    expect(menu.querySelector('[data-nr-highlight-color="rose"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(menu.querySelector('[data-nr-highlight-color="indigo"]')?.getAttribute('aria-pressed')).toBe('false')
  })

  // ── Anotação de texto associada ao highlight (feature 013) ──────────────
  it('T033: menu do highlight sem nota mostra "Anotar"', async () => {
    const { doc, para, highlight, overlayer } = await renderComHighlightPintado()
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    expect(menu.querySelector('[data-nr-highlight-annotate]')?.textContent).toBe('Anotar')
  })

  it('T034: menu do highlight com nota mostra "Editar anotacao"', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const setup = await renderViewer({ highlights: [highlight] })
    const doc = makeFakeDoc(['First sentence. Second sentence.'])
    loadSection(setup.foliateEl, doc, 0)
    const { overlayer } = setup.foliateEl.renderer.getContents()[0]
    const para = doc.querySelector('p') as HTMLElement
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    expect(menu.querySelector('[data-nr-highlight-annotate]')?.textContent).toBe('Editar anotacao')
  })

  it('T035: tocar em Anotar chama onAnnotateHighlight e fecha o menu, sem chamar remover/trocar', async () => {
    const onAnnotateHighlight = vi.fn()
    const onDeleteHighlight = vi.fn()
    const onChangeHighlightAppearance = vi.fn()
    const { doc, para, highlight, overlayer } = await renderComHighlightPintado({
      onAnnotateHighlight,
      onDeleteHighlight,
      onChangeHighlightAppearance,
    })
    overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

    clickAt(para, 120, 130)
    const menu = doc.getElementById('nr-highlight-menu') as HTMLElement
    click(menu.querySelector('[data-nr-highlight-annotate]') as HTMLElement)

    expect(onAnnotateHighlight).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
    expect(menu.hidden).toBe(true)
    expect(onDeleteHighlight).not.toHaveBeenCalled()
    expect(onChangeHighlightAppearance).not.toHaveBeenCalled()
  })

  // ── Indicador de anotação (US1/feature 014) ──────────────────────────────
  // JSDOM não implementa layout de verdade — Range.prototype.getClientRects
  // tem um default seguro em setup.ts (array vazio), mas pra testar a
  // POSIÇÃO real da aba precisamos de um rect específico. Como o range é
  // criado internamente pelo mock de addAnnotation (target.doc.createRange()),
  // não dá pra estubar a instância — patcheamos o protótipo pra esta
  // chamada e restauramos depois (vi.clearAllMocks() do afterEach global
  // NÃO desfaz um spy no protótipo, só limpa histórico de chamadas).
  function stubRangeClientRects(rects: Array<Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>>) {
    // height derivada de bottom-top (mesma conta de um DOMRect real) —
    // upsertNoteTab usa rect.height pra dimensionar a aba (feature 014).
    const withHeight = rects.map((r) => ({ ...r, height: r.bottom - r.top }))
    return vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(withHeight as unknown as DOMRectList)
  }

  it('T036: highlight com nota ganha uma aba de indicador ancorada ao inicio do trecho', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 60, bottom: 136 }])
    try {
      const setup = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)

      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })
      const tab = doc.querySelector('[data-nr-highlight-note-tab]') as HTMLElement
      expect(tab.dataset.nrHighlightNoteTab).toBe(highlight.cfi)
      expect(tab.className).toBe('nr-highlight-note-tab')
      // Ancorada NO inicio do trecho (rect.top/left diretos) — a
      // legibilidade do texto por cima vem da opacidade do background
      // (CSS), nao de deslocar a aba pra fora da area do texto (ver
      // plan.md R-004, correcao final). Largura ~ 1a palavra de
      // highlight.text ("First"): 5 chars * 8.5px = 42.5px. Altura =
      // rect.height (bottom 136 - top 120 = 16).
      expect(tab.style.top).toBe('120px')
      expect(tab.style.left).toBe('40px')
      expect(tab.style.width).toBe('42.5px')
      expect(tab.style.height).toBe('16px')
    } finally {
      rectsSpy.mockRestore()
    }
  })

  it('T037: highlight sem nota nao ganha aba de indicador', async () => {
    const { doc, highlight, overlayer } = await renderComHighlightPintado()

    // Espera o paint (assincrono) de fato acontecer antes de checar a
    // ausencia da aba — senão a asserção passaria mesmo sem o paint ter
    // rodado ainda.
    await waitFor(() => {
      expect(overlayer.add).toHaveBeenCalledWith(highlight.cfi, expect.anything(), expect.anything(), expect.anything())
    })
    expect(doc.querySelector('[data-nr-highlight-note-tab]')).toBeNull()
  })

  it('T038: remover o texto da nota (highlight atualizado) remove a aba na repintura seguinte', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 60, bottom: 136 }])
    try {
      const { foliateEl, props, rerender } = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })

      const semNota = { ...highlight, note: undefined }
      await act(async () => {
        rerender(
          <EpubViewer {...({ ...props, highlights: [semNota] } as Parameters<typeof EpubViewer>[0])} />,
        )
      })

      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).toBeNull()
      })
    } finally {
      rectsSpy.mockRestore()
    }
  })

  it('T043b: com nota, o overlay pinta indicador e highlight em grupos separados (sem 2 camadas translucidas empilhadas)', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'rose', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 240, bottom: 136 }])
    try {
      const setup = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })

      const { overlayer } = setup.foliateEl.renderer.getContents()[0]
      const call = overlayer.add.mock.calls.find((c: unknown[]) => c[0] === highlight.cfi)
      expect(call).toBeDefined()
      const drawFn = call![2] as (rects: unknown[], opts?: { color?: string }) => SVGElement

      // Chama o draw function de verdade (nao o mock) com um rect largo,
      // pra confirmar que ele DIVIDE em 2 grupos (indicador + resto) em
      // vez de desenhar duas camadas sobrepostas na mesma area.
      const g = drawFn(
        [{ left: 40, top: 120, right: 240, bottom: 136, width: 200, height: 16 }],
        { color: '#f43f5e' },
      )
      expect(g.children.length).toBe(2)
      const noteGroup = g.children[0] as SVGElement
      expect(noteGroup.getAttribute('fill')).toBe('#facc15')
      // Cantinho dobrado (post-it) fica DENTRO do grupo do indicador —
      // não introduz uma 3ª camada translucida independente.
      expect(noteGroup.querySelector('path[fill="#eab308"]')).not.toBeNull()
      expect((g.children[1] as SVGElement).getAttribute('fill')).toBe('#f43f5e')
    } finally {
      rectsSpy.mockRestore()
    }
  })

  // ── Preview flutuante da anotação (US2/feature 014) ──────────────────────
  it('T039: tocar na aba abre a caixa de preview so-leitura com o texto da nota, sem abrir o menu completo', async () => {
    const onAnnotateHighlight = vi.fn()
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 60, bottom: 136 }])
    try {
      const setup = await renderViewer({ highlights: [highlight], onAnnotateHighlight })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })
      const tab = doc.querySelector('[data-nr-highlight-note-tab]') as HTMLElement
      setElementRect(tab, { left: 40, top: 120, right: 52, bottom: 136, width: 12, height: 16 })

      click(tab)

      const preview = doc.getElementById('nr-highlight-note-preview') as HTMLElement
      expect(preview?.hidden).toBe(false)
      expect(preview.querySelector('.nr-note-preview-text')?.textContent).toBe('Minha reflexao')
      // offsetHeight é sempre 0 em JSDOM (sem layout real): cabe acima
      // (rect.top 120 - 0 - GAP 10 >= 0), então fica colado acima do rect.
      expect(preview.style.top).toBe('110px')
      expect(doc.getElementById('nr-highlight-menu')?.hidden).not.toBe(false)
      expect(onAnnotateHighlight).not.toHaveBeenCalled()
    } finally {
      rectsSpy.mockRestore()
    }
  })

  it('T040: tocar fora da caixa de preview fecha ela', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 60, bottom: 136 }])
    try {
      const setup = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })
      const tab = doc.querySelector('[data-nr-highlight-note-tab]') as HTMLElement
      setElementRect(tab, { left: 40, top: 120, right: 52, bottom: 136, width: 12, height: 16 })
      click(tab)
      const preview = doc.getElementById('nr-highlight-note-preview') as HTMLElement
      expect(preview.hidden).toBe(false)

      clickAt(doc.body, 300, 300)

      expect(preview.hidden).toBe(true)
    } finally {
      rectsSpy.mockRestore()
    }
  })

  it('T041: tocar em outra parte do trecho (fora da aba) continua abrindo o menu completo, sem regressao de FR-008', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 120, right: 60, bottom: 136 }])
    try {
      const setup = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })
      const para = doc.querySelector('p') as HTMLElement
      const { overlayer } = setup.foliateEl.renderer.getContents()[0]
      overlayer.hitTest.mockReturnValue([highlight.cfi, doc.createRange(), { left: 40, top: 120, right: 300, bottom: 140 }])

      clickAt(para, 200, 130)

      const menu = doc.getElementById('nr-highlight-menu')
      expect(menu?.hidden).toBe(false)
      expect(doc.getElementById('nr-highlight-note-preview')?.hidden).not.toBe(false)
    } finally {
      rectsSpy.mockRestore()
    }
  })

  it('T042: aba perto do topo da tela abre a caixa de preview ABAIXO do trecho (fallback de posicao, FR-007)', async () => {
    const highlight = {
      id: 7, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)',
      text: 'First sen', color: 'indigo', note: 'Minha reflexao', sectionIndex: 0, percentage: 10, createdAt: new Date(),
    }
    const rectsSpy = stubRangeClientRects([{ left: 40, top: 2, right: 60, bottom: 18 }])
    try {
      const setup = await renderViewer({ highlights: [highlight] })
      const doc = makeFakeDoc(['First sentence. Second sentence.'])
      loadSection(setup.foliateEl, doc, 0)
      await waitFor(() => {
        expect(doc.querySelector('[data-nr-highlight-note-tab]')).not.toBeNull()
      })
      const tab = doc.querySelector('[data-nr-highlight-note-tab]') as HTMLElement
      setElementRect(tab, { left: 40, top: 2, right: 52, bottom: 18, width: 12, height: 16 })

      click(tab)

      const preview = doc.getElementById('nr-highlight-note-preview') as HTMLElement
      expect(preview.hidden).toBe(false)
      // Nao cabe acima (rect.top 2 - offsetHeight 0 - GAP 10 < 0) -> cai
      // abaixo: scrollY(0) + rect.bottom(18) + GAP(10).
      expect(preview.style.top).toBe('28px')
    } finally {
      rectsSpy.mockRestore()
    }
  })

  // ── FR-003c: Copiar e Compartilhar no menu de seleção ────────────────────
  describe('Copiar e Compartilhar', () => {
    let writeText: ReturnType<typeof vi.fn>
    let share: ReturnType<typeof vi.fn>

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined)
      share = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    })

    it('T050: tocar em Copiar coloca o texto selecionado na area de transferencia, fecha o menu e nao cria highlight', () => {
      const range = selectWholeText(fakeDoc, para)
      setDocSelection(fakeDoc, range)
      fireSelectionChange(fakeDoc)
      const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
      const copyBtn = menu.querySelector('[data-nr-selection-run="copy"]') as HTMLElement
      expect(copyBtn).not.toBeNull()

      click(copyBtn)

      expect(writeText).toHaveBeenCalledWith('First sentence. Second sentence.')
      expect(onCreateHighlight).not.toHaveBeenCalled()
      expect(menu.hidden).toBe(true)
    })

    it('T051: tocar em Compartilhar abre o compartilhamento do sistema com o texto selecionado', () => {
      const range = selectWholeText(fakeDoc, para)
      setDocSelection(fakeDoc, range)
      fireSelectionChange(fakeDoc)
      const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
      const shareBtn = menu.querySelector('[data-nr-selection-run="share"]') as HTMLElement

      click(shareBtn)

      expect(share).toHaveBeenCalledWith({ text: 'First sentence. Second sentence.' })
      expect(onCreateHighlight).not.toHaveBeenCalled()
      expect(menu.hidden).toBe(true)
    })

    // FR-003d: sem clipboard/share (navegador sem suporte), so nao conclui — sem lancar
    it('T052: sem Web Share API disponivel, tocar em Compartilhar nao lanca erro', () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
      const range = selectWholeText(fakeDoc, para)
      setDocSelection(fakeDoc, range)
      fireSelectionChange(fakeDoc)
      const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
      const shareBtn = menu.querySelector('[data-nr-selection-run="share"]') as HTMLElement

      expect(() => click(shareBtn)).not.toThrow()
      expect(menu.hidden).toBe(true)
    })

    it('T053: tocar em Traduzir aciona onTranslate com o texto selecionado, ancorado no paragrafo, e fecha o menu sem criar highlight', () => {
      const range = selectWholeText(fakeDoc, para)
      setDocSelection(fakeDoc, range)
      fireSelectionChange(fakeDoc)
      const menu = fakeDoc.getElementById('nr-selection-menu') as HTMLElement
      const translateBtn = menu.querySelector('[data-nr-selection-run="translate"]') as HTMLElement
      expect(translateBtn).not.toBeNull()

      click(translateBtn)

      expect(onTranslate).toHaveBeenCalledWith('First sentence. Second sentence.')
      expect(para.getAttribute('data-nr-active')).toBe('1')
      expect(onCreateHighlight).not.toHaveBeenCalled()
      expect(menu.hidden).toBe(true)
    })
  })

  it('T015: ao carregar uma seção, os highlights daquela seção são repintados via addAnnotation', async () => {
    const highlights = [
      { id: 1, bookId: 1, cfi: 'epubcfi(/6/4!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/4!/4/2/1:0)', text: 'trecho', color: 'indigo', sectionIndex: 2, percentage: 40, createdAt: new Date() },
      { id: 2, bookId: 1, cfi: 'epubcfi(/6/8!/4/2/1:0,/1:10)', paraCfi: 'epubcfi(/6/8!/4/2/1:0)', text: 'outro', color: 'rose', sectionIndex: 5, percentage: 90, createdAt: new Date() },
    ]
    const setup = await renderViewer({ highlights })
    const doc2 = makeFakeDoc(['Section two paragraph.'])
    loadSection(setup.foliateEl, doc2, 2)

    await waitFor(() => {
      expect(setup.foliateEl.addAnnotation).toHaveBeenCalledWith({ value: 'epubcfi(/6/4!/4/2/1:0,/1:10)' })
    })
    expect(setup.foliateEl.addAnnotation).not.toHaveBeenCalledWith({ value: 'epubcfi(/6/8!/4/2/1:0,/1:10)' })
  })
})

describe('EpubViewer — posição visível', () => {
  it('gera o CFI do início do parágrafo visível a partir do range atual', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    foliateEl.getCFI.mockImplementation((_index, range?: Range | null) => {
      const startContainer = range?.startContainer
      const startElement =
        startContainer?.nodeType === Node.ELEMENT_NODE
          ? (startContainer as Element)
          : startContainer?.parentElement
      const text = startElement?.textContent ?? ''
      return text.includes('What This Book Is About')
        ? 'epubcfi(/6/8!/4/2/10/2/1:0)'
        : 'epubcfi(/6/8!/4/2/2/1:0)'
    })
    foliateEl.getProgressOf.mockReturnValue({
      tocItem: { label: 'What This Book Is About', href: 'preface.xhtml' },
    })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.6, 1])

    const fakeDoc = makeFakeDoc(['Preface', 'What This Book Is About'])
    const paras = fakeDoc.querySelectorAll('p')
    const secondPara = paras[1] as HTMLElement
    const range = fakeDoc.createRange()
    range.selectNodeContents(secondPara)
    range.collapse(true)

    loadSection(foliateEl, fakeDoc, 0)
    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
        fraction: 0.42,
        tocItem: { label: 'What This Book Is About', href: 'preface.xhtml' },
        section: { current: 0, total: 3 },
        range,
      })
    })

    expect(viewerRef.current?.getVisibleLocation()).toEqual({
      cfi: 'epubcfi(/6/8!/4/2/10/2/1:0)',
      tocLabel: 'What This Book Is About',
      sectionHref: 'preface.xhtml',
      fraction: 0.42,
      percentage: 42,
    })
    expect(viewerRef.current?.getFirstVisibleParagraphIndex()).toBe(1)
    expect(secondPara.getAttribute('data-nr-para-cfi')).toBe('epubcfi(/6/8!/4/2/10/2/1:0)')
  })

  it('calcula progresso do capitulo usando limites claros do indice', async () => {
    const onRelocate = vi.fn()
    const { foliateEl } = await renderViewer({ onRelocate })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const firstDoc = makeFakeDoc(['Chapter 1.'])
    const secondDoc = makeFakeDoc(['Chapter 2.'])
    loadSection(foliateEl, firstDoc, 0)
    loadSection(foliateEl, secondDoc, 1)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.3,
        tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
        index: 1,
      })
    })

    expect(onRelocate).toHaveBeenLastCalledWith(expect.objectContaining({
      percentage: 30,
      chapterPercentage: 50,
      sectionIndex: 1,
      tocLabel: 'Chapter 2',
    }))
  })

  it('usa progresso da secao como fallback quando o item do indice tem ancora', async () => {
    const onRelocate = vi.fn()
    const { foliateEl } = await renderViewer({ onRelocate })
    foliateEl.book!.sections = [{ href: 'chapter.xhtml', linear: 'yes' }]
    foliateEl.book!.toc = [
      { label: 'Parte 1', href: 'chapter.xhtml#parte-1' },
      { label: 'Parte 2', href: 'chapter.xhtml#parte-2' },
    ]
    foliateEl.getSectionFractions.mockReturnValue([0, 1])

    const doc = makeFakeDoc(['Anchored section.'])
    loadSection(foliateEl, doc, 0)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.35,
        tocItem: { label: 'Parte 1', href: 'chapter.xhtml#parte-1' },
        section: { current: 0, total: 1 },
        index: 0,
      })
    })

    expect(onRelocate).toHaveBeenLastCalledWith(expect.objectContaining({
      percentage: 35,
      chapterPercentage: 35,
      sectionIndex: 0,
      tocLabel: 'Parte 1',
    }))
  })

  it('omite progresso do capitulo quando nao ha indice confiavel', async () => {
    const onRelocate = vi.fn()
    const { foliateEl } = await renderViewer({ onRelocate })
    foliateEl.book!.toc = []

    const doc = makeFakeDoc(['Chapter without toc.'])
    loadSection(foliateEl, doc, 0)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.2,
        tocItem: { label: 'Missing', href: 'missing.xhtml' },
        section: { current: 0, total: 1 },
        index: 0,
      })
    })

    expect(onRelocate.mock.calls.at(-1)?.[0]).not.toHaveProperty('chapterPercentage')
  })

  it('mantem o retorno do TTS na secao do audio apos scroll para uma secao anterior', async () => {
    const { viewerRef, foliateEl } = await renderViewer()

    const previousDoc = makeFakeDoc(['Previous section paragraph.'])
    const audioDoc = makeFakeDoc(['Audio section paragraph.'])
    const previousPara = previousDoc.querySelector('p') as HTMLElement
    const audioPara = audioDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, previousDoc, 0)
    loadSection(foliateEl, audioDoc, 1)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.4,
        tocItem: { label: 'Audio Chapter', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
        index: 1,
      })
    })

    act(() => { viewerRef.current?.resetTtsScroll() })

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.2,
        tocItem: { label: 'Previous Chapter', href: 'chapter-1.xhtml' },
        section: { current: 0, total: 3 },
        index: 0,
      })
    })

    act(() => { viewerRef.current?.highlightTts(0, 0, 0) })

    expect(audioPara.classList.contains('nr-tts-hl')).toBe(true)
    expect(previousPara.classList.contains('nr-tts-hl')).toBe(false)

    foliateEl.renderer.goTo.mockClear()

    act(() => { viewerRef.current?.resetTtsScroll({ preservePlaybackSection: true }) })
    act(() => { viewerRef.current?.scrollToParagraph(0) })

    expect(foliateEl.renderer.goTo).toHaveBeenCalledWith(expect.objectContaining({
      index: 1,
      anchor: expect.any(Function),
    }))
  })

  it('destaca a palavra do TTS sem reescrever links e marcacoes internas', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    const fakeDoc = document.implementation.createHTMLDocument('test')
    const para = fakeDoc.createElement('p')
    para.innerHTML = 'Read <a href="#note"><em>linked</em></a> <strong>text</strong> now.'
    fakeDoc.body.appendChild(para)

    loadSection(foliateEl, fakeDoc, 0)

    const linkedStart = para.textContent?.indexOf('linked') ?? -1
    act(() => { viewerRef.current?.highlightTts(0, linkedStart, linkedStart + 'linked'.length) })

    expect(para.querySelector('a')?.getAttribute('href')).toBe('#note')
    expect(para.querySelector('a em mark.nr-tts-word')?.textContent).toBe('linked')
    expect(para.querySelector('strong')?.textContent).toBe('text')

    const textStart = para.textContent?.indexOf('text') ?? -1
    act(() => { viewerRef.current?.highlightTts(0, textStart, textStart + 'text'.length) })

    expect(para.querySelector('a')?.getAttribute('href')).toBe('#note')
    expect(para.querySelector('a em')?.textContent).toBe('linked')
    expect(para.querySelector('a mark.nr-tts-word')).toBeNull()
    expect(para.querySelector('strong mark.nr-tts-word')?.textContent).toBe('text')

    act(() => { viewerRef.current?.clearTts() })

    expect(para.querySelector('.nr-tts-word')).toBeNull()
    expect(para.querySelector('a')?.getAttribute('href')).toBe('#note')
    expect(para.querySelector('a em')?.textContent).toBe('linked')
    expect(para.querySelector('strong')?.textContent).toBe('text')
    expect(para.textContent).toBe('Read linked text now.')
  })

  it('projeta marcador visual no parágrafo que contém o bookmark salvo', async () => {
    const bookmarkCfi = 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)'
    const { foliateEl } = await renderViewer({
      bookmarks: [{
        id: 1,
        bookId: 1,
        cfi: bookmarkCfi,
        label: 'What This Book Is About',
        percentage: 42,
        color: 'rose',
        createdAt: new Date(),
      }],
    })

    foliateEl.getCFI.mockImplementation((_index, range?: Range | null) => {
      const text = range?.startContainer.textContent ?? ''
      if (text.includes('What This Book Is About')) return bookmarkCfi
      return 'epubcfi(/6/8!/4/2/2,/1:0,/1:7)'
    })

    const fakeDoc = makeFakeDoc(['Preface', 'What This Book Is About'])
    const paras = fakeDoc.querySelectorAll('p')

    loadSection(foliateEl, fakeDoc, 0)

    expect(paras[0].hasAttribute('data-nr-bookmark')).toBe(false)
    expect(paras[1].getAttribute('data-nr-bookmark')).toBe('rose')
    expect(paras[1].getAttribute('data-nr-bookmark-id')).toBe('1')
  })

  it('projeta marcador ao carregar diretamente uma seção diferente da inicial', async () => {
    const bookmarkCfi = 'epubcfi(/6/10!/4/2/1:0)'
    const { foliateEl } = await renderViewer({
      bookmarks: [{
        id: 9,
        bookId: 1,
        cfi: bookmarkCfi,
        label: 'Chapter 2',
        percentage: 55,
        color: 'emerald',
        createdAt: new Date(),
      }],
    })

    foliateEl.getCFI.mockImplementation((index: number) => (
      index === 1
        ? 'epubcfi(/6/10!/4/2/1:0)'
        : 'epubcfi(/6/8!/4/2/1:0)'
    ))

    const fakeDoc = makeFakeDoc(['Chapter 2 bookmarked paragraph.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)

    expect(para.getAttribute('data-nr-para-cfi')).toBe(bookmarkCfi)
    expect(para.getAttribute('data-nr-bookmark')).toBe('emerald')
    expect(para.getAttribute('data-nr-bookmark-id')).toBe('9')
  })

  it('remove o bookmark ao tocar na bandeira do parágrafo', async () => {
    const onBookmarkTap = vi.fn()
    const bookmarkCfi = 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)'
    const { foliateEl } = await renderViewer({
      onBookmarkTap,
      bookmarks: [{
        id: 7,
        bookId: 1,
        cfi: bookmarkCfi,
        label: 'What This Book Is About',
        percentage: 42,
        color: 'indigo',
        createdAt: new Date(),
      }],
    })

    foliateEl.getCFI.mockImplementation((_index, range?: Range | null) => {
      const text = range?.startContainer.textContent ?? ''
      if (text.includes('What This Book Is About')) return bookmarkCfi
      return 'epubcfi(/6/8!/4/2/2,/1:0,/1:7)'
    })

    const fakeDoc = makeFakeDoc(['Preface', 'What This Book Is About'])
    const paras = fakeDoc.querySelectorAll('p')
    const bookmarkedPara = paras[1] as HTMLElement
    vi.spyOn(bookmarkedPara, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 200,
      width: 300,
      height: 40,
      top: 200,
      right: 400,
      bottom: 240,
      left: 100,
      toJSON: () => ({}),
    })

    loadSection(foliateEl, fakeDoc, 0)
    act(() => {
      bookmarkedPara.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 108,
        clientY: 210,
      }))
    })

    expect(onBookmarkTap).toHaveBeenCalledWith(7)
    expectTapIgnored('bookmark-icon', {
      sectionIndex: 0,
      paragraphIndex: 1,
      bookmarkId: 7,
    })
  })

  it('continua permitindo tradução após carregar uma nova seção', async () => {
    const onTranslate = vi.fn()
    const { foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc(['Chapter 2 starts here.', 'Another paragraph.'])
    const paras = fakeDoc.querySelectorAll('p')

    loadSection(foliateEl, fakeDoc, 1)
    click(paras[0]!)

    expect(onTranslate).toHaveBeenCalledOnce()
  })

  it('aciona o bookmark do parágrafo pelo bloco de tradução inline', async () => {
    const onBookmarkParagraph = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onBookmarkParagraph })
    foliateEl.getCFI.mockReturnValue('epubcfi(/6/10!/4/2/1:0)')
    foliateEl.getProgressOf.mockReturnValue({
      tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
    })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const fakeDoc = makeFakeDoc(['Chapter paragraph for bookmark.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Tradução') })

    const bookmarkBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="bookmark"]') as HTMLElement | null
    expect(bookmarkBtn?.textContent?.trim()).toBe('Marcar')

    click(bookmarkBtn!)

    expect(onBookmarkParagraph).toHaveBeenCalledWith({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      label: 'Chapter 2',
      percentage: 20,
      snippet: 'Chapter paragraph for bookmark.',
    })
  })

  it('executa os botoes do bloco inline sem reselecionar o paragrafo', async () => {
    const onSpeakOne = vi.fn()
    const onSaveVocab = vi.fn()
    const onBookmarkParagraph = vi.fn()
    const onCenterTap = vi.fn()
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({
      onSpeakOne,
      onSaveVocab,
      onBookmarkParagraph,
      onCenterTap,
      onTranslate,
    })
    foliateEl.getCFI.mockReturnValue('epubcfi(/6/10!/4/2/1:0)')
    foliateEl.getProgressOf.mockReturnValue({
      tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
    })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const fakeDoc = makeFakeDoc(['Action paragraph.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setViewportHeight(fakeDoc, 720)

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Traducao') })

    const block = fakeDoc.getElementById('nr-translation-block') as HTMLElement
    const speakBtn = block.querySelector('[data-nr-action="speak"]') as HTMLElement
    const bookmarkBtn = block.querySelector('[data-nr-action="bookmark"]') as HTMLElement
    const saveBtn = block.querySelector('[data-nr-action="save"]') as HTMLElement

    clickAt(speakBtn, 180, 40)
    clickAt(bookmarkBtn, 180, 360)
    clickAt(saveBtn, 180, 680)

    expect(onSpeakOne).toHaveBeenCalledWith('Action paragraph.')
    expect(onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      snippet: 'Action paragraph.',
    }))
    expect(onSaveVocab).toHaveBeenCalledWith('Action paragraph.', 'Traducao')
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(para.hasAttribute('data-nr-active')).toBe(true)
  })

  it('executa botao inline mesmo quando o WebView retargeta o clique para o body', async () => {
    const onSpeakOne = vi.fn()
    const onCenterTap = vi.fn()
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onSpeakOne, onCenterTap, onTranslate })
    const fakeDoc = makeFakeDoc(['Retarget paragraph.', 'Other paragraph.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    setViewportHeight(fakeDoc, 720)
    setElementRect(para, { left: 24, top: 160, right: 336, bottom: 220, width: 312, height: 60 })

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Traducao') })

    const block = fakeDoc.getElementById('nr-translation-block') as HTMLElement
    const speakBtn = block.querySelector('[data-nr-action="speak"]') as HTMLElement
    setElementRect(block, { left: 24, top: 260, right: 360, bottom: 520, width: 336, height: 260 })
    setElementRect(speakBtn, { left: 312, top: 330, right: 356, bottom: 430, width: 44, height: 100 })

    clickAt(fakeDoc.body, 340, 380)

    expect(onSpeakOne).toHaveBeenCalledWith('Retarget paragraph.')
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(para.hasAttribute('data-nr-active')).toBe(true)
  })

  it('mantém o cfi do parágrafo estável mesmo após a tradução alterar o DOM', async () => {
    const onBookmarkParagraph = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onBookmarkParagraph })
    foliateEl.getCFI.mockImplementation((_index, range?: Range | null) => {
      const startContainer = range?.startContainer
      const startElement =
        startContainer?.nodeType === Node.ELEMENT_NODE
          ? (startContainer as Element)
          : startContainer?.parentElement
      const firstChildTag = startElement?.firstElementChild?.tagName
      return firstChildTag === 'SPAN'
        ? 'epubcfi(/6/10!/4/2/1:99)'
        : 'epubcfi(/6/10!/4/2/1:0)'
    })
    foliateEl.getProgressOf.mockReturnValue({
      tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
    })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const fakeDoc = makeFakeDoc(['Chapter paragraph for bookmark.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Traducao') })

    const bookmarkBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="bookmark"]') as HTMLElement | null
    click(bookmarkBtn!)

    expect(onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
    }))
  })

  it('mostra remover marcador no bloco inline quando o parágrafo já está marcado', async () => {
    const bookmarkCfi = 'epubcfi(/6/10!/4/2/1:0)'
    const { viewerRef, foliateEl } = await renderViewer({
      bookmarks: [{
        id: 3,
        bookId: 1,
        cfi: bookmarkCfi,
        label: 'Chapter 2',
        percentage: 20,
        color: 'indigo',
        createdAt: new Date(),
      }],
    })
    foliateEl.getCFI.mockReturnValue(bookmarkCfi)
    foliateEl.getProgressOf.mockReturnValue({
      tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
    })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const fakeDoc = makeFakeDoc(['Already bookmarked paragraph.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Tradução') })

    const bookmarkBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="bookmark"]') as HTMLElement | null
    expect(bookmarkBtn?.textContent?.trim()).toBe('Remover')
  })

  it('atravessa a fronteira entre seções sem clique extra e usa relocate.index como seção ativa', async () => {
    const onRelocate = vi.fn()
    const onTranslate = vi.fn()
    const onBookmarkParagraph = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onRelocate, onTranslate, onBookmarkParagraph })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])
    foliateEl.getCFI.mockImplementation((index: number) => (
      index === 1
        ? 'epubcfi(/6/10!/4/2/1:0)'
        : 'epubcfi(/6/8!/4/2/1:0)'
    ))
    foliateEl.getProgressOf.mockImplementation((index: number) => ({
      tocItem: {
        label: index === 1 ? 'Chapter 2' : 'Chapter 1',
        href: index === 1 ? 'chapter-2.xhtml' : 'chapter-1.xhtml',
      },
    }))

    const firstDoc = makeFakeDoc(['Chapter 1 paragraph.'])
    const secondDoc = makeFakeDoc(['Chapter 2 active paragraph.'])
    const secondPara = secondDoc.querySelector('p') as HTMLElement
    const secondRange = secondDoc.createRange()
    secondRange.selectNodeContents(secondPara)
    secondRange.collapse(true)

    loadSection(foliateEl, firstDoc, 0)
    loadSection(foliateEl, secondDoc, 1)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.32,
        tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
        index: 1,
        range: secondRange,
      })
    })

    expect(onRelocate).toHaveBeenLastCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      percentage: 32,
      chapterPercentage: 60,
      sectionIndex: 1,
      tocLabel: 'Chapter 2',
      sectionHref: 'chapter-2.xhtml',
    }))
    expect(viewerRef.current?.getVisibleLocation()).toEqual({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      tocLabel: 'Chapter 2',
      sectionHref: 'chapter-2.xhtml',
      fraction: 0.32,
      percentage: 32,
      chapterPercentage: 60,
    })

    click(secondPara)
    expect(onTranslate).toHaveBeenCalledOnce()

    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Traducao') })
    const bookmarkBtn = secondDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="bookmark"]') as HTMLElement | null
    click(bookmarkBtn!)

    expect(onBookmarkParagraph).toHaveBeenCalledWith(expect.objectContaining({
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      label: 'Chapter 2',
    }))
  })
})

describe('EpubViewer — lock de tradução', () => {
  it('bloqueia nova seleção enquanto tradução está em andamento', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })

    const fakeDoc = makeFakeDoc(['Para A.', 'Para B.'])
    const paras = fakeDoc.querySelectorAll('p')
    const paraA = paras[0] as HTMLElement
    const paraB = paras[1] as HTMLElement

    loadSection(foliateEl, fakeDoc, 0)

    // 1ª seleção → lock ativado pelo showTranslationLoading
    click(paraA)
    expect(onTranslate).toHaveBeenCalledTimes(1)

    act(() => { viewerRef.current?.showTranslationLoading() })

    // Enquanto lock ativo: tap em paraB deve ser ignorado
    click(paraB)
    expect(onTranslate).toHaveBeenCalledTimes(1) // ainda 1

    // Libera lock
    act(() => { viewerRef.current?.injectTranslation('Texto traduzido') })

    // Agora tap em paraB deve funcionar
    click(paraB)
    expect(onTranslate).toHaveBeenCalledTimes(2)
  })

  it('lock é liberado mesmo em caso de erro (clearTranslation)', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })

    const fakeDoc = makeFakeDoc(['Para A.', 'Para B.'])
    const paras = fakeDoc.querySelectorAll('p')
    const paraA = paras[0] as HTMLElement
    const paraB = paras[1] as HTMLElement

    loadSection(foliateEl, fakeDoc, 0)

    click(paraA)
    act(() => { viewerRef.current?.showTranslationLoading() })

    // Simula erro: ReaderScreen chama clearTranslation em vez de injectTranslation
    act(() => { viewerRef.current?.clearTranslation() })

    click(paraB)
    expect(onTranslate).toHaveBeenCalledTimes(2) // lock foi liberado
  })
})

describe('EpubViewer — chapter auto-advance', () => {
  it('pula automaticamente uma seção intermediária com apenas o título ao avançar de capítulo', async () => {
    const { viewerRef, foliateEl } = await renderViewer()

    const titleOnlyDoc = document.implementation.createHTMLDocument('stub')
    const heading = titleOnlyDoc.createElement('h1')
    heading.textContent = 'Chapter 2'
    titleOnlyDoc.body.appendChild(heading)
    injectFakeWindow(titleOnlyDoc, 0, 800, 400)

    act(() => { void viewerRef.current?.next() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(1)
    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 1,
      anchor: expect.any(Function),
    }))

    loadSection(foliateEl, titleOnlyDoc, 1)
    await act(async () => { await Promise.resolve() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(2)
    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 2,
      anchor: expect.any(Function),
    }))
  })

  it('não pula automaticamente quando a nova seção já tem conteúdo de leitura', async () => {
    const { viewerRef, foliateEl } = await renderViewer()

    const contentDoc = document.implementation.createHTMLDocument('content')
    const chapter = contentDoc.createElement('section')
    chapter.setAttribute('data-type', 'chapter')
    const heading = contentDoc.createElement('h1')
    heading.textContent = 'Chapter 2'
    const para = contentDoc.createElement('p')
    para.textContent = 'Real content starts here.'
    chapter.append(heading, para)
    contentDoc.body.append(chapter)
    injectFakeWindow(contentDoc, 0, 800, 1200)

    act(() => { void viewerRef.current?.next() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(1)

    loadSection(foliateEl, contentDoc, 1)
    await act(async () => { await Promise.resolve() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(1)
  })

  it('pula páginas de parte mesmo quando elas têm um parágrafo curto extra', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    foliateEl.book!.sections = [
      { id: 'chapter-1.xhtml', href: 'chapter-1.xhtml', linear: 'yes' },
      { id: 'part-1.xhtml', href: 'part-1.xhtml', linear: 'yes' },
      { id: 'chapter-2.xhtml', href: 'chapter-2.xhtml', linear: 'yes' },
    ]

    const partDoc = document.implementation.createHTMLDocument('part')
    const part = partDoc.createElement('div')
    part.setAttribute('data-type', 'part')
    const heading = partDoc.createElement('h1')
    heading.textContent = 'Part I. Foundation and Building Blocks'
    part.appendChild(heading)
    const watermark = partDoc.createElement('p')
    watermark.textContent = 'OceanofPDF.com'
    partDoc.body.append(part, watermark)
    injectFakeWindow(partDoc, 0, 800, 400)

    act(() => { void viewerRef.current?.next() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(1)

    loadSection(foliateEl, partDoc, 1)
    await act(async () => { await Promise.resolve() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(2)
    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 2,
      anchor: expect.any(Function),
    }))
  })

  it('pula página de parte ao navegar para ela via índice (href)', async () => {
    const { viewerRef, foliateEl } = await renderViewer()

    const partDoc = document.implementation.createHTMLDocument('part')
    const part = partDoc.createElement('div')
    part.setAttribute('data-type', 'part')
    const heading = partDoc.createElement('h1')
    heading.textContent = 'Part I. Foundation and Building Blocks'
    part.appendChild(heading)
    const watermark = partDoc.createElement('p')
    watermark.textContent = 'OceanofPDF.com'
    partDoc.body.append(part, watermark)
    injectFakeWindow(partDoc, 0, 800, 400)

    foliateEl.book!.sections = [
      { id: 'chapter-1.xhtml', href: 'chapter-1.xhtml', linear: 'yes' },
      { id: 'part-1.xhtml', href: 'part-1.xhtml', linear: 'yes' },
      { id: 'chapter-2.xhtml', href: 'chapter-2.xhtml', linear: 'yes' },
    ]

    act(() => { viewerRef.current?.goTo('part-1.xhtml') })
    expect(foliateEl.goTo).toHaveBeenCalledWith('part-1.xhtml')

    loadSection(foliateEl, partDoc, 1)
    await act(async () => { await Promise.resolve() })
    expect(foliateEl.renderer.goTo).toHaveBeenCalledTimes(1)
    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 2,
      anchor: expect.any(Function),
    }))
  })

  it('resolve href do indice por sufixo quando o caminho do spine tem prefixo OPF', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    foliateEl.book!.sections = [
      { id: 'OPS/Text/chapter-1.xhtml', href: 'OPS/Text/chapter-1.xhtml', linear: 'yes' },
      { id: 'OPS/Text/chapter-2.xhtml', href: 'OPS/Text/chapter-2.xhtml', linear: 'yes' },
    ]
    foliateEl.renderer.goTo.mockClear()
    foliateEl.goTo.mockClear()

    act(() => { viewerRef.current?.goTo('Text/chapter-2.xhtml#start') })

    expect(foliateEl.goTo).not.toHaveBeenCalled()
    expect(foliateEl.renderer.goTo).toHaveBeenCalledWith(expect.objectContaining({
      index: 1,
      anchor: expect.any(Function),
    }))

    const target = foliateEl.renderer.goTo.mock.calls[0]?.[0] as { anchor?: (doc: Document) => Element | number | null }
    const doc = document.implementation.createHTMLDocument('chapter')
    const heading = doc.createElement('h1')
    heading.id = 'start'
    doc.body.appendChild(heading)

    expect(target.anchor?.(doc)).toBe(heading)
  })

  it('resolve explicitamente fragments do indice mesmo quando o href bate com o spine', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    foliateEl.book!.sections = [
      { id: 'OPS/c01.xhtml', href: 'OPS/c01.xhtml', linear: 'yes' },
      { id: 'OPS/c02.xhtml', href: 'OPS/c02.xhtml', linear: 'yes' },
    ]
    foliateEl.renderer.goTo.mockClear()
    foliateEl.goTo.mockClear()

    act(() => { viewerRef.current?.goTo('OPS/c02.xhtml#h2-1') })
    await act(async () => { await Promise.resolve() })

    expect(foliateEl.goTo).not.toHaveBeenCalled()
    expect(foliateEl.renderer.goTo).toHaveBeenCalledWith(expect.objectContaining({
      index: 1,
      anchor: expect.any(Function),
    }))

    const target = foliateEl.renderer.goTo.mock.calls[0]?.[0] as { anchor?: (doc: Document) => Element | number | null }
    const doc = document.implementation.createHTMLDocument('chapter')
    const heading = doc.createElement('h2')
    heading.id = 'h2-1'
    doc.body.appendChild(heading)

    expect(target.anchor?.(doc)).toBe(heading)
  })

  it('prevToEnd navega para o fim da seção anterior com âncora explícita', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    const firstDoc = makeFakeDoc(['Chapter 1 paragraph.'])
    const secondDoc = makeFakeDoc(['Chapter 2 paragraph.'])

    loadSection(foliateEl, firstDoc, 0)
    loadSection(foliateEl, secondDoc, 1)
    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.42,
        tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
        index: 1,
      })
    })

    act(() => { viewerRef.current?.prevToEnd() })

    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith(expect.objectContaining({
      index: 0,
      anchor: expect.any(Function),
    }))
    const prevToEndTarget = foliateEl.renderer.goTo.mock.calls.at(-1)?.[0] as { anchor?: (doc: Document) => number }
    expect(prevToEndTarget.anchor?.(firstDoc)).toBe(1)
  })
})

describe('EpubViewer — zona de atalho pro índice (toque na borda esquerda)', () => {
  it('tap na faixa esquerda abre o índice, sem outro efeito colateral', async () => {
    const onOpenToc = vi.fn()
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc, onTranslate, onCenterTap })
    const doc = makeFakeDoc(['Chapter paragraph.'])
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)

    loadSection(foliateEl, doc, 0)

    clickAt(doc.body, 20, 360)

    expect(onOpenToc).toHaveBeenCalledOnce()
    expect(onTranslate).not.toHaveBeenCalled()
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(foliateEl.renderer.goTo).not.toHaveBeenCalled()
  })

  it('tap na faixa esquerda abre o índice independente da seção atual', async () => {
    const onOpenToc = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc })
    const doc = makeFakeDoc(['Last chapter paragraph.'])
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)

    loadSection(foliateEl, doc, 2)
    act(() => {
      foliateEl.fireFoliate('relocate', { index: 2, section: { current: 2, total: 3 } })
    })

    clickAt(doc.body, 20, 360)

    expect(onOpenToc).toHaveBeenCalledOnce()
  })

  it('tap na faixa esquerda abre o índice mesmo com TTS ativo', async () => {
    const onOpenToc = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc, ttsGlobalActive: true })
    const doc = makeFakeDoc(['Chapter paragraph.'])
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)

    loadSection(foliateEl, doc, 0)

    clickAt(doc.body, 20, 360)

    expect(onOpenToc).toHaveBeenCalledOnce()
  })

  it('tap no canto superior-esquerdo continua abrindo/fechando o chrome, não abre o índice', async () => {
    const onOpenToc = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc, onCenterTap })
    const doc = makeFakeDoc(['Chapter paragraph.'])
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)

    loadSection(foliateEl, doc, 0)

    clickAt(doc.body, 20, 40)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onOpenToc).not.toHaveBeenCalled()
  })

  it('tap no canto inferior-esquerdo continua abrindo/fechando o chrome, não abre o índice', async () => {
    const onOpenToc = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc, onCenterTap })
    const doc = makeFakeDoc(['Chapter paragraph.'])
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)

    loadSection(foliateEl, doc, 0)

    clickAt(doc.body, 20, 690)

    expect(onCenterTap).toHaveBeenCalledOnce()
    expect(onOpenToc).not.toHaveBeenCalled()
  })

  it('tap em parágrafo perto da borda esquerda abre tradução, nunca abre o índice', async () => {
    const onOpenToc = vi.fn()
    const onTranslate = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenToc, onTranslate })
    const doc = makeFakeDoc(['First paragraph near the edge.'])
    const para = doc.querySelector('p') as HTMLElement
    setViewportWidth(doc, 360)
    setViewportHeight(doc, 720)
    setElementRect(para, { left: 8, top: 320, right: 336, bottom: 400, width: 328, height: 80 })

    loadSection(foliateEl, doc, 0)

    clickAt(para, 20, 360)

    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onOpenToc).not.toHaveBeenCalled()
  })
})

describe('EpubViewer - bloco inline de traducao', () => {
  it('renderiza loading minimalista e remove copy de sucesso do bloco inline', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    const fakeDoc = makeFakeDoc(['Chapter paragraph for translation.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)
    click(para)

    act(() => { viewerRef.current?.showTranslationLoading() })

    let block = fakeDoc.getElementById('nr-translation-block')
    expect(block?.querySelector('.nr-tr-spinner')).not.toBeNull()
    expect(block?.textContent).not.toContain('Traduzindo')
    expect(block?.textContent).not.toContain('Preparando a traducao...')
    expect(block?.textContent?.trim()).toBe('')
    expect(logEventMock).toHaveBeenCalledWith('reader.translation.panel.open', expect.objectContaining({
      flowId: 'reader-translation-test-flow',
      screen: 'reader',
      status: 'success',
      details: expect.objectContaining({
        source: 'tap',
        sectionIndex: 1,
        paragraphIndex: 0,
        textLength: expect.any(Number),
        state: 'loading',
        translationId: expect.any(String),
      }),
    }))

    act(() => { viewerRef.current?.injectTranslation('Texto traduzido') })

    block = fakeDoc.getElementById('nr-translation-block')
    expect(block?.textContent).not.toContain('Traducao pronta')
    expect(Array.from(block?.querySelectorAll('[data-nr-action]') ?? []).map((el) => (
      (el as HTMLElement).dataset.nrAction
    ))).toEqual(['next', 'speak', 'bookmark', 'save'])
    expect(block?.querySelector('[data-nr-action="next"]')?.textContent?.trim()).toBe('Next')
    expect(block?.querySelector('[data-nr-action="speak"]')).not.toBeNull()
    expect(block?.querySelector('[data-nr-action="bookmark"]')).not.toBeNull()
    expect(block?.querySelector('[data-nr-action="save"]')).not.toBeNull()
  })

  it('mantem definicao e traducao em slots independentes com as quatro acoes', async () => {
    const onWordLensDefinition = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({
      onWordLensDefinition,
      wordLensData: {
        levels: { ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['A ubiquitous idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelector('.nr-word-lens')).not.toBeNull())
    const word = fakeDoc.querySelector('.nr-word-lens') as HTMLElement
    setCaretRange(fakeDoc, word.firstChild as Text, 3)
    clickAt(para, 180, 360)
    const target = onWordLensDefinition.mock.calls[0][0]

    act(() => {
      viewerRef.current?.showTranslationLoading()
      viewerRef.current?.showWordLensDefinitionLoading(target)
      viewerRef.current?.injectWordLensDefinition(target, {
        partsOfSpeech: ['adjective'],
        senses: [{
          partOfSpeech: 'adjective',
          definition: 'being present everywhere at once',
          examples: [],
          synonyms: ['omnipresent'],
        }],
      })
    })

    const block = fakeDoc.getElementById('nr-translation-block') as HTMLElement
    expect(block.querySelector('[data-nr-definition-slot]')?.getAttribute('aria-live')).toBe('polite')
    expect(block.querySelector('[role="heading"]')?.getAttribute('aria-level')).toBe('3')
    expect(block.querySelector('[data-nr-definition-slot]')?.textContent)
      .toContain('being present everywhere at once')
    expect(block.querySelector('[data-nr-translation-slot] .nr-tr-spinner')).not.toBeNull()

    act(() => { viewerRef.current?.injectTranslation('Uma ideia onipresente.') })

    expect(block.querySelector('[data-nr-definition-slot]')?.textContent)
      .toContain('being present everywhere at once')
    expect(block.querySelector('[data-nr-translation-slot]')?.textContent)
      .toContain('Uma ideia onipresente.')
    act(() => { viewerRef.current?.injectWordLensDefinitionError(target) })
    expect(block.querySelector('[data-nr-definition-slot]')?.textContent)
      .toContain('Nao foi possivel carregar a definicao offline')
    expect(block.querySelector('[data-nr-translation-slot]')?.textContent)
      .toContain('Uma ideia onipresente.')
    expect(Array.from(block.querySelectorAll('[data-nr-action]')).map((el) => (
      (el as HTMLElement).dataset.nrAction
    ))).toEqual(['next', 'speak', 'bookmark', 'save'])
  })

  it('troca a palavra exata na mesma frase sem retraduzir e ignora resposta antiga', async () => {
    const onTranslate = vi.fn()
    const onWordLensDefinition = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({
      onTranslate,
      onWordLensDefinition,
      wordLensData: {
        levels: { elaborate: 4, ubiquitous: 5 },
        lemmas: {},
        packVersion: 'test',
      },
    })
    const fakeDoc = makeFakeDoc(['An elaborate ubiquitous idea.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    loadSection(foliateEl, fakeDoc, 0)
    await waitFor(() => expect(fakeDoc.querySelectorAll('.nr-word-lens')).toHaveLength(2))
    const [firstWord, secondWord] = Array.from(fakeDoc.querySelectorAll('.nr-word-lens')) as HTMLElement[]

    setCaretRange(fakeDoc, firstWord.firstChild as Text, 2)
    clickAt(para, 180, 360)
    const firstTarget = onWordLensDefinition.mock.calls[0][0]
    act(() => {
      viewerRef.current?.showTranslationLoading()
      viewerRef.current?.showWordLensDefinitionLoading(firstTarget)
      viewerRef.current?.injectTranslation('Uma ideia elaborada e onipresente.')
    })

    setCaretRange(fakeDoc, secondWord.firstChild as Text, 2)
    clickAt(para, 180, 360)
    const secondTarget = onWordLensDefinition.mock.calls[1][0]
    act(() => {
      viewerRef.current?.showWordLensDefinitionLoading(secondTarget)
      viewerRef.current?.injectWordLensDefinition(firstTarget, {
        partsOfSpeech: ['adjective'],
        senses: [{
          partOfSpeech: 'adjective',
          definition: 'old elaborate response',
          examples: [],
          synonyms: [],
        }],
      })
    })

    const definitionSlot = fakeDoc.querySelector('[data-nr-definition-slot]') as HTMLElement
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).toHaveBeenCalledTimes(2)
    expect(secondTarget).toMatchObject({ lemma: 'ubiquitous', surface: 'ubiquitous' })
    expect(secondTarget.selectionId).not.toBe(firstTarget.selectionId)
    expect(definitionSlot.textContent).not.toContain('old elaborate response')
    expect(definitionSlot.textContent).toContain('Carregando definicao offline')

    act(() => {
      viewerRef.current?.injectWordLensDefinition(secondTarget, {
        partsOfSpeech: ['adjective'],
        senses: [{
          partOfSpeech: 'adjective',
          definition: 'being present everywhere at once',
          examples: [],
          synonyms: [],
        }],
      })
    })
    expect(definitionSlot.textContent).toContain('being present everywhere at once')

    clickAt(para, 180, 360)
    expect(para.hasAttribute('data-nr-active')).toBe(false)
    expect(onTranslate).toHaveBeenCalledOnce()
    expect(onWordLensDefinition).toHaveBeenCalledTimes(2)
  })

  it('tap no fundo do bloco inline nao alterna chrome e registra motivo', async () => {
    const onCenterTap = vi.fn()
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onCenterTap, onTranslate })
    const fakeDoc = makeFakeDoc(['Chapter paragraph for translation.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 1)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Texto traduzido') })

    const block = fakeDoc.getElementById('nr-translation-block') as HTMLElement
    clickAt(block, 180, 360)

    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledOnce()
    expectTapIgnored('translation-block', {
      sectionIndex: 1,
      paragraphIndex: 0,
    })
  })

  it('botao Next seleciona e traduz a primeira unidade do proximo paragrafo', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc(['First paragraph.', 'Second paragraph.'])
    const paras = fakeDoc.querySelectorAll('p')

    loadSection(foliateEl, fakeDoc, 0)
    click(paras[0]!)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Translated first') })

    const nextBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="next"]') as HTMLElement
    click(nextBtn)

    expect(onTranslate).toHaveBeenNthCalledWith(1, 'First paragraph.')
    expect(onTranslate).toHaveBeenNthCalledWith(2, 'Second paragraph.')
    expect(logEventMock).toHaveBeenCalledWith('reader.translation.tap', expect.objectContaining({
      details: expect.objectContaining({
        source: 'next',
        sectionIndex: 0,
        paragraphIndex: 1,
      }),
    }))
    expect(paras[0]?.hasAttribute('data-nr-active')).toBe(false)
    expect(paras[1]?.hasAttribute('data-nr-active')).toBe(true)
    expect(paras[1]?.querySelector('.nr-hl-sentence')?.textContent).toBe('Second paragraph.')
  })

  it('botao Next avanca para a proxima frase antes do proximo paragrafo', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc(['First sentence. Remainder sentence.', 'Real next paragraph.'])
    const paras = fakeDoc.querySelectorAll('p')
    const firstTextNode = paras[0]?.firstChild as Text
    setCaretRange(fakeDoc, firstTextNode, 3)

    loadSection(foliateEl, fakeDoc, 0)
    click(paras[0]!)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Translated first sentence') })

    expect(fakeDoc.getElementById('nr-para-remainder')?.textContent).toBe(' Remainder sentence.')

    const nextBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="next"]') as HTMLElement
    click(nextBtn)

    expect(onTranslate).toHaveBeenLastCalledWith('Remainder sentence.')
    expect(fakeDoc.getElementById('nr-para-remainder')).toBeNull()
    expect(paras[0]?.hasAttribute('data-nr-active')).toBe(true)
    expect(paras[0]?.querySelector('.nr-hl-sentence')?.textContent).toBe('Remainder sentence.')
    expect(paras[1]?.hasAttribute('data-nr-active')).toBe(false)
  })

  it('botao Next percorre frases dentro do paragrafo seguinte antes de pular texto', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const fakeDoc = makeFakeDoc([
      'The main goal of this book is to provide an intuition into the field of LLMs.',
      'The pace of development in the Language AI field is incredibly fast and frustration. you can build trying to keep up with the latest technologies.Instead, we focus on the fundamentals of LLMs and intend to provide a fun and easy learning process',
    ])
    const paras = fakeDoc.querySelectorAll('p')

    loadSection(foliateEl, fakeDoc, 0)
    click(paras[0]!)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Translated first') })

    let nextBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="next"]') as HTMLElement
    click(nextBtn)

    expect(onTranslate).toHaveBeenNthCalledWith(2, 'The pace of development in the Language AI field is incredibly fast and frustration.')

    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Translated second') })
    nextBtn = fakeDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="next"]') as HTMLElement
    click(nextBtn)

    expect(onTranslate).toHaveBeenNthCalledWith(3, 'you can build trying to keep up with the latest technologies.')
    expect(paras[1]?.hasAttribute('data-nr-active')).toBe(true)
  })

  it('botao Next no ultimo paragrafo avanca secao e traduz o primeiro paragrafo carregado', async () => {
    const onTranslate = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onTranslate })
    const firstDoc = makeFakeDoc(['Last paragraph in chapter 2.'])
    const secondDoc = makeFakeDoc(['First paragraph in chapter 3.', 'Second paragraph in chapter 3.'])
    const firstPara = firstDoc.querySelector('p') as HTMLElement

    act(() => { void foliateEl.renderer.goTo({ index: 1 }) })
    loadSection(foliateEl, firstDoc, 1)
    click(firstPara)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Translated last') })

    const nextBtn = firstDoc.getElementById('nr-translation-block')?.querySelector('[data-nr-action="next"]') as HTMLElement
    click(nextBtn)

    expect(foliateEl.renderer.goTo).toHaveBeenLastCalledWith({
      index: 2,
      anchor: expect.any(Function),
    })

    loadSection(foliateEl, secondDoc, 2)
    await flushAnimationFrame()

    expect(onTranslate).toHaveBeenNthCalledWith(1, 'Last paragraph in chapter 2.')
    expect(onTranslate).toHaveBeenNthCalledWith(2, 'First paragraph in chapter 3.')
    expect(secondDoc.querySelector('p')?.hasAttribute('data-nr-active')).toBe(true)
  })
})

describe('EpubViewer - imagens do leitor', () => {
  function appendImage(doc: Document, parent: Element = doc.body, src = 'https://example.test/images/figure.jpg') {
    const image = doc.createElement('img')
    image.src = src
    image.alt = 'Mapa do capitulo'
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(image, 'naturalHeight', {
      configurable: true,
      value: 480,
    })
    parent.appendChild(image)
    return image
  }

  it('tap em img abre a visualizacao sem traduzir nem alternar chrome', async () => {
    const onOpenImage = vi.fn()
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenImage, onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['Paragraph with image.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    const imageSrc = 'https://example.test/images/figure.jpg'
    const image = appendImage(fakeDoc, para, imageSrc)

    loadSection(foliateEl, fakeDoc, 0)
    click(image)

    expect(onOpenImage).toHaveBeenCalledWith({
      src: imageSrc,
      alt: 'Mapa do capitulo',
      naturalWidth: 640,
      naturalHeight: 480,
      sectionIndex: 0,
    })
    expect(onTranslate).not.toHaveBeenCalled()
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(logEventMock).toHaveBeenCalledWith('reader.image.open', expect.objectContaining({
      screen: 'reader',
      status: 'success',
      details: expect.objectContaining({
        sectionIndex: 0,
        hasAlt: true,
        naturalWidth: 640,
        naturalHeight: 480,
        sourceType: 'external',
      }),
    }))
    expect(JSON.stringify(logEventMock.mock.calls)).not.toContain(imageSrc)
  })

  it('detecta imagem pelo elementFromPoint quando o alvo direto nao e a imagem', async () => {
    const onOpenImage = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenImage })
    const fakeDoc = makeFakeDoc(['Hi'])
    const imageSrc = 'blob:reader-image'
    const image = appendImage(fakeDoc, fakeDoc.body, imageSrc)
    Object.defineProperty(fakeDoc, 'elementFromPoint', {
      configurable: true,
      value: () => image,
    })

    loadSection(foliateEl, fakeDoc, 0)
    clickAt(fakeDoc.body, 180, 360)

    expect(onOpenImage).toHaveBeenCalledWith(expect.objectContaining({
      src: imageSrc,
      sectionIndex: 0,
    }))
  })

  it('tap em img com chrome visivel e TTS ativo nao navega TTS nem fecha chrome', async () => {
    const onOpenImage = vi.fn()
    const onCenterTap = vi.fn()
    const onTranslate = vi.fn()
    const onParagraphTapForTts = vi.fn()
    const { foliateEl } = await renderViewer({
      chromeVisible: true,
      ttsGlobalActive: true,
      onOpenImage,
      onCenterTap,
      onTranslate,
      onParagraphTapForTts,
    })
    const fakeDoc = makeFakeDoc(['Paragraph with image.'])
    const para = fakeDoc.querySelector('p') as HTMLElement
    const image = appendImage(fakeDoc, para)

    loadSection(foliateEl, fakeDoc, 0)
    click(image)

    expect(onOpenImage).toHaveBeenCalledOnce()
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).not.toHaveBeenCalled()
    expect(onParagraphTapForTts).not.toHaveBeenCalled()
    expect(logEventMock).not.toHaveBeenCalledWith('reader.tap.ignored', expect.objectContaining({
      details: expect.objectContaining({ reason: 'tts-active' }),
    }))
  })

  it('gesto de scroll sobre img nao abre a visualizacao', async () => {
    const onOpenImage = vi.fn()
    const { foliateEl } = await renderViewer({ onOpenImage })
    const fakeDoc = makeFakeDoc(['Paragraph with image.'])
    const image = appendImage(fakeDoc, fakeDoc.querySelector('p') as HTMLElement)

    loadSection(foliateEl, fakeDoc, 0)
    touchAt(image, 'touchstart', 80, 80)
    touchAt(image, 'touchmove', 80, 120)
    click(image)

    expect(onOpenImage).not.toHaveBeenCalled()
    expectTapIgnored('scroll-gesture')
  })

  it('imagem dentro do bloco de traducao continua sendo tratada como toque no bloco', async () => {
    const onOpenImage = vi.fn()
    const onTranslate = vi.fn()
    const onCenterTap = vi.fn()
    const { viewerRef, foliateEl } = await renderViewer({ onOpenImage, onTranslate, onCenterTap })
    const fakeDoc = makeFakeDoc(['Paragraph for translation.'])
    const para = fakeDoc.querySelector('p') as HTMLElement

    loadSection(foliateEl, fakeDoc, 0)
    click(para)
    act(() => { viewerRef.current?.showTranslationLoading() })
    act(() => { viewerRef.current?.injectTranslation('Texto traduzido') })

    const block = fakeDoc.getElementById('nr-translation-block') as HTMLElement
    const image = appendImage(fakeDoc, block)
    click(image)

    expect(onOpenImage).not.toHaveBeenCalled()
    expect(onCenterTap).not.toHaveBeenCalled()
    expect(onTranslate).toHaveBeenCalledOnce()
    expectTapIgnored('translation-block', {
      sectionIndex: 0,
      paragraphIndex: 0,
    })
  })
})

describe('EpubViewer — liberação de recursos ao trocar de livro/desmontar', () => {
  it('libera os recursos do livro ao sair do leitor (desmonte)', async () => {
    const { foliateEl, unmount } = await renderViewer()

    await act(async () => { unmount() })

    expect(foliateEl.close).toHaveBeenCalledOnce()
    expect(foliateEl.book?.destroy).toHaveBeenCalledOnce()
  })

  it('libera os recursos do livro anterior ao trocar de livro', async () => {
    const { viewerRef, foliateEl: firstFoliateEl, rerender, container } = await renderViewer()

    const secondBook: Book = { ...mockBook, id: 2, title: 'Second Book' }
    rerender(
      <EpubViewer
        ref={viewerRef}
        {...(defaultProps({ book: secondBook }) as Parameters<typeof EpubViewer>[0])}
      />,
    )
    // Flush promises: setup() da nova instância (import + open() + init() do mock resolvem imediatamente)
    await act(async () => { await Promise.resolve() })

    expect(firstFoliateEl.close).toHaveBeenCalledOnce()
    expect(firstFoliateEl.book?.destroy).toHaveBeenCalledOnce()

    const secondFoliateEl = container.querySelector('foliate-view') as unknown as FoliateViewMock
    expect(secondFoliateEl).not.toBe(firstFoliateEl)
    expect(secondFoliateEl.book?.destroy).not.toHaveBeenCalled()
  })

  it('libera o book que termina de abrir depois do cleanup já ter rodado (open() pendente durante saída)', async () => {
    // Simula EPUB grande/rede lenta: open() fica pendente além do flush inicial do renderViewer.
    deferNextOpen()
    const { foliateEl, unmount } = await renderViewer()

    // Nesse instante, open() ainda não resolveu — view.book ainda não existe (igual ao foliate-js real).
    expect(foliateEl.book).toBeUndefined()

    await act(async () => { unmount() })
    expect(foliateEl.close).toHaveBeenCalledOnce()

    // open() só resolve DEPOIS do cleanup ter rodado — sem o fix, o book que acabou de
    // nascer aqui vazaria pra sempre (cleanup já passou e não vai rodar de novo).
    await act(async () => {
      resolveDeferredOpen()
      await Promise.resolve()
    })

    expect(foliateEl.book).toBeDefined()
    expect(foliateEl.book?.destroy).toHaveBeenCalledOnce()
  })
})
