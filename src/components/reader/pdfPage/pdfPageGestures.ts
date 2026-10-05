// Pinça (dois dedos) nos documentos das páginas PDF. O iframe da página é do mesmo origin, então o pai
// registra os listeners direto no `contentDocument` (igual ao EpubViewer) — nenhum script no iframe, o
// sandbox continua sem allow-scripts (R-005, research.md §2).

export const PDF_ZOOM_MIN_PCT = 100
export const PDF_ZOOM_MAX_PCT = 400

export interface PinchHandlers {
  /** Chamado no começo da pinça; devolve o zoom atual em % (100 = largura da tela). */
  onStart: () => number
  /** Feedback visual durante o gesto: razão atual (1 = sem mudança) e centro em coordenadas do iframe. */
  onChange: (ratio: number, center: { x: number; y: number }) => void
  /** Soltou os dedos: razão final e centro. Quem recebe aplica o zoom e limpa o feedback. */
  onEnd: (ratio: number, center: { x: number; y: number }) => void
  onCancel?: () => void
}

const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const midpoint = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })

/** Limita o zoom resultante da pinça ao intervalo suportado, em % inteiro. */
export function clampZoomPct(pct: number): number {
  if (!Number.isFinite(pct)) return PDF_ZOOM_MIN_PCT
  return Math.round(Math.min(PDF_ZOOM_MAX_PCT, Math.max(PDF_ZOOM_MIN_PCT, pct)))
}

/**
 * Registra a pinça em `doc`. Devolve a função que remove os listeners. Um dedo continua rolando de forma
 * nativa; só quando há dois dedos o gesto é capturado (preventDefault) para o navegador não dar zoom na UI.
 */
export function attachPinchZoom(doc: Document, handlers: PinchHandlers): () => void {
  let startDistance = 0
  let lastRatio = 1
  let lastCenter = { x: 0, y: 0 }
  let active = false

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) return
    active = true
    startDistance = distance(event.touches[0], event.touches[1])
    lastRatio = 1
    lastCenter = midpoint(event.touches[0], event.touches[1])
    handlers.onStart()
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!active || event.touches.length !== 2 || startDistance === 0) return
    event.preventDefault()
    lastRatio = distance(event.touches[0], event.touches[1]) / startDistance
    lastCenter = midpoint(event.touches[0], event.touches[1])
    handlers.onChange(lastRatio, lastCenter)
  }

  const finish = (cancelled: boolean) => {
    if (!active) return
    active = false
    if (cancelled) handlers.onCancel?.()
    else handlers.onEnd(lastRatio, lastCenter)
    startDistance = 0
  }
  // Ao levantar um dos dois dedos o gesto termina (o dedo que sobrou não vira "arrasto" até soltar de novo).
  const onTouchEnd = (event: TouchEvent) => {
    if (active && event.touches.length < 2) finish(false)
  }
  const onTouchCancel = () => finish(true)

  // passive:false em touchmove: sem isso preventDefault é ignorado e o navegador faz o próprio zoom.
  doc.addEventListener('touchstart', onTouchStart, { passive: true })
  doc.addEventListener('touchmove', onTouchMove, { passive: false })
  doc.addEventListener('touchend', onTouchEnd, { passive: true })
  doc.addEventListener('touchcancel', onTouchCancel, { passive: true })
  // Desliga o zoom nativo da página mantendo a rolagem em x/y.
  doc.documentElement.style.touchAction = 'pan-x pan-y'

  return () => {
    doc.removeEventListener('touchstart', onTouchStart)
    doc.removeEventListener('touchmove', onTouchMove)
    doc.removeEventListener('touchend', onTouchEnd)
    doc.removeEventListener('touchcancel', onTouchCancel)
  }
}
