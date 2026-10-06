import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PdfBookInfoProvider } from '@/services/bookInfo/PdfBookInfoProvider'
import { createPdfBook } from '@/services/pdf/PdfBookFactory'
import type { PdfBookHandle } from '@/services/pdf/PdfBookFactory'
import type { PdfPageProxy } from '@/services/pdf/pdfjs'

vi.mock('@/services/pdf/PdfBookFactory', () => ({ createPdfBook: vi.fn() }))
const createPdfBookMock = vi.mocked(createPdfBook)

function fakeHandle(pages: string[], metadata: Record<string, unknown> = {}) {
  const destroy = vi.fn()
  const getPage = vi.fn(async (n: number) => {
    const text = pages[n - 1] ?? ''
    return {
      getViewport: () => ({ width: 1, height: 1 }),
      getTextContent: async () => ({ items: [{ str: text, transform: [10, 0, 0, 10, 0, 0], width: 100, height: 10, hasEOL: true, fontName: 'f' }] }),
      cleanup: vi.fn(),
    } as unknown as PdfPageProxy
  })
  const handle = {
    pdf: { numPages: pages.length, getPage },
    book: { metadata, destroy },
  } as unknown as PdfBookHandle
  return { handle, destroy, getPage }
}

const blank = (n: number) => Array.from({ length: n }, () => '')

beforeEach(() => {
  createPdfBookMock.mockReset()
})

