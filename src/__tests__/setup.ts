import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// JSDOM não implementa layout de verdade, então Range.prototype.getClientRects
// nem existe (diferente de getBoundingClientRect, que o jsdom stub com um
// retângulo zerado) — paintHighlight passou a chamá-lo pra posicionar o
// indicador de anotação (feature 014). Default seguro (array vazio, sem
// jogar exceção); testes que precisam de um rect específico sobrescrevem
// via vi.spyOn(Range.prototype, 'getClientRects') e restauram no fim.
if (typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
}

// Global flag: when set, the next open() call rejects with this error.
let nextOpenError: Error | null = null

export function failNextOpen(err: Error) {
  nextOpenError = err
}

// Global flag: quando setado, a próxima chamada de open() fica pendente até
// resolveDeferredOpen() ser chamado — simula EPUB grande/rede lenta pra testar
// cleanup rodando antes de open() (e portanto view.book) resolver.
let deferNextOpenFlag = false
let deferredOpenResolve: (() => void) | null = null

export function deferNextOpen() {
  deferNextOpenFlag = true
}

export function resolveDeferredOpen() {
  deferredOpenResolve?.()
  deferredOpenResolve = null
}

function makeBookMock() {
  return {
    transformTarget: new EventTarget(),
    metadata: {},
    sections: [
      { href: 'chapter-1.xhtml', linear: 'yes' },
      { href: 'chapter-2.xhtml', linear: 'yes' },
      { href: 'chapter-3.xhtml', linear: 'yes' },
    ],
    toc: [
      { label: 'Chapter 1', href: 'chapter-1.xhtml' },
      { label: 'Chapter 2', href: 'chapter-2.xhtml' },
      { label: 'Chapter 3', href: 'chapter-3.xhtml' },
    ],
    destroy: vi.fn(),
  }
}

// Stub de Overlayer por seção (feature 010, highlights) — observável em vez de
// undefined, pra testes poderem asseverar que a pintura foi chamada com o range
// e a cor certos. Não faz hit-testing real; hitTest sempre devolve vazio.
function makeOverlayerMock() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    hitTest: vi.fn((): unknown[] => []),
  }
}

// Mock foliate-view element used by EpubViewer tests.
class FoliateViewMock extends HTMLElement {
  private foliateCallbacks = new Map<string, Array<(e: { detail: unknown }) => void>>()
  private rendererEvents = new EventTarget()
  private rendererContents: Array<{ doc: Document; index: number }> = []
  private rendererPrimaryIndex = 0
  private overlayersByIndex = new Map<number, ReturnType<typeof makeOverlayerMock>>()

  private getOverlayerFor(index: number) {
    if (!this.overlayersByIndex.has(index)) this.overlayersByIndex.set(index, makeOverlayerMock())
    return this.overlayersByIndex.get(index)!
  }

  override addEventListener(
    event: string,
    cb: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (event === 'load' || event === 'relocate') {
      if (!this.foliateCallbacks.has(event)) this.foliateCallbacks.set(event, [])
      this.foliateCallbacks.get(event)!.push(cb as unknown as (e: { detail: unknown }) => void)
      return
    }
    super.addEventListener(event, cb, options)
  }

  fireFoliate(event: string, detail: unknown) {
    if (event === 'load') {
      const loadDetail = detail as { doc?: Document; index?: number }
      if (loadDetail.doc && typeof loadDetail.index === 'number') {
        this.rendererContents = [
          ...this.rendererContents.filter((content) => content.index !== loadDetail.index),
          { doc: loadDetail.doc, index: loadDetail.index },
        ].sort((a, b) => a.index - b.index)
      }
    }
    if (event === 'relocate') {
      const relocateDetail = detail as { index?: number; section?: { current?: number } }
      const nextPrimaryIndex = relocateDetail.index ?? relocateDetail.section?.current
      if (typeof nextPrimaryIndex === 'number') this.rendererPrimaryIndex = nextPrimaryIndex
    }
    this.foliateCallbacks.get(event)?.forEach(cb => cb({ detail }))
  }

  fireRenderer(event: string) {
    this.rendererEvents.dispatchEvent(new Event(event))
  }

