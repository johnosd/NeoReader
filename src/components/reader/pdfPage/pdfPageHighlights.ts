// Highlights na página fiel (US5). O highlight de PDF é gravado como intervalo `neopdf:` no texto bruto das páginas
// (DI-005/DI-006) — o mesmo que o modo texto grava —, então vale nos dois modos.
//
// Pintura: envolve só os caracteres do intervalo dentro dos itens da camada de texto (wrapItemRange), com fundo,
// sublinhado ou risco ondulado. O texto da camada é transparente sobre a imagem da página; fundo e linhas de
// text-decoration têm cor própria e aparecem por cima. Um intervalo que atravessa páginas é pintado em cada uma.
//
// Menus (seleção e highlight existente) ficam DENTRO do documento da página, como o painel de tradução e pelo
// mesmo motivo: overlays React sobre o iframe não recebem toque no Android. Os botões funcionam porque os
// listeners vêm do documento pai (mesma origem; o iframe não roda scripts).

import type { TranslateFn } from '@/i18n'
import type { HighlightStyle } from '@/types/highlight'
import { annotationColorHex } from '@/utils/annotationColors'
import type { PdfRange } from '@/utils/pdfLocator'
import { escapeHtml } from '@/utils/readerUtils'
import { unwrapMarks, wrapItemRange } from './pdfPageTextMarks'
import { applyVisualScale } from './pdfPageTranslation'

// ── Puras ────────────────────────────────────────────────────────────────────

/** Trecho [start, end) do intervalo que cai nesta página, ou null se a página está fora dele. */
export function rangeOnPage(range: PdfRange, pageIndex: number, rawLength: number): { start: number; end: number } | null {
  if (pageIndex < range.start.pageIndex || pageIndex > range.end.pageIndex) return null
  const start = pageIndex === range.start.pageIndex ? range.start.offset : 0
  const end = pageIndex === range.end.pageIndex ? range.end.offset : rawLength
  return end > start ? { start, end } : null
}

/** Pedaços de cada item da camada de texto cobertos por [start, end) do texto bruto da página. */
export function itemSlices(
  start: number,
  end: number,
  itemStarts: readonly number[],
  items: ReadonlyArray<{ str: string }>,
): Array<{ itemIndex: number; from: number; to: number }> {
  const slices: Array<{ itemIndex: number; from: number; to: number }> = []
  items.forEach((item, itemIndex) => {
    const itemStart = itemStarts[itemIndex] ?? 0
    const from = Math.max(start, itemStart) - itemStart
    const to = Math.min(end, itemStart + item.str.length) - itemStart
    if (to > from && item.str.slice(from, to).trim()) slices.push({ itemIndex, from, to })
  })
  return slices
}

/**
 * Ponta da seleção (nó + offset do DOM) → offset no texto bruto da página. Dentro de um item, conta os caracteres
 * desde o início dele (o item pode ter spans de Word Lens dentro). Fora de qualquer item (o navegador põe a ponta
 * entre spans ou no fim da camada): o início vai para o próximo item, o fim para o fim do item anterior.
 */
export function selectionBoundaryToRaw(
  doc: Document,
  node: Node,
  offset: number,
  side: 'start' | 'end',
  itemStarts: readonly number[],
  items: ReadonlyArray<{ str: string }>,
): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const span = element?.closest<HTMLElement>('.textLayer span[data-nr-item]') ?? null
  if (span) {
    const itemIndex = Number(span.dataset.nrItem)
    const before = doc.createRange()
    before.selectNodeContents(span)
    before.setEnd(node, offset)
    const chars = Math.min(before.toString().length, items[itemIndex]?.str.length ?? 0)
    return (itemStarts[itemIndex] ?? 0) + chars
  }

  const spans = [...doc.querySelectorAll<HTMLElement>('.textLayer span[data-nr-item]')]
  const boundary = doc.createRange()
  boundary.setStart(node, offset)
  if (side === 'start') {
    const next = spans.find((s) => boundary.comparePoint(s, 0) >= 0)
    return next ? (itemStarts[Number(next.dataset.nrItem)] ?? 0) : null
  }
  const previous = [...spans].reverse().find((s) => boundary.comparePoint(s, s.childNodes.length) <= 0)
  if (!previous) return null
  const itemIndex = Number(previous.dataset.nrItem)
  return (itemStarts[itemIndex] ?? 0) + (items[itemIndex]?.str.length ?? 0)
}

