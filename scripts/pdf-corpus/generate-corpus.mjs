// Gera o corpus PDF SINTÉTICO em debug-books/pdf/ (pasta ignorada pelo git).
//
// Por que sintético: PDFs de livros reais têm copyright (não dá para versionar
// fixtures extraídos deles) e os PDFs pessoais da máquina têm dados sensíveis.
// O texto aqui é gerado por vocabulário próprio e impresso pelo Chromium
// (page.pdf), com layouts que exercitam as heurísticas de pdfParagraphs:
// cabeçalho/rodapé repetidos, recuo vs. espaçamento entre parágrafos, hifenização
// de fim de linha, 2 colunas, tabelas/figuras, páginas só-imagem.
//
// Limitação honesta: todos os PDFs saem do mesmo "produtor" (Chromium/Skia).
// PDFs de LaTeX/InDesign/Word agrupam itens de texto de outro jeito — para a
// calibragem final (T015), copie 2-3 PDFs reais seus para debug-books/pdf/.
//
// Requisitos (ferramentas de dev locais, NÃO são dependências do app):
//   - `playwright` instalado (npm i --no-save playwright) + Chromium baixado
//   - Python com `pypdf` (pip install pypdf)
//
// Uso: node scripts/pdf-corpus/generate-corpus.mjs [--only 1col,2col] [--skip-grande]

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../../debug-books/pdf')
const POSTPROCESS = join(here, 'postprocess.py')

const args = process.argv.slice(2)
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? '').split(',')) : null
const skipGrande = args.includes('--skip-grande')
const wants = (name) => !only || only.has(name)

// ---------------------------------------------------------------------------
// Texto sintético determinístico (mesma semente → mesmo PDF)
// ---------------------------------------------------------------------------

