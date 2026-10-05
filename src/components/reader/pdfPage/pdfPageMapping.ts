// Mapeamentos puros usados pelo PdfPageViewer: toque/seleção na página → posição no texto bruto →
// parágrafo reconstruído; página → rótulo do sumário; página → progresso. Sem DOM, testável isoladamente.

import type { PdfTocItem } from '@/services/pdf/PdfBookFactory'
import type { PdfBlock } from '@/utils/pdfParagraphs'
import { formatPdfPoint, type PdfPoint } from '@/utils/pdfLocator'

/**
 * Offset (texto bruto da página) onde começa o item `itemIndex` — o item é o `<span data-nr-item>` tocado.
 * `itemStarts` vem de PdfExtractedPage.itemStarts (pdfLocator.buildRawPage).
 */
export function offsetOfItem(itemStarts: readonly number[], itemIndex: number): number {
  return itemStarts[itemIndex] ?? 0
}

/**
 * Índice do item que contém `offset`. Se o offset cai numa quebra de linha ("\n" depois de um item com
 * hasEOL) ou num item vazio, devolve o próximo item com texto; depois do último, devolve o último.
 * -1 se a página não tem nenhum item com texto.
 */
export function itemIndexAtOffset(
  itemStarts: readonly number[],
  items: ReadonlyArray<{ str: string }>,
  offset: number,
): number {
  // Último item que começa em ≤ offset (busca binária: página grande tem milhares de itens).
  let low = 0
  let high = itemStarts.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (itemStarts[mid] <= offset) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found === -1) found = 0

  // Anda até um item com texto cujo intervalo contém o offset, ou o próximo item com texto.
  for (let i = found; i < items.length; i++) {
    if (items[i].str.length === 0) continue
    if (offset < itemStarts[i] + items[i].str.length || itemStarts[i] >= offset) return i
  }
  for (let i = Math.min(found, items.length - 1); i >= 0; i--) {
    if (items[i].str.length > 0) return i
  }
  return -1
}

/** Bloco (parágrafo/título) cujo texto bruto contém o ponto, ou null (ex.: cabeçalho removido da reconstrução). */
export function findBlockAtPoint(blocks: readonly PdfBlock[], point: PdfPoint): PdfBlock | null {
  return (
    blocks.find(
      (block) =>
        block.kind !== 'figure' &&
        block.ranges.some((range) => range.pageIndex === point.pageIndex && point.offset >= range.start && point.offset < range.end),
    ) ?? null
  )
}

/** Primeiro ponto do bloco (início do primeiro intervalo) — o "endereço" do parágrafo para marcador/highlight. */
export function blockStartPoint(block: PdfBlock): PdfPoint | null {
  const first = block.ranges[0]
  return first ? { pageIndex: first.pageIndex, offset: first.start } : null
}

/**
 * Último item do sumário que começa em página ≤ `pageIndex` (percorre os subitens também), com o href já como
 * localizador de página — o mesmo href que o viewer entrega ao sumário (`goTo(href)`) e que o ReaderScreen
 * compara para marcar o capítulo atual.
 */
export function tocItemForPage(
  toc: readonly PdfTocItem[] | null | undefined,
  pageIndex: number,
): { label: string; href: string } | undefined {
  let best: { label: string; index: number } | undefined
  const visit = (items: readonly PdfTocItem[]) => {
    for (const item of items) {
      if (item.index !== undefined && item.index <= pageIndex && (!best || item.index >= best.index)) {
        best = { label: item.label, index: item.index }
      }
      if (item.subitems) visit(item.subitems)
    }
  }
  visit(toc ?? [])
  return best ? { label: best.label, href: formatPdfPoint({ pageIndex: best.index, offset: 0 }) } : undefined
}

/** Rótulo do capítulo atual (ver tocItemForPage). */
export function tocLabelForPage(toc: readonly PdfTocItem[] | null | undefined, pageIndex: number): string | undefined {
  return tocItemForPage(toc, pageIndex)?.label
}

/**
 * Progresso 0–100: (página + fração percorrida da página) / total de páginas. `fractionInPage` é 0–1 e é
 * limitado a esse intervalo (a rolagem pode passar um pouco do fim da página por causa da margem entre páginas).
 */
export function progressPercentage(pageIndex: number, fractionInPage: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  const fraction = Math.min(1, Math.max(0, Number.isFinite(fractionInPage) ? fractionInPage : 0))
  return Math.min(100, Math.max(0, ((pageIndex + fraction) / pageCount) * 100))
}

/** Página (0-based) correspondente a uma fração 0–1 do livro. */
export function pageForFraction(fraction: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(pageCount - 1, Math.max(0, Math.floor(fraction * pageCount)))
}
