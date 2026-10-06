// Pinça (dois dedos) nas páginas PDF. Dois alvos, porque o foliate-fxl desliga `pointer-events` dos iframes
// durante a rolagem e por ~150 ms depois (fixed-layout.js, `.scroll-page iframe { pointer-events: none }`):
// - o `contentDocument` de cada página (iframe do mesmo origin: o pai registra os listeners, nenhum script no
//   iframe, o sandbox continua sem allow-scripts — R-005, research.md §2);
// - o contêiner do viewer no documento pai, que recebe os toques enquanto os iframes estão desligados.
// Eventos de toque não atravessam a fronteira do iframe, então um gesto nunca chega aos dois alvos.

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
 * Registra a pinça em `target` (documento de uma página ou elemento do documento pai). Devolve a função que
 * remove os listeners. Um dedo continua rolando de forma nativa; com dois dedos o gesto é capturado.
 */
export function attachPinchZoom(target: Document | HTMLElement, handlers: PinchHandlers): () => void {
  let startDistance = 0
  let lastRatio = 1
  let lastCenter = { x: 0, y: 0 }
  let active = false

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) return
    // Cancelar já no touchstart do 2º dedo impede o navegador de transformar o gesto em rolagem com dois
    // dedos. Se só cancelássemos no touchmove seria tarde: com a rolagem iniciada o touchmove vem
    // `cancelable=false`, o preventDefault é ignorado e parte do movimento vira rolagem (zoom fraco/ignorado).
    if (event.cancelable) event.preventDefault()
    active = true
    startDistance = distance(event.touches[0], event.touches[1])
    lastRatio = 1
    lastCenter = midpoint(event.touches[0], event.touches[1])
    handlers.onStart()
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!active || event.touches.length !== 2 || startDistance === 0) return
    // Evento não cancelável (rolagem já em curso): chamar preventDefault só geraria erro no console.
    if (event.cancelable) event.preventDefault()
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

  // passive:false em touchstart/touchmove: listener passivo não pode chamar preventDefault, e o navegador
  // faria a própria rolagem/zoom com os dois dedos.
  // Cast: TouchEvent em Document e em HTMLElement têm assinaturas de addEventListener diferentes no TS.
  const eventTarget = target as unknown as EventTarget
  eventTarget.addEventListener('touchstart', onTouchStart as EventListener, { passive: false })
  eventTarget.addEventListener('touchmove', onTouchMove as EventListener, { passive: false })
  eventTarget.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })
  eventTarget.addEventListener('touchcancel', onTouchCancel as EventListener, { passive: true })
  // Desliga o zoom nativo (do navegador, que ampliaria a UI inteira) mantendo a rolagem em x/y.
  const styled = 'documentElement' in target ? target.documentElement : target
  styled.style.touchAction = 'pan-x pan-y'

  return () => {
    eventTarget.removeEventListener('touchstart', onTouchStart as EventListener)
    eventTarget.removeEventListener('touchmove', onTouchMove as EventListener)
    eventTarget.removeEventListener('touchend', onTouchEnd as EventListener)
    eventTarget.removeEventListener('touchcancel', onTouchCancel as EventListener)
  }
}
