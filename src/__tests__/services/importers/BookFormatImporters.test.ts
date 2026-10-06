import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importerForFormat, importerForMetadata } from '@/services/importers'
import type { NativePreparedEpub } from '@/services/NativeLibraryImportService'

const mocks = vi.hoisted(() => ({
  parseEpubMetadata: vi.fn(),
  invalidateExtrasCache: vi.fn(),
  parsePdfMetadata: vi.fn(),
  fetchLocalFile: vi.fn(),
  deleteLocalBookFile: vi.fn(),
}))

vi.mock('@/services/EpubService', () => ({
  EpubService: {
    parseMetadata: mocks.parseEpubMetadata,
    invalidateExtrasCache: mocks.invalidateExtrasCache,
  },
}))

vi.mock('@/services/pdf/PdfService', () => ({ PdfService: { parseMetadata: mocks.parsePdfMetadata } }))
vi.mock('@/services/BookFileResolver', () => ({ BookFileResolver: { fetchLocalFile: mocks.fetchLocalFile } }))
vi.mock('@/services/NativeLibraryImportService', () => ({ deleteLocalBookFile: mocks.deleteLocalBookFile }))

const prepared: NativePreparedEpub = {
  importId: 'test-import',
  name: 'example.epub',
  size: 1024,
  sha256: 'hash',
  localUri: 'file:///example',
  originalUri: 'content://example',
  metadata: {
    title: 'Example',
    author: 'Writer',
    identifiers: [{ kind: 'ISBN_13', value: '9781234567897', raw: '9781234567897' }],
    language: 'en',
  },
  diagnostics: { copyMs: 1, inspectMs: 1, bytesCopied: 1024 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteLocalBookFile.mockResolvedValue(true)
  mocks.parsePdfMetadata.mockResolvedValue({
    title: 'PDF title', author: 'PDF author', coverBlob: new Blob(['js-cover']),
    pageCount: 8, pdfTextLayer: 'full', detectedLanguage: 'en',
  })
})

describe('book format importers', () => {
  it('keeps a missing format on the EPUB importer and its metadata path', async () => {
    const file = new File(['epub'], 'example.epub')
    const metadata = { title: 'EPUB title', author: 'Writer', coverBlob: null }
    mocks.parseEpubMetadata.mockResolvedValue(metadata)

    const importer = importerForFormat(undefined)
    expect(importer.format).toBe('EPUB')
    expect(await importer.parseMetadata(file)).toBe(metadata)
    expect(mocks.parseEpubMetadata).toHaveBeenCalledWith(file)
    expect(importerForMetadata(metadata)).toBe(importer)
  })

  it('maps native EPUB metadata and ISBN without opening it as PDF', async () => {
    const result = await importerForFormat('EPUB').prepareNative(prepared)

    expect(result.metadata).toMatchObject({ title: 'Example', author: 'Writer', coverBlob: null })
    expect(result.bookInfoContext.lookupHints?.identifiers).toEqual(prepared.metadata.identifiers)
    expect(result.bookInfoContext.isbn13?.value).toEqual(prepared.metadata.identifiers?.[0])
    expect(mocks.fetchLocalFile).not.toHaveBeenCalled()
    expect(mocks.parsePdfMetadata).not.toHaveBeenCalled()
  })

  it('uses the native cover and parsed PDF metadata on a native PDF', async () => {
    const blob = new Blob(['pdf'])
    mocks.fetchLocalFile.mockResolvedValue(blob)
    const nativePdf: NativePreparedEpub = {
      ...prepared, format: 'PDF', name: 'example.pdf',
      cover: { base64: btoa('cover'), mimeType: 'image/jpeg' },
    }

    const result = await importerForFormat('PDF').prepareNative(nativePdf)

    expect(mocks.parsePdfMetadata).toHaveBeenCalledWith(blob, 'example.pdf', { skipCover: true })
    expect(result.metadata.pdf).toEqual({ pageCount: 8, pdfTextLayer: 'full', detectedLanguage: 'en' })
    expect(result.metadata.coverBlob).toMatchObject({ size: 5, type: 'image/jpeg' })
    expect(result.bookInfoBlob).toBe(blob)
    expect(importerForMetadata(result.metadata).format).toBe('PDF')
  })

  it('renderiza a capa no JS quando o plugin nativo não devolve capa', async () => {
    const blob = new Blob(['pdf'])
    mocks.fetchLocalFile.mockResolvedValue(blob)

    const result = await importerForFormat('PDF').prepareNative({ ...prepared, format: 'PDF', name: 'sem-capa.pdf' })

    expect(mocks.parsePdfMetadata).toHaveBeenCalledWith(blob, 'sem-capa.pdf', { skipCover: false })
    expect(result.metadata.coverBlob).toMatchObject({ size: 8 })
  })

  it('removes a new native PDF copy when parsing fails', async () => {
    mocks.fetchLocalFile.mockResolvedValue(new Blob(['bad-pdf']))
    mocks.parsePdfMetadata.mockRejectedValue(new Error('invalid'))

    await expect(importerForFormat('PDF').prepareNative({ ...prepared, format: 'PDF' })).rejects.toThrow('invalid')
    expect(mocks.deleteLocalBookFile).toHaveBeenCalledWith(prepared.localUri)
  })
})
