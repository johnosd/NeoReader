import { describe, expect, it, vi } from 'vitest'

import { PdfTextExtractor } from '@/services/pdf/PdfTextExtractor'
import type { PdfDocumentProxy, PdfPageProxy, PdfTextContentItem } from '@/services/pdf/pdfjs'
import { buildPdfChunks } from '@/utils/pdfChunks'
import { buildRawPageText } from '@/utils/pdfLocator'
import { loadPdfFixture } from '../../testUtils/pdfFixtures'

// PDF falso alimentado pelas fixtures (itens reais do pdf.js). Registra quantas vezes cada página foi pedida.
function fakePdf(name: string) {
  const fixture = loadPdfFixture(name)
  const byIndex = new Map(fixture.pages.map((p) => [p.pageIndex, p]))
  const getPage = vi.fn(async (pageNumber: number): Promise<PdfPageProxy> => {
    const page = byIndex.get(pageNumber - 1)
    const items: PdfTextContentItem[] = page
      ? [{ type: 'beginMarkedContent' }, ...page.items, { type: 'endMarkedContent' }]
      : []
    return {
      getViewport: () => page?.viewport ?? { width: 595, height: 842 },
      getTextContent: async () => ({ items }),
      cleanup: vi.fn(),
    } as unknown as PdfPageProxy
  })
  const pdf = { numPages: fixture.pages.at(-1)!.pageIndex + 1, getPage } as unknown as PdfDocumentProxy
  return { pdf, getPage, fixture }
}

