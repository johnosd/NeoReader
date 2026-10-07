// Modo texto do PDF (US2): um "livro" reflowable sintético, uma seção XHTML por trecho (DI-009), que o
// MESMO EpubViewer abre via prop `openBook` (DI-003). Assim Word Lens, tradução inline, TTS, highlights
// e marcadores funcionam sem reescrever a lógica do EPUB.
//
// O objeto segue o formato que o foliate-js espera de um book (o mesmo que epub.js monta): `sections`
// com load()/unload()/createDocument(), `toc`, `splitTOCHref`/`getTOCFragment`/`resolveHref`.
// Invariantes que mantêm o EpubViewer inalterado (R-011):
//   - raiz de toda seção com data-type="chapter" e nunca data-pdf-bookmark → o pulo automático de
//     "capítulo-stub" (isChapterStubSection) não some com trechos curtos;
//   - SEM transformTarget/entries/resources → registerUnmanifestedEpubStylesheets e
//     installPassiveEpubContentTransform não fazem nada;
//   - hrefs do sumário resolvidos pelo splitTOCHref/resolveHref deste próprio livro.

import type { PdfChunk } from '@/utils/pdfChunks'
import type { PdfBlock, PdfBlockRange } from '@/utils/pdfParagraphs'

// Atributos que ligam cada bloco do HTML ao texto bruto do PDF (localizador, DI-005). O
// PdfLocatorResolver lê esses atributos para converter localizador ↔ CFI.
export const PDF_TEXT_ATTR_START = 'data-nr-pdf-start' // "pagina:offset" do início do bloco
export const PDF_TEXT_ATTR_RANGES = 'data-nr-pdf-ranges' // "p:ini-fim;p:ini-fim" (fim exclusivo)
export const PDF_TEXT_ATTR_FIGURE = 'data-nr-pdf-figure' // "figure" (recorte) ou "page" (página inteira)
export const PDF_TEXT_ATTR_CHUNK = 'data-nr-pdf-chunk'

// Estimativa de caracteres por página para `section.size` antes de gerar o HTML. O foliate usa o
// tamanho só para repartir a fração de progresso entre as seções.
const ESTIMATED_CHARS_PER_PAGE = 1800

const XHTML_MIME = 'application/xhtml+xml'
// O documento EXIBIDO é HTML, não XML: o paginator do foliate põe o conteúdo de `loadContent()` em
// `iframe.srcdoc`, que é sempre parseado como HTML (é assim também com os EPUBs). Num documento XML o
// EpubViewer quebra ao injetar o bloco de tradução (innerHTML com atributo booleano, ex. `hidden`). Os
// documentos de conversão (getSectionDocument/createDocument) usam o mesmo parser, para a árvore — e
// portanto os caminhos de CFI — ser a mesma da página na tela.
const DISPLAY_MIME = 'text/html'

/** Imagem pedida ao renderer: faixa de uma figura ou a página inteira ("como na página", FR-009). */
export interface PdfTextImageRequest {
  pageIndex: number
  region: { yTop: number; yBottom: number } | null
}

/** O que o livro sintético precisa da sessão PDF (o PdfTextExtractor + render de página). */
export interface PdfTextBookSource {
  chunks: readonly PdfChunk[]
  reconstructChunk(chunk: PdfChunk): Promise<PdfBlock[]>
  getPagesShownAsImage(chunk: PdfChunk): Promise<Array<{ pageIndex: number; rawLength: number }>>
  // Ausente (ou devolvendo null) → só a legenda do placeholder, sem imagem.
  renderImage?(request: PdfTextImageRequest): Promise<Blob | null>
}

export interface PdfTextBookOptions {
  title: string
  author: string
  language?: string | null
  // Textos visíveis (i18n fica com quem chama). Números de página 1-based.
  labels: {
    figure: (pageNumber: number) => string
    pageAsImage: (pageNumber: number) => string
  }
}

export interface PdfTextBookSection {
  id: string
  linear: 'yes'
  size: number
  load(): Promise<string>
  loadContent(): Promise<string>
  unload(): void
  createDocument(): Promise<Document>
  resolveHref(href: string): string
}

