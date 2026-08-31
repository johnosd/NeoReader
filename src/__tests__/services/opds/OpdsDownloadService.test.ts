import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog, OpdsFeedEntry } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  request: vi.fn(),
  importEpub: vi.fn(),
  getCredential: vi.fn(),
  recordDownload: vi.fn(),
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

    const [file, options] = mocks.importEpub.mock.calls[0] as [File, { importSource: string }]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('opds-dune.epub')
    expect(options).toEqual({ importSource: 'opds' })

    expect(mocks.recordDownload).toHaveBeenCalledWith(1, 'urn:book-1', 77)
    expect(getOpdsDownloadState(1, 'urn:book-1')).toEqual({ key: '1:urn:book-1', status: 'success', bookId: 77 })
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
