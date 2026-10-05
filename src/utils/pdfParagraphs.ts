// Reconstrução de parágrafos a partir dos itens de texto do pdf.js (DI-007).
//
// Função PURA: recebe itens de getTextContent() (str, transform, width, height, hasEOL) e
// devolve blocos (parágrafo / título / figura) com os intervalos do texto bruto de cada um
// (DI-005 — o localizador nunca depende desta heurística). Sem DOM, sem pdf.js.
//
// Implementação independente, feita do zero a partir do conceito (research.md §3). O Readest
// é AGPL-3.0: nenhum código dele entra aqui (DI-007 / FR-019).
//
// Pipeline:
//   1. itens → glyphs com geometria (descarta texto rotacionado);
//   2. glyphs → linhas por baseline; colunas por "rio" vertical (gutter) no eixo x;
//   3. remove cabeçalho/rodapé repetido e número de página isolado;
//   4. linhas → blocos (gap vertical, recuo, linha curta, tamanho de fonte, lista);
//   5. dehifeniza, une parágrafo que atravessa coluna/página e calcula os `ranges` brutos.
//
// Todas as constantes numéricas abaixo foram calibradas no corpus (debug-books/pdf).

import { buildRawPage } from './pdfLocator'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface PdfTextItemInput {
  str: string
  transform: number[] // [a, b, c, d, e, f] do pdf.js: e/f = posição da baseline, a/d ≈ tamanho
  width: number
  height: number
  hasEOL?: boolean
  fontName?: string
}

export interface PdfPageInput {
  pageIndex: number
  viewport: { width: number; height: number } // escala 1
  items: PdfTextItemInput[]
}

/** Intervalo [start, end) no texto bruto (buildRawPageText) de uma página. */
export interface PdfBlockRange {
  pageIndex: number
  start: number
  end: number
}

export interface PdfBlock {
  kind: 'paragraph' | 'heading' | 'figure'
  text: string // vazio em 'figure'
  pageIndex: number // página onde o bloco COMEÇA (DI-009)
  ranges: PdfBlockRange[]
  level?: 1 | 2 | 3 // só em 'heading'
  // Só em 'figure': faixa vertical (coordenadas do PDF, y para cima) para recortar a página.
  region?: { pageIndex: number; yTop: number; yBottom: number }
}

export interface ReconstructOptions {
  // Só devolve blocos que COMEÇAM nesta faixa de páginas. As demais páginas de `pages` servem de
  // contexto: detectar cabeçalho repetido e juntar o parágrafo que atravessa a virada de página.
  ownedFromPage?: number
  ownedToPage?: number
}

// ---------------------------------------------------------------------------
// Constantes calibradas
// ---------------------------------------------------------------------------

// Itens cuja baseline difere até esta fração do tamanho de fonte ficam na mesma linha (cobre sobrescrito).
const LINE_TOLERANCE_EM = 0.5
// Espaço entre itens da mesma linha maior que isso vira " " (pdf.js não insere espaços entre itens).
const SPACE_GAP_EM = 0.2
// Mesma string a menos de 1pt de distância = texto impresso várias vezes (negrito falso por sobreposição).
const DUPLICATE_TOLERANCE_PT = 1
// Itens com |b| acima disto (fração de |a|) estão rotacionados (margem lateral, marca d'água): ficam fora do fluxo.
const MAX_ITEM_SKEW = 0.2

// Colunas: rio vertical sem texto no eixo x.
const GUTTER_MIN_WIDTH_PT = 10
const GUTTER_MAX_COVER_RATIO = 0.03 // fração dos itens que pode "cobrir" o rio (títulos que atravessam)
const GUTTER_CENTRAL_BAND = [0.25, 0.75] as const // o rio precisa estar no miolo da página
const GUTTER_MIN_ITEMS_PER_SIDE = 8
const GUTTER_MIN_ITEMS_TOTAL = 40
const GUTTER_ROW_GAP_RATIO = 0.8 // vão da linha ≥ 80% do rio → linha de duas colunas (não um título espaçado)

// Página com menos texto que isso não tem amostra para um tamanho de corpo próprio.
const PAGE_BODY_MIN_CHARS = 300

// Quebra de parágrafo.
const PARAGRAPH_GAP_FACTOR = 1.35 // gap entre linhas > 1,35× o espaçamento típico
const PARAGRAPH_GAP_MIN_EM = 0.4 // ...e pelo menos 0,4em acima do típico (ruído de baseline chega a ~0,4em em PDFs reais)
const INDENT_MIN_EM = 0.6 // recuo de primeira linha
const SHORT_LINE_EM = 1.5 // linha justificada mais curta que a borda direita por isso = fim de parágrafo
const RAGGED_SHORT_RATIO = 0.25 // texto sem justificar: linha ≥25% mais curta que a coluna e com ponto final
const JUSTIFIED_SHARE = 0.45 // fração de linhas na borda direita para considerar a coluna justificada
const FONT_CHANGE_RATIO = 1.12 // tamanho muda > 12% entre linhas vizinhas → bloco novo
const FONT_DOMINANT_SHARE = 0.8 // a fonte da linha só conta como "mudou" se cobre ≥80% dos caracteres