// mulberry32: PRNG minúsculo; Math.random não aceita semente.
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// "·" marca pontos de hifenização; vira soft hyphen (&shy;) no HTML — o Chromium
// só imprime o "-" quando a palavra realmente quebra ali, como num livro real.
const LANGS = {
  en: {
    lang: 'en',
    subj: ['The old librarian', 'A curious student', 'The committee', 'Every reader', 'The young engineer', 'Our neighbour', 'The traveller', 'A careful editor', 'The research team', 'Her grandmother'],
    verb: ['considered', 'explained', 'remembered', 'documented', 'questioned', 'rearranged', 'described', 'appreciated', 'investigated', 'rediscovered'],
    obj: [
      'the ex·tra·or·di·nary re·spon·si·bil·i·ty of the author',
      'an un·der·stand·ing of the com·mu·ni·ca·tion between neigh·bour·ing towns',
      'the small de·tails of that long con·ver·sa·tion',
      'a for·got·ten story hid·den in the ar·chives',
      'the true mean·ing of the words they had in·her·it·ed',
      'the way time quiet·ly changes the peo·ple around us',
      'a lit·tle known path be·tween the high moun·tains',
      'the silent rules of life in a small com·mu·ni·ty',
    ],
    conn: ['because', 'although', 'while', 'after', 'whenever'],
    title: ['The Quiet Archive', 'A Map of Small Things', 'Letters from the Harbour', 'The Slow Season', 'Notes on Patience'],
    chapterWords: ['Beginnings', 'The Long Road', 'A Careful Reading', 'What the Archive Kept', 'Winter Letters', 'The Market Town', 'Unfinished Maps', 'A Change of Plans', 'Quiet Hours', 'The Last Page'],
    sectionWords: ['First impressions', 'The question of memory', 'On method', 'A short digression', 'Returning home', 'Small evidence'],
    quote: 'It is not the book that changes, but the reader who comes back to it.',
    chapter: 'Chapter',
  },
  pt: {
    lang: 'pt-BR',
    subj: ['A velha bibliotecária', 'O estudante curioso', 'A comissão', 'Cada leitor', 'O jovem engenheiro', 'Minha vizinha', 'O viajante', 'A editora cuidadosa', 'A equipe de pesquisa', 'A avó dela'],
    verb: ['considerou', 'explicou', 'lembrou', 'documentou', 'questionou', 'reorganizou', 'descreveu', 'apreciou', 'investigou', 'redescobriu'],
    obj: [
      'a ex·tra·or·di·ná·ria res·pon·sa·bi·li·da·de do autor',
      'a com·pre·en·são da co·mu·ni·ca·ção entre as ci·da·des vi·zi·nhas',
      'os pe·que·nos de·ta·lhes daquela longa con·ver·sa',
      'uma his·tó·ria es·que·ci·da nos ar·qui·vos',
      'o sig·ni·fi·ca·do ver·da·dei·ro das pa·la·vras que her·da·ram',
      'a ma·nei·ra como o tem·po muda as pes·soas ao nosso redor',
      'um ca·mi·nho pou·co co·nhe·ci·do entre as mon·ta·nhas',
      'as re·gras si·len·ci·o·sas da vida em uma pe·que·na co·mu·ni·da·de',
    ],
    conn: ['porque', 'embora', 'enquanto', 'depois que', 'sempre que'],
    title: ['O Arquivo Silencioso', 'Um Mapa das Coisas Pequenas', 'Cartas do Porto'],
    chapterWords: ['Os Começos', 'A Estrada Longa', 'Uma Leitura Cuidadosa', 'O Que o Arquivo Guardou', 'Cartas de Inverno', 'A Cidade do Mercado'],
    sectionWords: ['Primeiras impressões', 'A questão da memória', 'Sobre o método', 'Uma breve digressão'],
    quote: 'Não é o livro que muda, mas o leitor que volta a ele.',
    chapter: 'Capítulo',
  },
  es: {
    lang: 'es-ES',
    subj: ['La vieja bibliotecaria', 'El estudiante curioso', 'La comisión', 'Cada lector', 'El joven ingeniero', 'Mi vecina', 'El viajero', 'La editora cuidadosa', 'El equipo de investigación', 'Su abuela'],
    verb: ['consideró', 'explicó', 'recordó', 'documentó', 'cuestionó', 'reorganizó', 'describió', 'apreció', 'investigó', 'redescubrió'],
    obj: [
      'la ex·tra·or·di·na·ria res·pon·sa·bi·li·dad del autor',
      'la com·pren·sión de la co·mu·ni·ca·ción entre las ciu·da·des ve·ci·nas',
      'los pe·que·ños de·ta·lles de aquella lar·ga con·ver·sa·ción',
      'una his·to·ria ol·vi·da·da en los ar·chi·vos',
      'el sig·ni·fi·ca·do ver·da·de·ro de las pa·la·bras que he·re·da·ron',
      'la for·ma en que el tiem·po cam·bia a las per·so·nas a nues·tro al·re·de·dor',
      'un ca·mi·no po·co co·no·ci·do en·tre las mon·ta·ñas',
      'las re·glas si·len·cio·sas de la vi·da en una pe·que·ña co·mu·ni·dad',
    ],
    conn: ['porque', 'aunque', 'mientras', 'después de que', 'siempre que'],
    title: ['El Archivo Silencioso', 'Un Mapa de las Cosas Pequeñas', 'Cartas del Puerto'],
    chapterWords: ['Los Comienzos', 'El Camino Largo', 'Una Lectura Cuidadosa', 'Lo Que Guardó el Archivo', 'Cartas de Invierno', 'La Ciudad del Mercado'],
    sectionWords: ['Primeras impresiones', 'La cuestión de la memoria', 'Sobre el método', 'Una breve digresión'],
    quote: 'No es el libro el que cambia, sino el lector que vuelve a él.',
    chapter: 'Capítulo',
  },
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)]
const shy = (s) => s.replaceAll('·', '&shy;')
const plain = (s) => s.replaceAll('·', '')

function sentence(L, rng) {
  let s = `${pick(rng, L.subj)} ${pick(rng, L.verb)} ${pick(rng, L.obj)}`
  if (rng() < 0.6) s += `, ${pick(rng, L.conn)} ${pick(rng, L.subj).toLowerCase()} ${pick(rng, L.verb)} ${pick(rng, L.obj)}`
  return shy(s + '.')
}

function paragraph(L, rng, sentences = 4 + Math.floor(rng() * 4)) {
  return Array.from({ length: sentences }, () => sentence(L, rng)).join(' ')
}

