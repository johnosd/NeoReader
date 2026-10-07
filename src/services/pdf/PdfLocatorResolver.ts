// Conversão entre o localizador do PDF ("neopdf:", DI-005) e o CFI do livro sintético do modo texto.
//
// O que é gravado (progresso, marcadores, highlights) é sempre o localizador; o EpubViewer só fala CFI.
// Esta é a "borda" de DI-006: o ReaderScreen converte localizador → CFI ao entregar dados ao viewer e
// CFI → localizador ao receber. Na página fiel não há CFI: o mapeamento ponto ↔ item da camada de
// texto já vive em components/reader/pdfPage/pdfPageMapping.ts.
//
// Cada bloco do HTML sintético carrega os intervalos do texto bruto que ele cobre (PdfTextBookBuilder,
// atributo data-nr-pdf-ranges). Dentro do bloco, offset do texto exibido ↔ offset do texto bruto é
// PROPORCIONAL: o texto exibido difere do bruto por espaços, hífens de quebra e cópias sobrepostas
// removidas (R-016), então não existe correspondência caractere a caractere. O início de um bloco é
// sempre exato — marcador e progresso apontam para inícios de parágrafo.

import * as CFI from 'foliate-js/epubcfi.js'
import { findChunkForPage, type PdfChunk } from '@/utils/pdfChunks'
import {
  comparePdfPoints,
  formatPdfPoint,
  formatPdfRange,
  parsePdfLocator,
  type PdfPoint,
} from '@/utils/pdfLocator'
import { PDF_TEXT_ATTR_RANGES, PDF_TEXT_BLOCK_ID_PREFIX } from './PdfTextBookBuilder'

interface RawSpan {
  pageIndex: number
  start: number
  end: number
}

/** O mínimo do livro sintético de que a conversão precisa. */
export interface PdfLocatorResolverBook {
  getSectionDocument(index: number): Promise<Document | null>
}

/** Posição dentro de um bloco do HTML sintético. */
export interface PdfTextPosition {
  element: Element
  textOffset: number
}

// ---------------------------------------------------------------------------
// Bloco ↔ texto bruto (DOM, sem pdf.js)
// ---------------------------------------------------------------------------

function parseSpans(element: Element): RawSpan[] {
  const value = element.getAttribute(PDF_TEXT_ATTR_RANGES)
  if (!value) return []
  return value.split(';').flatMap((part) => {
    const match = /^(\d+):(\d+)-(\d+)$/.exec(part)
    return match ? [{ pageIndex: Number(match[1]), start: Number(match[2]), end: Number(match[3]) }] : []
  })
}

const textLength = (element: Element) => element.textContent?.length ?? 0

/** Blocos do documento com intervalos de texto bruto, na ordem de leitura. */
export function pdfTextBlocks(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(`[${PDF_TEXT_ATTR_RANGES}]`))
}

function blockStart(element: Element): PdfPoint | null {
  const first = parseSpans(element)[0]
  return first ? { pageIndex: first.pageIndex, offset: first.start } : null
}

/**
 * Offset no texto bruto → posição no bloco (proporcional; null se o ponto não está no bloco).
 * `inclusiveEnd`: aceita o ponto exatamente no fim (fim de intervalo). Sem isso, o início do bloco
 * seguinte (mesmo offset) casaria com o fim deste.
 */
function textOffsetInBlock(element: Element, point: PdfPoint, inclusiveEnd = false): number | null {
  const spans = parseSpans(element)
  const total = spans.reduce((sum, span) => sum + (span.end - span.start), 0)
  let before = 0
  for (const [i, span] of spans.entries()) {
    const isLast = i === spans.length - 1
    const inside = span.pageIndex === point.pageIndex &&
      point.offset >= span.start &&
      (point.offset < span.end || (inclusiveEnd && isLast && point.offset === span.end))
    if (inside) {
      if (total === 0) return 0
      return Math.round(((before + point.offset - span.start) / total) * textLength(element))
    }
    before += span.end - span.start
  }
  return null
}

/**
 * Bloco e posição que mostram o ponto. Ponto fora de todo bloco (cabeçalho/rodapé removido pela
 * reconstrução, número de página) cai no primeiro bloco que começa depois dele; depois do último, no último.
 */
export function findTextPosition(doc: Document, point: PdfPoint): PdfTextPosition | null {
  const blocks = pdfTextBlocks(doc)
  for (const inclusiveEnd of [false, true]) {
    for (const element of blocks) {
      const textOffset = textOffsetInBlock(element, point, inclusiveEnd)
      if (textOffset !== null) return { element, textOffset }
    }
  }
  const next = blocks.find((element) => {
    const start = blockStart(element)
    return start !== null && comparePdfPoints(start, point) >= 0
  })
  if (next) return { element: next, textOffset: 0 }
  const last = blocks[blocks.length - 1]
  return last ? { element: last, textOffset: textLength(last) } : null
}