// Títulos.
const HEADING_RATIO = 1.15 // fonte ≥ 1,15× o corpo
const HEADING_LEVEL_1_RATIO = 1.6
const HEADING_LEVEL_2_RATIO = 1.25
const HEADING_JOIN_GAP_EM = 1.8 // linhas de título consecutivas (título quebrado em 2 linhas)
// Título "de forma": mesmo tamanho do corpo, mas curto, sem pontuação final e (CAIXA ALTA ou isolado
// por vazio acima e abaixo). Muitos livros usam só negrito/caixa alta em vez de fonte maior.
const SHAPE_HEADING_MAX_CHARS = 80
const SHAPE_HEADING_ISOLATION = 1.3 // vazio acima e abaixo > 1,3× o espaçamento típico
const ALL_CAPS_SHARE = 0.9

// Figuras e tabelas (só o texto é conhecido: inferimos por vazio vertical e linhas em "células").
const FIGURE_GAP_LINES = 5 // vazio > 5× o espaçamento típico entre duas linhas → há uma figura ali
const TABLE_CELL_GAP_EM = 1.0
const TABLE_MIN_CELLS = 3
const TABLE_MIN_LINES = 3

// Cabeçalho / rodapé.
const HEADER_ZONE = 0.12 // fração da altura da página, a partir do topo/rodapé
const HEADER_MIN_REPEATS = 3
// Cabeçalho de verdade aparece em boa parte das páginas (a cada página, ou a cada 2 em livros
// com verso/recto). Título de seção que só reaparece de vez em quando ("Resumo") fica abaixo disto.
const HEADER_MIN_PAGE_SHARE = 0.4
const HEADER_EDGE_LINES = 2 // só as 2 linhas mais externas de cada lado são candidatas

// ---------------------------------------------------------------------------
// Estruturas internas
// ---------------------------------------------------------------------------

interface Glyph {
  index: number // índice do item na página (casa com buildRawPage.itemStarts)
  str: string
  x: number // borda esquerda
  y: number // baseline
  w: number
  h: number // tamanho de fonte (0 em itens vazios)
  font: string
  // Índices de cópias sobrepostas descartadas: continuam no bloco para os ranges ficarem contíguos.
  duplicates: number[]
}

type Stream = 'F' | 'L' | 'R' // F = largura total, L/R = coluna esquerda/direita

interface Line {
  pageIndex: number
  glyphs: Glyph[]
  text: string
  x0: number
  x1: number
  y: number
  size: number
  // Fonte que domina a linha e a fração de caracteres que ela cobre (citação em itálico = outra fonte).
  font: string
  fontShare: number
  stream: Stream
  isTable: boolean
}

interface PageMetrics {
  typicalGap: number | null
  leftMargin: number
  rightEdge: number
  justified: boolean
}

// ---------------------------------------------------------------------------
// 1. Itens → glyphs
// ---------------------------------------------------------------------------

