import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Global flag: when set, the next open() call rejects with this error.
let nextOpenError: Error | null = null

export function failNextOpen(err: Error) {
  nextOpenError = err
}

// Mock foliate-view element used by EpubViewer tests.
class FoliateViewMock extends HTMLElement {
  private foliateCallbacks = new Map<string, Array<(e: { detail: unknown }) => void>>()
  private rendererEvents = new EventTarget()
  private rendererContents: Array<{ doc: Document; index: number }> = []
  private rendererPrimaryIndex = 0

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
    return Promise.resolve()
  })

  init = vi.fn(() => Promise.resolve())
  close = vi.fn()
  next = vi.fn(() => Promise.resolve())
  prev = vi.fn(() => Promise.resolve())
  goTo = vi.fn((target?: string | number | { index?: number }) => {
    if (typeof target === 'number') this.rendererPrimaryIndex = target
    if (typeof target === 'object' && typeof target?.index === 'number') {
      this.rendererPrimaryIndex = target.index
    }
    return Promise.resolve()
  })
  getCFI = vi.fn(() => 'epubcfi(/6/4!/4/2/1:0)')
  getProgressOf = vi.fn(() => ({ tocItem: { label: 'Mock Chapter', href: 'chapter-1.xhtml' } }))
  getSectionFractions = vi.fn(() => [0, 0.5, 1])

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
      overlayer: undefined,
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

  book = {
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
  }
}

if (!customElements.get('foliate-view')) {
  customElements.define('foliate-view', FoliateViewMock)
}

export type { FoliateViewMock }
