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

// R14 (code review 2026-10-10): o transporte de faixas do pdf.js não tem canal de erro; a abertura
// precisa rejeitar sozinha e derrubar a loading task em falha de Range ou abort.
describe('PdfBookFactory abertura com falha de Range / abort', () => {
  const failingSource = { url: 'https://localhost/book.pdf', length: 1000 }

  function pendingLoadingTask(promise: Promise<unknown> = new Promise(() => {})) {
    const destroy = vi.fn(async () => undefined)
    mocks.getDocument.mockReturnValue({ promise, destroy })
    return { destroy }
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('erro no 1º Range (documento ainda não aberto) rejeita a abertura e destrói a loading task', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('range offline') }))
    const { destroy } = pendingLoadingTask()

    const opening = createPdfBook(failingSource)
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled())
    preparedTransport().requestDataRange(0, 10)

    await expect(opening).rejects.toThrow('range offline')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('erro de Range depois do documento abrir (1ª página) também rejeita e destrói', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const { destroy } = pendingLoadingTask(Promise.resolve({
      numPages: 3,
      getPage: vi.fn(() => new Promise(() => {})), // pdf.js esperando bytes que não chegam
      destroy: vi.fn(async () => undefined),
    }))

    const opening = createPdfBook(failingSource)
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled())
    await Promise.resolve()
    preparedTransport().requestDataRange(100, 200)

    await expect(opening).rejects.toThrow('PDF range HTTP 500')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('erro em slice() de Blob durante a abertura rejeita', async () => {
    const { destroy } = pendingLoadingTask()
    const blob = new Blob(['%PDF-1.7'])
    vi.spyOn(blob, 'slice').mockReturnValue({ arrayBuffer: () => Promise.reject(new Error('blob lost')) } as unknown as Blob)

    const opening = createPdfBook(blob)
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled())
    preparedTransport().requestDataRange(0, 4)

    await expect(opening).rejects.toThrow('blob lost')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('abort do signal durante a abertura rejeita, cancela os Range pendentes e destrói a loading task', async () => {
    let rangeSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      rangeSignal = init.signal ?? undefined
      return new Promise(() => {})
    }))
    const { destroy } = pendingLoadingTask()
    const controller = new AbortController()

    const opening = createPdfBook(failingSource, { signal: controller.signal })
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled())
    preparedTransport().requestDataRange(0, 10)
    await vi.waitFor(() => expect(rangeSignal).toBeDefined())
    controller.abort()

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    expect(rangeSignal?.aborted).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('signal já abortado não chega a abrir o documento', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(createPdfBook(new Blob(['%PDF-1.7']), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.getDocument).not.toHaveBeenCalled()
  })

  it('depois de aberto, erro de Range ou abort não derruba a sessão (só book.destroy libera)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('later range') }))
    const destroy = vi.fn(async () => undefined)
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({ getViewport: () => ({ width: 100, height: 200 }) })),
        getMetadata: vi.fn(async () => ({})),
        getOutline: vi.fn(async () => null),
        destroy: vi.fn(async () => undefined),
      }),
      destroy,
    })
    const controller = new AbortController()
    const handle = await createPdfBook(failingSource, { signal: controller.signal })

    preparedTransport().requestDataRange(0, 10)
    controller.abort()
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledWith('PDF range read failed:', 0, 10, expect.any(Error)))
    expect(destroy).not.toHaveBeenCalled()
    handle.book.destroy()
  })
})
