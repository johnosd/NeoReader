import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderPdfPage } from '@/services/pdf/pdfPageRender'
import type { PdfPageProxy } from '@/services/pdf/pdfjs'

const mocks = vi.hoisted(() => ({
  annotationRender: vi.fn(),
}))

vi.mock('@/services/pdf/pdfjs', () => ({
  loadPdfjs: async () => ({
    TextLayer: class {
      textDivs: HTMLElement[] = []
      async render() {}
    },
    AnnotationLayer: class {
      async render(options: { linkService?: { getDestinationHash?: (dest: unknown) => string } }) {
        // O pdf.js usa options.linkService durante render(), ao montar links internos.
        mocks.annotationRender(options.linkService?.getDestinationHash?.([1, 'XYZ']))
      }
    },
  }),
  pdfjsPath: () => '/vendor/pdfjs/',
}))

const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')

beforeEach(() => {
  document.body.innerHTML = '<div id="canvas"></div><div class="textLayer"></div><div class="annotationLayer"></div>'
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n')
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(async () => undefined),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  else delete (HTMLImageElement.prototype as { decode?: () => Promise<void> }).decode
  document.body.innerHTML = ''
})

describe('PDF annotation links', () => {
  it('passes linkService to AnnotationLayer.render for internal destinations', async () => {
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      streamTextContent: () => new ReadableStream(),
      getAnnotations: async () => [{ dest: [1, 'XYZ'] }],
    } as unknown as PdfPageProxy

    await renderPdfPage(page, document, 1)

    expect(mocks.annotationRender).toHaveBeenCalledWith('[1,"XYZ"]')
  })
})
