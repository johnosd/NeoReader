// DOM de overlay desenhado DENTRO do documento (iframe) de cada página PDF: balão de ações e marcadores
// na margem. Overlays React sobre o iframe não recebem toque de forma confiável no Android WebView, então
// — como no EpubViewer — tudo que o usuário toca vive no próprio documento da página.
//
// Os elementos entram como filhos de `.textLayer`: ele tem o tamanho exato da página, então posições em %
// acompanham o zoom sem recalcular. O pdf.js limpa a camada de texto a cada render (zoom); quem usa este
// módulo redesenha ao receber o evento PDF_PAGE_RENDERED_EVENT (reexportado daqui).

export { PDF_PAGE_RENDERED_EVENT } from '@/services/pdf/pdfPageRender'

const BUBBLE_CLASS = 'nr-pdf-bubble'
const MARKER_CLASS = 'nr-pdf-bookmark-marker'

export interface PdfOverlayPalette {
  background: string
  text: string
  isDark: boolean
}

export interface BubbleAction {
  label: string
  onSelect: () => void
}

export interface BookmarkMarker {
  id: number
  topPct: number // % da altura da página
  color?: string
}

// O documento da página é renderizado em dpr× e reduzido por transform: 1/dpr (ver renderPdfPage). Um
// tamanho "visual" de N px precisa de N×dpr px de layout, senão o overlay sai pequeno em telas densas.
function layoutPx(doc: Document, visualPx: number): number {
  const dpr = doc.defaultView?.devicePixelRatio || 1
  return Math.round(visualPx * dpr * 100) / 100
}

function textLayerOf(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.textLayer')
}

export function hideBubble(doc: Document): void {
  doc.querySelectorAll(`.${BUBBLE_CLASS}`).forEach((el) => el.remove())
}

export function hasBubble(doc: Document): boolean {
  return doc.querySelector(`.${BUBBLE_CLASS}`) !== null
}

/**
 * Balão com ações perto do ponto tocado. `xPct`/`yPct` são relativos à página (0–100). Substitui o balão
 * anterior; a ação escolhida fecha o balão.
 */
export function showBubble(
  doc: Document,
  options: { xPct: number; yPct: number; actions: BubbleAction[]; palette: PdfOverlayPalette },
): void {
  const layer = textLayerOf(doc)
  if (!layer) return
  hideBubble(doc)

  const { palette } = options
  const bubble = doc.createElement('div')
  bubble.className = BUBBLE_CLASS
  bubble.setAttribute('role', 'toolbar')

  // Fica centrado no toque, mas dentro da página: ancora à esquerda/direita perto das bordas.
  const x = Math.min(88, Math.max(12, options.xPct))
  Object.assign(bubble.style, {
    position: 'absolute',
    left: `${x}%`,
    top: `${Math.max(2, options.yPct)}%`,
    transform: `translate(-50%, ${layoutPx(doc, -46)}px)`,
    zIndex: '5',
    display: 'flex',
    gap: `${layoutPx(doc, 6)}px`,
    padding: `${layoutPx(doc, 6)}px`,
    borderRadius: `${layoutPx(doc, 12)}px`,
    background: palette.isDark ? '#1e2230' : '#ffffff',
    color: palette.isDark ? '#f1f5f9' : '#0f172a',
    boxShadow: `0 ${layoutPx(doc, 4)}px ${layoutPx(doc, 14)}px rgba(0,0,0,0.35)`,
    border: `${layoutPx(doc, 1)}px solid ${palette.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
    fontFamily: 'system-ui, sans-serif',
    fontSize: `${layoutPx(doc, 14)}px`,
    lineHeight: '1.2',
    // Os spans do text layer ficam "color: transparent"; o balão precisa de cor própria e de eventos.
    cursor: 'pointer',
    userSelect: 'none',
  })

  for (const action of options.actions) {
    const button = doc.createElement('button')
    button.type = 'button'
    button.textContent = action.label
    Object.assign(button.style, {
      appearance: 'none',
      border: '0',
      background: 'transparent',
      color: 'inherit',
      font: 'inherit',
      padding: `${layoutPx(doc, 8)}px ${layoutPx(doc, 12)}px`,
      borderRadius: `${layoutPx(doc, 8)}px`,
      whiteSpace: 'nowrap',
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      hideBubble(doc)
      action.onSelect()
    })
    bubble.append(button)
  }
  // Tocar no balão não pode contar como "toque fora do texto" (que alterna o chrome).
  bubble.addEventListener('click', (event) => event.stopPropagation())
  layer.append(bubble)
}

const MARKER_COLORS: Record<string, string> = {
  indigo: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
}

/** Redesenha todos os marcadores da página (fita na margem esquerda, na altura do parágrafo marcado). */
export function renderBookmarkMarkers(
  doc: Document,
  markers: readonly BookmarkMarker[],
  onTap: (bookmarkId: number) => void,
): void {
  const layer = textLayerOf(doc)
  if (!layer) return
  layer.querySelectorAll(`.${MARKER_CLASS}`).forEach((el) => el.remove())

  for (const marker of markers) {
    const el = doc.createElement('button')
    el.type = 'button'
    el.className = MARKER_CLASS
    el.dataset.bookmarkId = String(marker.id)
    el.setAttribute('aria-label', 'bookmark')
    const width = layoutPx(doc, 14)
    const height = layoutPx(doc, 22)
    Object.assign(el.style, {
      position: 'absolute',
      left: `${layoutPx(doc, 4)}px`,
      top: `${marker.topPct}%`,
      width: `${width}px`,
      height: `${height}px`,
      padding: '0',
      border: '0',
      zIndex: '4',
      background: MARKER_COLORS[marker.color ?? 'indigo'] ?? MARKER_COLORS.indigo,
      // Fita com entalhe embaixo.
      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)',
      cursor: 'pointer',
    })
    el.addEventListener('click', (event) => {
      event.stopPropagation()
      onTap(marker.id)
    })
    layer.append(el)
  }
}

export function clearBookmarkMarkers(doc: Document): void {
  doc.querySelectorAll(`.${MARKER_CLASS}`).forEach((el) => el.remove())
}
