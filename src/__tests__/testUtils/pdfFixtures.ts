import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRawPageText } from '@/utils/pdfLocator'

// Forma dos JSON gerados por scripts/extract-pdf-text-fixtures.mjs (itens reais do pdf.js getTextContent).
export interface PdfFixtureItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
  fontName: string
}

export interface PdfFixturePage {
  pageIndex: number
  viewport: { width: number; height: number }
  items: PdfFixtureItem[]
}

export interface PdfFixture {
  source: string
  pageCount: number
  firstPage: number
  outlineTopLevel: number
  pages: PdfFixturePage[]
}

export function loadPdfFixture(name: string): PdfFixture {
  // process.cwd() = raiz do projeto no Vitest (import.meta.url é reescrito no ambiente jsdom).
  const path = resolve(process.cwd(), 'src/__tests__/fixtures/pdf', `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as PdfFixture
}

/** Texto bruto (regra do localizador v1) das páginas da fixture, separadas por quebra de linha. */
export function fixtureRawText(name: string, pageIndexes?: number[]): string {
  return loadPdfFixture(name)
    .pages.filter((page) => !pageIndexes || pageIndexes.includes(page.pageIndex))
    .map((page) => buildRawPageText(page.items))
    .join('\n')
}