// ---------------------------------------------------------------------------
// HTML dos documentos
// ---------------------------------------------------------------------------

const BASE_CSS = `
  @page { margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; color: #111 }
  h1 { font-size: 20pt; margin: 0 0 14pt; page-break-before: always; page-break-after: avoid }
  h2 { font-size: 14pt; margin: 16pt 0 8pt; page-break-after: avoid }
  p { margin: 0; text-align: justify }
  /* capítulos ímpares: recuo de primeira linha; pares: espaçamento entre parágrafos */
  .indent p { text-indent: 1.4em }
  .indent p:first-of-type, .indent h2 + p { text-indent: 0 }
  .spaced p { margin-bottom: 8pt }
  blockquote { margin: 10pt 1.5em; font-style: italic; font-size: 10pt }
  .center { text-align: center }
`

function bookHtml(L, { chapters, seed, title }) {
  const rng = makeRng(seed)
  const parts = [
    `<section class="center" style="padding-top:34%"><h1 style="page-break-before:avoid;font-size:26pt">${title}</h1><p class="center">A synthetic corpus book</p></section>`,
    `<section style="page-break-before:always;font-size:9pt"><p>Copyright © 2026 NeoReader test corpus. ISBN 978-0-306-40615-7.</p><p>${shy(paragraph(L, rng, 2))}</p></section>`,
  ]
  for (let c = 1; c <= chapters; c++) {
    const style = c % 2 ? 'indent' : 'spaced'
    const chTitle = L.chapterWords[(c - 1) % L.chapterWords.length]
    let body = `<h1>${L.chapter} ${c}: ${chTitle}</h1>`
    for (let s = 0; s < 3; s++) {
      body += `<h2>${c}.${s + 1} ${pick(rng, L.sectionWords)}</h2>`
      for (let p = 0; p < 4; p++) {
        body += `<p>${paragraph(L, rng)}</p>`
        if (p === 1 && s === 1) body += `<blockquote>${L.quote}</blockquote>`
      }
    }
    parts.push(`<section class="${style}">${body}</section>`)
  }
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><title>${plain(title)}</title><style>${BASE_CSS}</style></head><body>${parts.join('')}</body></html>`
}

function twoColHtml(L, seed) {
  const rng = makeRng(seed)
  let body = `<header style="column-span:all;margin-bottom:10pt"><h1 style="page-break-before:avoid;font-size:18pt;text-align:center">Journal of Imaginary Results</h1><p class="center"><em>Abstract.</em> ${paragraph(L, rng, 3)}</p></header>`
  for (let s = 1; s <= 10; s++) {
    body += `<h2>${s}. ${pick(rng, L.sectionWords)}</h2>`
    for (let p = 0; p < 5; p++) body += `<p>${paragraph(L, rng, 5)}</p>`
  }
  const css = `${BASE_CSS} body{font-size:9.5pt} article{column-count:2;column-gap:8mm} h2{font-size:11pt;margin-top:10pt} p{margin-bottom:6pt}`
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><title>Journal of Imaginary Results</title><style>${css}</style></head><body><article>${body}</article></body></html>`
}

