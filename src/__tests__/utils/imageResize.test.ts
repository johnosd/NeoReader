import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resizeCoverBlob } from '@/utils/imageResize'

// jsdom nao implementa Canvas real (getContext('2d') retorna null) nem
// createImageBitmap global — mockamos as duas pra testar a logica de
// decisao (research.md Decisao 5 / R-002 do plan.md), nao o resultado
// pixel-a-pixel real.

function makeFakeCanvas(drawImageSpy: ReturnType<typeof vi.fn>, resizedBlob: Blob) {
  const fakeCtx = { drawImage: drawImageSpy }
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => fakeCtx),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(resizedBlob)),
  }
  return fakeCanvas
}

describe('resizeCoverBlob', () => {
  let createImageBitmapMock: ReturnType<typeof vi.fn>
  let createElementSpy: ReturnType<typeof vi.spyOn>
  const originalCreateElement = document.createElement.bind(document)

  beforeEach(() => {
    createImageBitmapMock = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmapMock)
    createElementSpy = vi.spyOn(document, 'createElement')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    createElementSpy.mockRestore()
  })

  it('retorna o mesmo blob original quando ja esta dentro do teto (sem upscale)', async () => {
    const original = new Blob(['dado'], { type: 'image/jpeg' })
    const closeSpy = vi.fn()
    createImageBitmapMock.mockResolvedValue({ width: 800, height: 1200, close: closeSpy })

    const result = await resizeCoverBlob(original, 2000)

    expect(result).toBe(original)
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas')
  })

  it('redimensiona corretamente quando acima do teto, preservando a proporcao', async () => {
    const original = new Blob(['dado'], { type: 'image/jpeg' })
    const resized = new Blob(['redimensionado'], { type: 'image/jpeg' })
    const drawImageSpy = vi.fn()
    const fakeCanvas = makeFakeCanvas(drawImageSpy, resized)
    createElementSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
      return originalCreateElement(tag)
    })
    createImageBitmapMock.mockResolvedValue({ width: 4000, height: 6000, close: vi.fn() })

    const result = await resizeCoverBlob(original, 2000)

    // maior lado (6000) escala pra 2000 -> fator 1/3; largura 4000 -> 1333
    expect(fakeCanvas.width).toBe(1333)
    expect(fakeCanvas.height).toBe(2000)
    expect(drawImageSpy).toHaveBeenCalledWith(expect.anything(), 0, 0, 1333, 2000)
    expect(fakeCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg')
    expect(result).toBe(resized)
  })

  it('cai pra image/jpeg quando o formato original nao e reencodavel via canvas', async () => {
    const original = new Blob(['dado'], { type: 'image/gif' })
    const resized = new Blob(['redimensionado'], { type: 'image/jpeg' })
    const drawImageSpy = vi.fn()
    const fakeCanvas = makeFakeCanvas(drawImageSpy, resized)
    createElementSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return fakeCanvas as unknown as HTMLCanvasElement
      return {} as HTMLElement
    })
    createImageBitmapMock.mockResolvedValue({ width: 3000, height: 3000, close: vi.fn() })

    await resizeCoverBlob(original, 2000)

    expect(fakeCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg')
  })

  it('retorna o blob original sem lancar quando createImageBitmap rejeita', async () => {
    const original = new Blob(['dado'], { type: 'image/jpeg' })
    createImageBitmapMock.mockRejectedValue(new Error('formato invalido'))

    const result = await resizeCoverBlob(original, 2000)

    expect(result).toBe(original)
  })

  it('nao tenta decodificar capas de fallback SVG', async () => {
    const svg = new Blob(['<svg></svg>'], { type: 'image/svg+xml' })

    const result = await resizeCoverBlob(svg, 2000)

    expect(result).toBe(svg)
    expect(createImageBitmapMock).not.toHaveBeenCalled()
  })
})