describe('PdfBookInfoProvider', () => {
  it('declara a origem pdf-metadata', () => {
    expect(new PdfBookInfoProvider().source).toBe('pdf-metadata')
  })

  it('lookupHints com título e autor dos metadados e dados do documento', async () => {
    const { handle } = fakeHandle(blank(30), {
      title: 'O Livro',
      author: ['Ana', 'Beto'],
      language: 'pt',
      description: 'Uma sinopse.',
      publisher: 'Editora X',
    })
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    expect(info.lookupHints).toEqual({ title: 'O Livro', author: 'Ana, Beto', identifiers: [] })
    expect(info.pageCount).toEqual({ value: 30, source: 'pdf-metadata', confidence: 'high' })
    expect(info.language?.value).toBe('pt')
    expect(info.synopsis?.value).toBe('Uma sinopse.')
    expect(info.publisher?.value).toBe('Editora X')
  })

  it('ISBN na página de copyright vira identificador e destrava isbn13/universalIdentifier', async () => {
    const pages = blank(40)
    pages[1] = 'Copyright © 2026. ISBN 978-0-306-40615-7. Todos os direitos reservados.'
    const { handle } = fakeHandle(pages, { title: 'T' })
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    const expected = { kind: 'ISBN_13', value: '9780306406157', raw: '9780306406157' }
    expect(info.lookupHints?.identifiers).toEqual([expected])
    expect(info.isbn13).toEqual({ value: expected, source: 'pdf-metadata', confidence: 'medium' })
    expect(info.isbn10).toBeNull()
    expect(info.universalIdentifier?.value).toEqual(expected)
  })

  it('procura nas 10 primeiras e nas 3 últimas páginas (e só nelas)', async () => {
    const pages = blank(50)
    pages[20] = 'ISBN 978-0-306-40615-7' // miolo: fora da janela
    pages[48] = 'ISBN-10: 0-306-40615-2' // últimas 3
    const { handle, getPage } = fakeHandle(pages)
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    expect(info.lookupHints?.identifiers).toEqual([{ kind: 'ISBN_10', value: '0306406152', raw: '0306406152' }])
    const requested = getPage.mock.calls.map(([n]) => n - 1)
    expect(requested.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 47, 48, 49])
  })

  it('tradução: fica só com o ISBN desta edição (não o do original, nem o da edição anterior, nem o de anúncio no fim)', async () => {
    // Linhas reais da página 3 (copyright) e da 324 (anúncio de outro livro) de "Web Scraping com Python".
    const pages = blank(325)
    pages[2] = [
      'ISBN 9781491985571 © 2018 Ryan Mitchell. This translation is published and sold by permission',
      'ISBN 9781491985571 © 2018 Ryan Mitchell. Esta tradução é publicada e vendida com a permissão',
      'ISBN: 978-85-7522-734-3',
      'Agosto/2015 Primeira edição (ISBN: 978-85-7522-447-2)',
    ].join('\n')
    pages[323] = '9788575227022'
    const { handle } = fakeHandle(pages, { title: 'Web Scraping com Python' })
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    const expected = { kind: 'ISBN_13', value: '9788575227343', raw: '9788575227343' }
    expect(info.lookupHints?.identifiers).toEqual([expected])
    expect(info.isbn13?.value).toEqual(expected)
    expect(info.universalIdentifier?.value).toEqual(expected)
  })

  it('só o ISBN do original (tradução sem ISBN próprio): nenhum identificador, em vez do de outro livro', async () => {
    const pages = blank(20)
    pages[3] = 'Título original: Some Book. ISBN 978-0-306-40615-7. Tradução de Fulano.'
    const { handle } = fakeHandle(pages)
    createPdfBookMock.mockResolvedValue(handle)
    expect((await new PdfBookInfoProvider().collect(new Blob(['x']))).lookupHints?.identifiers).toEqual([])
  })

  it('só histórico de edição: usa (é o melhor disponível)', async () => {
    const pages = blank(20)
    pages[2] = '1ª edição, 2026 — ISBN 978-0-306-40615-7'
    const { handle } = fakeHandle(pages)
    createPdfBookMock.mockResolvedValue(handle)
    expect((await new PdfBookInfoProvider().collect(new Blob(['x']))).lookupHints?.identifiers?.map((i) => i.value))
      .toEqual(['9780306406157'])
  })

  it('sem ISBN: identificadores vazios, sem erro', async () => {
    const { handle } = fakeHandle(['Capítulo 1. Nada de ISBN aqui.', 'Mais texto.'], { title: 'T' })
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    expect(info.lookupHints?.identifiers).toEqual([])
    expect(info.isbn13).toBeNull()
    expect(info.universalIdentifier).toBeNull()
  })

  it('ISBN repetido em páginas diferentes aparece uma vez só', async () => {
    const pages = blank(20)
    pages[1] = 'ISBN 978-0-306-40615-7'
    pages[19] = 'ISBN 978-0-306-40615-7'
    const { handle } = fakeHandle(pages)
    createPdfBookMock.mockResolvedValue(handle)
    expect((await new PdfBookInfoProvider().collect(new Blob(['x']))).lookupHints?.identifiers).toHaveLength(1)
  })

  it('metadados ausentes ou de tipo estranho não viram valores', async () => {
    const { handle } = fakeHandle(blank(3), { title: 42, author: {}, language: '???' })
    createPdfBookMock.mockResolvedValue(handle)
    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))
    expect(info.lookupHints).toMatchObject({ title: null, author: null })
    expect(info.language).toBeNull()
    expect(info.publisher).toBeNull()
  })

  it('sem arquivo ou com PDF ilegível devolve só dicas vazias, sem lançar', async () => {
    expect(await new PdfBookInfoProvider().collect(null)).toEqual({ lookupHints: { title: null, author: null, identifiers: [] } })
    createPdfBookMock.mockRejectedValue(new Error('corrompido'))
    expect(await new PdfBookInfoProvider().collect(new Blob(['x']))).toEqual({ lookupHints: { title: null, author: null, identifiers: [] } })
  })

  it('página ilegível não impede achar ISBN nas outras, e o documento é sempre destruído', async () => {
    const pages = blank(5)
    pages[2] = 'ISBN 978-0-306-40615-7'
    const { handle, destroy } = fakeHandle(pages)
    const original = handle.pdf.getPage
    handle.pdf.getPage = vi.fn(async (n: number) => {
      if (n === 1) throw new Error('página quebrada')
      return original(n)
    })
    createPdfBookMock.mockResolvedValue(handle)

    const info = await new PdfBookInfoProvider().collect(new Blob(['x']))

    expect(info.lookupHints?.identifiers).toHaveLength(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
