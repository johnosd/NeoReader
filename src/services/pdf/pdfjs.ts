// Tipos mínimos do pdf.js 4.7.76 vendorizado em node_modules/foliate-js/vendor/pdfjs (o pacote não traz
// .d.ts) e o carregador único. Só descrevemos o que o NeoReader usa — não é a API inteira.

export interface PdfViewportLike {
  width: number
  height: number
  transform?: number[]
}

export interface PdfRenderTask {
  promise: Promise<void>
  cancel(): void
}

// Item de getTextContent(): só os TextItem têm `str`; marcadores de conteúdo (beginMarkedContent...) não.
export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
  fontName: string
}

export type PdfTextContentItem = PdfTextItem | { type: string }

export const isPdfTextItem = (item: PdfTextContentItem): item is PdfTextItem => 'str' in item

export interface PdfPageProxy {
  getViewport(options: { scale: number }): PdfViewportLike
  render(options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewportLike
    pageColors?: unknown
  }): PdfRenderTask
  getTextContent(): Promise<{ items: PdfTextContentItem[] }>
  streamTextContent(): ReadableStream
  getAnnotations(): Promise<unknown[]>
  cleanup(): void
}

export interface PdfOutlineNode {
  title: string
  dest: string | unknown[] | null
  items?: PdfOutlineNode[]
}

export interface PdfMetadataResult {
  info?: Record<string, unknown>
  metadata?: { get(name: string): unknown } | null
}

export interface PdfDocumentProxy {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPageProxy>
  getMetadata(): Promise<PdfMetadataResult | null>
  getOutline(): Promise<PdfOutlineNode[] | null>
  getDestination(name: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
  destroy(): Promise<void>
}

// A API de transporte por faixas: o pdf.js pede [begin, end) e nós respondemos com um slice do Blob.
export interface PdfDataRangeTransport {
  requestDataRange: (begin: number, end: number) => void
  onDataRange(begin: number, chunk: ArrayBuffer): void
}

export interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  PDFDataRangeTransport: new (length: number, initialData: ArrayBuffer[] | Uint8Array[]) => PdfDataRangeTransport
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocumentProxy> }
  TextLayer: new (options: { textContentSource: ReadableStream; container: HTMLElement; viewport: PdfViewportLike }) => {
    render(): Promise<void>
    // Um <span> por TextItem (str definido), na mesma ordem de getTextContent().
    textDivs: HTMLElement[]
  }
  AnnotationLayer: new (options: {
    page: PdfPageProxy
    viewport: PdfViewportLike
    div: HTMLElement
  }) => { render(options: { annotations: unknown[]; linkService: unknown }): Promise<void> }
  // Erros tipados do pdf.js (senha / arquivo inválido) — o PdfService traduz para erros do app.
  PasswordException: new (...args: unknown[]) => Error
  InvalidPDFException: new (...args: unknown[]) => Error
}

// Caminho público dos assets (worker, cmaps, fontes). No build vêm de copyFoliatePdfjsAssets; no
// `npm run dev`, de serveFoliatePdfjsAssets (vite.config.ts).
export const pdfjsPath = (path: string) => `/vendor/pdfjs/${path}`

let pdfjsPromise: Promise<PdfJsLib> | null = null

/**
 * Carrega o pdf.js sob demanda (~600 KB, fora do bundle inicial) e configura o worker.
 * O alias `@pdfjs/pdf.min.mjs` é definido em vite.config.ts; o módulo registra `globalThis.pdfjsLib`
 * como efeito colateral (é assim que o foliate-js também o usa).
 */
export function loadPdfjs(): Promise<PdfJsLib> {
  pdfjsPromise ??= import('@pdfjs/pdf.min.mjs').then(() => {
    const lib = (globalThis as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib
    if (!lib) throw new Error('pdf.js carregou, mas globalThis.pdfjsLib não foi registrado')
    lib.GlobalWorkerOptions.workerSrc = pdfjsPath('pdf.worker.min.mjs')
    return lib
  })
  // Se falhar (ex.: offline no primeiro uso), deixa tentar de novo na próxima chamada.
  pdfjsPromise.catch(() => {
    pdfjsPromise = null
  })
  return pdfjsPromise
}
