// Localizador de posição em PDF ("neopdf:") — equivalente ao CFI do EPUB (DI-005/DI-006).
//
// Endereço = (índice da página, offset de caractere no TEXTO BRUTO da página).
// O texto bruto é a concatenação dos itens de getTextContent() do pdf.js, SEM
// qualquer heurística de parágrafos. Por isso melhorar a reconstrução de
// parágrafos depois nunca invalida progresso, marcadores ou highlights salvos.
// Se a regra de texto bruto mudar, é preciso subir PDF_LOCATOR_VERSION.

export const PDF_LOCATOR_VERSION = 1

const LOCATOR_PREFIX = 'neopdf:'
const VERSIONED_PREFIX = `${LOCATOR_PREFIX}v${PDF_LOCATOR_VERSION};`

export interface PdfPoint {
  pageIndex: number // 0-based
  offset: number // unidades UTF-16 no texto bruto da página
}

// Fim exclusivo, igual a Range/slice.
export interface PdfRange {
  start: PdfPoint
  end: PdfPoint
}

export type PdfLocator =
  | { kind: 'point'; point: PdfPoint }
  | { kind: 'range'; range: PdfRange }

/** Item de texto do pdf.js — só os campos que a regra de texto bruto usa. */
export interface PdfRawTextItem {
  str: string
  hasEOL?: boolean
}

// ---------------------------------------------------------------------------
// Texto bruto
// ---------------------------------------------------------------------------

/**
 * Regra da versão 1: concatena `str` na ordem do pdf.js e põe "\n" depois de
 * cada item com hasEOL. Nada de trim, dehifenização ou espaço extra.
 * `itemStarts[i]` é o offset onde o item i começa (útil para mapear spans da camada de texto).
 */
export function buildRawPage(items: readonly PdfRawTextItem[]): { text: string; itemStarts: number[] } {
  const itemStarts: number[] = []
  let text = ''
  for (const item of items) {
    itemStarts.push(text.length)
    text += item.str
    if (item.hasEOL) text += '\n'
  }
  return { text, itemStarts }
}

export function buildRawPageText(items: readonly PdfRawTextItem[]): string {
  return buildRawPage(items).text
}

// ---------------------------------------------------------------------------
// Formatação / parse
// ---------------------------------------------------------------------------

function isValidPoint(point: PdfPoint): boolean {
  return Number.isInteger(point.pageIndex) && point.pageIndex >= 0 && Number.isInteger(point.offset) && point.offset >= 0
}

function formatPointBody(point: PdfPoint): string {
  return `p=${point.pageIndex};o=${point.offset}`
}

export function formatPdfPoint(point: PdfPoint): string {
  if (!isValidPoint(point)) throw new RangeError(`Ponto PDF inválido: ${JSON.stringify(point)}`)
  return `${VERSIONED_PREFIX}${formatPointBody(point)}`
}

export function formatPdfRange(range: PdfRange): string {
  if (!isValidPoint(range.start) || !isValidPoint(range.end)) {
    throw new RangeError(`Intervalo PDF inválido: ${JSON.stringify(range)}`)
  }
  return `${VERSIONED_PREFIX}${formatPointBody(range.start)},${formatPointBody(range.end)}`
}

// Só dígitos: rejeita "1e3", "-1", " 1", "01x" etc. que Number() aceitaria.
const POINT_BODY = /^p=(\d+);o=(\d+)$/

function parsePointBody(body: string): PdfPoint | null {
  const match = POINT_BODY.exec(body)
  if (!match) return null
  const point = { pageIndex: Number(match[1]), offset: Number(match[2]) }
  return Number.isSafeInteger(point.pageIndex) && Number.isSafeInteger(point.offset) ? point : null
}

/** true para qualquer string `neopdf:` (inclusive de versão futura); false para `epubcfi(...)` e lixo. */
export function isPdfLocator(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(LOCATOR_PREFIX)
}

/** Devolve null se a string não for um localizador da versão atual bem formado. */
export function parsePdfLocator(value: string | null | undefined): PdfLocator | null {
  if (typeof value !== 'string' || !value.startsWith(VERSIONED_PREFIX)) return null

  const parts = value.slice(VERSIONED_PREFIX.length).split(',')
  if (parts.length === 1) {
    const point = parsePointBody(parts[0])
    return point ? { kind: 'point', point } : null
  }
  if (parts.length === 2) {
    const start = parsePointBody(parts[0])
    const end = parsePointBody(parts[1])
    return start && end ? { kind: 'range', range: { start, end } } : null
  }
  return null
}

export function parsePdfPoint(value: string | null | undefined): PdfPoint | null {
  const locator = parsePdfLocator(value)
  return locator?.kind === 'point' ? locator.point : null
}

export function parsePdfRange(value: string | null | undefined): PdfRange | null {
  const locator = parsePdfLocator(value)
  return locator?.kind === 'range' ? locator.range : null
}

/** Ponto inicial de um localizador, seja ponto ou intervalo (ex.: para navegar até um highlight). */
export function getPdfLocatorStart(value: string | null | undefined): PdfPoint | null {
  const locator = parsePdfLocator(value)
  if (!locator) return null
  return locator.kind === 'point' ? locator.point : locator.range.start
}

// ---------------------------------------------------------------------------
// Ordenação / igualdade
// ---------------------------------------------------------------------------

export function comparePdfPoints(a: PdfPoint, b: PdfPoint): number {
  return a.pageIndex !== b.pageIndex ? a.pageIndex - b.pageIndex : a.offset - b.offset
}

export function arePdfPointsEqual(a: PdfPoint, b: PdfPoint): boolean {
  return comparePdfPoints(a, b) === 0
}
