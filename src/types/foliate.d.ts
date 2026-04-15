// Declarações TypeScript para foliate-js (pacote sem tipos nativos)

interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

interface RelocateDetail {
  cfi: string
  fraction: number // 0-1, progresso geral do livro
  tocItem?: { label: string; href: string }
  // Índice e total de seções — vem de SectionProgress.getProgress() em progress.js
  section?: { current: number; total: number }
}

declare module 'foliate-js/view.js' {
  export class View extends HTMLElement {
    book: {
      toc: TocItem[]
      metadata: Record<string, unknown>
      sections?: { length: number }
    }
    renderer: HTMLElement & {
      setAttribute(name: string, value: string): void
      setStyles?(css: string): void
    }
    lastLocation: RelocateDetail | null

    open(file: Blob | File): Promise<void>
    init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    goTo(target: string | number | { fraction: number }): Promise<unknown>
    close(): void

    // Override para tipar os eventos customizados corretamente
    addEventListener(
      type: 'relocate',
      listener: (e: CustomEvent<RelocateDetail>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: 'load',
      listener: (e: CustomEvent<{ doc: Document; index: number }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void
  }
}
