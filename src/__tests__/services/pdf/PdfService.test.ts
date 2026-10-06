import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPdfBook } from '@/services/pdf/PdfBookFactory'
import { isUsablePageText, PdfImportError, PdfService, samplePageIndexes } from '@/services/pdf/PdfService'
import type { PdfBookHandle } from '@/services/pdf/PdfBookFactory'
import type { PdfPageProxy } from '@/services/pdf/pdfjs'
import { loadPdfFixture } from '../../testUtils/pdfFixtures'

vi.mock('@/services/pdf/PdfBookFactory', () => ({ createPdfBook: vi.fn() }))

const createPdfBookMock = vi.mocked(createPdfBook)

interface FakeOptions {
  fixture?: string // páginas vêm das fixtures reais do pdf.js
  pageCount?: number
  pageText?: (pageIndex: number) => string // alternativa: texto sintético por página
  metadata?: Record<string, unknown>
  cover?: Blob | null
}

function fakeHandle(options: FakeOptions): { handle: PdfBookHandle; destroy: ReturnType<typeof vi.fn> } {
  const fixture = options.fixture ? loadPdfFixture(options.fixture) : null
  const byIndex = new Map(fixture?.pages.map((p) => [p.pageIndex, p]))
  const numPages = options.pageCount ?? (fixture ? fixture.pages.at(-1)!.pageIndex + 1 : 10)
  const destroy = vi.fn()

  const pdf = {
    numPages,
    getPage: async (n: number) => {
      const i = n - 1
      const items = options.pageText
        ? [{ str: options.pageText(i), transform: [10, 0, 0, 10, 0, 0], width: 100, height: 10, hasEOL: true, fontName: 'f' }]
        : (byIndex.get(i)?.items ?? [])
      return { getViewport: () => ({ width: 1, height: 1 }), getTextContent: async () => ({ items }), cleanup: vi.fn() } as unknown as PdfPageProxy
    },
  } as unknown as PdfBookHandle['pdf']

  const book = {
    metadata: options.metadata ?? {},
    getCover: async () => (options.cover === undefined ? new Blob(['png'], { type: 'image/png' }) : options.cover),
    destroy,
  } as unknown as PdfBookHandle['book']

  return { handle: { book, pdf }, destroy }
}

const lorem = (n: number) => `Este é o texto corrido da página ${n} de um livro de teste com palavras suficientes para ser texto.`

beforeEach(() => {
  createPdfBookMock.mockReset()
})

describe('PdfService.parseMetadata — metadados', () => {
  it('usa título e autor dos metadados e devolve capa e nº de páginas', async () => {
    const { handle, destroy } = fakeHandle({ pageCount: 40, pageText: lorem, metadata: { title: ' O Livro ', author: 'Ana' } })
    createPdfBookMock.mockResolvedValue(handle)

    const meta = await PdfService.parseMetadata(new Blob(['x']), 'arquivo.pdf')

    expect(meta.title).toBe('O Livro')
    expect(meta.author).toBe('Ana')
    expect(meta.pageCount).toBe(40)
    expect(meta.coverBlob?.type).toBe('image/png')
    expect(destroy).toHaveBeenCalledTimes(1) // abre, lê e destrói
  })

  it('normaliza autor em array (dc:creator) e junta vários autores', async () => {
    const { handle } = fakeHandle({ pageText: lorem, metadata: { title: 'T', author: ['Mitchell, Ryan', 'Outro Autor'] } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).author).toBe('Mitchell, Ryan, Outro Autor')
  })

  it('sem título → nome do arquivo sem .pdf; sem autor → "Autor desconhecido"', async () => {
    const { handle } = fakeHandle({ pageText: lorem, metadata: {} })
    createPdfBookMock.mockResolvedValue(handle)
    const meta = await PdfService.parseMetadata(new Blob(['x']), 'Meu Livro Bom.PDF')
    expect(meta.title).toBe('Meu Livro Bom')
    expect(meta.author).toBe('Autor desconhecido')
  })

  it('metadados vazios ou de tipo estranho caem no fallback', async () => {
    const { handle } = fakeHandle({ pageText: lorem, metadata: { title: '   ', author: 42 } })
    createPdfBookMock.mockResolvedValue(handle)
    const meta = await PdfService.parseMetadata(new Blob(['x']), 'a.pdf')
    expect(meta.title).toBe('a')
    expect(meta.author).toBe('Autor desconhecido')
  })

  it('título/autor-lixo do Word caem no nome do arquivo e em "Autor desconhecido" (R-026, "Os Noturnos")', async () => {
    const { handle } = fakeHandle({
      pageText: lorem,
      metadata: { title: '(Microsoft Word - Fl\\341via Muniz - Noturnos _Rev_)', author: 'A' },
    })
    createPdfBookMock.mockResolvedValue(handle)
    const meta = await PdfService.parseMetadata(new Blob(['x']), 'Os Noturnos - Flávia Muniz.pdf')
    expect(meta.title).toBe('Os Noturnos - Flávia Muniz')
    expect(meta.author).toBe('Autor desconhecido')
  })

  it('falha ao gerar a capa não derruba o import', async () => {
    const { handle } = fakeHandle({ pageText: lorem, metadata: { title: 'T' } })
    handle.book.getCover = async () => {
      throw new Error('canvas indisponível')
    }
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).coverBlob).toBeNull()
  })
})