export interface PdfTextBookTocItem {
  label: string
  href: string
}

export interface PdfTextBook {
  metadata: { title: string; author: string; language?: string }
  rendition: { layout: 'reflowable' }
  dir: 'ltr'
  sections: PdfTextBookSection[]
  toc: PdfTextBookTocItem[]
  splitTOCHref(href: string | undefined): string[]
  getTOCFragment(doc: Document, id: string): Element | null
  resolveHref(href: string): { index: number; anchor: (doc: Document) => Element | number | null } | null
  isExternal(href: string): boolean
  destroy(): void
  /**
   * Documento da seção SEM renderizar imagens (só a estrutura), para converter localizador ↔ CFI. Os
   * caminhos de CFI dos blocos são os mesmos do documento exibido: a imagem fica dentro do <figure>.
   */
  getSectionDocument(index: number): Promise<Document | null>
}

export const pdfTextSectionHref = (chunkIndex: number) => `nr-pdf-chunk-${chunkIndex}.xhtml`

// ---------------------------------------------------------------------------
// HTML (funções puras, exportadas para teste)
// ---------------------------------------------------------------------------

// Caracteres proibidos em XML 1.0 (controles que alguns PDFs trazem no texto) quebrariam o parse da seção.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// id estável do bloco = ponto onde ele começa. O foliate grava o id em cada passo do CFI ("/6[id]"), e o
// PdfLocatorResolver acha o bloco por ele mesmo quando o leitor injetou elementos antes (bloco de tradução)
// ou dentro dele (spans de Word Lens), o que desloca os índices do CFI.
export const PDF_TEXT_BLOCK_ID_PREFIX = 'nrpdf-'
export const pdfTextBlockId = (pageIndex: number, offset: number) => `${PDF_TEXT_BLOCK_ID_PREFIX}${pageIndex}-${offset}`

const formatRanges = (ranges: readonly PdfBlockRange[]) =>
  ranges.map((r) => `${r.pageIndex}:${r.start}-${r.end}`).join(';')

/** Bloco do HTML: um bloco reconstruído ou uma página mostrada inteira como imagem. */
export type PdfTextHtmlBlock =
  | { type: 'block'; block: PdfBlock; imageUrl?: string | null }
  | { type: 'page'; pageIndex: number; rawLength: number; imageUrl?: string | null }

/**
 * Ordem final do trecho: blocos reconstruídos, trocando os de páginas "como na original" por uma
 * imagem da página inteira, posta onde a página estaria na leitura.
 */
export function arrangeChunkBlocks(
  blocks: readonly PdfBlock[],
  pagesAsImage: ReadonlyArray<{ pageIndex: number; rawLength: number }>,
): PdfTextHtmlBlock[] {
  const imagePages = new Set(pagesAsImage.map((p) => p.pageIndex))
  const pending = [...pagesAsImage].sort((a, b) => a.pageIndex - b.pageIndex)
  const result: PdfTextHtmlBlock[] = []
  const flushPagesBefore = (pageIndex: number) => {
    while (pending.length > 0 && pending[0].pageIndex <= pageIndex) {
      const page = pending.shift()!
      result.push({ type: 'page', pageIndex: page.pageIndex, rawLength: page.rawLength })
    }
  }
  for (const block of blocks) {
    if (imagePages.has(block.pageIndex)) continue
    // Página-imagem anterior a este bloco entra antes dele (`<` estrito: bloco da própria página já saiu).
    flushPagesBefore(block.pageIndex - 1)
    result.push({ type: 'block', block })
  }
  flushPagesBefore(Infinity)
  return result
}

