// DOM de overlay desenhado DENTRO do documento (iframe) de cada página PDF: marcadores na margem (o painel
// de tradução/Word Lens fica em pdfPageTranslation.ts). Overlays React sobre o iframe não recebem toque de forma confiável no Android WebView, então
// — como no EpubViewer — tudo que o usuário toca vive no próprio documento da página.
//
// Os elementos entram como filhos de `.textLayer`: ele tem o tamanho exato da página, então posições em %
// acompanham o zoom sem recalcular. O pdf.js limpa a camada de texto a cada render (zoom); quem usa este
// módulo redesenha ao receber o evento PDF_PAGE_RENDERED_EVENT (reexportado daqui).

export { PDF_PAGE_RENDERED_EVENT } from '@/services/pdf/pdfPageRender'

const MARKER_CLASS = 'nr-pdf-bookmark-marker'

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
