// Constrói o "book" de um PDF para o renderer de layout fixo do foliate (foliate-fxl) e devolve junto o
// único PDFDocumentProxy do livro (DI-008): página fiel, extração de texto e modo texto compartilham o mesmo
// documento — nunca se abre o mesmo PDF duas vezes em paralelo.
//
// Adaptado de foliate-js/pdf.js (MIT, Copyright (c) 2022 John Factotum), conforme o pacote vendorizado em
// node_modules/foliate-js (fork readest/foliate-js, licença MIT do próprio repositório). Diferenças:
// tipado em TypeScript, devolve o `pdf` além do `book`, e abre com disableAutoFetch para ler só as faixas
// do arquivo que forem necessárias (research.md §1 — PDF de 200 MB não pode virar 200 MB de heap).

import type { PdfOutlineEntry } from '@/utils/pdfChunks'
import { loadPdfjs, pdfjsPath, type PdfDocumentProxy, type PdfOutlineNode, type PdfPageProxy } from './pdfjs'
import { buildPdfPageSource, renderPdfPageToBlob, type PdfPageSource } from './pdfPageRender'

// Páginas (e resultados de render) mantidas em memória ao mesmo tempo; as mais antigas são descartadas.
const MAX_CACHED_PAGES = 8

export interface PdfTocItem {
  label: string
  href: string // JSON do destino (nome ou array), resolvido por book.resolveHref
  index: number | undefined // índice 0-based da página, quando o destino resolve
  subitems: PdfTocItem[] | null
}

export interface PdfBookSection {
  id: number
  load(): Promise<PdfPageSource>
  createDocument(): Promise<Document>
  size: number
}

export interface PdfBookMetadata {
  title?: unknown
  author?: unknown
  contributor?: unknown
  description?: unknown
  language?: unknown
  publisher?: unknown
  subject?: unknown
  identifier?: unknown
  source?: unknown
  rights?: unknown
}

export interface PdfBook {
  rendition: { layout: 'pre-paginated'; viewport: { width: number; height: number } }
  metadata: PdfBookMetadata
  toc: PdfTocItem[] | null
  sections: PdfBookSection[]
  isExternal(uri: string): boolean
  resolveHref(href: string): Promise<{ index: number }>
  splitTOCHref(href: string): Promise<[number | null, null]>
  getTOCFragment(doc: Document): Element
  getCover(): Promise<Blob | null>
  destroy(): void
}

export interface PdfBookHandle {
  book: PdfBook
  pdf: PdfDocumentProxy
}

export interface PdfRangeSource {
  url: string
  length: number
}

