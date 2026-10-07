// TTS na página fiel (US4). "Parágrafo" do TTS = bloco reconstruído (pdfParagraphs) do trecho ativo, o mesmo
// texto que o modo texto mostra e que a tradução usa — sem quebra de linha física nem hífen de quebra (SC-004).
// O destaque é desenhado nos spans da camada de texto do pdf.js (DOM, nunca canvas — R-030), inclusive quando o
// parágrafo continua na página seguinte.
//
// Funções puras (mapeamento texto do bloco ↔ texto bruto da página) + funções de DOM para o destaque.

import type { PdfBlock } from '@/utils/pdfParagraphs'
import type { PdfPoint } from '@/utils/pdfLocator'
import { findWordNear } from './pdfPageWords'
import { unwrapMarks, wrapItemRange } from './pdfPageTextMarks'

// ── Puras ────────────────────────────────────────────────────────────────────

/** Blocos que o TTS lê: parágrafos e títulos com texto (figuras não têm o que ler). */
export function ttsParagraphBlocks(blocks: readonly PdfBlock[]): PdfBlock[] {
  return blocks.filter((block) => block.kind !== 'figure' && block.text.trim().length > 0)
}

/** Mesmo bloco? Compara pelo início (o cache do extrator pode devolver objetos novos depois de despejar). */
export function sameBlockStart(a: PdfBlock, b: PdfBlock): boolean {
  const ra = a.ranges[0]
  const rb = b.ranges[0]
  return !!ra && !!rb && ra.pageIndex === rb.pageIndex && ra.start === rb.start
}

const comparePoints = (a: PdfPoint, b: PdfPoint) => a.pageIndex - b.pageIndex || a.offset - b.offset

/**
 * Índice do primeiro bloco que ainda não terminou no ponto `top` (topo visível da tela): o parágrafo que o
 * leitor está vendo, mesmo que tenha começado acima da tela. 0 se nenhum.
 */
export function firstBlockEndingAfter(blocks: readonly PdfBlock[], top: PdfPoint): number {
  const index = blocks.findIndex((block) => {
    const last = block.ranges[block.ranges.length - 1]
    return !!last && comparePoints({ pageIndex: last.pageIndex, offset: last.end }, top) > 0
  })
  return index < 0 ? 0 : index
}

/**
 * Inverso de `approximateBlockOffset` (pdfPageWords): posição no texto do bloco → ponto no texto bruto, por
 * proporção sobre os intervalos. Serve de "perto daqui" para achar a palavra exata no texto bruto.
 */
export function blockTextOffsetToRawPoint(block: PdfBlock, textOffset: number): PdfPoint | null {
  const total = block.ranges.reduce((sum, r) => sum + (r.end - r.start), 0)
  if (total === 0 || block.text.length === 0) return null
  let target = Math.round((Math.min(Math.max(0, textOffset), block.text.length) / block.text.length) * total)
  for (const range of block.ranges) {
    const length = range.end - range.start
    // `<` e não `<=`: exatamente no fim de um intervalo = começo do seguinte (a palavra que abre a página
    // seguinte não pode ser procurada no fim da anterior).
    if (target < length) return { pageIndex: range.pageIndex, offset: range.start + target }
    target -= length
  }
  const last = block.ranges[block.ranges.length - 1]
  return { pageIndex: last.pageIndex, offset: last.end }
}

/**
 * Palavra lida pelo TTS (offsets no texto do bloco) → início dela no texto bruto da página, ou null quando não
 * dá para achar com segurança (palavra hifenizada entre linhas, por exemplo): aí fica só o destaque do parágrafo.
 * A busca é restrita aos intervalos do bloco naquela página — não marca a mesma palavra num parágrafo vizinho.
 */
export function rawWordStart(
  block: PdfBlock,
  wordStart: number,
  wordEnd: number,
  raw: string,
): { pageIndex: number; start: number; length: number } | null {
  const word = block.text.slice(wordStart, wordEnd).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!word) return null
  const near = blockTextOffsetToRawPoint(block, wordStart)
  if (!near) return null
  const found = findWordNear(raw, word, near.offset)
  if (found < 0) return null
  const inBlock = block.ranges.some((r) => r.pageIndex === near.pageIndex && found >= r.start && found + word.length <= r.end)
  return inBlock ? { pageIndex: near.pageIndex, start: found, length: word.length } : null
}

/** Índices dos itens da camada de texto que pertencem ao bloco nesta página. */
export function blockItemIndexes(
  block: PdfBlock,
  pageIndex: number,
  itemStarts: readonly number[],
  items: ReadonlyArray<{ str: string }>,
): number[] {
  const ranges = block.ranges.filter((r) => r.pageIndex === pageIndex)
  const indexes: number[] = []
  items.forEach((item, index) => {
    const start = itemStarts[index] ?? 0
    const end = start + item.str.length
    if (item.str.trim() && ranges.some((r) => start < r.end && end > r.start)) indexes.push(index)
  })
  return indexes
}

// ── DOM (documento de uma página) ────────────────────────────────────────────

const STYLE_ID = 'nr-pdf-tts-style'
const PARAGRAPH_CLASS = 'nr-pdf-tts'
const WORD_CLASS = 'nr-pdf-tts-word'

// Mesmas cores do EPUB (.nr-tts-hl / .nr-tts-word em EpubViewer.tsx); o fundo do parágrafo vem do tema
// (palette.ttsHighlight) por variável CSS, atualizada a cada destaque. O texto da camada é transparente sobre a
// imagem da página: só o fundo aparece.
const TTS_CSS = `
.textLayer span.${PARAGRAPH_CLASS} { background: var(--nr-tts-bg, rgba(34, 197, 94, 0.15)); }
.textLayer span[data-nr-item] span.${WORD_CLASS} { background: rgba(250, 204, 21, 0.45); border-radius: 0.15em; }
`

function ensureStyles(doc: Document, background: string): void {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = TTS_CSS
    ;(doc.head ?? doc.documentElement).append(style)
  }
  doc.documentElement.style.setProperty('--nr-tts-bg', background)
}

/** Destaca os spans do parágrafo lido nesta página. */
export function highlightTtsItems(doc: Document, itemIndexes: readonly number[], background: string): void {
  ensureStyles(doc, background)
  for (const index of itemIndexes) {
    doc.querySelector(`.textLayer span[data-nr-item="${index}"]`)?.classList.add(PARAGRAPH_CLASS)
  }
}

/** Remove os destaques de TTS (parágrafo e palavra) da página. */
export function clearTtsHighlight(doc: Document): void {
  doc.querySelectorAll(`.${PARAGRAPH_CLASS}`).forEach((el) => el.classList.remove(PARAGRAPH_CLASS))
  unwrapMarks(doc, `span.${WORD_CLASS}`)
}

/** Karaokê: envolve os caracteres [start, end) do item numa marca (ver wrapItemRange). */
export function markTtsWord(doc: Document, itemIndex: number, start: number, end: number): void {
  wrapItemRange(doc, itemIndex, start, end, () => {
    const mark = doc.createElement('span')
    mark.className = WORD_CLASS
    return mark
  })
}