function tablesHtml(L, seed) {
  const rng = makeRng(seed)
  const pages = []
  for (let n = 1; n <= 8; n++) {
    const rows = Array.from({ length: 6 }, (_, r) => `<tr><td>Sample ${n}.${r + 1}</td><td>${(rng() * 100).toFixed(2)}</td><td>${(rng() * 10).toFixed(3)}</td><td>${Math.floor(rng() * 900 + 100)}</td></tr>`).join('')
    const bars = Array.from({ length: 5 }, (_, i) => {
      const h = 20 + Math.floor(rng() * 90)
      return `<rect x="${20 + i * 40}" y="${130 - h}" width="28" height="${h}" fill="#4a6fa5"/><text x="${24 + i * 40}" y="145" font-size="9">Q${i + 1}</text>`
    }).join('')
    pages.push(`<section style="page-break-before:${n === 1 ? 'avoid' : 'always'}">
      <h2>Table ${n}. Measurements and results</h2>
      <p>${paragraph(L, rng, 3)}</p>
      <table><thead><tr><th>Sample</th><th>Value</th><th>Error</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="cap">Table ${n}. Synthetic measurements for the corpus.</p>
      <svg width="240" height="155" viewBox="0 0 240 155" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="155" fill="#f4f4f4"/>${bars}</svg>
      <p class="cap">Figure ${n}. Quarterly values (vector chart with text labels).</p>
      <p>${paragraph(L, rng, 3)}</p>
      <p class="formula">E = mc<sup>2</sup>, &nbsp; x<sub>1</sub><sup>2</sup> + x<sub>2</sub><sup>2</sup> = r<sup>2</sup>, &nbsp; ∑ a<sub>i</sub> ≤ ∫ f(x) dx</p>
      <img alt="figure" id="img${n}" width="240" height="120">
    </section>`)
  }
  const css = `${BASE_CSS} table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt} td,th{border:1px solid #333;padding:3pt 6pt;text-align:right} th{background:#e5e5e5} .cap{font-size:9pt;font-style:italic;margin:4pt 0 10pt} .formula{text-align:center;margin:10pt 0}`
  return `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><title>Tables, Figures and Formulas</title><style>${css}</style></head><body>${pages.join('')}</body></html>`
}

// ---------------------------------------------------------------------------
// Impressão
// ---------------------------------------------------------------------------

async function printHtml(browser, html, { format = 'A5', margin, header, footer, outline = false } = {}) {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  // Imagens do documento "tabelas": desenhadas em canvas e viram PNG (raster no PDF).
  await page.evaluate(() => {
    document.querySelectorAll('img[id^="img"]').forEach((img, i) => {
      const c = document.createElement('canvas')
      c.width = 240
      c.height = 120
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0, 0, 240, 120)
      grad.addColorStop(0, '#d9a441')
      grad.addColorStop(1, '#2f6f8f')
      g.fillStyle = grad
      g.fillRect(0, 0, 240, 120)
      g.fillStyle = '#fff'
      g.font = '16px sans-serif'
      g.fillText(`raster ${i + 1}`, 10, 24) // texto rasterizado: NÃO deve aparecer na camada de texto
      img.src = c.toDataURL('image/png')
    })
  })
  const pdf = await page.pdf({
    format,
    margin: margin ?? { top: '20mm', bottom: '20mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: Boolean(header || footer),
    headerTemplate: header ?? '<span></span>',
    footerTemplate: footer ?? '<span></span>',
    printBackground: true,
    outline,
    tagged: outline, // o Chromium só gera o outline (sumário) em PDF "tagged"
  })
  await page.close()
  return pdf
}

const headerTpl = (text) => `<div style="font-size:8px;width:100%;text-align:center;color:#555;font-family:Georgia,serif">${text}</div>`
const footerTpl = '<div style="font-size:9px;width:100%;text-align:center;font-family:Georgia,serif"><span class="pageNumber"></span></div>'

