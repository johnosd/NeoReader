import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog, OpdsFeedEntry } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  downloadBookToLocal: vi.fn(),
  importPreparedNativeBook: vi.fn(),
  getCredential: vi.fn(),
  recordDownload: vi.fn(),
  createTag: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  downloadBookToLocal: mocks.downloadBookToLocal,
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: { importPreparedNativeBook: mocks.importPreparedNativeBook },
}))

vi.mock('@/services/opds/OpdsCredentialStore', () => ({
  OpdsCredentialStore: { get: mocks.getCredential },
}))

vi.mock('@/db/opdsDownloadedEntries', () => ({
  recordDownload: mocks.recordDownload,
}))

vi.mock('@/db/tags', () => ({
  createTag: mocks.createTag,
}))

import { OpdsDownloadService } from '@/services/opds/OpdsDownloadService'
import { getOpdsDownloadState } from '@/services/opds/OpdsDownloadCoordinator'

const catalog: OpdsCatalog = {
  id: 1,
  name: 'Gutenberg',
  baseUrl: 'https://example.com/opds/',
  hasCredential: false,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const entry: OpdsFeedEntry = {
  id: 'urn:book-1',
  title: 'Dune',
  author: 'Frank Herbert',
  kind: 'publication',
  acquisitionUrl: 'https://example.com/download/1.epub',
}

// O que o plugin devolve depois de baixar para o armazenamento do app (formato decidido pelos bytes).
function prepared(format: 'EPUB' | 'PDF', overrides: Record<string, unknown> = {}) {
  return {
    importId: 'native-download-1',
    format,
    name: 'provisorio',
    size: 2048,
    sha256: 'abc',
    localUri: `file:///data/books/abc.${format === 'PDF' ? 'pdf' : 'epub'}`,
    originalUri: entry.acquisitionUrl,
    metadata: { title: 'x', author: '' },
    diagnostics: { copyMs: 1, inspectMs: 1 },
    ...overrides,
  }
}

describe('OpdsDownloadService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(true)
    mocks.downloadBookToLocal.mockReset().mockResolvedValue(prepared('EPUB'))
    mocks.importPreparedNativeBook.mockReset()
    mocks.getCredential.mockReset()
    mocks.recordDownload.mockReset()
    mocks.createTag.mockReset()
  })

  it('baixa pelo plugin direto para o armazenamento do app (sem passar o arquivo pela ponte) e grava o vínculo', async () => {
    mocks.importPreparedNativeBook.mockResolvedValue(77)

    const bookId = await OpdsDownloadService.download(catalog, entry)

    expect(bookId).toBe(77)
    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(
      expect.objectContaining({ url: entry.acquisitionUrl, name: 'opds-dune.epub', headers: {}, timeoutMs: 30_000 }),
      { timeoutMs: 600_000 },
    )
    const [file, options] = mocks.importPreparedNativeBook.mock.calls[0] as [{ name: string }, { importSource: string; tags: number[] }]
    expect(file.name).toBe('opds-dune.epub')
    expect(options).toEqual({ importSource: 'opds', tags: [] })

    expect(mocks.recordDownload).toHaveBeenCalledWith(1, 'urn:book-1', 77)
    expect(getOpdsDownloadState(1, 'urn:book-1')).toEqual({ key: '1:urn:book-1', status: 'success', bookId: 77 })
  })

  it('PDF baixado: nome .pdf e o mesmo import nativo (FR-017 da 022)', async () => {
    mocks.downloadBookToLocal.mockResolvedValue(prepared('PDF'))
    mocks.importPreparedNativeBook.mockResolvedValue(55)

    const pdfEntry: OpdsFeedEntry = { ...entry, id: 'e-pdf', acquisitionUrl: 'https://example.com/download/1.pdf', acquisitionFormat: 'PDF' }
    const bookId = await OpdsDownloadService.download(catalog, pdfEntry)

    expect(bookId).toBe(55)
    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(expect.objectContaining({ name: 'opds-dune.pdf' }), expect.anything())
    const [file, options] = mocks.importPreparedNativeBook.mock.calls[0] as [{ name: string; format: string }, { importSource: string }]
    expect(file).toMatchObject({ name: 'opds-dune.pdf', format: 'PDF' })
    expect(options.importSource).toBe('opds')
    expect(mocks.recordDownload).toHaveBeenCalledWith(1, 'e-pdf', 55)
    expect(getOpdsDownloadState(1, 'e-pdf')).toEqual({ key: '1:e-pdf', status: 'success', bookId: 55 })
  })

  it('confia nos bytes, não no type do feed: anunciado como PDF mas o plugin detectou EPUB → .epub', async () => {
    mocks.downloadBookToLocal.mockResolvedValue(prepared('EPUB'))
    mocks.importPreparedNativeBook.mockResolvedValue(56)

    await OpdsDownloadService.download(catalog, { ...entry, id: 'e-liar', acquisitionFormat: 'PDF' })

    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(expect.objectContaining({ name: 'opds-dune.pdf' }), expect.anything())
    const [file] = mocks.importPreparedNativeBook.mock.calls[0] as [{ name: string }]
    expect(file.name).toBe('opds-dune.epub')
  })

  it('PDF baixado que o import recusa marca erro com a mensagem do import', async () => {
    mocks.downloadBookToLocal.mockResolvedValue(prepared('PDF'))
    mocks.importPreparedNativeBook.mockRejectedValue(new Error('Este PDF está protegido por senha.'))

    await expect(OpdsDownloadService.download(catalog, { ...entry, id: 'e-pdf-err', acquisitionFormat: 'PDF' }))
      .rejects.toThrow('protegido por senha')
    expect(getOpdsDownloadState(1, 'e-pdf-err')).toMatchObject({ status: 'error', errorMessage: 'Este PDF está protegido por senha.' })
  })

  it('resolve assunto/idioma da entry em tags via createTag e passa pro import (FR de organização/filtro)', async () => {
    mocks.importPreparedNativeBook.mockResolvedValue(88)
    mocks.createTag.mockImplementation((name: string) => Promise.resolve({ 'Love stories': 10, Inglês: 11 }[name] ?? 0))

    const entryWithMetadata: OpdsFeedEntry = { ...entry, id: 'e6', subjects: ['Love stories'], language: 'en' }
    await OpdsDownloadService.download(catalog, entryWithMetadata)

    expect(mocks.createTag).toHaveBeenCalledWith('Love stories')
    expect(mocks.createTag).toHaveBeenCalledWith('Inglês')
    const [, options] = mocks.importPreparedNativeBook.mock.calls[0] as [unknown, { tags: number[] }]
    expect(options.tags).toEqual([10, 11])
  })

  it('manda Authorization Basic ao plugin quando o catálogo tem credencial', async () => {
    mocks.getCredential.mockResolvedValue({ username: 'u', password: 'p' })
    mocks.importPreparedNativeBook.mockResolvedValue(1)

    await OpdsDownloadService.download({ ...catalog, id: 2, hasCredential: true }, { ...entry, id: 'e2' })

    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { Authorization: `Basic ${btoa('u:p')}` } }),
      expect.anything(),
    )
  })

  it('marca erro no coordinator quando o download falha (ex: HTTP ou tempo esgotado no plugin)', async () => {
    mocks.downloadBookToLocal.mockRejectedValue(new Error('Falha ao baixar o livro (401)'))

    await expect(OpdsDownloadService.download(catalog, { ...entry, id: 'e3' })).rejects.toThrow('(401)')
    expect(getOpdsDownloadState(1, 'e3')).toEqual({ key: '1:e3', status: 'error', errorMessage: 'Falha ao baixar o livro (401)' })
    expect(mocks.importPreparedNativeBook).not.toHaveBeenCalled()
  })

  it('faz upgrade de http:// pra https:// no link de aquisição antes de baixar, quando o catálogo em si é https (research.md #10)', async () => {
    mocks.importPreparedNativeBook.mockResolvedValue(9)

    await OpdsDownloadService.download(catalog, { ...entry, id: 'e-http', acquisitionUrl: 'http://example.com/download/1.epub' })

    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/download/1.epub' }), expect.anything())
  })

  it('NÃO faz upgrade pra https quando o catálogo em si é http:// — self-hosted na rede local costuma ser http:// puro de propósito (R-010)', async () => {
    mocks.importPreparedNativeBook.mockResolvedValue(10)

    const httpCatalog = { ...catalog, id: 3, baseUrl: 'http://192.168.0.14:8083/opds' }
    await OpdsDownloadService.download(httpCatalog, { ...entry, id: 'e-lan', acquisitionUrl: 'http://192.168.0.14:8083/opds/book/1.epub' })

    expect(mocks.downloadBookToLocal).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://192.168.0.14:8083/opds/book/1.epub' }), expect.anything())
  })

  it('recusa rodar fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await expect(OpdsDownloadService.download(catalog, { ...entry, id: 'e4' })).rejects.toThrow(/Android nativo/)
    expect(mocks.downloadBookToLocal).not.toHaveBeenCalled()
  })

  it('ignora toque duplicado (download já em andamento pra mesma entry)', async () => {
    let resolveDownload: (value: unknown) => void = () => {}
    mocks.downloadBookToLocal.mockReturnValue(new Promise((resolve) => { resolveDownload = resolve }))
    mocks.importPreparedNativeBook.mockResolvedValue(5)

    const first = OpdsDownloadService.download(catalog, { ...entry, id: 'e5' })
    const second = await OpdsDownloadService.download(catalog, { ...entry, id: 'e5' })

    expect(second).toBeNull()
    resolveDownload(prepared('EPUB'))
    await first
    expect(mocks.downloadBookToLocal).toHaveBeenCalledTimes(1)
  })
})
