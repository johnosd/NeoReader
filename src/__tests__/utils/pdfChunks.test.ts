import { describe, expect, it } from 'vitest'

import { buildPdfChunks, findChunkForPage, PDF_CHUNK_MAX_PAGES, PDF_CHUNK_PAGES } from '@/utils/pdfChunks'

describe('buildPdfChunks — com outline', () => {
  it('cria um trecho por capítulo, cobrindo o livro inteiro sem buracos', () => {
    const chunks = buildPdfChunks(60, [
      { title: 'Intro', pageIndex: 0 },
      { title: 'Cap 1', pageIndex: 10 },
      { title: 'Cap 2', pageIndex: 35 },
    ])
    expect(chunks).toEqual([
      { index: 0, startPage: 0, endPage: 9, label: 'Intro' },
      { index: 1, startPage: 10, endPage: 34, label: 'Cap 1' },
      { index: 2, startPage: 35, endPage: 59, label: 'Cap 2' },
    ])
  })

  it('páginas antes do primeiro capítulo viram um trecho "Páginas X–Y" (1-based)', () => {
    const chunks = buildPdfChunks(30, [{ title: 'Cap 1', pageIndex: 4 }])
    expect(chunks[0]).toEqual({ index: 0, startPage: 0, endPage: 3, label: 'Páginas 1–4' })
    expect(chunks[1]).toEqual({ index: 1, startPage: 4, endPage: 29, label: 'Cap 1' })
  })

  it('subdivide capítulo com mais de 40 páginas em blocos de 20', () => {
    const chunks = buildPdfChunks(100, [{ title: 'Gigante', pageIndex: 0 }])
    expect(PDF_CHUNK_MAX_PAGES).toBe(40)
    expect(PDF_CHUNK_PAGES).toBe(20)
    expect(chunks.map((c) => [c.startPage, c.endPage, c.label])).toEqual([
      [0, 19, 'Gigante (1/5)'],
      [20, 39, 'Gigante (2/5)'],
      [40, 59, 'Gigante (3/5)'],
      [60, 79, 'Gigante (4/5)'],
      [80, 99, 'Gigante (5/5)'],
    ])
  })

  it('capítulo com exatamente 40 páginas não é subdividido; 41 é', () => {
    expect(buildPdfChunks(40, [{ title: 'A', pageIndex: 0 }])).toHaveLength(1)
    expect(buildPdfChunks(41, [{ title: 'A', pageIndex: 0 }])).toHaveLength(3) // 20 + 20 + 1
  })

  it('ordena outline fora de ordem e ignora destinos fora do documento', () => {
    const chunks = buildPdfChunks(30, [
      { title: 'Cap 2', pageIndex: 15 },
      { title: 'Fantasma', pageIndex: 99 },
      { title: 'Negativo', pageIndex: -3 },
      { title: 'Cap 1', pageIndex: 0 },
    ])
    expect(chunks.map((c) => c.label)).toEqual(['Cap 1', 'Cap 2'])
    expect(chunks[0].endPage).toBe(14)
  })

  it('vários itens na mesma página → fica o primeiro', () => {
    const chunks = buildPdfChunks(20, [
      { title: 'Parte I', pageIndex: 0 },
      { title: 'Cap 1', pageIndex: 0 },
      { title: 'Cap 2', pageIndex: 10 },
    ])
    expect(chunks.map((c) => c.label)).toEqual(['Parte I', 'Cap 2'])
  })

  it('título vazio vira trecho "Páginas X–Y"', () => {
    expect(buildPdfChunks(10, [{ title: '   ', pageIndex: 0 }])[0].label).toBe('Páginas 1–10')
  })
})

describe('buildPdfChunks — sem outline', () => {
  it.each([null, undefined, []])('divide em blocos de 20 páginas (%j)', (outline) => {
    const chunks = buildPdfChunks(45, outline)
    expect(chunks).toEqual([
      { index: 0, startPage: 0, endPage: 19, label: 'Páginas 1–20' },
      { index: 1, startPage: 20, endPage: 39, label: 'Páginas 21–40' },
      { index: 2, startPage: 40, endPage: 44, label: 'Páginas 41–45' },
    ])
  })

  it('PDF curto vira um trecho só', () => {
    expect(buildPdfChunks(5, null)).toEqual([{ index: 0, startPage: 0, endPage: 4, label: 'Páginas 1–5' }])
  })

  it('PDF de 1000 páginas: 50 blocos cobrindo tudo', () => {
    const chunks = buildPdfChunks(1000, null)
    expect(chunks).toHaveLength(50)
    expect(chunks.at(-1)?.endPage).toBe(999)
  })

  it('aceita rótulo de página customizado (i18n)', () => {
    const chunks = buildPdfChunks(5, null, (a, b) => `Pages ${a}-${b}`)
    expect(chunks[0].label).toBe('Pages 1-5')
  })

  it.each([0, -1, 1.5, Number.NaN])('pageCount inválido (%j) → nenhum trecho', (pageCount) => {
    expect(buildPdfChunks(pageCount, null)).toEqual([])
  })
})

describe('buildPdfChunks — invariantes', () => {
  it('trechos são contíguos, em ordem, com índices sequenciais', () => {
    const chunks = buildPdfChunks(333, [
      { title: 'A', pageIndex: 7 },
      { title: 'B', pageIndex: 120 },
      { title: 'C', pageIndex: 121 },
    ])
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i)
      expect(chunk.startPage).toBe(i === 0 ? 0 : chunks[i - 1].endPage + 1)
      expect(chunk.endPage).toBeGreaterThanOrEqual(chunk.startPage)
    })
    expect(chunks.at(-1)?.endPage).toBe(332)
  })
})

describe('findChunkForPage', () => {
  const chunks = buildPdfChunks(45, null)

  it('acha o trecho que contém a página', () => {
    expect(findChunkForPage(chunks, 0)?.index).toBe(0)
    expect(findChunkForPage(chunks, 19)?.index).toBe(0)
    expect(findChunkForPage(chunks, 20)?.index).toBe(1)
    expect(findChunkForPage(chunks, 44)?.index).toBe(2)
  })

  it('devolve null fora do documento', () => {
    expect(findChunkForPage(chunks, 45)).toBeNull()
    expect(findChunkForPage(chunks, -1)).toBeNull()
  })
})