/** O ponto contido de fato em algum bloco do documento (sem o "cai no próximo" de findTextPosition). */
function containsPoint(doc: Document, point: PdfPoint): boolean {
  return pdfTextBlocks(doc).some((element) => textOffsetInBlock(element, point) !== null)
}

/** Posição no bloco → ponto no texto bruto. */
export function pointFromTextPosition(element: Element, textOffset: number): PdfPoint | null {
  const spans = parseSpans(element)
  if (spans.length === 0) return null
  const total = spans.reduce((sum, span) => sum + (span.end - span.start), 0)
  const length = textLength(element)
  const clamped = Math.max(0, Math.min(textOffset, length))
  let raw = length === 0 ? 0 : Math.round((clamped / length) * total)
  for (const [i, span] of spans.entries()) {
    const size = span.end - span.start
    if (raw < size || i === spans.length - 1) {
      return { pageIndex: span.pageIndex, offset: span.start + Math.min(raw, size) }
    }
    raw -= size
  }
  return null
}

/** Bloco que contém o nó (subindo pelos ancestrais) e o offset de texto do ponto dentro dele. */
export function textPositionFromBoundary(node: Node, offset: number): PdfTextPosition | null {
  let element: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  while (element && !element.hasAttribute(PDF_TEXT_ATTR_RANGES)) element = element.parentElement
  if (!element) return null

  // Caracteres do bloco antes do ponto (o nó pode estar dentro de spans injetados pelo leitor).
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  try {
    range.setEnd(node, offset)
  } catch {
    return { element, textOffset: 0 }
  }
  return { element, textOffset: range.toString().length }
}

/** Range colapsado no offset de texto do bloco. */
export function rangeAtTextPosition(position: PdfTextPosition): Range {
  const doc = position.element.ownerDocument
  const range = doc.createRange()
  const walker = doc.createTreeWalker(position.element, NodeFilter.SHOW_TEXT)
  let remaining = position.textOffset
  let lastText: Text | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (remaining <= node.data.length) {
      range.setStart(node, remaining)
      range.collapse(true)
      return range
    }
    remaining -= node.data.length
    lastText = node
  }
  if (lastText) range.setStart(lastText, lastText.data.length)
  else range.setStart(position.element, 0)
  range.collapse(true)
  return range
}

// ---------------------------------------------------------------------------
// Localizador ↔ CFI
// ---------------------------------------------------------------------------

const sectionCfi = (index: number, range: Range) => CFI.joinIndir(CFI.fake.fromIndex(index), CFI.fromRange(range))

/**
 * Range do ponto. Início de bloco vira (bloco, 0) — exatamente o que o EpubViewer calcula para um
 * parágrafo (getOrCreateParagraphBookmarkCfi), para o marcador casar com o parágrafo por comparação de CFI.
 */
function pointRange(position: PdfTextPosition): Range {
  if (position.textOffset > 0) return rangeAtTextPosition(position)
  const range = position.element.ownerDocument.createRange()
  range.selectNodeContents(position.element)
  range.collapse(true)
  return range
}

type CfiStep = { index: number; id?: string; offset?: number }

/**
 * Posição apontada por um caminho de CFI, achando o bloco pelo id gravado no caminho (imune a elementos
 * que o leitor injeta). Dentro do bloco: o 1º trecho de texto ("/1:n") é idêntico ao do documento limpo,
 * então o offset é exato; mais fundo (spans de Word Lens) usa `hintText` (texto selecionado) ou o início.
 */
function positionFromSteps(doc: Document, steps: CfiStep[], hintText?: string): PdfTextPosition | null {
  const blockStep = steps.findLastIndex((step) => step.id?.startsWith(PDF_TEXT_BLOCK_ID_PREFIX))
  const element = blockStep >= 0 ? doc.getElementById(steps[blockStep].id!) : null
  if (!element) return null
  const inner = steps.slice(blockStep + 1)
  if (inner.length === 1 && inner[0].index === 1 && typeof inner[0].offset === 'number') {
    return { element, textOffset: Math.min(inner[0].offset, textLength(element)) }
  }
  if (inner.length > 0 && hintText) {
    const found = (element.textContent ?? '').indexOf(hintText)
    if (found >= 0) return { element, textOffset: found }
  }
  return { element, textOffset: 0 }
}

/**
 * Converte entre localizadores e CFIs do livro sintético. Guarda poucos documentos estruturais (a
 * conversão de vários marcadores cai quase sempre nos mesmos trechos).
 */
export class PdfLocatorResolver {
  private readonly book: PdfLocatorResolverBook
  private readonly chunks: readonly PdfChunk[]
  private readonly docCache = new Map<number, Promise<Document | null>>()
  private static readonly DOC_CACHE_SIZE = 6

  constructor(book: PdfLocatorResolverBook, chunks: readonly PdfChunk[]) {
    this.book = book
    this.chunks = chunks
  }

