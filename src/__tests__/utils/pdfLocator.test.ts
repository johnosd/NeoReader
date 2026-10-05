import { describe, expect, it } from 'vitest'

import { createBookmarkSyncKey } from '@/services/BookmarkDriveSyncModel'
import {
  arePdfPointsEqual,
  buildRawPage,
  buildRawPageText,
  comparePdfPoints,
  formatPdfPoint,
  formatPdfRange,
  getPdfLocatorStart,
  isPdfLocator,
  parsePdfLocator,
  parsePdfPoint,
  parsePdfRange,
  type PdfPoint,
} from '@/utils/pdfLocator'

describe('pdfLocator — formato e parse', () => {
  it('formata e faz parse de um ponto (round-trip)', () => {
    const point: PdfPoint = { pageIndex: 119, offset: 842 }
    const text = formatPdfPoint(point)
    expect(text).toBe('neopdf:v1;p=119;o=842')
    expect(parsePdfPoint(text)).toEqual(point)
    expect(parsePdfLocator(text)).toEqual({ kind: 'point', point })
  })

  it('formata e faz parse de um intervalo, inclusive entre páginas', () => {
    const range = { start: { pageIndex: 4, offset: 1200 }, end: { pageIndex: 5, offset: 37 } }
    const text = formatPdfRange(range)
    expect(text).toBe('neopdf:v1;p=4;o=1200,p=5;o=37')
    expect(parsePdfRange(text)).toEqual(range)
    expect(parsePdfLocator(text)).toEqual({ kind: 'range', range })
  })

  it('página sem texto usa offset 0', () => {
    expect(formatPdfPoint({ pageIndex: 7, offset: 0 })).toBe('neopdf:v1;p=7;o=0')
  })

  it('parsePdfPoint rejeita intervalo e parsePdfRange rejeita ponto', () => {
    expect(parsePdfPoint('neopdf:v1;p=1;o=2,p=3;o=4')).toBeNull()
    expect(parsePdfRange('neopdf:v1;p=1;o=2')).toBeNull()
  })

  it.each([
    '',
    'neopdf:',
    'neopdf:v1;',
    'neopdf:v1;p=1',
    'neopdf:v1;p=-1;o=0',
    'neopdf:v1;p=1.5;o=0',
    'neopdf:v1;p=1e3;o=0',
    'neopdf:v1;p= 1;o=0',
    'neopdf:v1;p=a;o=0',
    'neopdf:v1;o=0;p=1',
    'neopdf:v1;p=1;o=2,p=3;o=4,p=5;o=6',
    'neopdf:v1;p=1;o=2,',
    'neopdf:v2;p=1;o=2', // versão futura: não entendemos o conteúdo
    'epubcfi(/6/4!/4/2/2:0)',
    'p=1;o=2',
  ])('devolve null para string inválida: %j', (value) => {
    expect(parsePdfLocator(value)).toBeNull()
  })

  it('devolve null para null/undefined', () => {
    expect(parsePdfLocator(null)).toBeNull()
    expect(parsePdfLocator(undefined)).toBeNull()
  })

  it('format lança para ponto inválido', () => {
    expect(() => formatPdfPoint({ pageIndex: -1, offset: 0 })).toThrow(RangeError)
    expect(() => formatPdfPoint({ pageIndex: 0, offset: 1.5 })).toThrow(RangeError)
    expect(() => formatPdfRange({ start: { pageIndex: 0, offset: 0 }, end: { pageIndex: Number.NaN, offset: 0 } })).toThrow(RangeError)
  })

  it('getPdfLocatorStart devolve o início de ponto ou intervalo', () => {
    expect(getPdfLocatorStart('neopdf:v1;p=3;o=10')).toEqual({ pageIndex: 3, offset: 10 })
    expect(getPdfLocatorStart('neopdf:v1;p=3;o=10,p=4;o=2')).toEqual({ pageIndex: 3, offset: 10 })
    expect(getPdfLocatorStart('epubcfi(/6/4)')).toBeNull()
  })
})

describe('pdfLocator — isPdfLocator', () => {
  it('distingue localizador PDF de CFI do EPUB', () => {
    expect(isPdfLocator('neopdf:v1;p=0;o=0')).toBe(true)
    expect(isPdfLocator('neopdf:v9;whatever')).toBe(true) // reconhece o prefixo mesmo de versão futura
    expect(isPdfLocator('epubcfi(/6/4!/4/2/2:0)')).toBe(false)
    expect(isPdfLocator('')).toBe(false)
    expect(isPdfLocator(null)).toBe(false)
    expect(isPdfLocator(undefined)).toBe(false)
  })
})

describe('pdfLocator — ordenação e igualdade', () => {
  it('ordena por página e depois por offset', () => {
    const points: PdfPoint[] = [
      { pageIndex: 2, offset: 5 },
      { pageIndex: 1, offset: 900 },
      { pageIndex: 2, offset: 0 },
      { pageIndex: 0, offset: 10 },
    ]
    const sorted = [...points].sort(comparePdfPoints)
    expect(sorted).toEqual([
      { pageIndex: 0, offset: 10 },
      { pageIndex: 1, offset: 900 },
      { pageIndex: 2, offset: 0 },
      { pageIndex: 2, offset: 5 },
    ])
  })

  it('compara estruturalmente', () => {
    expect(arePdfPointsEqual({ pageIndex: 1, offset: 2 }, { pageIndex: 1, offset: 2 })).toBe(true)
    expect(arePdfPointsEqual({ pageIndex: 1, offset: 2 }, { pageIndex: 1, offset: 3 })).toBe(false)
    expect(comparePdfPoints({ pageIndex: 1, offset: 2 }, { pageIndex: 1, offset: 2 })).toBe(0)
  })
})

describe('pdfLocator — texto bruto da página (versão 1)', () => {
  it('concatena os itens e insere \\n depois de hasEOL, sem nenhuma outra normalização', () => {
    const items = [
      { str: 'The ex', hasEOL: false },
      { str: 'tra', hasEOL: false },
      { str: 'ordinary ', hasEOL: true },
      { str: '', hasEOL: true },
      { str: 'next line', hasEOL: false },
    ]
    expect(buildRawPageText(items)).toBe('The extraordinary \n\nnext line')
  })

  it('devolve o offset inicial de cada item', () => {
    const { text, itemStarts } = buildRawPage([
      { str: 'ab', hasEOL: true },
      { str: 'cd' },
      { str: 'ef', hasEOL: true },
      { str: 'g' },
    ])
    expect(text).toBe('ab\ncdef\ng')
    expect(itemStarts).toEqual([0, 3, 5, 8])
    // cada início aponta para o texto do próprio item
    expect(text.slice(itemStarts[2], itemStarts[2] + 2)).toBe('ef')
  })

  it('página sem itens → texto vazio', () => {
    expect(buildRawPageText([])).toBe('')
  })
})

describe('pdfLocator — sync de marcadores (DI-006)', () => {
  it('createBookmarkSyncKey gera chave estável e distinta para localizadores', () => {
    const a = formatPdfPoint({ pageIndex: 10, offset: 4 })
    const b = formatPdfPoint({ pageIndex: 10, offset: 5 })
    expect(createBookmarkSyncKey(a)).toBe(createBookmarkSyncKey(a))
    expect(createBookmarkSyncKey(a)).not.toBe(createBookmarkSyncKey(b))
    expect(createBookmarkSyncKey(a)).toMatch(/^cfi_/)
    // espaços em volta não mudam a chave
    expect(createBookmarkSyncKey(`  ${a} `)).toBe(createBookmarkSyncKey(a))
  })
})
