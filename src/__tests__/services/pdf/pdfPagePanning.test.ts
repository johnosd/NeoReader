import { afterEach, describe, expect, it, vi } from 'vitest'

import { setupPanningEvents } from '@/services/pdf/pdfPageRender'

// Documento de página dentro de um iframe (o pan sobe do iframe até o ancestral rolável; no jsdom cai na window).
function makePageDoc(): Document {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.body.innerHTML = '<div class="textLayer"></div>'
  // jsdom não faz layout: elementFromPoint não existe no documento do iframe.
  doc.elementFromPoint = () => null
  return doc
}

// jsdom não tem PointerEvent: um MouseEvent com pointerType basta para os handlers.
function pointer(type: string, pointerType: string, x: number, y: number): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, screenX: x, screenY: y, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  return event
}

describe('setupPanningEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('arrastar com o mouse rola a página', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const doc = makePageDoc()
    setupPanningEvents(doc)
    const layer = doc.querySelector('.textLayer')!

    layer.dispatchEvent(pointer('pointerdown', 'mouse', 100, 100))
    layer.dispatchEvent(pointer('pointermove', 'mouse', 80, 60))

    expect(scrollTo).toHaveBeenCalled()
  })

  it('dedo não aciona o pan por código (a pinça movia a página com cada dedo)', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const doc = makePageDoc()
    setupPanningEvents(doc)
    const layer = doc.querySelector('.textLayer')!

    // Dois dedos da pinça se afastando: antes cada um gravava a rolagem com o próprio deslocamento.
    layer.dispatchEvent(pointer('pointerdown', 'touch', 150, 300))
    layer.dispatchEvent(pointer('pointerdown', 'touch', 250, 300))
    layer.dispatchEvent(pointer('pointermove', 'touch', 120, 300))
    layer.dispatchEvent(pointer('pointermove', 'touch', 280, 300))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
