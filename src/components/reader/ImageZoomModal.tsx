import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'

interface ImageZoomModalProps {
  src: string | null
  alt?: string | null
  onClose: () => void
}

interface ImageZoomModalContentProps {
  src: string
  alt?: string | null
  onClose: () => void
}

type Point = {
  x: number
  y: number
}

type ImageTransform = {
  scale: number
  x: number
  y: number
}

type GestureState =
  | {
      mode: 'pan'
      pointerId: number
      startPoint: Point
      startTransform: ImageTransform
    }
  | {
      mode: 'pinch'
      startDistance: number
      startCenter: Point
      startTransform: ImageTransform
    }

const MIN_SCALE = 1
const MAX_SCALE = 4
const INITIAL_TRANSFORM: ImageTransform = { scale: MIN_SCALE, x: 0, y: 0 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getDistance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function getCenter(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function getEventPoint(event: ReactPointerEvent): Point {
  return {
    x: event.clientX,
    y: event.clientY,
  }
}

function getTwoPointers(pointers: Map<number, Point>) {
  return Array.from(pointers.values()).slice(0, 2)
}

export function ImageZoomModal({ src, alt, onClose }: ImageZoomModalProps) {
  if (!src) return null

  return (
    <ImageZoomModalContent
      key={src}
      src={src}
      alt={alt}
      onClose={onClose}
    />
  )
}

function ImageZoomModalContent({ src, alt, onClose }: ImageZoomModalContentProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<Element | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const activePointersRef = useRef<Map<number, Point>>(new Map())
  const gestureRef = useRef<GestureState | null>(null)
  const transformRef = useRef<ImageTransform>(INITIAL_TRANSFORM)
  const [transform, setTransform] = useState<ImageTransform>(INITIAL_TRANSFORM)
  const imageAlt = alt?.trim() ?? ''

  const clampTransform = useCallback((nextTransform: ImageTransform): ImageTransform => {
    const scale = clamp(nextTransform.scale, MIN_SCALE, MAX_SCALE)

    if (scale <= MIN_SCALE) {
      return INITIAL_TRANSFORM
    }

    const surface = surfaceRef.current
    const image = imageRef.current

    if (!surface || !image || surface.clientWidth === 0 || surface.clientHeight === 0 || image.clientWidth === 0 || image.clientHeight === 0) {
      return {
        scale,
        x: nextTransform.x,
        y: nextTransform.y,
      }
    }

    const scaledWidth = image.clientWidth * scale
    const scaledHeight = image.clientHeight * scale
    const maxX = Math.max(0, (scaledWidth - surface.clientWidth) / 2)
    const maxY = Math.max(0, (scaledHeight - surface.clientHeight) / 2)

    return {
      scale,
      x: clamp(nextTransform.x, -maxX, maxX),
      y: clamp(nextTransform.y, -maxY, maxY),
    }
  }, [])

  const commitTransform = useCallback((nextTransform: ImageTransform) => {
    const clampedTransform = clampTransform(nextTransform)
    transformRef.current = clampedTransform
    setTransform(clampedTransform)
  }, [clampTransform])

  const getSurfaceCenter = useCallback((): Point => {
    const surface = surfaceRef.current

    if (!surface) {
      return { x: 0, y: 0 }
    }

    const rect = surface.getBoundingClientRect()

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }, [])

  const startPanGesture = useCallback((pointerId: number, point: Point) => {
    gestureRef.current = {
      mode: 'pan',
      pointerId,
      startPoint: point,
      startTransform: transformRef.current,
    }
  }, [])

  const startPinchGesture = useCallback((first: Point, second: Point) => {
    const distance = getDistance(first, second)

    if (distance === 0) return

    gestureRef.current = {
      mode: 'pinch',
      startDistance: distance,
      startCenter: getCenter(first, second),
      startTransform: transformRef.current,
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const activePointers = activePointersRef.current
    previousFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      activePointers.clear()
      gestureRef.current = null

      if (previousFocusRef.current instanceof HTMLElement && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus()
      }

      previousFocusRef.current = null
    }
  }, [onClose])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    activePointersRef.current.set(event.pointerId, getEventPoint(event))

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some test and embedded browser environments do not expose pointer capture.
    }

    if (activePointersRef.current.size >= 2) {
      const [first, second] = getTwoPointers(activePointersRef.current)
      startPinchGesture(first, second)
      return
    }

    startPanGesture(event.pointerId, getEventPoint(event))
  }, [startPanGesture, startPinchGesture])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return

    event.preventDefault()
    event.stopPropagation()

    activePointersRef.current.set(event.pointerId, getEventPoint(event))

    if (activePointersRef.current.size >= 2) {
      const [first, second] = getTwoPointers(activePointersRef.current)
      const gesture = gestureRef.current

      if (!gesture || gesture.mode !== 'pinch') {
        startPinchGesture(first, second)
        return
      }

      const distance = getDistance(first, second)

      if (distance === 0) return

      const nextCenter = getCenter(first, second)
      const nextScale = clamp(
        gesture.startTransform.scale * (distance / gesture.startDistance),
        MIN_SCALE,
        MAX_SCALE,
      )
      const scaleRatio = nextScale / gesture.startTransform.scale
      const surfaceCenter = getSurfaceCenter()
      const pinchOriginX = gesture.startCenter.x - surfaceCenter.x - gesture.startTransform.x
      const pinchOriginY = gesture.startCenter.y - surfaceCenter.y - gesture.startTransform.y

      commitTransform({
        scale: nextScale,
        x: gesture.startTransform.x
          + (nextCenter.x - gesture.startCenter.x)
          + pinchOriginX * (1 - scaleRatio),
        y: gesture.startTransform.y
          + (nextCenter.y - gesture.startCenter.y)
          + pinchOriginY * (1 - scaleRatio),
      })

      return
    }

    const gesture = gestureRef.current

    if (!gesture || gesture.mode !== 'pan' || gesture.pointerId !== event.pointerId) {
      startPanGesture(event.pointerId, getEventPoint(event))
      return
    }

    if (gesture.startTransform.scale <= MIN_SCALE) return

    const point = getEventPoint(event)

    commitTransform({
      scale: gesture.startTransform.scale,
      x: gesture.startTransform.x + point.x - gesture.startPoint.x,
      y: gesture.startTransform.y + point.y - gesture.startPoint.y,
    })
  }, [commitTransform, getSurfaceCenter, startPanGesture, startPinchGesture])

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    activePointersRef.current.delete(event.pointerId)

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture is best effort in WebView and tests.
    }

    if (activePointersRef.current.size >= 2) {
      const [first, second] = getTwoPointers(activePointersRef.current)
      startPinchGesture(first, second)
      return
    }

    if (activePointersRef.current.size === 1) {
      const [[pointerId, point]] = Array.from(activePointersRef.current.entries())
      startPanGesture(pointerId, point)
      return
    }

    gestureRef.current = null
  }, [startPanGesture, startPinchGesture])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Imagem do leitor"
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white outline-none active:bg-white/25 focus-visible:ring-2 focus-visible:ring-white"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        aria-label="Fechar"
      >
        <X size={20} />
      </button>

      <div
        ref={surfaceRef}
        className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
        style={{
          cursor: transform.scale > MIN_SCALE ? 'grab' : 'zoom-in',
          overscrollBehavior: 'contain',
          userSelect: 'none',
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <img
          ref={imageRef}
          src={src}
          alt={imageAlt}
          draggable={false}
          className="block max-h-full max-w-full object-contain"
          style={{
            maxWidth: '100%',
            maxHeight: '100dvh',
            objectFit: 'contain',
            pointerEvents: 'none',
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
            transformOrigin: 'center center',
            touchAction: 'none',
            willChange: 'transform',
          }}
          onLoad={() => commitTransform(INITIAL_TRANSFORM)}
        />
      </div>
    </div>
  )
}
