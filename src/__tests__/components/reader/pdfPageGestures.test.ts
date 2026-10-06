import { describe, expect, it, vi } from 'vitest'

import { attachPinchZoom, clampZoomPct } from '@/components/reader/pdfPage/pdfPageGestures'

// jsdom não tem Touch/TouchEvent completos: um Event comum com `touches` definido basta para os listeners.
function touchEvent(type: string, points: Array<{ x: number; y: number }>, cancelable = true): Event {
  const event = new Event(type, { bubbles: true, cancelable })
  Object.defineProperty(event, 'touches', { value: points.map((p) => ({ clientX: p.x, clientY: p.y })) })
  return event
}

const twoFingers = (distance: number) => [{ x: 200 - distance / 2, y: 300 }, { x: 200 + distance / 2, y: 300 }]

function makeHandlers() {
  return { onStart: vi.fn(() => 100), onChange: vi.fn(), onEnd: vi.fn(), onCancel: vi.fn() }
}

describe('attachPinchZoom', () => {
  it('cancela já no touchstart com dois dedos (o navegador não transforma o gesto em rolagem)', () => {
    const el = document.createElement('div')
    attachPinchZoom(el, makeHandlers())

    const start = touchEvent('touchstart', twoFingers(100))
    el.dispatchEvent(start)
    expect(start.defaultPrevented).toBe(true)

    const oneFinger = touchEvent('touchstart', [{ x: 10, y: 10 }])
    el.dispatchEvent(oneFinger)
    expect(oneFinger.defaultPrevented).toBe(false) // um dedo continua rolando nativamente
  })

  it('aplica a razão inteira do movimento dos dedos', () => {
    const el = document.createElement('div')
    const handlers = makeHandlers()
    attachPinchZoom(el, handlers)

    el.dispatchEvent(touchEvent('touchstart', twoFingers(100)))
    el.dispatchEvent(touchEvent('touchmove', twoFingers(150)))
    el.dispatchEvent(touchEvent('touchend', []))

    expect(handlers.onChange).toHaveBeenLastCalledWith(1.5, { x: 200, y: 300 })
    expect(handlers.onEnd).toHaveBeenCalledWith(1.5, { x: 200, y: 300 })
  })

  it('não chama preventDefault em touchmove não cancelável (evita o erro "Ignored attempt to cancel")', () => {
    const el = document.createElement('div')
    const handlers = makeHandlers()
    attachPinchZoom(el, handlers)

    el.dispatchEvent(touchEvent('touchstart', twoFingers(100)))
    const move = touchEvent('touchmove', twoFingers(120), false)
    const preventDefault = vi.spyOn(move, 'preventDefault')
    el.dispatchEvent(move)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(handlers.onChange).toHaveBeenCalledWith(1.2, { x: 200, y: 300 })
  })

  it('funciona tanto no documento da página quanto num elemento do documento pai, e desliga o zoom nativo', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    const el = document.createElement('div')
    const docHandlers = makeHandlers()
    const elHandlers = makeHandlers()
    attachPinchZoom(doc, docHandlers)
    attachPinchZoom(el, elHandlers)

    expect(doc.documentElement.style.touchAction).toBe('pan-x pan-y')
    expect(el.style.touchAction).toBe('pan-x pan-y')

    doc.dispatchEvent(touchEvent('touchstart', twoFingers(100)))
    el.dispatchEvent(touchEvent('touchstart', twoFingers(100)))
    expect(docHandlers.onStart).toHaveBeenCalledTimes(1)
    expect(elHandlers.onStart).toHaveBeenCalledTimes(1)
    iframe.remove()
  })

  it('a função devolvida remove os listeners', () => {
    const el = document.createElement('div')
    const handlers = makeHandlers()
    const detach = attachPinchZoom(el, handlers)
    detach()

    el.dispatchEvent(touchEvent('touchstart', twoFingers(100)))
    expect(handlers.onStart).not.toHaveBeenCalled()
  })
})

describe('clampZoomPct', () => {
  it('limita a 100–400% e arredonda', () => {
    expect(clampZoomPct(50)).toBe(100)
    expect(clampZoomPct(149.6)).toBe(150)
    expect(clampZoomPct(900)).toBe(400)
    expect(clampZoomPct(Number.NaN)).toBe(100)
  })
})
