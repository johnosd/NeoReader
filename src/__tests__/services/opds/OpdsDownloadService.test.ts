import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog, OpdsFeedEntry } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  request: vi.fn(),
  importEpub: vi.fn(),
  getCredential: vi.fn(),
  recordDownload: vi.fn(),
  createTag: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: { importEpub: mocks.importEpub },
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

function base64Of(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('OpdsDownloadService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(true)
    mocks.request.mockReset()
    mocks.importEpub.mockReset()
    mocks.getCredential.mockReset()
    mocks.recordDownload.mockReset()
    mocks.createTag.mockReset()
  })

  it('baixa via CapacitorHttp e importa o File resultante, gravando o vínculo', async () => {
    const epubBytes = [0x50, 0x4b, 0x03, 0x04]
    mocks.request.mockResolvedValue({ status: 200, data: base64Of(epubBytes) })
    mocks.importEpub.mockResolvedValue(77)

    const bookId = await OpdsDownloadService.download(catalog, entry)

    expect(bookId).toBe(77)
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: entry.acquisitionUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    }))

    const [file, options] = mocks.importEpub.mock.calls[0] as [File, { importSource: string; tags: number[] }]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('opds-dune.epub')
    expect(options).toEqual({ importSource: 'opds', tags: [] })

    expect(mocks.recordDownload).toHaveBeenCalledWith(1, 'urn:book-1', 77)
    expect(getOpdsDownloadState(1, 'urn:book-1')).toEqual({ key: '1:urn:book-1', status: 'success', bookId: 77 })
  })

  it('resolve assunto/idioma da entry em tags via createTag e passa pro import (FR de organização/filtro)', async () => {
    mocks.request.mockResolvedValue({ status: 200, data: base64Of([1, 2, 3]) })
    mocks.importEpub.mockResolvedValue(88)
    mocks.createTag.mockImplementation((name: string) => Promise.resolve({ 'Love stories': 10, Inglês: 11 }[name] ?? 0))

    const entryWithMetadata: OpdsFeedEntry = { ...entry, id: 'e6', subjects: ['Love stories'], language: 'en' }
    await OpdsDownloadService.download(catalog, entryWithMetadata)

    expect(mocks.createTag).toHaveBeenCalledWith('Love stories')
    expect(mocks.createTag).toHaveBeenCalledWith('Inglês')
    const [, options] = mocks.importEpub.mock.calls[0] as [File, { tags: number[] }]
    expect(options.tags).toEqual([10, 11])
  })

  it('adiciona Authorization Basic quando o catálogo tem credencial', async () => {
    mocks.getCredential.mockResolvedValue({ username: 'u', password: 'p' })
    mocks.request.mockResolvedValue({ status: 200, data: base64Of([1, 2, 3]) })
    mocks.importEpub.mockResolvedValue(1)

    await OpdsDownloadService.download({ ...catalog, id: 2, hasCredential: true }, { ...entry, id: 'e2' })

    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: { Authorization: `Basic ${btoa('u:p')}` },
    }))
  })

  it('marca erro no coordinator quando o download falha', async () => {
    mocks.request.mockRejectedValue(new Error('network fail'))

    await expect(OpdsDownloadService.download(catalog, { ...entry, id: 'e3' })).rejects.toThrow('network fail')
    expect(getOpdsDownloadState(1, 'e3')).toEqual({ key: '1:e3', status: 'error', errorMessage: 'network fail' })
  })

  it('faz upgrade de http:// pra https:// no link de aquisição antes de baixar, quando o catálogo em si é https (research.md #10)', async () => {
    mocks.request.mockResolvedValue({ status: 200, data: base64Of([1, 2, 3]) })
    mocks.importEpub.mockResolvedValue(9)

    await OpdsDownloadService.download(catalog, { ...entry, id: 'e-http', acquisitionUrl: 'http://example.com/download/1.epub' })

    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/download/1.epub' }))
  })

  it('NÃO faz upgrade pra https quando o catálogo em si é http:// — self-hosted na rede local costuma ser http:// puro de propósito (R-010)', async () => {
    mocks.request.mockResolvedValue({ status: 200, data: base64Of([1, 2, 3]) })
    mocks.importEpub.mockResolvedValue(10)

    const httpCatalog = { ...catalog, id: 3, baseUrl: 'http://192.168.0.14:8083/opds' }
    await OpdsDownloadService.download(httpCatalog, { ...entry, id: 'e-lan', acquisitionUrl: 'http://192.168.0.14:8083/opds/book/1.epub' })

    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://192.168.0.14:8083/opds/book/1.epub' }))
  })

  it('recusa rodar fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await expect(OpdsDownloadService.download(catalog, { ...entry, id: 'e4' })).rejects.toThrow(/Android nativo/)
  })

  it('ignora toque duplicado (download já em andamento pra mesma entry)', async () => {
    let resolveRequest: (value: unknown) => void = () => {}
    mocks.request.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))

    const first = OpdsDownloadService.download(catalog, { ...entry, id: 'e5' })
    const second = await OpdsDownloadService.download(catalog, { ...entry, id: 'e5' })

    expect(second).toBeNull()
    resolveRequest({ status: 200, data: base64Of([1]) })
    mocks.importEpub.mockResolvedValue(5)
    await first
  })
})
