import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolvePdfReaderSource: vi.fn(),
  createPdfBook: vi.fn(),
}))

vi.mock('@/services/BookFileResolver', () => ({ BookFileResolver: { resolvePdfReaderSource: mocks.resolvePdfReaderSource } }))
vi.mock('@/services/pdf/PdfBookFactory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/pdf/PdfBookFactory')>()
  return { ...actual, createPdfBook: mocks.createPdfBook }
})

import { usePdfReaderSession } from '@/hooks/usePdfReaderSession'
import type { Book } from '@/types/book'

const pdfBlob = new Blob(['%PDF-1.7'])
const book: Book = {
  id: 7,
  title: 'PDF',
  author: 'A',
  format: 'PDF',
  fileBlob: pdfBlob,
  storageMode: 'embedded',
  addedAt: new Date(),
  lastOpenedAt: null,
}

function fakeOpen(numPages = 45, toc: unknown = null) {
  const destroy = vi.fn()
  const handle = {
    pdf: { numPages, getPage: vi.fn() },
    book: { toc, destroy },
  }
  mocks.createPdfBook.mockResolvedValue(handle)
  return { handle, destroy }
}

beforeEach(() => {
  mocks.resolvePdfReaderSource.mockReset()
  mocks.createPdfBook.mockReset()
  mocks.resolvePdfReaderSource.mockResolvedValue(pdfBlob)
})

describe('usePdfReaderSession', () => {
  it('livro EPUB (enabled=false) não abre nada', () => {
    const { result } = renderHook(() => usePdfReaderSession(book, false))
    expect(result.current).toEqual({ status: 'idle' })
    expect(mocks.resolvePdfReaderSource).not.toHaveBeenCalled()
    expect(mocks.createPdfBook).not.toHaveBeenCalled()
  })

  it('resolve o arquivo, abre o PDF e expõe trechos, extrator e nº de páginas', async () => {
    fakeOpen(45)
    const { result } = renderHook(() => usePdfReaderSession(book, true))

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(mocks.resolvePdfReaderSource).toHaveBeenCalledWith(book)
    expect(mocks.createPdfBook).toHaveBeenCalledWith(pdfBlob)
    if (result.current.status !== 'ready') throw new Error('esperava ready')
    const { session } = result.current
    expect(session.pageCount).toBe(45)
    // sem sumário: blocos de 20 páginas (DI-009)
    expect(session.chunks.map((c) => [c.startPage, c.endPage])).toEqual([[0, 19], [20, 39], [40, 44]])
    expect(session.extractor.pageCount).toBe(45)
  })

  it('passes the local PDF range source through without materializing a Blob', async () => {
    fakeOpen()
    const source = { url: 'https://localhost/_capacitor_file_/large.pdf', length: 200_000_000 }
    mocks.resolvePdfReaderSource.mockResolvedValue(source)

    const { result } = renderHook(() => usePdfReaderSession({ ...book, storageMode: 'local', uri: 'file:///large.pdf' }, true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(mocks.createPdfBook).toHaveBeenCalledWith(source)
  })

  it('usa o sumário do PDF para dividir os trechos', async () => {
    fakeOpen(30, [
      { label: 'Cap 1', href: '', index: 0, subitems: null },
      { label: 'Cap 2', href: '', index: 12, subitems: null },
    ])
    const { result } = renderHook(() => usePdfReaderSession(book, true))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('esperava ready')
    expect(result.current.session.chunks.map((c) => c.label)).toEqual(['Cap 1', 'Cap 2'])
  })

  it('destrói o PDF ao sair do leitor', async () => {
    const { destroy } = fakeOpen()
    const { result, unmount } = renderHook(() => usePdfReaderSession(book, true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    unmount()

    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('se sair antes de abrir terminar, destrói o documento recém-aberto (sem vazar)', async () => {
    const { destroy } = fakeOpen()
    let release!: () => void
    mocks.resolvePdfReaderSource.mockReturnValue(new Promise((resolve) => { release = () => resolve(pdfBlob) }))

    const { unmount } = renderHook(() => usePdfReaderSession(book, true))
    unmount()
    await act(async () => {
      release()
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1))
  })

  it('erro ao resolver o arquivo vira status error (mensagem preservada para a tela de arquivo ausente)', async () => {
    mocks.resolvePdfReaderSource.mockRejectedValue(new Error('Este livro foi movido, apagado ou perdeu a permissao de acesso.'))
    const { result } = renderHook(() => usePdfReaderSession(book, true))

    await waitFor(() => expect(result.current.status).toBe('error'))
    if (result.current.status !== 'error') throw new Error('esperava error')
    expect(result.current.error.message).toMatch(/movido/)
  })

  it('erro ao abrir o PDF vira status error', async () => {
    mocks.createPdfBook.mockRejectedValue(new Error('PDF inválido'))
    const { result } = renderHook(() => usePdfReaderSession(book, true))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('re-render com um objeto de livro novo mas mesmo arquivo não reabre o PDF', async () => {
    fakeOpen()
    const { result, rerender } = renderHook(({ b }) => usePdfReaderSession(b, true), { initialProps: { b: book } })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ b: { ...book, lastOpenedAt: new Date() } })

    expect(mocks.createPdfBook).toHaveBeenCalledTimes(1)
  })

  it('trocar de livro destrói o anterior e abre o novo', async () => {
    const first = fakeOpen()
    const { result, rerender } = renderHook(({ b }) => usePdfReaderSession(b, true), { initialProps: { b: book } })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    fakeOpen(10)
    rerender({ b: { ...book, id: 8, fileBlob: new Blob(['%PDF-other']) } })

    await waitFor(() => expect(mocks.createPdfBook).toHaveBeenCalledTimes(2))
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })
})
