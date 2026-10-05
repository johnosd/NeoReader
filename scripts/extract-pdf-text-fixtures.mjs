// Extrai os itens de texto do pdf.js (getTextContent) de PDFs do corpus local e
// grava fixtures JSON em src/__tests__/fixtures/pdf/ — é o que os testes de
// pdfParagraphs consomem (o Vitest/jsdom nunca carrega o pdf.js real, R-008).
//
// Roda no Chromium (o pdf.js precisa de Worker/canvas): um servidor HTTP local
// minúsculo serve o pdf.js vendorizado + o PDF, e o Playwright dirige a página.
//
// Requisito (ferramenta de dev local, NÃO é dependência do app):
//   npm i --no-save playwright   (+ Chromium já baixado pelo Playwright)
//
// Uso:
//   node scripts/extract-pdf-text-fixtures.mjs                  # todos os PDFs de debug-books/pdf, 12 primeiras páginas
//   node scripts/extract-pdf-text-fixtures.mjs --only 1col,2col # só estes
//   node scripts/extract-pdf-text-fixtures.mjs --pages 3-14     # outro intervalo (1-based)
//   node scripts/extract-pdf-text-fixtures.mjs --in <dir>       # outro diretório de PDFs
//   node scripts/extract-pdf-text-fixtures.mjs --only "Livro" --out <dir>  # grava fora do repo (PDFs reais: só para medir, nunca versionar)
//
// Só gere fixtures de PDFs que possam ser versionados (corpus sintético ou
// texto de domínio público): o JSON contém o texto das páginas.

import { createServer } from 'node:http'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pdfjsDir = join(root, 'node_modules/foliate-js/vendor/pdfjs')

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const inDir = resolve(opt('--in', join(root, 'debug-books/pdf')))
const outDir = resolve(opt('--out', join(root, 'src/__tests__/fixtures/pdf')))
const only = opt('--only') ? new Set(opt('--only').split(',')) : null
const [firstPage, lastPage] = opt('--pages', '1-12').split('-').map(Number)

const MIME = { '.mjs': 'text/javascript', '.html': 'text/html', '.pdf': 'application/pdf', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream' }

// Servidor mínimo: /pdfjs/* → pasta vendorizada, /pdf/<nome> → PDF do corpus, / → página vazia.
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  try {
    if (url === '/') {
      res.setHeader('Content-Type', 'text/html')
      return res.end('<!doctype html><meta charset="utf-8"><title>extract</title>')
    }
    let file
    if (url.startsWith('/pdfjs/')) file = join(pdfjsDir, url.slice('/pdfjs/'.length))
    else if (url.startsWith('/pdf/')) file = join(inDir, url.slice('/pdf/'.length))
    if (!file || !resolve(file).startsWith(url.startsWith('/pdfjs/') ? pdfjsDir : inDir)) {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
    res.end(readFileSync(file))
  } catch {
    res.statusCode = 404
    res.end()
  }
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`

const names = readdirSync(inDir)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => basename(f, '.pdf'))
  .filter((n) => !only || only.has(n))

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()

try {
  const page = await browser.newPage()
  await page.goto(origin)
  await page.evaluate(async (o) => {
    window.pdfjs = await import(`${o}/pdfjs/pdf.mjs`)
    window.pdfjs.GlobalWorkerOptions.workerSrc = `${o}/pdfjs/pdf.worker.mjs`
  }, origin)

  for (const name of names) {
    const result = await page.evaluate(
      async ({ o, name, firstPage, lastPage }) => {
        const bytes = new Uint8Array(await (await fetch(`${o}/pdf/${name}.pdf`)).arrayBuffer())
        let pdf
        try {
          pdf = await window.pdfjs.getDocument({
            data: bytes,
            isEvalSupported: false,
            cMapUrl: `${o}/pdfjs/cmaps/`,
            cMapPacked: true,
            standardFontDataUrl: `${o}/pdfjs/standard_fonts/`,
          }).promise
        } catch (e) {
          return { error: `${e.name}: ${e.message}` } // senha.pdf / corrompido.pdf caem aqui
        }
        const round = (n) => Math.round(n * 100) / 100
        const pages = []
        for (let i = firstPage; i <= Math.min(lastPage, pdf.numPages); i++) {
          const p = await pdf.getPage(i)
          const viewport = p.getViewport({ scale: 1 })
          const content = await p.getTextContent()
          pages.push({
            pageIndex: i - 1,
            viewport: { width: round(viewport.width), height: round(viewport.height) },
            items: content.items
              .filter((it) => typeof it.str === 'string') // ignora marcadores de conteúdo (beginMarkedContent etc.)
              .map((it) => ({
                str: it.str,
                transform: it.transform.map(round),
                width: round(it.width),
                height: round(it.height),
                hasEOL: it.hasEOL,
                fontName: it.fontName,
              })),
          })
        }
        const info = await pdf.getMetadata().catch(() => null)
        const outline = await pdf.getOutline().catch(() => null)
        const result = { pageCount: pdf.numPages, info: info?.info ?? null, outlineTopLevel: outline?.length ?? 0, pages }
        await pdf.destroy()
        return result
      },
      { o: origin, name, firstPage, lastPage },
    )

    if (result.error) {
      console.log(`${name}.pdf → ${result.error} (sem fixture)`)
      continue
    }
    const fixture = { source: `${name}.pdf`, pdfjsVersion: '4.7.76', firstPage, ...result }
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(fixture))
    const items = result.pages.reduce((n, p) => n + p.items.length, 0)
    console.log(`${name}.pdf → ${result.pages.length} páginas, ${items} itens, outline=${result.outlineTopLevel}`)
  }
} finally {
  await browser.close()
  server.close()
}