function blockToHtml(item: PdfTextHtmlBlock, options: PdfTextBookOptions): string {
  if (item.type === 'page') {
    const caption = escapeXml(options.labels.pageAsImage(item.pageIndex + 1))
    const attrs = `id="${pdfTextBlockId(item.pageIndex, 0)}" ${PDF_TEXT_ATTR_FIGURE}="page" ${PDF_TEXT_ATTR_START}="${item.pageIndex}:0" ${PDF_TEXT_ATTR_RANGES}="${item.pageIndex}:0-${item.rawLength}"`
    const img = item.imageUrl ? `<img src="${escapeXml(item.imageUrl)}" alt="${caption}"/>` : ''
    return `<figure ${attrs}>${img}<figcaption>${caption}</figcaption></figure>`
  }

  const { block } = item
  const start = block.ranges[0] ?? { pageIndex: block.pageIndex, start: 0 }
  const attrs = `id="${pdfTextBlockId(start.pageIndex, start.start)}" ${PDF_TEXT_ATTR_START}="${start.pageIndex}:${start.start}" ${PDF_TEXT_ATTR_RANGES}="${formatRanges(block.ranges)}"`
  if (block.kind === 'figure') {
    const caption = escapeXml(options.labels.figure(block.pageIndex + 1))
    const img = item.imageUrl ? `<img src="${escapeXml(item.imageUrl)}" alt="${caption}"/>` : ''
    return `<figure ${PDF_TEXT_ATTR_FIGURE}="figure" ${attrs}>${img}<figcaption>${caption}</figcaption></figure>`
  }
  if (block.kind === 'heading') {
    const level = block.level ?? 2
    return `<h${level} ${attrs}>${escapeXml(block.text)}</h${level}>`
  }
  return `<p ${attrs}>${escapeXml(block.text)}</p>`
}

// CSS neutro: tema, fonte, tamanho e entrelinha vêm do buildReaderCSS do EpubViewer (como no EPUB).
// Exceção: as cores "originais" de um PDF (papel branco, texto preto). No modo Original o leitor não
// impõe cores e, sem isto, o texto preto ficava sobre o fundo escuro do leitor (achado no device, T079).
// Nos temas do NeoReader o buildReaderCSS sobrescreve com !important.
const SECTION_CSS = `
html { background-color: #fff; color: #000; }
figure { margin: 1em 0; text-align: center; }
figure img { max-width: 100%; height: auto; background: #fff; }
figcaption { font-size: 0.8em; opacity: 0.7; }
`