function toGlyphs(items: readonly PdfTextItemInput[]): Glyph[] {
  const glyphs: Glyph[] = []
  // Grade de 1pt: a cópia deslocada de 0,3pt cai no mesmo balde ou num vizinho.
  const buckets = new Map<string, Glyph[]>()
  const bucketKey = (x: number, y: number) => `${Math.floor(x)}|${Math.floor(y)}`

  items.forEach((item, index) => {
    const [a = 0, b = 0, , d = 0, x = 0, y = 0] = item.transform
    const size = item.height || Math.abs(d) || Math.abs(a)
    if (Math.abs(b) > Math.abs(a) * MAX_ITEM_SKEW) return // rotacionado
    if (!item.str && !item.hasEOL) return

    if (item.str.trim()) {
      let original: Glyph | undefined
      for (let dx = -1; dx <= 1 && !original; dx++) {
        for (let dy = -1; dy <= 1 && !original; dy++) {
          original = buckets
            .get(bucketKey(x + dx, y + dy))
            ?.find((g) => g.str === item.str && Math.abs(g.x - x) < DUPLICATE_TOLERANCE_PT && Math.abs(g.y - y) < DUPLICATE_TOLERANCE_PT)
        }
      }
      if (original) {
        original.duplicates.push(index)
        return
      }
    }

    const glyph: Glyph = { index, str: item.str, x, y, w: item.width, h: item.str.trim() ? size : 0, font: item.fontName ?? '', duplicates: [] }
    glyphs.push(glyph)
    if (item.str.trim()) {
      const key = bucketKey(x, y)
      buckets.set(key, [...(buckets.get(key) ?? []), glyph])
    }
  })
  return glyphs
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((p, q) => p - q)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ---------------------------------------------------------------------------
// 2. Linhas e colunas
// ---------------------------------------------------------------------------

function clusterRows(glyphs: Glyph[]): Glyph[][] {
  const sorted = [...glyphs].sort((p, q) => q.y - p.y || p.index - q.index)
  const rows: Glyph[][] = []
  let rowY = 0
  let rowH = 0
  for (const glyph of sorted) {
    const current = rows[rows.length - 1]
    const tolerance = LINE_TOLERANCE_EM * Math.max(glyph.h, rowH)
    if (current && Math.abs(glyph.y - rowY) <= tolerance) {
      current.push(glyph)
      rowH = Math.max(rowH, glyph.h)
    } else {
      rows.push([glyph])
      rowY = glyph.y
      rowH = glyph.h
    }
  }
  return rows.map((row) => row.sort((p, q) => p.x - q.x || p.index - q.index))
}

type Gutter = { a: number; b: number }

const solidGlyphs = (glyphs: Glyph[]) => glyphs.filter((g) => g.str.trim() && g.w > 0)
const hasTooLittleText = (glyphs: Glyph[]) => solidGlyphs(glyphs).length < GUTTER_MIN_ITEMS_TOTAL

function findGutter(glyphs: Glyph[]): Gutter | null {
  const solid = solidGlyphs(glyphs)
  if (solid.length < GUTTER_MIN_ITEMS_TOTAL) return null

  const minX = Math.min(...solid.map((g) => g.x))
  const maxX = Math.max(...solid.map((g) => g.x + g.w))
  const width = maxX - minX
  if (width < GUTTER_MIN_WIDTH_PT * 8) return null

  // Cobertura do eixo x em passos de 1pt: quantos itens passam por cada ponto.
  const cover = new Array<number>(Math.ceil(width) + 1).fill(0)
  for (const g of solid) {
    const from = Math.max(0, Math.floor(g.x - minX))
    const to = Math.min(cover.length - 1, Math.ceil(g.x + g.w - minX))
    for (let i = from; i <= to; i++) cover[i]++
  }

  const maxCover = Math.max(1, Math.floor(solid.length * GUTTER_MAX_COVER_RATIO))
  const bandStart = Math.floor(width * GUTTER_CENTRAL_BAND[0])
  const bandEnd = Math.ceil(width * GUTTER_CENTRAL_BAND[1])

  let best: Gutter | null = null
  let runStart = -1
  for (let i = bandStart; i <= bandEnd + 1; i++) {
    const open = i <= bandEnd && cover[i] <= maxCover
    if (open && runStart < 0) runStart = i
    if (!open && runStart >= 0) {
      if (!best || i - runStart > best.b - best.a) best = { a: runStart, b: i }
      runStart = -1
    }
  }
  if (!best || best.b - best.a < GUTTER_MIN_WIDTH_PT) return null

  const gutter = { a: minX + best.a, b: minX + best.b }
  const mid = (gutter.a + gutter.b) / 2
  const left = solid.filter((g) => g.x + g.w / 2 < mid).length
  const right = solid.length - left
  return left >= GUTTER_MIN_ITEMS_PER_SIDE && right >= GUTTER_MIN_ITEMS_PER_SIDE ? gutter : null
}

function glyphText(glyphs: Glyph[]): string {
  let text = ''
  let previous: Glyph | null = null
  for (const glyph of glyphs) {
    if (!glyph.str) continue
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(glyph.str)) {
      const size = Math.max(previous.h, glyph.h)
      if (glyph.x - (previous.x + previous.w) > SPACE_GAP_EM * size) text += ' '
    }
    text += glyph.str
    if (glyph.str.trim()) previous = glyph
  }
  return text.replace(/\s+/g, ' ').trim()
}