async function readHttpRange(source: PdfRangeSource, begin: number, end: number, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(source.url, {
    headers: { Range: `bytes=${begin}-${end - 1}` },
    signal,
  })
  if (response.status !== 206 || !response.headers.get('content-range')?.startsWith(`bytes ${begin}-${end - 1}/`)) {
    throw new Error(`PDF range HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('PDF range response has no body')
  const bytes = new Uint8Array(end - begin)
  let offset = 0
  try {
    while (offset < bytes.length) {
      const { value, done } = await reader.read()
      if (done || !value) throw new Error('PDF range response ended early')
      const count = Math.min(value.byteLength, bytes.length - offset)
      bytes.set(value.subarray(0, count), offset)
      offset += count
    }
    return bytes.buffer
  } finally {
    // O servidor local pode continuar enviando atÃ© o EOF apesar de responder 206.
    await reader.cancel().catch(() => undefined)
  }
}

async function resolveDestinationPage(pdf: PdfDocumentProxy, dest: string | unknown[] | null | undefined): Promise<number | undefined> {
  if (!dest) return undefined
  const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
  if (!resolved?.[0]) return undefined
  return pdf.getPageIndex(resolved[0])
}

async function makeTocItem(node: PdfOutlineNode, pdf: PdfDocumentProxy): Promise<PdfTocItem> {
  let index: number | undefined
  try {
    index = await resolveDestinationPage(pdf, node.dest)
  } catch (error) {
    // Destino quebrado em um item do sumário não pode impedir o livro de abrir.
    console.warn('Failed to get page index for TOC item:', node.title, error)
  }
  return {
    label: node.title,
    href: node.dest ? JSON.stringify(node.dest) : '',
    index,
    subitems: node.items?.length ? await Promise.all(node.items.map((child) => makeTocItem(child, pdf))) : null,
  }
}

/** Itens de nível 1 do sumário já resolvidos para página — a entrada de buildPdfChunks (DI-009). */
export function outlineEntriesFromToc(toc: readonly PdfTocItem[] | null | undefined): PdfOutlineEntry[] {
  return (toc ?? []).flatMap((item) => (item.index === undefined ? [] : [{ title: item.label, pageIndex: item.index }]))
}

export async function createPdfBook(file: Blob | PdfRangeSource): Promise<PdfBookHandle> {
  const pdfjs = await loadPdfjs()

  // O pdf.js pede [begin, end): arquivos locais vêm por HTTP Range e Blobs usam slice().
  const transport = new pdfjs.PDFDataRangeTransport(file instanceof Blob ? file.size : file.length, [])
  const rangeRequests = new AbortController()
  transport.requestDataRange = (begin, end) => {
    const read = file instanceof Blob
      ? file.slice(begin, end).arrayBuffer()
      : readHttpRange(file, begin, end, rangeRequests.signal)
    read
      .then((chunk) => transport.onDataRange(begin, chunk))
      .catch((error) => {
        if (!rangeRequests.signal.aborted) console.warn('PDF range read failed:', begin, end, error)
      })
  }

  const pdf = await pdfjs.getDocument({
    range: transport,
    // Sem isto o pdf.js baixaria o arquivo inteiro em segundo plano depois de abrir.
    disableAutoFetch: true,
    wasmUrl: pdfjsPath(''),
    cMapUrl: pdfjsPath('cmaps/'),
    standardFontDataUrl: pdfjsPath('standard_fonts/'),
    isEvalSupported: false,
  }).promise

  try {
    // O layout fixo precisa do tamanho da 1ª página como viewport padrão.
    const firstViewport = (await pdf.getPage(1)).getViewport({ scale: 1 })

    const meta = (await pdf.getMetadata()) ?? {}
    const dc = (name: string) => meta.metadata?.get(name)
    const metadata: PdfBookMetadata = {
      title: dc('dc:title') ?? meta.info?.Title,
      author: dc('dc:creator') ?? meta.info?.Author,
      contributor: dc('dc:contributor'),
      description: dc('dc:description') ?? meta.info?.Subject,
      language: dc('dc:language'),
      publisher: dc('dc:publisher'),
      subject: dc('dc:subject'),
      identifier: dc('dc:identifier'),
      source: dc('dc:source'),
      rights: dc('dc:rights'),
    }

    const outline = await pdf.getOutline()
    const toc = outline ? await Promise.all(outline.map((node) => makeTocItem(node, pdf))) : null

    // Dois caches LRU: páginas do pdf.js e HTML-base já renderizado. Map mantém ordem de inserção;
    // reinserir ao ler move o item para o fim (mais recente).
    const renderCache = new Map<number, PdfPageSource>()
    const pageCache = new Map<number, PdfPageProxy>()

    const getPage = async (index: number) => {
      const cached = pageCache.get(index)
      if (cached) {
        pageCache.delete(index)
        pageCache.set(index, cached)
        return cached
      }
      const page = await pdf.getPage(index + 1)
      pageCache.set(index, page)
      while (pageCache.size > MAX_CACHED_PAGES) {
        const oldest = pageCache.keys().next().value as number
        pageCache.get(oldest)?.cleanup() // libera os dados internos da página
        pageCache.delete(oldest)
      }
      return page
    }

    const sections: PdfBookSection[] = Array.from({ length: pdf.numPages }, (_, i) => ({
      id: i,
      load: async () => {
        const cached = renderCache.get(i)
        if (cached) {
          renderCache.delete(i)
          renderCache.set(i, cached)
          return cached
        }
        const source = await buildPdfPageSource(await getPage(i))
        renderCache.set(i, source)
        while (renderCache.size > MAX_CACHED_PAGES) {
          const oldest = renderCache.keys().next().value as number
          const entry = renderCache.get(oldest)
          renderCache.delete(oldest)
          if (entry?.src) URL.revokeObjectURL(entry.src)
        }
        return source
      },
      // Documento "de texto": só a camada de texto, para o foliate montar o sumário/busca sem renderizar o canvas.
      createDocument: async () => {
        const page = await getPage(i)
        const doc = document.implementation.createHTMLDocument('')
        for (const [tag, attr] of [['div', 'canvas'], ['div', 'textLayer'], ['div', 'annotationLayer']] as const) {
          const el = doc.createElement(tag)
          if (attr === 'canvas') el.id = attr
          else el.className = attr
          doc.body.appendChild(el)
        }
        const textLayer = doc.body.querySelector<HTMLElement>('.textLayer')!

        // O TextLayer do pdf.js mede fonte com canvas 2d; sem ele (jsdom), monta spans simples.
        if (doc.createElement('canvas').getContext?.('2d')) {
          await new pdfjs.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textLayer,
            viewport: page.getViewport({ scale: 1 }),
          }).render()
        } else {
          for (const item of (await page.getTextContent()).items) {
            if ('str' in item && item.str) {
              const span = doc.createElement('span')
              span.textContent = item.str
              textLayer.appendChild(span)
            }
          }
        }
        return doc
      },
      size: 1000,
    }))

    const parseDest = async (href: string) => {
      const parsed = JSON.parse(href) as string | unknown[]
      return typeof parsed === 'string' ? pdf.getDestination(parsed) : parsed
    }

    const book: PdfBook = {
      rendition: { layout: 'pre-paginated', viewport: { width: firstViewport.width, height: firstViewport.height } },
      metadata,
      toc,
      sections,
      isExternal: (uri) => /^\w+:/i.test(uri),
      resolveHref: async (href) => {
        const dest = await parseDest(href)
        return { index: await pdf.getPageIndex(dest![0]) }
      },
      splitTOCHref: async (href) => {
        if (!href) return [null, null]
        const dest = await parseDest(href)
        try {
          return [await pdf.getPageIndex(dest![0]), null]
        } catch (error) {
          console.warn('Error getting page index for href', href, error)
          return [null, null]
        }
      },
      getTOCFragment: (doc) => doc.documentElement,
      getCover: async () => renderPdfPageToBlob(await pdf.getPage(1)),
      destroy: () => {
        rangeRequests.abort()
        for (const entry of renderCache.values()) if (entry?.src) URL.revokeObjectURL(entry.src)
        renderCache.clear()
        for (const page of pageCache.values()) page?.cleanup()
        pageCache.clear()
        void pdf.destroy()
      },
    }

    return { book, pdf }
  } catch (error) {
    // Falhou depois de abrir o documento (1ª página, metadados): não deixar o worker/documento vazando.
    void pdf.destroy()
    throw error
  }
}