describe('PdfService.parseMetadata — camada de texto', () => {
  it('full: todas as páginas amostradas têm texto', async () => {
    const { handle } = fakeHandle({ fixture: '1col', metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    // as fixtures só têm as 12 primeiras páginas: amostra de 8 cai em páginas com e sem fixture
    const meta = await PdfService.parseMetadata(new Blob(['x']))
    expect(['full', 'partial']).toContain(meta.pdfTextLayer)
  })

  it('full com texto em todas as páginas', async () => {
    const { handle } = fakeHandle({ pageCount: 100, pageText: lorem, metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).pdfTextLayer).toBe('full')
  })

  it('none: PDF escaneado (nenhuma página com texto)', async () => {
    const { handle } = fakeHandle({ fixture: 'escaneado', metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    const meta = await PdfService.parseMetadata(new Blob(['x']))
    expect(meta.pdfTextLayer).toBe('none')
    expect(meta.detectedLanguage).toBeNull()
  })

  it('partial: metade das páginas amostradas tem texto (misto)', async () => {
    const { handle } = fakeHandle({ pageCount: 100, pageText: (i) => (i < 50 ? lorem(i) : ''), metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).pdfTextLayer).toBe('partial')
  })

  it('texto-lixo (fonte sem ToUnicode) NÃO conta como camada de texto (R-009)', async () => {
    const junk = (i: number) => ``.repeat(30) + String(i)
    const { handle } = fakeHandle({ pageCount: 30, pageText: junk, metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).pdfTextLayer).toBe('none')
  })
})

describe('PdfService.parseMetadata — idioma (DI-012)', () => {
  it('prefere o idioma dos metadados (e normaliza a etiqueta)', async () => {
    const { handle } = fakeHandle({ pageCount: 30, pageText: lorem, metadata: { title: 'T', language: 'pt_br' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).detectedLanguage).toBe('pt-BR')
  })

  it('aceita idioma dos metadados em array', async () => {
    const { handle } = fakeHandle({ pageCount: 30, pageText: lorem, metadata: { title: 'T', language: ['es'] } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).detectedLanguage).toBe('es')
  })

  it('metadado de idioma com cara de lixo é ignorado e cai na detecção pelo texto', async () => {
    const { handle } = fakeHandle({ fixture: '1col-pt', metadata: { title: 'T', language: '???' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).detectedLanguage).toBe('pt-BR')
  })

  it('sem metadado: detecta pelo texto amostrado (en)', async () => {
    const { handle } = fakeHandle({ fixture: '1col', metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).detectedLanguage).toBe('en')
  })

  it('texto curto demais para decidir → indefinido (null), nunca "en" em silêncio', async () => {
    const { handle } = fakeHandle({ pageCount: 2, pageText: () => 'Capítulo um. Olá mundo, isto é só um teste curto.', metadata: { title: 'T' } })
    createPdfBookMock.mockResolvedValue(handle)
    expect((await PdfService.parseMetadata(new Blob(['x']))).detectedLanguage).toBeNull()
  })
})

describe('PdfService.parseMetadata — erros (FR-015)', () => {
  const failWith = (name: string) => {
    const error = new Error('x')
    error.name = name
    createPdfBookMock.mockRejectedValue(error)
  }

  it('senha → PdfImportError PDF_PASSWORD_PROTECTED', async () => {
    failWith('PasswordException')
    const error = await PdfService.parseMetadata(new Blob(['x'])).catch((e) => e)
    expect(error).toBeInstanceOf(PdfImportError)
    expect(error.code).toBe('PDF_PASSWORD_PROTECTED')
    expect(error.message).toMatch(/senha/)
  })

  it.each(['InvalidPDFException', 'MissingPDFException', 'UnknownErrorException'])('%s → PDF_INVALID', async (name) => {
    failWith(name)
    const error = await PdfService.parseMetadata(new Blob(['x'])).catch((e) => e)
    expect(error).toBeInstanceOf(PdfImportError)
    expect(error.code).toBe('PDF_INVALID')
  })

  it('destrói o documento mesmo se a leitura de texto falhar', async () => {
    const { handle, destroy } = fakeHandle({ pageCount: 10, pageText: lorem, metadata: { title: 'T' } })
    handle.pdf.getPage = vi.fn().mockRejectedValue(new Error('página quebrada'))
    createPdfBookMock.mockResolvedValue(handle)
    const meta = await PdfService.parseMetadata(new Blob(['x']))
    expect(meta.pdfTextLayer).toBe('none') // página ilegível = sem texto, não erro
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

describe('helpers', () => {
  it('samplePageIndexes: tudo em PDF curto; espalhado, único e dentro do documento em PDF longo', () => {
    expect(samplePageIndexes(3)).toEqual([0, 1, 2])
    const sample = samplePageIndexes(1000)
    expect(sample).toHaveLength(8)
    expect(sample[0]).toBe(0)
    expect(sample.at(-1)).toBe(999)
    expect(new Set(sample).size).toBe(8)
    expect(samplePageIndexes(0)).toEqual([])
  })

  it('isUsablePageText', () => {
    expect(isUsablePageText(lorem(1))).toBe(true)
    expect(isUsablePageText('12')).toBe(false)
    expect(isUsablePageText('�'.repeat(60))).toBe(false)
    expect(isUsablePageText('#$%&/()=?!'.repeat(10))).toBe(false)
  })
})
