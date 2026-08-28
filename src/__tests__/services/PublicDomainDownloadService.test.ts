import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  request: vi.fn(),
  importEpub: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: { importEpub: mocks.importEpub },
}))

import { PublicDomainDownloadService } from '@/services/PublicDomainDownloadService'
import { getPublicDomainDownloadState } from '@/services/PublicDomainDownloadCoordinator'
import type { PublicDomainCatalogEntry } from '@/services/PublicDomainCatalogService'

const entry: PublicDomainCatalogEntry = {
  id: 'jane-austen_pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  authorSlug: 'jane-austen',
  titleSlug: 'pride-and-prejudice',
}

function base64Of(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('PublicDomainDownloadService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.request.mockReset()
    mocks.importEpub.mockReset()
  })

  it('baixa via CapacitorHttp com ?source=download e importa o File resultante', async () => {
    const epubBytes = [0x50, 0x4b, 0x03, 0x04] // assinatura ZIP/EPUB
    mocks.request.mockResolvedValue({ status: 200, data: base64Of(epubBytes) })
    mocks.importEpub.mockResolvedValue(77)

    const bookId = await PublicDomainDownloadService.download(entry)

    expect(bookId).toBe(77)
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download',
      method: 'GET',
      responseType: 'arraybuffer',
    }))

    const [file, options] = mocks.importEpub.mock.calls[0] as [File, { importSource: string }]
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('jane-austen_pride-and-prejudice.epub')
    expect(options).toEqual({ importSource: 'public-domain' })

    expect(getPublicDomainDownloadState(entry.id)).toEqual({
      entryId: entry.id,
      status: 'success',
      bookId: 77,
    })
  })

  it('marca erro no coordinator quando o download falha', async () => {
    mocks.request.mockRejectedValue(new Error('network fail'))

    await expect(PublicDomainDownloadService.download(entry)).rejects.toThrow('network fail')

    expect(getPublicDomainDownloadState(entry.id)).toEqual({
      entryId: entry.id,
      status: 'error',
      errorMessage: 'network fail',
    })
  })

  it('marca offline:true quando navigator.onLine e false no momento da falha (US3)', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mocks.request.mockRejectedValue(new Error('Unable to resolve host'))

    await expect(PublicDomainDownloadService.download(entry)).rejects.toThrow('Unable to resolve host')

    expect(getPublicDomainDownloadState(entry.id)).toEqual({
      entryId: entry.id,
      status: 'error',
      errorMessage: 'Unable to resolve host',
      offline: true,
    })

    onLineSpy.mockRestore()
  })

  it('recusa rodar fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)

    await expect(PublicDomainDownloadService.download(entry)).rejects.toThrow(/Android nativo/)
  })

  it('propaga o erro de duplicata do pipeline de import existente sem criar um segundo livro (US2)', async () => {
    // Simula o usuario ja tendo esse classico importado de outra fonte
    // (ex: arquivo proprio) — BookImportService.importEpub ja rejeita
    // duplicatas sozinho (findDuplicateBook); aqui so confirmamos que o
    // caminho de download novo herda esse comportamento sem duplicar
    // nem tratar como sucesso.
    const epubBytes = [0x50, 0x4b, 0x03, 0x04]
    mocks.request.mockResolvedValue({ status: 200, data: base64Of(epubBytes) })
    mocks.importEpub.mockRejectedValue(new Error('Este livro ja esta na biblioteca.'))

    await expect(PublicDomainDownloadService.download(entry)).rejects.toThrow('Este livro ja esta na biblioteca.')

    expect(getPublicDomainDownloadState(entry.id)).toEqual({
      entryId: entry.id,
      status: 'error',
      errorMessage: 'Este livro ja esta na biblioteca.',
    })
    expect(mocks.importEpub).toHaveBeenCalledTimes(1)
  })
})
