import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { useSyncRef } from './useSyncRef'

const DEFAULT_DELAY_MS = 500
// Dedo que anda mais que isso é scroll, não long-press. Sem a tolerância, rolar
// a lista começando em cima de um livro entraria no modo de seleção (R-001).
const DEFAULT_MOVE_TOLERANCE_PX = 10

interface UseLongPressOptions {
  onLongPress: () => void
  delayMs?: number
  moveTolerancePx?: number
}

export interface LongPressHandlers {
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (e: MouseEvent) => void
  onClickCapture: (e: MouseEvent) => void
}

// Long-press com pointer events, sem lib de gestos (feature 023, D-02).
// O componente mantém o próprio onClick; o hook só engole o click que o
// browser dispara ao soltar o dedo depois de um long-press — senão segurar um
// livro pra selecionar também o abriria.
export function useLongPress({
  onLongPress,
  delayMs = DEFAULT_DELAY_MS,
  moveTolerancePx = DEFAULT_MOVE_TOLERANCE_PX,
}: UseLongPressOptions): LongPressHandlers {
  const onLongPressRef = useSyncRef(onLongPress)
  // ReturnType<typeof setTimeout>: o tipo do id do timer muda entre browser
  // (number) e Node (objeto); assim o TS aceita os dois.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    startRef.current = null
  }, [])

  // Desmontar no meio do gesto (ex: a linha virtualizada saiu da tela) não
  // pode deixar o timer disparar depois.
  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback((e: PointerEvent) => {
    // Botão direito/do meio do mouse não conta; toque e caneta vêm com button 0.
    if (e.button !== 0) return
    // Zera aqui (e não só no click) porque soltar o dedo fora do elemento não
    // gera click — o flag ficaria preso e engoliria o próximo toque legítimo.
    firedRef.current = false
    cancel()
    startRef.current = { x: e.clientX, y: e.clientY }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      startRef.current = null
      firedRef.current = true
      onLongPressRef.current()
    }, delayMs)
  }, [cancel, delayMs, onLongPressRef])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const start = startRef.current
    if (!start) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > moveTolerancePx) cancel()
  }, [cancel, moveTolerancePx])

  const onContextMenu = useCallback((e: MouseEvent) => {
    // O Android WebView abre o menu do sistema (copiar/salvar imagem) no
    // long-press; aqui o gesto é nosso.
    e.preventDefault()
  }, [])

  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!firedRef.current) return
    firedRef.current = false
    // Fase de captura: corta o click antes de chegar no onClick do próprio
    // elemento ou de botões internos (ex: "⋯" da linha da lista).
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu,
    onClickCapture,
  }
}
