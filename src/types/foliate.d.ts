// Declaracoes TypeScript para foliate-js (pacote sem tipos nativos)

interface TocItem {
  label: string
  href: string
  subitems?: TocItem[]
}

interface FoliateSection {
  href?: string
  cfi?: string
  linear?: string
}

interface FoliateResource {
  href: string
  mediaType: string
  [key: string]: unknown
}

// hitTest devolve [value, range, rect] do highlight sob o ponto, ou [] — é o
// que o próprio foliate usa para emitir 'show-annotation' (view.js). A US3
// consulta direto, para não depender da ordem de registro dos listeners.
interface FoliateOverlayer {
  hitTest?(point: { x: number; y: number }):
    | [string, Range, { left: number; top: number; right: number; bottom: number }]
    | []
  remove?(value: string): void
}

interface FoliateRendererContent {
  doc: Document
  index?: number
  overlayer?: FoliateOverlayer
}

interface RelocateDetail {
  cfi: string
  fraction: number // 0-1, progresso geral do livro
  tocItem?: { label: string; href: string }
  // Indice e total de secoes - vem de SectionProgress.getProgress() em progress.js
  section?: { current: number; total: number }
  index?: number
  size?: number
  range?: Range
}

declare module 'foliate-js/view.js' {
  export class View extends HTMLElement {
    book: {
      toc: TocItem[]
      metadata: Record<string, unknown>
      sections?: FoliateSection[]
      transformTarget?: EventTarget
      entries?: Map<string, unknown>
      resources?: {
        manifest?: FoliateResource[]
      }
      // Revoga os blob URLs de imagens/fontes/CSS acumulados durante a leitura (view.close() não chama isso sozinho)
      destroy?(): void
    }
    renderer: HTMLElement & {
      primaryIndex: number
      setAttribute(name: string, value: string | number): void
      removeAttribute(name: string): void
      setStyles?(css: string): void
      goTo?(params: {
        index: number
        anchor?: number | ((doc: Document) => Range | Element | number | null)
        select?: boolean
      }): Promise<unknown> | void
      nextSection?(): Promise<unknown> | void
      prevSection?(): Promise<unknown> | void
      getContents(): FoliateRendererContent[]
      scrollToAnchor?(anchor: number | Range | Element, select?: boolean, smooth?: boolean): Promise<unknown> | void
    }
    lastLocation: RelocateDetail | null

    open(file: Blob | File): Promise<void>
    init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    goTo(target: string | number | { fraction: number }): Promise<unknown>
    getCFI(index: number, range?: Range | null): string
    getProgressOf(index: number, range: Range): {
      tocItem?: { label: string; href?: string }
      pageItem?: unknown
    }
    getSectionFractions(): number[]
    close(): void

    // Highlights (feature 010): addAnnotation resolve o CFI, acha o overlayer da
    // seção e emite 'draw-annotation' com um draw(func, opts) que desenha via
    // overlayer.add — ver view.js. deleteAnnotation é addAnnotation(x, true).
    addAnnotation(annotation: { value: string }, remove?: boolean): Promise<{ index: number; label: string } | undefined>
    deleteAnnotation(annotation: { value: string }): Promise<{ index: number; label: string } | undefined>

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
      type: 'draw-annotation',
      listener: (e: CustomEvent<{
        draw: (func: unknown, opts?: { color?: string }) => void
        annotation: { value: string }
        doc: Document
        range: Range
      }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: 'show-annotation',
      listener: (e: CustomEvent<{ value: string; index: number; range?: Range; rect?: DOMRect }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    // Emitido depois que o overlayer de uma seção fica pronto — sempre DEPOIS de
    // 'load' para a mesma seção (ver paginator.js#display: onLoad roda antes do
    // create-overlayer ser despachado). addAnnotation chamado durante 'load' pode
    // não encontrar overlayer ainda; por isso repintamos highlights aqui também.
    addEventListener(
      type: 'create-overlay',
      listener: (e: CustomEvent<{ index: number }>) => void,
      options?: boolean | AddEventListenerOptions,
    ): void
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void
  }
}

declare module 'foliate-js/overlayer.js' {
  interface OverlayerRect {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }

  interface OverlayerLineOptions {
    color?: string
    width?: number
    padding?: number
    writingMode?: string
  }

  export class Overlayer {
    // draw function pronta pra usar com o draw(func, opts) de 'draw-annotation' —
    // pinta um highlight colorido sobre o range. overlayer.add() já calcula os
    // rects a partir do Range antes de chamar draw(rects, options); ver overlayer.js.
    static highlight(rects: OverlayerRect[], options?: { color?: string; padding?: number }): SVGElement
    // Estilos de marcação (feature 010): sublinhado reto e risco ondulado, mesma
    // assinatura de draw function que highlight — ver overlayer.js.
    static underline(rects: OverlayerRect[], options?: OverlayerLineOptions): SVGElement
    static squiggly(rects: OverlayerRect[], options?: OverlayerLineOptions): SVGElement
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function compare(a: string, b: string): number
  export function collapse(cfi: string, toEnd?: boolean): string
}

declare module 'foliate-js/opds.js' {
  export interface OpdsLink {
    rel?: string[]
    href?: string
    type?: string
    title?: string
  }

  export interface OpdsSubject {
    name?: string | null
    code?: string | null
    scheme?: string | null
  }

  export interface OpdsPublication {
    metadata: {
      id?: string
      title: string
      author: { name: string; links: OpdsLink[] }[]
      language?: string
      subject?: OpdsSubject[]
    }
    links: OpdsLink[]
    images: OpdsLink[]
  }

  export interface OpdsNavigationItem extends OpdsLink {
    title?: string
  }

  export interface OpdsFeedResult {
    metadata: {
      id?: string
      title?: string
      subtitle?: string
      updated?: string
    }
    links: OpdsLink[]
    publications?: OpdsPublication[]
    navigation?: OpdsNavigationItem[]
  }

  export const REL: {
    ACQ: string
    FACET: string
    GROUP: string
    COVER: string[]
    THUMBNAIL: string[]
  }

  export function isOPDSCatalog(contentType: string | null | undefined): boolean
  export function isOPDSSearch(contentType: string | null | undefined): boolean
  export function getFeed(doc: Document): OpdsFeedResult
  export function getPublication(entry: Element): OpdsPublication
  export function getOpenSearch(doc: Document): {
    metadata: { title?: string; description?: string }
    search: (params: Map<string | null, Map<string, string>>) => string
    params: { ns: string | null; name: string; required: boolean; value: string }[]
  }
}