function makeLine(pageIndex: number, glyphs: Glyph[], stream: Stream): Line | null {
  const solid = glyphs.filter((g) => g.str.trim())
  if (solid.length === 0) return null

  // Baseline e tamanho vêm do item com mais caracteres (ignora sobrescrito/nota de rodapé).
  const main = solid.reduce((best, g) => (g.str.trim().length > best.str.trim().length ? g : best))
  const text = glyphText(glyphs)

  // Linha "de tabela": ≥3 células separadas por vãos largos.
  let cells = 1
  for (let i = 1; i < solid.length; i++) {
    const gap = solid[i].x - (solid[i - 1].x + solid[i - 1].w)
    if (gap >= TABLE_CELL_GAP_EM * main.h) cells++
  }

  const charsByFont = new Map<string, number>()
  for (const g of solid) charsByFont.set(g.font, (charsByFont.get(g.font) ?? 0) + g.str.trim().length)
  const [font, fontChars] = [...charsByFont.entries()].sort((p, q) => q[1] - p[1])[0]
  const totalChars = solid.reduce((n, g) => n + g.str.trim().length, 0)

  return {
    pageIndex,
    glyphs,
    text,
    x0: Math.min(...solid.map((g) => g.x)),
    x1: Math.max(...solid.map((g) => g.x + g.w)),
    y: main.y,
    size: main.h,
    font,
    fontShare: fontChars / totalChars,
    stream,
    isTable: cells >= TABLE_MIN_CELLS && stream === 'F',
  }
}

// Linhas da página já na ordem de leitura: coluna esquerda, depois a direita, por faixa
// delimitada pelas linhas de largura total (título que atravessa as colunas).
function orderedLines(page: PdfPageInput, neighbourGutter: Gutter | null): Line[] {
  const glyphs = toGlyphs(page.items)
  const rows = clusterRows(glyphs)
  // Página com pouco texto (última de um artigo, abertura de capítulo) não tem amostra para achar o
  // rio sozinha: herda o das vizinhas, senão as duas colunas viram uma linha só.
  const gutter = findGutter(glyphs) ?? (hasTooLittleText(glyphs) ? neighbourGutter : null)

  if (!gutter) {
    return rows.flatMap((row) => makeLine(page.pageIndex, row, 'F') ?? [])
  }

  const gutterWidth = gutter.b - gutter.a
  const mid = (gutter.a + gutter.b) / 2
  const ordered: Line[] = []
  let leftBand: Line[] = []
  let rightBand: Line[] = []
  const flush = () => {
    ordered.push(...leftBand, ...rightBand)
    leftBand = []
    rightBand = []
  }

  for (const row of rows) {
    const solid = row.filter((g) => g.str.trim())
    const crosses = solid.some((g) => g.x < gutter.a && g.x + g.w > gutter.b)
    const leftGlyphs = row.filter((g) => g.x + g.w / 2 < mid)
    const rightGlyphs = row.filter((g) => g.x + g.w / 2 >= mid)
    const leftSolid = leftGlyphs.filter((g) => g.str.trim())
    const rightSolid = rightGlyphs.filter((g) => g.str.trim())

    let twoColumns = false
    if (!crosses && leftSolid.length > 0 && rightSolid.length > 0) {
      const leftEnd = Math.max(...leftSolid.map((g) => g.x + g.w))
      const rightStart = Math.min(...rightSolid.map((g) => g.x))
      twoColumns = rightStart - leftEnd >= gutterWidth * GUTTER_ROW_GAP_RATIO
    }

    if (twoColumns || (!crosses && (leftSolid.length === 0 || rightSolid.length === 0))) {
      // Linha só de uma coluna, ou das duas lado a lado.
      const left = makeLine(page.pageIndex, leftGlyphs, 'L')
      const right = makeLine(page.pageIndex, rightGlyphs, 'R')
      if (left) leftBand.push(left)
      if (right) rightBand.push(right)
    } else {
      flush()
      const full = makeLine(page.pageIndex, row, 'F')
      if (full) ordered.push(full)
    }
  }
  flush()
  return ordered
}

// ---------------------------------------------------------------------------
// 3. Cabeçalho / rodapé
// ---------------------------------------------------------------------------

