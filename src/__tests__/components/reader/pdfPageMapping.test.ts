import { describe, expect, it } from 'vitest'

import {
  blockStartPoint,
  findBlockAtPoint,
  itemIndexAtOffset,
  offsetOfItem,
  pageForFraction,
  progressPercentage,
  tocLabelForPage,
} from '@/components/reader/pdfPage/pdfPageMapping'
import type { PdfTocItem } from '@/services/pdf/PdfBookFactory'
import { buildRawPage } from '@/utils/pdfLocator'
import { reconstructPdfParagraphs, type PdfBlock } from '@/utils/pdfParagraphs'
import { loadPdfFixture } from '../../testUtils/pdfFixtures'

describe('offsetOfItem / itemIndexAtOffset', () => {
  const items = [
    { str: 'Hello ', hasEOL: false },
    { str: 'world', hasEOL: true },
    { str: '', hasEOL: true },
    { str: 'next', hasEOL: false },
  ]
  const { itemStarts, text } = buildRawPage(items)

  it('é consistente com o texto bruto', () => {
    expect(text).toBe('Hello world\n\nnext')
    expect(offsetOfItem(itemStarts, 1)).toBe(6)
    expect(offsetOfItem(itemStarts, 3)).toBe(13)
    expect(offsetOfItem(itemStarts, 99)).toBe(0) // índice fora: não explode
  })

  it('acha o item que contém o offset', () => {
    expect(itemIndexAtOffset(itemStarts, items, 0)).toBe(0)
    expect(itemIndexAtOffset(itemStarts, items, 5)).toBe(0)
    expect(itemIndexAtOffset(itemStarts, items, 6)).toBe(1)
    expect(itemIndexAtOffset(itemStarts, items, 10)).toBe(1)
  })

  it('offset sobre quebra de linha ou item vazio vai para o próximo item com texto', () => {
    expect(itemIndexAtOffset(itemStarts, items, 11)).toBe(3) // "\n" depois de "world"
    expect(itemIndexAtOffset(itemStarts, items, 12)).toBe(3) // "\n" do item vazio
  })

  it('offset além do fim devolve o último item com texto; página sem texto devolve -1', () => {
    expect(itemIndexAtOffset(itemStarts, items, 999)).toBe(3)
    expect(itemIndexAtOffset([], [], 0)).toBe(-1)
    const empty = [{ str: '', hasEOL: true }]
    expect(itemIndexAtOffset(buildRawPage(empty).itemStarts, empty, 0)).toBe(-1)
  })

  it('round-trip: o offset de cada item cai de volta no mesmo item (fixture real)', () => {
    const page = loadPdfFixture('1col').pages.find((p) => p.pageIndex === 3)!
    const { itemStarts: starts } = buildRawPage(page.items)
    page.items.forEach((item, i) => {
      if (!item.str.length) return
      expect(itemIndexAtOffset(starts, page.items, offsetOfItem(starts, i))).toBe(i)
    })
  })
})

describe('findBlockAtPoint / blockStartPoint', () => {
  const fixture = loadPdfFixture('1col')
  const blocks = reconstructPdfParagraphs(fixture.pages, { ownedFromPage: 3, ownedToPage: 6 })

  it('todo ponto dentro dos ranges de um bloco devolve esse bloco', () => {
    const paragraphs = blocks.filter((b) => b.kind === 'paragraph')
    expect(paragraphs.length).toBeGreaterThan(3)
    for (const block of paragraphs) {
      const range = block.ranges[0]
      const middle = Math.floor((range.start + range.end) / 2)
      expect(findBlockAtPoint(blocks, { pageIndex: range.pageIndex, offset: middle })).toBe(block)
      expect(findBlockAtPoint(blocks, { pageIndex: range.pageIndex, offset: range.start })).toBe(block)
    }
  })

  it('ponto fora de qualquer bloco (página sem texto, offset enorme) → null', () => {
    expect(findBlockAtPoint(blocks, { pageIndex: 99, offset: 0 })).toBeNull()
    expect(findBlockAtPoint(blocks, { pageIndex: 3, offset: 10_000_000 })).toBeNull()
  })

  it('figura nunca é devolvida como parágrafo tocado', () => {
    const figure: PdfBlock = { kind: 'figure', text: '', pageIndex: 0, ranges: [{ pageIndex: 0, start: 0, end: 50 }] }
    expect(findBlockAtPoint([figure], { pageIndex: 0, offset: 10 })).toBeNull()
  })

  it('blockStartPoint é o início do primeiro intervalo', () => {
    const block = blocks.find((b) => b.kind === 'paragraph')!
    expect(blockStartPoint(block)).toEqual({ pageIndex: block.ranges[0].pageIndex, offset: block.ranges[0].start })
    expect(blockStartPoint({ kind: 'figure', text: '', pageIndex: 0, ranges: [] })).toBeNull()
  })
})

describe('tocLabelForPage', () => {
  const toc: PdfTocItem[] = [
    { label: 'Capa', href: '', index: 0, subitems: null },
    {
      label: 'Parte I',
      href: '',
      index: 5,
      subitems: [
        { label: 'Cap 1', href: '', index: 6, subitems: null },
        { label: 'Cap 2', href: '', index: 20, subitems: null },
      ],
    },
    { label: 'Sem destino', href: '', index: undefined, subitems: null },
    { label: 'Parte II', href: '', index: 40, subitems: null },
  ]

  it('devolve o último item que começa em página ≤ atual, inclusive subitens', () => {
    expect(tocLabelForPage(toc, 0)).toBe('Capa')
    expect(tocLabelForPage(toc, 5)).toBe('Parte I')
    expect(tocLabelForPage(toc, 6)).toBe('Cap 1')
    expect(tocLabelForPage(toc, 19)).toBe('Cap 1')
    expect(tocLabelForPage(toc, 25)).toBe('Cap 2')
    expect(tocLabelForPage(toc, 400)).toBe('Parte II')
  })

  it('sem sumário ou antes do primeiro item → undefined', () => {
    expect(tocLabelForPage(null, 3)).toBeUndefined()
    expect(tocLabelForPage([], 3)).toBeUndefined()
    expect(tocLabelForPage([{ label: 'Cap', href: '', index: 10, subitems: null }], 3)).toBeUndefined()
  })
})

describe('progressPercentage / pageForFraction', () => {
  it('soma a fração percorrida da página e limita a 0–100', () => {
    expect(progressPercentage(0, 0, 100)).toBe(0)
    expect(progressPercentage(49, 0.5, 100)).toBeCloseTo(49.5)
    expect(progressPercentage(99, 1, 100)).toBe(100)
    expect(progressPercentage(120, 0, 100)).toBe(100)
    expect(progressPercentage(10, -3, 100)).toBeCloseTo(10)
    expect(progressPercentage(10, Number.NaN, 100)).toBeCloseTo(10)
    expect(progressPercentage(5, 0.5, 0)).toBe(0)
  })

  it('pageForFraction mapeia fração para página dentro do documento', () => {
    expect(pageForFraction(0, 200)).toBe(0)
    expect(pageForFraction(0.5, 200)).toBe(100)
    expect(pageForFraction(1, 200)).toBe(199)
    expect(pageForFraction(7, 200)).toBe(199)
    expect(pageForFraction(-1, 200)).toBe(0)
    expect(pageForFraction(0.3, 0)).toBe(0)
  })
})
