import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createRef } from 'react'
import { EpubViewer, type EpubViewerHandle } from '@/components/reader/EpubViewer'
import type { Book } from '@/types/book'
import { failNextOpen, type FoliateViewMock } from '../setup'

// Mocka o import dinâmico de foliate-js — apenas registra o side-effect.
// O elemento <foliate-view> é provido pelo FoliateViewMock registrado no setup.ts.
vi.mock('foliate-js/view.js', () => ({}))

// Mocka módulos de DB usados indiretamente (via useTTS/hooks internos, se houver)
vi.mock('@/db/translations', () => ({
  getCachedTranslation: vi.fn(),
  setCachedTranslation: vi.fn(),
}))

// ─── helpers ────────────────────────────────────────────────────────────────

const mockBook: Book = {
  id: 1,
  title: 'Test Book',
  author: 'Author',
  coverBlob: null,
  fileBlob: new Blob([''], { type: 'application/epub+zip' }),
  addedAt: new Date(),
  lastOpenedAt: null,
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    book: mockBook,
    bookmarks: [],
    fontSize: 'md' as const,
    savedCfi: null,
    onRelocate: vi.fn(),
    onTocReady: vi.fn(),
    onLoad: vi.fn(),
    onError: vi.fn(),
    onSaveVocab: vi.fn(),
    onCenterTap: vi.fn(),
    onTranslate: vi.fn(),
    onSpeakOne: vi.fn(),
    onParagraphTapForTts: vi.fn(),
    ttsGlobalActive: false,
    onAtBottom: vi.fn(),
    onBookmarkTap: vi.fn(),
    ...overrides,
  }
}

/** Renderiza o EpubViewer, aguarda o setup async e devolve o elemento foliate-view. */
async function renderViewer(overrides: Record<string, unknown> = {}) {
  const viewerRef = createRef<EpubViewerHandle>()
  const props = defaultProps(overrides)

  const { container } = render(<EpubViewer ref={viewerRef} {...(props as Parameters<typeof EpubViewer>[0])} />)

  // Flush promises: open() + init() do mock resolvem imediatamente
  await act(async () => { await Promise.resolve() })

  const foliateEl = container.querySelector('foliate-view') as unknown as FoliateViewMock
  return { viewerRef, foliateEl, props, container }
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
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function loadSection(foliateEl: FoliateViewMock, doc: Document, index = 0) {
  act(() => {
    foliateEl.fireFoliate('load', { doc, index })
    foliateEl.fireRenderer('stabilized')
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
    loadSection(foliateEl, makeFakeDoc(), 0)
    expect(props.onLoad).toHaveBeenCalledOnce()
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
})

describe('EpubViewer — seleção de texto', () => {
  let fakeDoc: Document
  let paraA: HTMLElement
  let paraB: HTMLElement
  let viewerRef: ReturnType<typeof createRef<EpubViewerHandle>>
  let foliateEl: FoliateViewMock
  let onTranslate: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    onTranslate = vi.fn()
    const setup = await renderViewer({ onTranslate })
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
})

describe('EpubViewer — posição visível', () => {
  it('gera o CFI do início do parágrafo visível a partir do range atual', async () => {
    const { viewerRef, foliateEl } = await renderViewer()
    foliateEl.getCFI.mockReturnValue('epubcfi(/6/8!/4/2/10/2/1:0)')
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
      percentage: 60,
    })
    expect(viewerRef.current?.getFirstVisibleParagraphIndex()).toBe(1)

    const paragraphRange = foliateEl.getCFI.mock.calls[0]?.[1] as Range
    expect(foliateEl.getCFI).toHaveBeenCalledWith(0, expect.any(Range))
    expect(paragraphRange.collapsed).toBe(true)
    expect(paragraphRange.startOffset).toBe(0)
    expect(paragraphRange.startContainer.textContent).toBe('What This Book Is About')
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

  it('usa relocate para sinalizar fim da seção quando o progresso chega ao final', async () => {
    const onAtBottom = vi.fn()
    const { foliateEl } = await renderViewer({ onAtBottom })
    foliateEl.getSectionFractions.mockReturnValue([0, 0.2, 0.4, 1])

    const fakeDoc = makeFakeDoc(['Chapter content.'])
    loadSection(foliateEl, fakeDoc, 1)

    act(() => {
      foliateEl.fireFoliate('relocate', {
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.39,
        tocItem: { label: 'Chapter 2', href: 'chapter-2.xhtml' },
        section: { current: 1, total: 3 },
      })
    })

    expect(onAtBottom).toHaveBeenLastCalledWith(true, true, 'Chapter 3')
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
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(1)

    loadSection(foliateEl, titleOnlyDoc, 1)
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(2)
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
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(1)

    loadSection(foliateEl, contentDoc, 1)
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(1)
  })

  it('pula páginas de parte mesmo quando elas têm um parágrafo curto extra', async () => {
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

    act(() => { void viewerRef.current?.next() })
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(1)

    loadSection(foliateEl, partDoc, 1)
    expect(foliateEl.renderer.nextSection).toHaveBeenCalledTimes(2)
  })

  it('chegar ao fundo da seção não dispara navegação implícita por swipe', async () => {
    const onAtBottom = vi.fn()
    const { foliateEl } = await renderViewer({ onAtBottom })
    const fakeDoc = makeFakeDoc(['Long chapter content.'])
    const fakeWin = injectFakeWindow(fakeDoc, 0, 800, 1200)

    loadSection(foliateEl, fakeDoc, 0)
    expect(onAtBottom).toHaveBeenLastCalledWith(false, true, 'Chapter 2')

    act(() => {
      fakeWin.fireScroll(380)
    })

    expect(onAtBottom).toHaveBeenLastCalledWith(true, true, 'Chapter 2')
  })
})