// ── Pintura ──────────────────────────────────────────────────────────────────

const MARK_CLASS = 'nr-pdf-hl'
const NOTE_CLASS = 'nr-pdf-hl-note'
const MENU_CLASS = 'nr-pdf-menu'
const STYLE_ID = 'nr-pdf-highlight-style'

export interface PdfPageHighlightPaint {
  id: number
  color: string
  style: HighlightStyle
  hasNote: boolean
  slices: Array<{ itemIndex: number; from: number; to: number }>
}

// Mesma escala visual do painel de tradução (--nr-dpr). Pseudo-elemento da nota em position:absolute: conteúdo
// em fluxo esticaria o item (que o pdf.js ajusta à largura do texto com scaleX) e desalinharia a linha.
const HIGHLIGHT_CSS = `
.textLayer span[data-nr-item] span.${MARK_CLASS} { position: static; cursor: pointer; border-radius: 0.12em; }
.textLayer span[data-nr-item] span.${NOTE_CLASS} { position: relative; }
.textLayer span[data-nr-item] span.${NOTE_CLASS}::before {
  content: ''; position: absolute; left: -0.25em; top: -0.3em; width: 0.42em; height: 0.42em; border-radius: 50%;
  background: var(--nr-hl-note-color, #6366f1); box-shadow: 0 0 0 0.08em rgba(0,0,0,0.35);
}
.textLayer > .${MENU_CLASS} {
  position: absolute; z-index: 7; transform: none; box-sizing: border-box; white-space: normal;
  display: flex; flex-wrap: wrap; align-items: center; gap: calc(4px * var(--nr-dpr));
  max-width: 92%; padding: calc(6px * var(--nr-dpr)); border-radius: calc(12px * var(--nr-dpr));
  background: #1e2230; color: #f1f5f9; border: calc(1px * var(--nr-dpr)) solid rgba(255,255,255,0.12);
  font-family: system-ui, sans-serif; font-size: calc(14px * var(--nr-dpr)); line-height: 1.35;
  box-shadow: 0 calc(6px * var(--nr-dpr)) calc(20px * var(--nr-dpr)) rgba(0,0,0,0.35); cursor: auto;
}
.textLayer .${MENU_CLASS} span, .textLayer .${MENU_CLASS} p { position: static; color: inherit; white-space: normal; transform: none; }
.textLayer .${MENU_CLASS} .nr-pdf-menu-note { flex-basis: 100%; margin: 0 0 calc(4px * var(--nr-dpr)); max-height: 8em; overflow-y: auto; opacity: 0.9; }
.textLayer .${MENU_CLASS} button { appearance: none; font: inherit; color: inherit; cursor: pointer; background: transparent;
  padding: calc(6px * var(--nr-dpr)) calc(10px * var(--nr-dpr)); border-radius: calc(8px * var(--nr-dpr));
  border: calc(1px * var(--nr-dpr)) solid rgba(255,255,255,0.18); }
.textLayer .${MENU_CLASS} button[data-primary="1"] { background: #6366f1; border-color: #6366f1; color: #fff; }
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = HIGHLIGHT_CSS
  ;(doc.head ?? doc.documentElement).append(style)
  if (!doc.documentElement.style.getPropertyValue('--nr-dpr')) {
    doc.documentElement.style.setProperty('--nr-dpr', String(doc.defaultView?.devicePixelRatio || 1))
  }
}

// Cor da paleta com transparência para o fundo (o texto da página tem de continuar legível por baixo).
function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function applyStyle(mark: HTMLElement, color: string, style: HighlightStyle): void {
  const hex = annotationColorHex(color)
  if (style === 'background') {
    mark.style.backgroundColor = withAlpha(hex, 0.35)
    return
  }
  // Linha com cor própria: aparece mesmo com o texto transparente da camada.
  mark.style.textDecorationLine = 'underline'
  mark.style.textDecorationColor = hex
  mark.style.textDecorationStyle = style === 'squiggly' ? 'wavy' : 'solid'
  mark.style.textDecorationThickness = '0.12em'
  mark.style.textUnderlineOffset = '0.12em'
}

/** Repinta os highlights desta página (apaga os anteriores). */
export function paintPageHighlights(doc: Document, highlights: readonly PdfPageHighlightPaint[]): void {
  ensureStyles(doc)
  unwrapMarks(doc, `span.${MARK_CLASS}`)
  for (const highlight of highlights) {
    let first = true
    for (const slice of highlight.slices) {
      const marks = wrapItemRange(doc, slice.itemIndex, slice.from, slice.to, () => {
        const mark = doc.createElement('span')
        mark.className = MARK_CLASS
        mark.dataset.nrHighlightId = String(highlight.id)
        applyStyle(mark, highlight.color, highlight.style)
        return mark
      })
      // Indicador de nota no começo do trecho (o primeiro pedaço desta página).
      if (first && highlight.hasNote && marks[0]) {
        marks[0].classList.add(NOTE_CLASS)
        marks[0].style.setProperty('--nr-hl-note-color', annotationColorHex(highlight.color))
      }
      if (marks.length > 0) first = false
    }
  }
}

/** Id do highlight sob o elemento tocado, ou null. */
export function highlightIdAt(target: Element | null): number | null {
  const mark = target?.closest?.(`span.${MARK_CLASS}`) as HTMLElement | null | undefined
  const id = mark ? Number(mark.dataset.nrHighlightId) : NaN
  return Number.isFinite(id) ? id : null
}

// ── Menus ────────────────────────────────────────────────────────────────────

export type PdfMenuActionId = 'copy' | 'share' | 'translate' | 'highlight' | 'edit' | 'remove'

export interface PdfMenuAction {
  id: PdfMenuActionId
  label: string
  primary?: boolean
}

export interface PdfMenu {
  kind: 'selection' | 'highlight'
  // Faixa vertical do trecho em % da página: o menu abre acima dele (ou abaixo, no topo da página).
  anchor: { topPct: number; bottomPct: number; leftPct: number }
  note?: string
  actions: PdfMenuAction[]
}

export function hidePdfMenus(doc: Document): void {
  doc.querySelectorAll(`.${MENU_CLASS}`).forEach((el) => el.remove())
}

export function openPdfMenu(doc: Document): PdfMenu['kind'] | null {
  return (doc.querySelector<HTMLElement>(`.${MENU_CLASS}`)?.dataset.kind as PdfMenu['kind'] | undefined) ?? null
}

/**
 * Desenha o menu (substitui o anterior). Os toques nos botões são tratados por quem chama, pelo atributo
 * `data-nr-pdf-menu-action` (o listener de clique da página já existe e tem de decidir antes de traduzir).
 */
export function renderPdfMenu(doc: Document, menu: PdfMenu, t: TranslateFn): HTMLElement | null {
  const layer = doc.querySelector<HTMLElement>('.textLayer')
  if (!layer) return null
  ensureStyles(doc)
  hidePdfMenus(doc)
  const el = doc.createElement('div')
  el.className = MENU_CLASS
  el.dataset.kind = menu.kind
  // data-nr-ui: o Word Lens não marca palavras dentro da interface.
  el.setAttribute('data-nr-ui', '1')
  el.setAttribute('role', 'menu')
  if (menu.anchor.topPct < 12) el.style.top = `${menu.anchor.bottomPct + 1}%`
  else el.style.bottom = `${100 - menu.anchor.topPct + 1}%`
  el.style.left = `${Math.min(Math.max(2, menu.anchor.leftPct), 60)}%`
  const note = menu.note ? `<p class="nr-pdf-menu-note" aria-label="${escapeHtml(t('reader.highlightMenu.noteIndicatorLabel'))}">${escapeHtml(menu.note)}</p>` : ''
  el.innerHTML = note + menu.actions
    .map((a) => `<button type="button" data-nr-pdf-menu-action="${a.id}"${a.primary ? ' data-primary="1"' : ''}>${escapeHtml(a.label)}</button>`)
    .join('')
  layer.append(el)
  applyVisualScale(doc, el)
  return el
}

/** Ação do menu sob o elemento tocado, ou null. */
export function menuActionAt(target: Element | null): PdfMenuActionId | null {
  const button = target?.closest?.('[data-nr-pdf-menu-action]') as HTMLElement | null | undefined
  return (button?.dataset.nrPdfMenuAction as PdfMenuActionId | undefined) ?? null
}