  private getDoc(index: number): Promise<Document | null> {
    const cached = this.docCache.get(index)
    if (cached) {
      this.docCache.delete(index)
      this.docCache.set(index, cached)
      return cached
    }
    const promise = this.book.getSectionDocument(index)
    this.docCache.set(index, promise)
    while (this.docCache.size > PdfLocatorResolver.DOC_CACHE_SIZE) {
      this.docCache.delete(this.docCache.keys().next().value as number)
    }
    return promise
  }

  /**
   * Seção + posição que mostram o ponto. Um parágrafo pertence ao trecho onde COMEÇA (DI-009): ponto na
   * 1ª página de um trecho pode estar no último parágrafo do trecho anterior.
   */
  private async locate(point: PdfPoint): Promise<{ index: number; position: PdfTextPosition } | null> {
    const chunk = findChunkForPage(this.chunks, point.pageIndex)
    if (!chunk) return null
    const doc = await this.getDoc(chunk.index)
    if (chunk.index > 0 && chunk.startPage === point.pageIndex && doc && !containsPoint(doc, point)) {
      const previous = await this.getDoc(chunk.index - 1)
      if (previous && containsPoint(previous, point)) {
        const position = findTextPosition(previous, point)
        if (position) return { index: chunk.index - 1, position }
      }
    }
    const position = doc ? findTextPosition(doc, point) : null
    return position ? { index: chunk.index, position } : null
  }

  /** Localizador (ponto ou intervalo) → CFI do livro sintético, ou null. */
  async locatorToCfi(locator: string | null | undefined): Promise<string | null> {
    const parsed = parsePdfLocator(locator)
    if (!parsed) return null
    if (parsed.kind === 'point') {
      const found = await this.locate(parsed.point)
      return found ? sectionCfi(found.index, pointRange(found.position)) : null
    }

    const start = await this.locate(parsed.range.start)
    const end = await this.locate(parsed.range.end)
    if (!start || !end) return null
    const range = rangeAtTextPosition(start.position)
    // Intervalo que atravessa trechos: o CFI do EPUB vive numa seção só; corta no fim do trecho inicial.
    if (end.index === start.index) {
      const endRange = rangeAtTextPosition(end.position)
      range.setEnd(endRange.startContainer, endRange.startOffset)
    } else {
      const blocks = pdfTextBlocks(start.position.element.ownerDocument)
      const lastBlock = blocks[blocks.length - 1] ?? start.position.element
      range.setEnd(lastBlock, lastBlock.childNodes.length)
    }
    return sectionCfi(start.index, range)
  }

  /**
   * CFI do livro sintético (ponto ou intervalo) → localizador, ou null. `hintText` = texto do intervalo
   * (highlight), usado para achar o início exato quando o leitor partiu o parágrafo em spans.
   */
  async cfiToLocator(cfi: string | null | undefined, hintText?: string): Promise<string | null> {
    if (!cfi || !CFI.isCFI.test(cfi)) return null
    // Forma do CFI analisado pelo epubcfi.js: ponto = [indireção, caminho]; intervalo = { parent, start, end }.
    type ParsedCfi = CfiStep[][] | { parent: CfiStep[][]; start: CfiStep[][]; end: CfiStep[][] }
    let parsed: ParsedCfi
    let index: number
    try {
      // Mesmo procedimento do view.resolveCFI do foliate (CFI "fake" por índice de seção).
      parsed = CFI.parse(cfi) as unknown as ParsedCfi
      index = CFI.fake.toIndex((Array.isArray(parsed) ? parsed : parsed.parent).shift())
    } catch {
      return null
    }
    if (!Number.isInteger(index)) return null
    const doc = await this.getDoc(index)
    if (!doc) return null

    if (Array.isArray(parsed)) {
      const position = positionFromSteps(doc, parsed[0] ?? [])
      const point = position ? pointFromTextPosition(position.element, position.textOffset) : null
      return point ? formatPdfPoint(point) : null
    }

    const { parent, start, end } = parsed
    const startPosition = positionFromSteps(doc, [...(parent[0] ?? []), ...(start[0] ?? [])], hintText)
    const startPoint = startPosition ? pointFromTextPosition(startPosition.element, startPosition.textOffset) : null
    if (!startPoint) return null
    let endPosition = positionFromSteps(doc, [...(parent[0] ?? []), ...(end[0] ?? [])])
    // Com o texto do intervalo, o fim é o início + tamanho do texto, se couber no mesmo bloco.
    if (hintText && startPosition && endPosition?.element === startPosition.element) {
      endPosition = { element: startPosition.element, textOffset: startPosition.textOffset + hintText.length }
    }
    const endPoint = endPosition ? pointFromTextPosition(endPosition.element, endPosition.textOffset) : null
    return endPoint && comparePdfPoints(endPoint, startPoint) > 0
      ? formatPdfRange({ start: startPoint, end: endPoint })
      : formatPdfPoint(startPoint)
  }

  /** Soltar os documentos guardados (troca de modo/livro). */
  clear(): void {
    this.docCache.clear()
  }
}
