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
  goTo = vi.fn(() => Promise.resolve())
  getCFI = vi.fn(() => 'epubcfi(/6/4!/4/2/1:0)')
  getProgressOf = vi.fn(() => ({ tocItem: { label: 'Mock Chapter', href: 'chapter-1.xhtml' } }))
  getSectionFractions = vi.fn(() => [0, 0.5, 1])

  renderer = {
    setAttribute: vi.fn(),
    setStyles: vi.fn(),
    nextSection: vi.fn(() => Promise.resolve()),
    prevSection: vi.fn(() => Promise.resolve()),
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
      { href: 'chapter-1.xhtml' },
      { href: 'chapter-2.xhtml' },
      { href: 'chapter-3.xhtml' },
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