describe('PdfTextExtractor.getPage', () => {
  it('devolve só os TextItem e o texto bruto da regra v1 do localizador', async () => {
    const { pdf, fixture } = fakePdf('1col')
    const page = await new PdfTextExtractor(pdf).getPage(2)

    const expected = fixture.pages.find((p) => p.pageIndex === 2)!
    expect(page.items).toHaveLength(expected.items.length) // marcadores de conteúdo ficaram de fora
    expect(page.rawText).toBe(buildRawPageText(expected.items))
    expect(page.itemStarts).toHaveLength(expected.items.length)
    expect(page.viewport).toEqual(expected.viewport)
    expect(page.pageIndex).toBe(2)
  })

  it('usa cache: pedir a mesma página duas vezes lê o pdf.js uma vez', async () => {
    const { pdf, getPage } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    await extractor.getPage(2)
    await extractor.getPage(2)
    expect(getPage).toHaveBeenCalledTimes(1)
  })

  it('chamadas simultâneas para a mesma página compartilham o trabalho', async () => {
    const { pdf, getPage } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    const [a, b] = await Promise.all([extractor.getPage(3), extractor.getPage(3)])
    expect(a).toBe(b)
    expect(getPage).toHaveBeenCalledTimes(1)
  })

  it('descarta as páginas mais antigas além do limite do cache (LRU)', async () => {
    const pages = Array.from({ length: 40 }, (_, i) => ({ pageIndex: i, viewport: { width: 595, height: 842 }, items: [] }))
    const getPage = vi.fn(async (n: number) => {
      const page = pages[n - 1]
      return { getViewport: () => page.viewport, getTextContent: async () => ({ items: [] }), cleanup: vi.fn() } as unknown as PdfPageProxy
    })
    const extractor = new PdfTextExtractor({ numPages: 40, getPage } as unknown as PdfDocumentProxy)

    for (let i = 0; i < 40; i++) await extractor.getPage(i)
    expect(getPage).toHaveBeenCalledTimes(40)

    await extractor.getPage(39) // recente: continua em cache
    expect(getPage).toHaveBeenCalledTimes(40)
    await extractor.getPage(0) // antiga: foi descartada
    expect(getPage).toHaveBeenCalledTimes(41)
  })

  it('chama cleanup() na página do pdf.js depois de ler o texto', async () => {
    const cleanup = vi.fn()
    const page = { getViewport: () => ({ width: 1, height: 1 }), getTextContent: async () => ({ items: [] }), cleanup }
    const extractor = new PdfTextExtractor({ numPages: 1, getPage: async () => page } as unknown as PdfDocumentProxy)
    await extractor.getPage(0)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('libera a página também quando getTextContent falha, e não guarda o erro em cache', async () => {
    const cleanup = vi.fn()
    let fail = true
    const page = {
      getViewport: () => ({ width: 1, height: 1 }),
      getTextContent: async () => {
        if (fail) throw new Error('boom')
        return { items: [] }
      },
      cleanup,
    }
    const extractor = new PdfTextExtractor({ numPages: 1, getPage: async () => page } as unknown as PdfDocumentProxy)
    await expect(extractor.getPage(0)).rejects.toThrow('boom')
    expect(cleanup).toHaveBeenCalledTimes(1)
    fail = false
    await expect(extractor.getPage(0)).resolves.toMatchObject({ rawText: '' })
  })

  it.each([-1, 1.5, 99])('rejeita página fora do documento (%j)', async (index) => {
    const { pdf } = fakePdf('1col')
    await expect(new PdfTextExtractor(pdf).getPage(index)).rejects.toThrow(RangeError)
  })

  it('página sem camada de texto (escaneada) → itens e texto bruto vazios', async () => {
    const { pdf } = fakePdf('escaneado')
    const page = await new PdfTextExtractor(pdf).getPage(0)
    expect(page.items).toEqual([])
    expect(page.rawText).toBe('')
  })
})

describe('PdfTextExtractor.reconstructChunk', () => {
  it('devolve só blocos que começam no trecho e lê páginas de contexto em volta', async () => {
    const { pdf, getPage } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    const chunk = { index: 0, startPage: 4, endPage: 6, label: 'Páginas 5–7' }

    const blocks = await extractor.reconstructChunk(chunk)

    expect(blocks.length).toBeGreaterThan(5)
    expect(blocks.every((b) => b.pageIndex >= 4 && b.pageIndex <= 6)).toBe(true)
    // contexto: 2 antes e 3 depois, limitado ao documento (fixture tem as páginas 0–11)
    const requested = getPage.mock.calls.map(([n]) => n - 1).sort((a, b) => a - b)
    expect(requested).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('junta o parágrafo que atravessa o fim do trecho usando a página seguinte como lookahead', async () => {
    const { pdf } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    // trecho de uma página só: sem lookahead os parágrafos que terminam na página seguinte ficariam cortados
    const blocks = await extractor.reconstructChunk({ index: 0, startPage: 5, endPage: 5, label: 'p6' })
    const paragraphs = blocks.filter((b) => b.kind === 'paragraph')
    expect(paragraphs.length).toBeGreaterThan(0)
    for (const p of paragraphs) expect(p.text).toMatch(/[.!?]$/)
  })

  it('cabeçalho repetido é removido mesmo num trecho curto (o contexto prova a repetição)', async () => {
    const { pdf } = fakePdf('1col')
    const blocks = await new PdfTextExtractor(pdf).reconstructChunk({ index: 0, startPage: 5, endPage: 5, label: 'p6' })
    expect(blocks.map((b) => b.text).join(' ')).not.toContain('The Quiet Archive')
  })

  it('reaproveita o resultado do mesmo trecho (cache de trechos)', async () => {
    const { pdf, getPage } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    const chunk = { index: 1, startPage: 4, endPage: 5, label: 'x' }
    const first = await extractor.reconstructChunk(chunk)
    const calls = getPage.mock.calls.length
    const second = await extractor.reconstructChunk(chunk)
    expect(second).toBe(first)
    expect(getPage.mock.calls.length).toBe(calls)
  })

  it('funciona com os trechos de buildPdfChunks e cobre o PDF sem duplicar blocos entre trechos', async () => {
    const { pdf } = fakePdf('2col')
    const extractor = new PdfTextExtractor(pdf)
    const chunks = buildPdfChunks(pdf.numPages, null, (a, b) => `${a}-${b}`)
    const all = (await Promise.all(chunks.map((c) => extractor.reconstructChunk(c)))).flat()

    const alone = (await new PdfTextExtractor(pdf).reconstructChunk({ index: 0, startPage: 0, endPage: pdf.numPages - 1, label: 'all' }))
    // Mesmo conteúdo de texto, na mesma ordem (um único trecho do documento todo vs. vários).
    expect(all.map((b) => b.text)).toEqual(alone.map((b) => b.text))
  })

  it('clear() esvazia os caches', async () => {
    const { pdf, getPage } = fakePdf('1col')
    const extractor = new PdfTextExtractor(pdf)
    await extractor.getPage(2)
    extractor.clear()
    await extractor.getPage(2)
    expect(getPage).toHaveBeenCalledTimes(2)
  })
})
