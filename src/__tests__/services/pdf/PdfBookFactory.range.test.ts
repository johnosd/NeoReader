import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('@/services/pdf/pdfjs', () => ({
  loadPdfjs: async () => ({
    PDFDataRangeTransport: class {
      constructor(public length: number) {}
      requestDataRange = vi.fn()
      onDataRange = vi.fn()
    },
    getDocument: mocks.getDocument,
  }),
  pdfjsPath: (path: string) => `/vendor/pdfjs/${path}`,
}))

import { createPdfBook } from '@/services/pdf/PdfBookFactory'

function preparedTransport() {
  return mocks.getDocument.mock.calls[0][0].range as {
    length: number
    requestDataRange(begin: number, end: number): void
    onDataRange: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  mocks.getDocument.mockReset()
  mocks.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({ getViewport: () => ({ width: 100, height: 200 }) })),
      getMetadata: vi.fn(async () => ({})),
      getOutline: vi.fn(async () => null),
      destroy: vi.fn(async () => undefined),
    }),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('PdfBookFactory range transport', () => {
  it('requests only the needed bytes from a local URL', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), {
      status: 206,
      headers: { 'Content-Range': 'bytes 10-12/200000000' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const handle = await createPdfBook({ url: 'https://localhost/book.pdf', length: 200_000_000 })
    const transport = preparedTransport()

    expect(transport.length).toBe(200_000_000)
    transport.requestDataRange(10, 13)
    await vi.waitFor(() => expect(transport.onDataRange).toHaveBeenCalledWith(10, expect.any(ArrayBuffer)))
    expect([...new Uint8Array(transport.onDataRange.mock.calls[0][1] as ArrayBuffer)]).toEqual([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledWith('https://localhost/book.pdf', {
      headers: { Range: 'bytes=10-12' },
      signal: expect.any(AbortSignal),
    })
    handle.book.destroy()
  })

  it('keeps Blob range reads for embedded and web PDFs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handle = await createPdfBook(new Blob(['%PDF-1.7']))
    const transport = preparedTransport()

    transport.requestDataRange(0, 4)
    await vi.waitFor(() => expect(transport.onDataRange).toHaveBeenCalledWith(0, expect.any(ArrayBuffer)))
    expect(fetchMock).not.toHaveBeenCalled()
    handle.book.destroy()
  })
})