export function buildChunkXhtml(
  chunk: PdfChunk,
  items: readonly PdfTextHtmlBlock[],
  options: PdfTextBookOptions,
): string {
  const lang = options.language ? ` lang="${escapeXml(options.language)}" xml:lang="${escapeXml(options.language)}"` : ''
  const body = items.map((item) => blockToHtml(item, options)).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${lang}>
<head>
<meta charset="utf-8"/>
<title>${escapeXml(chunk.label)}</title>
<style>${SECTION_CSS}</style>
</head>
<body>
<section data-type="chapter" ${PDF_TEXT_ATTR_CHUNK}="${chunk.index}">
${body}
</section>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Livro
// ---------------------------------------------------------------------------

interface LoadedSection {
  url: string
  imageUrls: string[]
  xhtml: string
}

/**
 * Cria o livro sintético. Não abre nem destrói o PDF: o documento pdf.js é da sessão (DI-008), e o
 * EpubViewer chama `book.destroy()` ao desmontar — aqui isso só solta as URLs geradas.
 */
export function createPdfTextBook(source: PdfTextBookSource, options: PdfTextBookOptions): PdfTextBook {
  const loaded = new Map<number, LoadedSection>()
  const loading = new Map<number, Promise<LoadedSection>>()
  let destroyed = false

  const release = (index: number) => {
    const entry = loaded.get(index)
    if (!entry) return
    URL.revokeObjectURL(entry.url)
    for (const url of entry.imageUrls) URL.revokeObjectURL(url)
    loaded.delete(index)
  }

  const renderImage = async (request: PdfTextImageRequest, imageUrls: string[]): Promise<string | null> => {
    if (!source.renderImage) return null
    try {
      const blob = await source.renderImage(request)
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      imageUrls.push(url)
      return url
    } catch (error) {
      // Figura sem imagem continua indicada pela legenda (FR-009); não derruba a seção.
      console.warn('[PdfTextBook] falha ao renderizar imagem da página', request.pageIndex, error)
      return null
    }
  }

  const loadSection = async (chunk: PdfChunk): Promise<LoadedSection> => {
    const [blocks, pagesAsImage] = await Promise.all([
      source.reconstructChunk(chunk),
      source.getPagesShownAsImage(chunk),
    ])
    const items = arrangeChunkBlocks(blocks, pagesAsImage)
    const imageUrls: string[] = []
    // Sequencial: cada imagem renderiza uma página inteira; em paralelo seguraria vários bitmaps juntos.
    for (const item of items) {
      if (item.type === 'page') {
        item.imageUrl = await renderImage({ pageIndex: item.pageIndex, region: null }, imageUrls)
      } else if (item.block.kind === 'figure') {
        const region = item.block.region
        item.imageUrl = await renderImage(
          { pageIndex: region?.pageIndex ?? item.block.pageIndex, region: region ? { yTop: region.yTop, yBottom: region.yBottom } : null },
          imageUrls,
        )
      }
    }
    const xhtml = buildChunkXhtml(chunk, items, options)
    const url = URL.createObjectURL(new Blob([xhtml], { type: XHTML_MIME }))
    return { url, imageUrls, xhtml }
  }

  const ensureLoaded = (chunk: PdfChunk): Promise<LoadedSection> => {
    const ready = loaded.get(chunk.index)
    if (ready) return Promise.resolve(ready)
    // Duas cargas simultâneas da mesma seção (visível + vizinha) compartilham o trabalho.
    const pending = loading.get(chunk.index)
    if (pending) return pending
    const promise = loadSection(chunk)
      .then((entry) => {
        if (destroyed) {
          URL.revokeObjectURL(entry.url)
          for (const url of entry.imageUrls) URL.revokeObjectURL(url)
          return entry
        }
        loaded.set(chunk.index, entry)
        return entry
      })
      .finally(() => loading.delete(chunk.index))
    loading.set(chunk.index, promise)
    return promise
  }

  const sections: PdfTextBookSection[] = source.chunks.map((chunk) => ({
    id: pdfTextSectionHref(chunk.index),
    linear: 'yes',
    size: (chunk.endPage - chunk.startPage + 1) * ESTIMATED_CHARS_PER_PAGE,
    load: async () => (await ensureLoaded(chunk)).url,
    loadContent: async () => (await ensureLoaded(chunk)).xhtml,
    unload: () => release(chunk.index),
    createDocument: async () => {
      const { xhtml } = await ensureLoaded(chunk)
      return new DOMParser().parseFromString(xhtml, DISPLAY_MIME)
    },
    // Todas as seções ficam na mesma "pasta": href relativo já é o href do livro.
    resolveHref: (href: string) => href,
  }))

  const indexById = new Map(sections.map((section, index) => [section.id, index]))

  const getSectionDocument = async (index: number): Promise<Document | null> => {
    const chunk = source.chunks[index]
    if (!chunk) return null
    // Seção já carregada: reaproveita o XHTML exibido (mesma estrutura, com as imagens).
    const xhtml = loaded.get(index)?.xhtml ?? buildChunkXhtml(
      chunk,
      arrangeChunkBlocks(await source.reconstructChunk(chunk), await source.getPagesShownAsImage(chunk)),
      options,
    )
    return new DOMParser().parseFromString(xhtml, DISPLAY_MIME)
  }

  return {
    metadata: {
      title: options.title,
      author: options.author,
      ...(options.language ? { language: options.language } : {}),
    },
    rendition: { layout: 'reflowable' },
    dir: 'ltr',
    sections,
    toc: source.chunks.map((chunk) => ({ label: chunk.label, href: pdfTextSectionHref(chunk.index) })),
    splitTOCHref: (href) => href?.split('#') ?? [],
    getTOCFragment: (doc, id) => doc.getElementById(id),
    resolveHref: (href) => {
      const [path, hash] = href.split('#')
      const index = indexById.get(path)
      if (index === undefined) return null
      return { index, anchor: hash ? (doc: Document) => doc.getElementById(hash) : () => 0 }
    },
    // Mesma regra do epub.js do foliate: blob: é interno; qualquer outro esquema é link externo.
    isExternal: (href) => /^(?!blob)\w+:/i.test(href),
    getSectionDocument,
    destroy: () => {
      destroyed = true
      for (const index of [...loaded.keys()]) release(index)
    },
  }
}