// "Escaneado": renderiza páginas de texto, tira screenshot e imprime só as imagens
// — o PDF resultante não tem nenhuma camada de texto.
async function scannedPdf(browser, L, seed, pageCount) {
  const rng = makeRng(seed)
  const page = await browser.newPage({ viewport: { width: 560, height: 794 }, deviceScaleFactor: 1.5 })
  const shots = []
  for (let i = 0; i < pageCount; i++) {
    const paras = Array.from({ length: 4 }, () => `<p>${paragraph(L, rng, 4)}</p>`).join('')
    await page.setContent(`<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><style>${BASE_CSS}
      body{background:#efe9dc;padding:48px 40px;width:560px;height:794px;overflow:hidden;filter:contrast(.92) grayscale(.3)} p{margin-bottom:8pt}</style></head><body>${paras}</body></html>`)
    shots.push((await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'))
  }
  const imgs = shots.map((b) => `<img src="data:image/jpeg;base64,${b}" style="display:block;width:148mm;height:210mm;page-break-after:always">`).join('')
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><title>Scanned Archive</title><style>@page{margin:0} body{margin:0}</style></head><body>${imgs}</body></html>`)
  const pdf = await page.pdf({ format: 'A5', margin: { top: '0', bottom: '0', left: '0', right: '0' }, printBackground: true })
  await page.close()
  return pdf
}

// Base do "grande": 100 páginas, cada uma com uma imagem de ruído (JPEG
// incompressível) — o tamanho/memória vem das imagens, como em PDFs pesados reais.
async function heavyBasePdf(browser, L, seed, pages, imgW, imgH, quality) {
  const rng = makeRng(seed)
  const page = await browser.newPage()
  let body = ''
  for (let i = 0; i < pages; i++) {
    body += `<section style="page-break-after:always"><h2>Page ${i + 1}</h2><p>${paragraph(L, rng, 3)}</p><img id="n${i}" width="${imgW}" height="${imgH}" style="display:block;height:95mm;width:auto"></section>`
  }
  await page.setContent(`<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><title>Big</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`)
  await page.evaluate(
    ({ pages, imgW, imgH, quality }) => {
      for (let i = 0; i < pages; i++) {
        const c = document.createElement('canvas')
        c.width = imgW
        c.height = imgH
        const g = c.getContext('2d')
        const data = g.createImageData(imgW, imgH)
        crypto.getRandomValues(data.data.subarray(0, 65536)) // getRandomValues limita a 64 KiB por chamada
        for (let o = 65536; o < data.data.length; o += 65536) {
          crypto.getRandomValues(data.data.subarray(o, Math.min(o + 65536, data.data.length)))
        }
        for (let p = 3; p < data.data.length; p += 4) data.data[p] = 255
        g.putImageData(data, 0, 0)
        document.getElementById(`n${i}`).src = c.toDataURL('image/jpeg', quality)
      }
    },
    { pages, imgW, imgH, quality },
  )
  const pdf = await page.pdf({ format: 'A5', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }, printBackground: true })
  await page.close()
  return pdf
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

function py(...pyArgs) {
  const r = spawnSync('python', [POSTPROCESS, ...pyArgs], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`postprocess.py falhou: ${pyArgs.join(' ')}`)
}

const mb = (path) => `${(statSync(path).size / 1048576).toFixed(1)} MB`

mkdirSync(OUT_DIR, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'pdf-corpus-'))
const browser = await chromium.launch()

try {
  const out = (name) => join(OUT_DIR, name)
  const raw = (name) => join(tmp, name)

  // 1col: livro nascido digital, com sumário (outline), cabeçalho/rodapé repetidos e ISBN na copyright.
  if (wants('1col') || wants('misto') || wants('semmeta') || wants('senha')) {
    const html = bookHtml(LANGS.en, { chapters: 10, seed: 1, title: 'The Quiet Archive' })
    writeFileSync(raw('1col.pdf'), await printHtml(browser, html, { header: headerTpl('The Quiet Archive'), footer: footerTpl, outline: true }))
    py('meta', raw('1col.pdf'), out('1col.pdf'), '--title', 'The Quiet Archive', '--author', 'Ada Corpus')
    console.log('1col.pdf', mb(out('1col.pdf')))
  }
  // 1col em pt/es: detecção de idioma. O pt fica sem /Lang (detecção); o es declara /Lang (caminho dos metadados).
  if (wants('1col-pt')) {
    const html = bookHtml(LANGS.pt, { chapters: 4, seed: 2, title: 'O Arquivo Silencioso' })
    writeFileSync(raw('1col-pt.pdf'), await printHtml(browser, html, { header: headerTpl('O Arquivo Silencioso'), footer: footerTpl, outline: true }))
    py('meta', raw('1col-pt.pdf'), out('1col-pt.pdf'), '--title', 'O Arquivo Silencioso', '--author', 'Ada Corpus')
    console.log('1col-pt.pdf', mb(out('1col-pt.pdf')))
  }
  if (wants('1col-es')) {
    const html = bookHtml(LANGS.es, { chapters: 4, seed: 3, title: 'El Archivo Silencioso' })
    writeFileSync(raw('1col-es.pdf'), await printHtml(browser, html, { header: headerTpl('El Archivo Silencioso'), footer: footerTpl, outline: true }))
    py('meta', raw('1col-es.pdf'), out('1col-es.pdf'), '--title', 'El Archivo Silencioso', '--author', 'Ada Corpus', '--lang', 'es-ES')
    console.log('1col-es.pdf', mb(out('1col-es.pdf')))
  }
  if (wants('2col')) {
    writeFileSync(raw('2col.pdf'), await printHtml(browser, twoColHtml(LANGS.en, 4), { format: 'A4', margin: { top: '22mm', bottom: '22mm', left: '16mm', right: '16mm' }, header: headerTpl('Journal of Imaginary Results'), footer: footerTpl }))
    py('meta', raw('2col.pdf'), out('2col.pdf'), '--title', 'Journal of Imaginary Results', '--author', 'Grace Corpus')
    console.log('2col.pdf', mb(out('2col.pdf')))
  }
  if (wants('tabelas')) {
    writeFileSync(raw('tabelas.pdf'), await printHtml(browser, tablesHtml(LANGS.en, 5), { footer: footerTpl }))
    py('meta', raw('tabelas.pdf'), out('tabelas.pdf'), '--title', 'Tables, Figures and Formulas', '--author', 'Grace Corpus')
    console.log('tabelas.pdf', mb(out('tabelas.pdf')))
  }
  if (wants('escaneado') || wants('misto')) {
    writeFileSync(raw('escaneado.pdf'), await scannedPdf(browser, LANGS.en, 6, 8))
    py('meta', raw('escaneado.pdf'), out('escaneado.pdf'), '--title', 'Scanned Archive')
    console.log('escaneado.pdf', mb(out('escaneado.pdf')))
  }
  if (wants('misto')) {
    // 6 páginas de texto + 3 escaneadas + 6 de texto: recursos de texto só nas páginas com texto.
    py('merge', raw('misto.pdf'), `${out('1col.pdf')}:3-8`, `${out('escaneado.pdf')}:1-3`, `${out('1col.pdf')}:9-14`)
    py('meta', raw('misto.pdf'), out('misto.pdf'), '--title', 'Mixed Pages', '--author', 'Ada Corpus')
    console.log('misto.pdf', mb(out('misto.pdf')))
  }
  if (wants('semmeta')) {
    py('merge', raw('semmeta-in.pdf'), `${out('1col.pdf')}:3-6`)
    py('strip', raw('semmeta-in.pdf'), out('semmeta.pdf'))
    console.log('semmeta.pdf', mb(out('semmeta.pdf')))
  }
  if (wants('senha')) {
    py('merge', raw('senha-in.pdf'), `${out('1col.pdf')}:1-6`)
    py('encrypt', raw('senha-in.pdf'), out('senha.pdf'), '--password', 'neoreader')
    console.log('senha.pdf', mb(out('senha.pdf')), '(senha: neoreader)')
  }
  if (wants('corrompido')) {
    // Cabeçalho PDF válido + lixo: sem xref/objetos → pdf.js lança InvalidPDFException.
    const junk = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 131 + 7) % 251))])
    writeFileSync(out('corrompido.pdf'), junk)
    console.log('corrompido.pdf', mb(out('corrompido.pdf')))
  }
  if (wants('naoepdf')) {
    // Extensão .pdf, conteúdo qualquer: detectBookFormat deve devolver null.
    writeFileSync(out('naoepdf.pdf'), 'Isto é só texto, não um PDF.\n'.repeat(50))
    console.log('naoepdf.pdf', mb(out('naoepdf.pdf')))
  }
  if (wants('grande') && !skipGrande) {
    // 10 blocos distintos de 100 páginas (cada página com uma imagem de ruído nova) = 1000 páginas / ~200 MB.
    // Blocos distintos de propósito: cópias do mesmo bloco seriam deduplicadas pelo pypdf e o arquivo sairia pequeno.
    const bases = []
    for (let i = 0; i < 10; i++) {
      const base = raw(`grande-base-${i}.pdf`)
      writeFileSync(base, await heavyBasePdf(browser, LANGS.en, 100 + i, 100, 440, 610, 0.85))
      bases.push(base)
      console.log(`  bloco ${i + 1}/10:`, mb(base))
    }
    py('merge', raw('grande-merged.pdf'), ...bases)
    py('meta', raw('grande-merged.pdf'), out('grande.pdf'), '--title', 'Big Book', '--author', 'Ada Corpus')
    console.log('grande.pdf', mb(out('grande.pdf')))
  }
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
