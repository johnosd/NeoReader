async (page) => {
  // Highlights de PDF nos dois modos (US5, SC-006), no navegador, com a ReaderScreen e os viewers REAIS.
  //  A. página fiel: seleção na camada de texto → menu → "Destacar" → caixa unificada → gravado como intervalo
  //     neopdf e pintado na página;
  //  B. modo texto: o mesmo highlight aparece (overlay do EpubViewer);
  //  C. modo texto: seleção → "Destacar" → gravado com localizador neopdf;
  //  D. página fiel: o highlight criado no modo texto aparece pintado;
  //  E. intervalo atravessando a virada de página: pintado nas DUAS páginas da página fiel.
  //
  // COMO RODAR: dev server `npx vite --port 5199 --strictPort`, PDF em `debug-books/pdf/` e
  // browser_run_code_unsafe com filename = "scripts/verificacao-visual/pdf-highlight.check.js".
  const BASE = 'http://localhost:5199'
  const OUT = '.playwright-mcp/verificacao-pdf'
  const FILE = '1col.pdf'
  const PAGE = 3 // página de miolo com prosa

  const ctx = await page.context().browser().newContext({ deviceScaleFactor: 2, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))

  const setMode = (id, mode) => p.evaluate(async ([bookId, m]) => {
    const { updateBookSettings } = await import('/src/db/bookSettings.ts')
    await updateBookSettings(bookId, { pdfReadingMode: m })
  }, [id, mode])
  const highlightsInDb = (id) => p.evaluate(async (bookId) => {
    const { getHighlightsByBookId } = await import('/src/db/highlights.ts')
    return (await getHighlightsByBookId(bookId)).map((h) => ({ id: h.id, cfi: h.cfi, paraCfi: h.paraCfi, text: h.text, color: h.color, style: h.style, note: h.note }))
  }, id)
  const open = async (id, mode, startHref) => {
    await setMode(id, mode)
    await p.evaluate(([bookId, href]) => window.__open(bookId, href), [id, startHref ?? null])
    await p.waitForFunction(() => !!document.querySelector('foliate-view')?.renderer?.shadowRoot?.querySelector('iframe'), null, { timeout: 20000 }).catch(() => undefined)
    await p.waitForTimeout(3500)
  }
  // Salva a caixa unificada (cor e estilo padrão) com uma nota.
  const saveComposer = async (note) => {
    const textarea = p.getByPlaceholder(/Write your annotation|Escreva sua anotacao/)
    await textarea.waitFor({ timeout: 5000 })
    await textarea.fill(note)
    // Clique pelo DOM: no viewport móvel o botão fica abaixo da dobra do sheet (fora da área visível).
    await p.getByRole('button', { name: /^(Save|Salvar)$/ }).evaluate((button) => button.click())
    await p.waitForTimeout(1500)
  }
  // Marcas de highlight da página fiel, por página.
  const pageMarks = () => p.evaluate(() => {
    const fxl = document.querySelector('foliate-view').renderer
    const out = {}
    for (const el of fxl.shadowRoot.querySelectorAll('.scroll-page')) {
      const d = el.querySelector('iframe')?.contentDocument
      const marks = d ? [...d.querySelectorAll('span.nr-pdf-hl')] : []
      if (marks.length) out[el.dataset.index] = marks.map((m) => m.textContent).join('')
    }
    return out
  })
  // Overlay do EpubViewer (modo texto): SVG do foliate com a cor do highlight.
  const textModeOverlayColors = () => p.evaluate(() => {
    const renderer = document.querySelector('foliate-view')?.renderer
    const colors = new Set()
    const visit = (root) => {
      for (const el of root.querySelectorAll('svg *')) {
        const fill = el.getAttribute('fill'); const stroke = el.getAttribute('stroke')
        if (fill && fill !== 'none') colors.add(fill.toLowerCase())
        if (stroke && stroke !== 'none') colors.add(stroke.toLowerCase())
      }
      for (const host of root.querySelectorAll('*')) if (host.shadowRoot) visit(host.shadowRoot)
    }
    if (renderer?.shadowRoot) visit(renderer.shadowRoot)
    return [...colors]
  })
  // Hex da cor gravada no highlight (a mesma paleta de src/utils/annotationColors.ts).
  const colorHex = (key) => p.evaluate(async (k) => (await import('/src/utils/annotationColors.ts')).annotationColorHex(k).toLowerCase(), key)

  try {
    await p.goto(BASE + '/scripts/verificacao-visual/harness/e2e.html')
    await p.waitForFunction(() => typeof window.__import === 'function')
    const r = await p.evaluate(([u, n]) => window.__import(u, n), ['/debug-books/pdf/' + encodeURIComponent(FILE), FILE])
    const rows = []

    // ── A. página fiel: selecionar → Destacar → salvar ──
    await open(r.id, 'page', `neopdf:v1;p=${PAGE};o=0`)
    const selected = await p.evaluate((pageIndex) => {
      const fxl = document.querySelector('foliate-view').renderer
      const el = fxl.shadowRoot.querySelectorAll('.scroll-page')[pageIndex]
      const doc = el.querySelector('iframe').contentDocument
      // Primeiro item de prosa com 20+ letras: seleciona os primeiros 18 caracteres dele.
      const span = [...doc.querySelectorAll('.textLayer span[data-nr-item]')].find((s) => (s.textContent ?? '').replace(/[^a-z]/gi, '').length > 20)
      const text = span.firstChild
      const range = doc.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 18)
      doc.getSelection().removeAllRanges()
      doc.getSelection().addRange(range)
      doc.dispatchEvent(new Event('selectionchange'))
      return range.toString()
    }, PAGE)
    await p.waitForTimeout(300)
    const menuOpened = await p.evaluate((pageIndex) => {
      const doc = document.querySelector('foliate-view').renderer.shadowRoot.querySelectorAll('.scroll-page')[pageIndex].querySelector('iframe').contentDocument
      const button = doc.querySelector('[data-nr-pdf-menu-action="highlight"]')
      // Android: o toque no botão desfaz a seleção antes do clique.
      doc.getSelection().removeAllRanges()
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return !!button
    }, PAGE)
    await saveComposer('Nota criada na página fiel')
    const afterA = await highlightsInDb(r.id)
    const hA = afterA.find((h) => h.note === 'Nota criada na página fiel')
    await p.waitForTimeout(800)
    const marksA = await pageMarks()
    await p.screenshot({ path: `${OUT}/highlight-pagina-fiel.png` })
    rows.push(`${menuOpened && hA?.cfi.startsWith(`neopdf:v1;p=${PAGE};o=`) && hA.text === selected.trim() ? 'OK ' : 'FALHOU'} | A. página fiel → gravado: ${hA ? `${hA.cfi} "${hA.text}"` : 'nada'}`)
    rows.push(`${(marksA[PAGE] ?? '').replace(/\s+/g, ' ').trim() === selected.trim() ? 'OK ' : 'FALHOU'} | A. pintado na página ${PAGE}: "${marksA[PAGE] ?? ''}"`)

    // ── B. o mesmo highlight no modo texto ──
    // Cor própria para o highlight da página fiel (nenhuma outra coisa do leitor usa esmeralda).
    await p.evaluate(async (id) => {
      const { updateHighlightAppearance } = await import('/src/db/highlights.ts')
      await updateHighlightAppearance(id, { color: 'emerald', style: 'background' })
    }, hA?.id)
    const emerald = await colorHex('emerald')
    const colorsBefore = await textModeOverlayColors()
    await open(r.id, 'text', hA?.cfi)
    const colorsB = await textModeOverlayColors()
    await p.screenshot({ path: `${OUT}/highlight-modo-texto.png` })
    rows.push(`${colorsB.includes(emerald) && !colorsBefore.includes(emerald) ? 'OK ' : 'FALHOU'} | B. aparece no modo texto (overlay ${emerald}): cores ${colorsB.join(', ') || 'nenhuma'}`)

    // ── C. modo texto: selecionar outro trecho → Destacar → salvar ──
    const selectedC = await p.evaluate(() => {
      const renderer = document.querySelector('foliate-view').renderer
      const host = renderer.getBoundingClientRect()
      for (const frame of renderer.shadowRoot.querySelectorAll('iframe')) {
        const doc = frame.contentDocument
        const frameTop = frame.getBoundingClientRect().top
        // Parágrafo VISÍVEL (posição do iframe + posição dentro dele), longe das bordas da tela.
        const para = [...(doc?.querySelectorAll('p[id^="nrpdf-"]') ?? [])].find((el) => {
          const top = frameTop + el.getBoundingClientRect().top
          return top > host.top + 100 && top < host.bottom - 200 && (el.textContent ?? '').length > 80
        })
        if (!para) continue
        const text = [...para.childNodes].find((n) => n.nodeType === 3 && n.data.trim().length > 40)
        if (!text) continue
        const range = doc.createRange()
        range.setStart(text, 4)
        range.setEnd(text, 26)
        doc.getSelection().removeAllRanges()
        doc.getSelection().addRange(range)
        doc.dispatchEvent(new Event('selectionchange'))
        return range.toString()
      }
      return null
    })
    await p.waitForTimeout(400)
    // Botão "Destacar" do menu de seleção do EpubViewer no iframe em que o menu está aberto. O clique leva as
    // coordenadas do botão: o EpubViewer acha o botão por hit-test (o alvo do evento vem do realm do iframe).
    const clickedC = await p.evaluate(() => {
      const renderer = document.querySelector('foliate-view').renderer
      for (const frame of renderer.shadowRoot.querySelectorAll('iframe')) {
        const menu = frame.contentDocument?.getElementById('nr-selection-menu')
        const button = menu?.querySelector('[data-nr-selection-open-colors]')
        if (button && !menu.hidden) {
          const b = button.getBoundingClientRect()
          button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }))
          return true
        }
      }
      return false
    })
    await saveComposer('Nota criada no modo texto')
    const allC = await highlightsInDb(r.id)
    const hC = allC.find((h) => h.note === 'Nota criada no modo texto')
    rows.push(`${hC?.cfi.startsWith('neopdf:v1;') && selectedC && hC.text.replace(/\s+/g, ' ').trim() === selectedC.replace(/\s+/g, ' ').trim() ? 'OK ' : 'FALHOU'} | C. modo texto → gravado: ${hC ? `${hC.cfi} "${hC.text}"` : `nada (menu clicado: ${clickedC}; no banco: ${allC.map((h) => `${h.note ?? '-'}@${h.cfi}`).join(' | ')})`} (selecionado "${selectedC}")`)

    // ── D. o highlight do modo texto na página fiel ──
    await open(r.id, 'page', hC?.cfi)
    await p.waitForTimeout(800)
    const marksD = await pageMarks()
    const startPageC = Number(/p=(\d+)/.exec(hC?.cfi ?? '')?.[1])
    const paintedD = (marksD[startPageC] ?? '').replace(/\s+/g, ' ').trim()
    rows.push(`${selectedC && paintedD.includes(selectedC.replace(/\s+/g, ' ').trim()) ? 'OK ' : 'FALHOU'} | D. aparece na página fiel (pág. ${startPageC}): "${paintedD}"`)

    // ── E. intervalo atravessando a virada de página: pintado nas duas ──
    const cross = await p.evaluate(async ([bookId, pageIndex]) => {
      const { loadPdfjs } = await import('/src/services/pdf/pdfjs.ts')
      const { buildRawPage, formatPdfRange } = await import('/src/utils/pdfLocator.ts')
      const { addHighlight } = await import('/src/db/highlights.ts')
      const pdfjs = await loadPdfjs()
      const data = await (await fetch('/debug-books/pdf/1col.pdf')).arrayBuffer()
      const pdf = await pdfjs.getDocument({ data }).promise
      const raw = async (i) => buildRawPage((await (await pdf.getPage(i + 1)).getTextContent()).items.filter((it) => typeof it.str === 'string'))
      const a = await raw(pageIndex)
      const b = await raw(pageIndex + 1)
      // Últimos 30 caracteres de texto da página A + primeiros 25 da B (sem o "\n" final).
      const aEnd = a.text.trimEnd().length
      const range = { start: { pageIndex, offset: aEnd - 30 }, end: { pageIndex: pageIndex + 1, offset: 25 } }
      await addHighlight({ bookId, cfi: formatPdfRange(range), paraCfi: formatPdfRange(range).split(',')[0], text: 'virada', color: 'rose', style: 'underline', sectionIndex: 0, percentage: 5, createdAt: new Date() })
      return { a: a.text.slice(aEnd - 30, aEnd), b: b.text.slice(0, 25) }
    }, [r.id, PAGE])
    await open(r.id, 'page', `neopdf:v1;p=${PAGE};o=0`)
    await p.evaluate((pageIndex) => {
      const fxl = document.querySelector('foliate-view').renderer
      fxl.shadowRoot.querySelectorAll('.scroll-page')[pageIndex].scrollIntoView({ block: 'end' })
    }, PAGE)
    await p.waitForTimeout(2500)
    const marksE = await pageMarks()
    await p.screenshot({ path: `${OUT}/highlight-virada.png` })
    const norm = (s) => (s ?? '').replace(/\s+/g, '')
    // O intervalo (como o de um highlight que cruza a virada) passa, no texto bruto, pelo cabeçalho corrido e pelo
    // número da página: só o texto de parágrafo pode ser pintado.
    const bodyA = norm(cross.a).replace(/TheQuietArchive\d*$/, '')
    const paintedHeader = /TheQuietArchive/.test(norm(marksE[PAGE])) || /TheQuietArchive/.test(norm(marksE[PAGE + 1]))
    rows.push(`${norm(marksE[PAGE]).includes(bodyA.slice(-8)) && norm(marksE[PAGE + 1]).includes(norm(cross.b).slice(0, 12)) && !paintedHeader ? 'OK ' : 'FALHOU'} | E. virada de página: pág. ${PAGE} "…${(marksE[PAGE] ?? '').slice(-30)}" + pág. ${PAGE + 1} "${(marksE[PAGE + 1] ?? '').slice(0, 30)}…" | cabeçalho pintado: ${paintedHeader}`)

    if (errors.length) rows.push(`FALHOU | erros na página: ${errors.slice(0, 3).join(' | ')}`)
    const failed = rows.filter((row) => row.startsWith('FALHOU')).length
    return { summary: `${rows.length - failed}/${rows.length} aprovados`, rows }
  } finally {
    await ctx.close()
  }
}