// Dígitos viram "#": "Página 12" e "Página 13" repetem a mesma chave.
const normalizeForRepeat = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
const PAGE_NUMBER_ONLY = /^[#\s\-–—.|•·]*#[#\s\-–—.|•·]*$/

function removeRepeatedEdges(pages: readonly PdfPageInput[], linesByPage: Line[][], bodySize: number): Line[][] {
  const allLines = linesByPage.flat()
  if (allLines.length === 0) return linesByPage

  const refTop = Math.max(...allLines.map((l) => l.y))
  const refBottom = Math.min(...allLines.map((l) => l.y))
  const pageHeight = Math.max(...pages.map((p) => p.viewport.height))
  const zone = pageHeight * HEADER_ZONE
  const pagesWithText = linesByPage.filter((lines) => lines.length > 0).length
  const minRepeats = pagesWithText <= 4 ? 2 : Math.max(HEADER_MIN_REPEATS, Math.ceil(pagesWithText * HEADER_MIN_PAGE_SHARE))

  // Candidatas: as linhas mais externas de cada página, dentro da zona.
  const edgeKeys: Array<{ line: Line; key: string }> = []
  linesByPage.forEach((lines) => {
    const byY = [...lines].sort((p, q) => q.y - p.y)
    const top = byY.slice(0, HEADER_EDGE_LINES).filter((l) => l.y >= refTop - zone)
    const bottom = byY.slice(-HEADER_EDGE_LINES).filter((l) => l.y <= refBottom + zone)
    for (const line of new Set([...top, ...bottom])) edgeKeys.push({ line, key: normalizeForRepeat(line.text) })
  })

  const pagesPerKey = new Map<string, Set<number>>()
  for (const { line, key } of edgeKeys) {
    if (!pagesPerKey.has(key)) pagesPerKey.set(key, new Set())
    pagesPerKey.get(key)!.add(line.pageIndex)
  }

  const removed = new Set<Line>()
  for (const { line, key } of edgeKeys) {
    // Linha com fonte de título nunca é cabeçalho corrido, mesmo que repita.
    const repeated = line.size < bodySize * HEADING_RATIO && (pagesPerKey.get(key)?.size ?? 0) >= minRepeats
    // Número de página isolado some mesmo sem repetição (janela curta, primeira/última página).
    const pageNumber = key.length <= 12 && PAGE_NUMBER_ONLY.test(key)
    if (repeated || pageNumber) removed.add(line)
  }
  return linesByPage.map((lines) => lines.filter((line) => !removed.has(line)))
}

// ---------------------------------------------------------------------------
// 4. Métricas e quebra de blocos
// ---------------------------------------------------------------------------

function bodySizeOf(lines: Line[]): number {
  const weight = new Map<number, number>()
  for (const line of lines) {
    const bucket = Math.round(line.size * 2) / 2
    weight.set(bucket, (weight.get(bucket) ?? 0) + line.text.length)
  }
  let best = 0
  let bestWeight = -1
  for (const [size, w] of weight) {
    if (w > bestWeight) {
      best = size
      bestWeight = w
    }
  }
  return best
}

function metricsFor(lines: Line[], bodySize: number): PageMetrics {
  const body = lines.filter((l) => Math.abs(l.size - bodySize) <= bodySize * 0.1)
  const gaps: number[] = []
  for (let i = 1; i < body.length; i++) {
    const gap = body[i - 1].y - body[i].y
    if (gap > 0 && gap <= bodySize * 2.5) gaps.push(gap)
  }

  // Margem esquerda = x0 mais frequente (arredondado a 1pt).
  const lefts = new Map<number, number>()
  for (const l of body) lefts.set(Math.round(l.x0), (lefts.get(Math.round(l.x0)) ?? 0) + 1)
  const leftMargin = [...lefts.entries()].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0]?.[0] ?? 0

  // Borda direita = percentil 90 de x1 (ignora uma linha que "vaza").
  const rights = body.map((l) => l.x1).sort((p, q) => p - q)
  const rightEdge = rights.length ? rights[Math.min(rights.length - 1, Math.floor(rights.length * 0.9))] : 0
  const flush = body.filter((l) => l.x1 >= rightEdge - 2).length

  return {
    // Mediana de gaps só faz sentido com amostra; abaixo de 4 gaps não há "típico" confiável.
    typicalGap: gaps.length >= 4 ? median(gaps) : null,
    leftMargin,
    rightEdge,
    justified: body.length >= 6 && flush / body.length >= JUSTIFIED_SHARE,
  }
}

const TERMINAL = /[.!?…]["'”’»)\]]*$/
const HYPHEN_END = /[-‐‑­]$/
// Travessão "—" NÃO entra: abre fala em diálogo e também aparece no meio de frase, no começo de linha.
const LIST_MARKER = /^(?:[•◦▪●■]|[-–*]\s|\d{1,2}[.)]\s+\p{Lu})/u

function isAllCaps(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  if (letters.length < 3) return false
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length
  return upper / letters.length >= ALL_CAPS_SHARE
}

function headingLevel(line: Line, bodySize: number): 1 | 2 | 3 | null {
  const ratio = line.size / bodySize
  if (ratio < HEADING_RATIO) return null
  return ratio >= HEADING_LEVEL_1_RATIO ? 1 : ratio >= HEADING_LEVEL_2_RATIO ? 2 : 3
}

interface Draft {
  kind: PdfBlock['kind']
  level?: 1 | 2 | 3
  lines: Line[]
  region?: PdfBlock['region']
}

