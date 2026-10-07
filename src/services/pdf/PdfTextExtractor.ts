import type { PdfChunk } from '@/utils/pdfChunks'
import { buildRawPage } from '@/utils/pdfLocator'
import { hasUncertainColumnOrder, reconstructPdfParagraphs, type PdfBlock, type PdfPageInput } from '@/utils/pdfParagraphs'
import { isPdfTextItem, type PdfDocumentProxy } from './pdfjs'

// Páginas de texto extraídas mantidas em memória (itens + texto bruto). ~1000 itens/página ≈ 150 KB,
// então 32 páginas ficam em poucos MB — suficiente para um trecho de até 40 páginas sem reextrair tudo
// a cada parágrafo consultado.
const PAGE_CACHE_SIZE = 32
// Trechos reconstruídos mantidos (o modo texto e o TTS consultam o mesmo trecho várias vezes).
const CHUNK_CACHE_SIZE = 4

// Páginas extras lidas em volta do trecho, só como contexto da reconstrução: antes, para detectar
// cabeçalho repetido; depois, para juntar o parágrafo que atravessa a virada de página (DI-009).
const CONTEXT_PAGES_BEFORE = 2
const CONTEXT_PAGES_AFTER = 3

export interface PdfExtractedPage extends PdfPageInput {
  rawText: string // texto bruto da regra v1 do localizador (pdfLocator.buildRawPage)
  itemStarts: number[]
}

/**
 * Texto de um PDF aberto: itens e texto bruto por página (com cache) e parágrafos reconstruídos por trecho.
 * Usa o PDFDocumentProxy compartilhado do livro (DI-008) — nunca abre o arquivo por conta própria.
 */
export class PdfTextExtractor {
  private readonly pageCache = new Map<number, PdfExtractedPage>()
  private readonly inFlight = new Map<number, Promise<PdfExtractedPage>>()
  private readonly chunkCache = new Map<number, PdfBlock[]>()

  private readonly pdf: PdfDocumentProxy

  // Campo explícito: `erasableSyntaxOnly` (tsconfig) proíbe a forma curta "constructor(private pdf)".
  constructor(pdf: PdfDocumentProxy) {
    this.pdf = pdf
  }

  get pageCount(): number {
    return this.pdf.numPages
  }

  /** Itens de texto + texto bruto da página (0-based). Páginas sem camada de texto devolvem listas vazias. */
  getPage(pageIndex: number): Promise<PdfExtractedPage> {
    const cached = this.pageCache.get(pageIndex)
    if (cached) {
      // Reinserir move para o fim do Map = mais recente (LRU).
      this.pageCache.delete(pageIndex)
      this.pageCache.set(pageIndex, cached)
      return Promise.resolve(cached)
    }

    // Duas chamadas simultâneas para a mesma página (ex.: contextos de trechos vizinhos) compartilham o trabalho.
    const pending = this.inFlight.get(pageIndex)
    if (pending) return pending

    const promise = this.extract(pageIndex).finally(() => this.inFlight.delete(pageIndex))
    this.inFlight.set(pageIndex, promise)
    return promise
  }

  async getRawText(pageIndex: number): Promise<string> {
    return (await this.getPage(pageIndex)).rawText
  }

  /**
   * Blocos (parágrafo/título/figura) cujo início está no trecho. Lê algumas páginas de contexto em volta,
   * mas só devolve o que começa dentro de [startPage, endPage].
   */
  async reconstructChunk(chunk: PdfChunk): Promise<PdfBlock[]> {
    const cached = this.chunkCache.get(chunk.index)
    if (cached) return cached

    const from = Math.max(0, chunk.startPage - CONTEXT_PAGES_BEFORE)
    const to = Math.min(this.pdf.numPages - 1, chunk.endPage + CONTEXT_PAGES_AFTER)

    // Sequencial de propósito: extrair 40 páginas em paralelo seguraria 40 operator lists ao mesmo tempo.
    const pages: PdfExtractedPage[] = []
    for (let pageIndex = from; pageIndex <= to; pageIndex++) pages.push(await this.getPage(pageIndex))

    const blocks = reconstructPdfParagraphs(pages, { ownedFromPage: chunk.startPage, ownedToPage: chunk.endPage })

    this.chunkCache.set(chunk.index, blocks)
    while (this.chunkCache.size > CHUNK_CACHE_SIZE) {
      this.chunkCache.delete(this.chunkCache.keys().next().value as number)
    }
    return blocks
  }

  /**
   * Páginas do trecho que o modo texto mostra como na original (FR-009 e Edge Cases da spec): sem texto
   * (escaneada dentro de um PDF misto) ou com ordem de colunas incerta. `rawLength` = tamanho do texto
   * bruto, para o localizador cobrir a página inteira.
   */
  async getPagesShownAsImage(chunk: PdfChunk): Promise<Array<{ pageIndex: number; rawLength: number }>> {
    const result: Array<{ pageIndex: number; rawLength: number }> = []
    for (let pageIndex = chunk.startPage; pageIndex <= chunk.endPage; pageIndex++) {
      const page = await this.getPage(pageIndex)
      const hasText = page.items.some((item) => item.str.trim())
      if (!hasText || hasUncertainColumnOrder(page)) result.push({ pageIndex, rawLength: page.rawText.length })
    }
    return result
  }

  /** Esvazia os caches (troca de livro/saída do leitor). O PDFDocumentProxy é destruído por quem o criou. */
  clear(): void {
    this.pageCache.clear()
    this.inFlight.clear()
    this.chunkCache.clear()
  }

  private async extract(pageIndex: number): Promise<PdfExtractedPage> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= this.pdf.numPages) {
      throw new RangeError(`Página PDF fora do documento: ${pageIndex}`)
    }

    const page = await this.pdf.getPage(pageIndex + 1)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      // Só TextItem: marcadores de conteúdo (beginMarkedContent...) não têm `str` e não entram no texto bruto.
      const items = content.items.filter(isPdfTextItem)
      const { text, itemStarts } = buildRawPage(items)

      const extracted: PdfExtractedPage = {
        pageIndex,
        viewport: { width: viewport.width, height: viewport.height },
        items,
        rawText: text,
        itemStarts,
      }

      this.pageCache.set(pageIndex, extracted)
      while (this.pageCache.size > PAGE_CACHE_SIZE) {
        this.pageCache.delete(this.pageCache.keys().next().value as number)
      }
      return extracted
    } finally {
      // Libera a lista de operações da página: não precisamos dela depois de ler o texto.
      page.cleanup()
    }
  }
}