  open = vi.fn(() => {
    if (nextOpenError) {
      const err = nextOpenError
      nextOpenError = null
      return Promise.reject(err)
    }
    // book só existe depois que open() resolve, igual ao foliate-js real
    // (view.book é atribuído dentro de open(), depois do parse do EPUB).
    if (deferNextOpenFlag) {
      deferNextOpenFlag = false
      return new Promise<void>((resolve) => {
        deferredOpenResolve = () => {
          this.book = makeBookMock()
          resolve()
        }
      })
    }
    this.book = makeBookMock()
    return Promise.resolve()
  })

  init = vi.fn(() => Promise.resolve())
  close = vi.fn()
  next = vi.fn(() => Promise.resolve())
  prev = vi.fn(() => Promise.resolve())
  goTo = vi.fn((target?: string | number | { index?: number }) => {
    if (typeof target === 'number') this.rendererPrimaryIndex = target
    if (typeof target === 'string') {
      const targetDocument = target.split('#')[0]
      const sectionIndex = (this.book?.sections ?? []).findIndex((section) => (
        section.href === targetDocument ||
        section.id === targetDocument ||
        section.href?.endsWith(`/${targetDocument}`) ||
        section.id?.endsWith(`/${targetDocument}`)
      ))
      if (sectionIndex >= 0) this.rendererPrimaryIndex = sectionIndex
    }
    if (typeof target === 'object' && typeof target?.index === 'number') {
      this.rendererPrimaryIndex = target.index
    }
    return Promise.resolve(target)
  })
  getCFI = vi.fn(() => 'epubcfi(/6/4!/4/2/1:0)')
  getProgressOf = vi.fn(() => ({ tocItem: { label: 'Mock Chapter', href: 'chapter-1.xhtml' } }))
  getSectionFractions = vi.fn(() => [0, 0.5, 1])

  // addAnnotation/deleteAnnotation mimicam o contrato real (view.js resolve o
  // CFI, acha o overlayer da seção e emite 'draw-annotation' com um
  // draw(func, opts) que desenha via overlayer.add) sem fazer parsing real de
  // CFI — sempre associa ao conteúdo mais recentemente carregado, o que basta
  // pros testes desta feature (uma seção carregada por vez).
  addAnnotation = vi.fn((annotation: { value: string }, remove = false) => {
    const target = this.rendererContents[this.rendererContents.length - 1]
    if (!target) return Promise.resolve(undefined)
    const overlayer = this.getOverlayerFor(target.index)
    overlayer.remove(annotation.value)
    if (!remove) {
      const range = target.doc.createRange()
      const draw = (func: unknown, opts?: unknown) => overlayer.add(annotation.value, range, func, opts)
      this.dispatchEvent(new CustomEvent('draw-annotation', { detail: { draw, annotation, doc: target.doc, range } }))
    }
    return Promise.resolve({ index: target.index, label: '' })
  })

  deleteAnnotation = vi.fn((annotation: { value: string }) => this.addAnnotation(annotation, true))

  renderer = {
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    setStyles: vi.fn(),
    get primaryIndex() {
      return (this as unknown as FoliateViewMock['renderer']).__owner.rendererPrimaryIndex
    },
    __owner: this,
    goTo: vi.fn((target?: { index?: number }) => {
      if (typeof target?.index === 'number') this.rendererPrimaryIndex = target.index
      return Promise.resolve()
    }),
    nextSection: vi.fn(() => Promise.resolve()),
    prevSection: vi.fn(() => Promise.resolve()),
    getContents: vi.fn(() => this.rendererContents.map((content) => ({
      ...content,
      overlayer: this.getOverlayerFor(content.index),
    }))),
    scrollToAnchor: vi.fn(),
    addEventListener: vi.fn((
      event: string,
      cb: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      this.rendererEvents.addEventListener(event, cb as EventListener, options)
    }),
    removeEventListener: vi.fn((
      event: string,
      cb: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      this.rendererEvents.removeEventListener(event, cb as EventListener, options)
    }),
  }

  book: ReturnType<typeof makeBookMock> | undefined = undefined
}

if (!customElements.get('foliate-view')) {
  customElements.define('foliate-view', FoliateViewMock)
}

// jsdom nao implementa ResizeObserver — measureElement do @tanstack/react-virtual
// (medicao dinamica de altura por item na Biblioteca virtualizada) depende dele.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}


export type { FoliateViewMock }