/** Juntar `previous` com a próxima linha de OUTRA coluna/página é continuação do mesmo parágrafo? */
function continuesAcross(previous: Line, previousText: string, next: Line, nextMetrics: PageMetrics, previousMetrics: PageMetrics): boolean {
  if (HYPHEN_END.test(previousText)) return true
  if (next.x0 - nextMetrics.leftMargin >= INDENT_MIN_EM * next.size) return false // recuo = parágrafo novo
  if (/^["'“‘«(]*\p{Ll}/u.test(next.text)) return true
  if (TERMINAL.test(previousText)) return false
  // Sem ponto final e a próxima começa com maiúscula: só continua se a linha anterior foi até a borda.
  return previous.x1 >= previousMetrics.rightEdge - SHORT_LINE_EM * previous.size
}

function startsNewBlockInStream(
  previous: Line,
  line: Line,
  following: Line | undefined,
  metrics: PageMetrics,
  bodySize: number,
): boolean {
  const gap = previous.y - line.y
  const typical = metrics.typicalGap

  // Mudança de tamanho (corpo ↔ título, nota, legenda).
  if (Math.max(previous.size, line.size) / Math.min(previous.size, line.size) > FONT_CHANGE_RATIO) return true

  if (LIST_MARKER.test(line.text)) return true

  if (typical !== null && gap > typical * PARAGRAPH_GAP_FACTOR && gap - typical > PARAGRAPH_GAP_MIN_EM * line.size) return true

  // Recuo de primeira linha: a linha atual recua e a anterior não. Com "hanging indent"
  // (bibliografia) a linha seguinte continua recuada — aí é continuação, não parágrafo novo.
  const indent = INDENT_MIN_EM * line.size
  const indented = line.x0 - metrics.leftMargin >= indent
  const previousIndented = previous.x0 - metrics.leftMargin >= indent

  // Fonte dominante diferente E recuo diferente: citação recuada em itálico ↔ corpo. Só a fonte não
  // basta — a última linha de um parágrafo pode ser um título de obra em itálico.
  if (
    previous.font !== line.font &&
    previous.fontShare >= FONT_DOMINANT_SHARE &&
    line.fontShare >= FONT_DOMINANT_SHARE &&
    indented !== previousIndented
  ) return true
  if (indented && !previousIndented) {
    const hanging = following && following.stream === line.stream && following.x0 - metrics.leftMargin >= indent
    if (!hanging) return true
  }

  // Linha anterior curta = fim de parágrafo. Em texto justificado toda linha interna vai até a borda.
  // Exceção: bloco inteiro recuado (citação), cuja borda direita também é menor que a da coluna.
  // Numa citação a borda direita é simétrica ao recuo; uma fala curta com recuo de primeira linha
  // ("— Sim, senhor.") fica muito mais curta que isso e é parágrafo de uma linha só.
  const quoteMargin = previous.x0 - metrics.leftMargin
  const sameIndentBlock =
    previousIndented &&
    Math.abs(line.x0 - previous.x0) < 0.3 * line.size &&
    metrics.rightEdge - previous.x1 <= 2 * quoteMargin + 0.5 * line.size
  // Guarda: linha curta SEM ponto final seguida de minúscula é frase interrompida (imagem/flutuante
  // no meio do texto, tabulação), não fim de parágrafo.
  const midSentence = !TERMINAL.test(previous.text) && /^["'“‘«(]*\p{Ll}/u.test(line.text)
  if (!midSentence && !sameIndentBlock && metrics.justified && previous.x1 < metrics.rightEdge - SHORT_LINE_EM * previous.size) return true
  if (!midSentence && !metrics.justified && TERMINAL.test(previous.text)) {
    const width = metrics.rightEdge - metrics.leftMargin
    if (width > 0 && metrics.rightEdge - previous.x1 > width * RAGGED_SHORT_RATIO) return true
  }

  return typical === null && bodySize > 0 && gap > bodySize * 2.2 // sem referência de espaçamento: só gaps enormes
}

function buildDrafts(linesByPage: Line[][], bodyOf: (line: Line) => number, metricsByPage: Map<string, PageMetrics>): Draft[] {
  const sequence = linesByPage.flat()
  const metricsOf = (line: Line) => metricsByPage.get(`${line.pageIndex}:${line.stream}`) ?? metricsByPage.get(`${line.pageIndex}:F`)!
  const drafts: Draft[] = []
  let current: Draft | null = null
  // Último parágrafo de corpo. Notas de rodapé (fonte menor) ficam no fim da página, entre o fim do
  // parágrafo e a página seguinte: a continuação precisa ser comparada com o corpo, não com a nota.
  let lastBody: Draft | null = null
  const isBodySize = (line: Line) => Math.abs(line.size - bodyOf(line)) <= bodyOf(line) * 0.1
  const text = (draft: Draft) => joinLines(draft.lines.map((l) => l.text))

  // Título "de forma" (ver SHAPE_HEADING_*): decidido antes do laço porque olha a linha de cima e a de baixo.
  const gapBetween = (a: Line | undefined, b: Line | undefined) =>
    a && b && a.pageIndex === b.pageIndex && a.stream === b.stream ? a.y - b.y : Infinity
  const shapeHeading = sequence.map((line, i) => {
    if (line.text.length > SHAPE_HEADING_MAX_CHARS || /[.,;:!?…]["'”’»)\]]*$/.test(line.text)) return false
    if (LIST_MARKER.test(line.text)) return false
    if (isAllCaps(line.text)) return true
    const typical = metricsOf(line).typicalGap
    if (typical === null) return false
    const isolated = (gap: number) => gap > typical * SHAPE_HEADING_ISOLATION
    return isolated(gapBetween(sequence[i - 1], line)) && isolated(gapBetween(line, sequence[i + 1]))
  })

  for (let i = 0; i < sequence.length; i++) {
    const line = sequence[i]
    const level = headingLevel(line, bodyOf(line)) ?? (shapeHeading[i] ? 3 : null)
    const previous = current?.lines[current.lines.length - 1]

    // Tabela: ≥3 linhas seguidas com "células" viram uma figura.
    if (line.isTable) {
      let end = i
      while (end + 1 < sequence.length && sequence[end + 1].isTable && sequence[end + 1].pageIndex === line.pageIndex) end++
      if (end - i + 1 >= TABLE_MIN_LINES) {
        const tableLines = sequence.slice(i, end + 1)
        drafts.push({
          kind: 'figure',
          lines: tableLines,
          region: { pageIndex: line.pageIndex, yTop: tableLines[0].y + tableLines[0].size, yBottom: tableLines[tableLines.length - 1].y - tableLines[tableLines.length - 1].size * 0.3 },
        })
        current = null
        i = end
        continue
      }
    }

    if (!current || !previous) {
      current = { kind: level ? 'heading' : 'paragraph', level: level ?? undefined, lines: [line] }
      drafts.push(current)
      continue
    }

    const sameFlow = previous.pageIndex === line.pageIndex && previous.stream === line.stream
    let breaks: boolean

    if (sameFlow) {
      const metrics = metricsOf(line)
      const gap = previous.y - line.y

      // Vazio grande no meio do fluxo = figura/ilustração sem texto.
      if (metrics.typicalGap !== null && gap > metrics.typicalGap * FIGURE_GAP_LINES && !level && !current.level) {
        drafts.push({
          kind: 'figure',
          lines: [],
          region: { pageIndex: line.pageIndex, yTop: previous.y - previous.size * 0.3, yBottom: line.y + line.size },
        })
        breaks = true
      } else if (current.kind === 'heading' || level) {
        // Título só continua em título do mesmo nível e logo abaixo (título quebrado em 2 linhas).
        breaks = !(current.kind === 'heading' && level === current.level && gap <= HEADING_JOIN_GAP_EM * line.size * 1.3)
      } else {
        breaks = startsNewBlockInStream(previous, line, sequence[i + 1], metrics, bodyOf(line))
      }
    } else if (level) {
      breaks = true
    } else {
      const anchor: Draft = lastBody && isBodySize(line) && current !== lastBody ? lastBody : current
      const anchorLast = anchor.lines[anchor.lines.length - 1]
      breaks = anchor.kind === 'heading' || !continuesAcross(anchorLast, text(anchor), line, metricsOf(line), metricsOf(anchorLast))
      if (!breaks) current = anchor
    }

    if (breaks) {
      current = { kind: level ? 'heading' : 'paragraph', level: level ?? undefined, lines: [line] }
      drafts.push(current)
    } else {
      current.lines.push(line)
    }
    if (current.kind === 'paragraph' && isBodySize(current.lines[0])) lastBody = current
  }
  return drafts
}

// ---------------------------------------------------------------------------
// 5. Texto final e ranges
// ---------------------------------------------------------------------------

// Pronomes clíticos que se ligam com hífen ("sentia-me", "diz-se", "dá-lo"): se a próxima linha começa
// com um deles, o hífen é da palavra e não de quebra de linha. Só entram formas de 1–3 letras que
// tipógrafos quase nunca deixam sozinhas numa linha como resto de palavra; "vos", "nos", "los", "lhes"
// ficaram de fora porque terminam palavras comuns ("arqui-vos", "deta-lhes").
const ENCLITIC_START = /^(?:me|te|se|lhe|o|a|os|as|lo|la)(?![\p{L}])/u

/** Junta linhas já lidas: dehifeniza "pala-" + "vra" e põe espaço nas demais quebras. */
function joinLines(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (!out) {
      out = line
    } else if (HYPHEN_END.test(out) && /\p{L}[-‐‑­]$/u.test(out)) {
      // Letra + hífen no fim da linha. Minúscula depois = hífen de quebra (some); maiúscula/dígito
      // = composto de verdade ("anglo-" + "Saxon"): fica o hífen, sem espaço.
      out = /^\p{Ll}/u.test(line) && !ENCLITIC_START.test(line) ? out.slice(0, -1) + line : out + line
    } else {
      out += ` ${line}`
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

function toRanges(lines: Line[], pageStarts: Map<number, { starts: number[]; items: readonly PdfTextItemInput[] }>): PdfBlockRange[] {
  const byPage = new Map<number, number[]>()
  for (const line of lines) {
    const list = byPage.get(line.pageIndex) ?? []
    for (const glyph of line.glyphs) list.push(glyph.index, ...glyph.duplicates)
    byPage.set(line.pageIndex, list)
  }

  const ranges: PdfBlockRange[] = []
  for (const [pageIndex, indexes] of [...byPage.entries()].sort((p, q) => p[0] - q[0])) {
    const page = pageStarts.get(pageIndex)!
    const sorted = [...new Set(indexes)].sort((p, q) => p - q)
    // Itens consecutivos formam um intervalo contíguo no texto bruto; um "buraco" (item removido
    // como cabeçalho, ou coluna vizinha) abre outro intervalo.
    let runStart = sorted[0]
    let runEnd = sorted[0]
    const close = () => {
      ranges.push({ pageIndex, start: page.starts[runStart], end: page.starts[runEnd] + page.items[runEnd].str.length })
    }
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k] === runEnd + 1) {
        runEnd = sorted[k]
      } else {
        close()
        runStart = sorted[k]
        runEnd = sorted[k]
      }
    }
    close()
  }
  return ranges
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function reconstructPdfParagraphs(pages: readonly PdfPageInput[], options: ReconstructOptions = {}): PdfBlock[] {
  if (pages.length === 0) return []

  const rawByPage = new Map(
    pages.map((page) => [page.pageIndex, { starts: buildRawPage(page.items).itemStarts, items: page.items }]),
  )

  // Rio de coluna "típico" do documento (mediana dos detectados), usado nas páginas com pouco texto.
  const detected = pages.map((page) => findGutter(toGlyphs(page.items))).filter((g): g is Gutter => g !== null)
  const neighbourGutter = detected.length
    ? { a: median(detected.map((g) => g.a)), b: median(detected.map((g) => g.b)) }
    : null
  const rawLines = pages.map((page) => orderedLines(page, neighbourGutter))
  const bodySize = bodySizeOf(rawLines.flat())
  const linesByPage = removeRepeatedEdges(pages, rawLines, bodySize)
  const allLines = linesByPage.flat()
  if (allLines.length === 0) return []

  // Tamanho de corpo por página: livros misturam páginas de 9pt e de 7pt (quadros, apêndices). Página
  // com pouco texto não tem amostra e usa o tamanho do documento.
  const bodyByPage = new Map<number, number>()
  linesByPage.forEach((lines, i) => {
    const chars = lines.reduce((n, line) => n + line.text.length, 0)
    bodyByPage.set(pages[i].pageIndex, chars >= PAGE_BODY_MIN_CHARS ? bodySizeOf(lines) : bodySize)
  })
  const bodyOf = (line: Line) => bodyByPage.get(line.pageIndex) ?? bodySize

  // Métricas por página e fluxo (coluna), com a página inteira como reserva para fluxos curtos.
  const metricsByPage = new Map<string, PageMetrics>()
  linesByPage.forEach((lines, i) => {
    const pageIndex = pages[i].pageIndex
    for (const stream of ['F', 'L', 'R'] as const) {
      const ofStream = lines.filter((l) => l.stream === stream)
      if (ofStream.length > 0) metricsByPage.set(`${pageIndex}:${stream}`, metricsFor(ofStream, bodyOf(ofStream[0])))
    }
  })

  const blocks: PdfBlock[] = []
  for (const draft of buildDrafts(linesByPage, bodyOf, metricsByPage)) {
    const first = draft.lines[0]
    const pageIndex = draft.region?.pageIndex ?? first?.pageIndex
    if (pageIndex === undefined) continue

    if (draft.kind === 'figure') {
      blocks.push({ kind: 'figure', text: '', pageIndex, ranges: toRanges(draft.lines, rawByPage), region: draft.region })
      continue
    }
    const text = joinLines(draft.lines.map((l) => l.text))
    if (!text) continue
    blocks.push({
      kind: draft.kind,
      text,
      pageIndex,
      ranges: toRanges(draft.lines, rawByPage),
      ...(draft.level ? { level: draft.level } : {}),
    })
  }

  const from = options.ownedFromPage ?? -Infinity
  const to = options.ownedToPage ?? Infinity
  return blocks.filter((block) => block.pageIndex >= from && block.pageIndex <= to)
}
