async (page) => {
  // Navegação até marcadores de PDF pela lista de marcadores (o caminho do usuário), no navegador.
  // Criada depois do bug do device (O Milagre da Manhã, 2026-10-06): o marcador salvava, mas tocar nele na lista
  // não levava ao parágrafo marcado. Usa os MESMOS localizadores gravados no celular.
  // Critério: depois de tocar no marcador, o parágrafo marcado (snippet) começa no topo da área de leitura
  // (entre o topo do leitor e 25% da altura), na página certa.
  //
  // COMO RODAR: dev server `npx vite --port 5199 --strictPort`, PDF em `debug-books/pdf/` e
  // browser_run_code_unsafe com filename = "scripts/verificacao-visual/pdf-marcador.check.js".
  const BASE = 'http://localhost:5199'
  const OUT = '.playwright-mcp/verificacao-pdf'
  const FILE = 'O Milagre Da Manhã.pdf'
  const BOOKMARKS = [
    { cfi: 'neopdf:v1;p=19;o=270', label: 'Epígrafe', pct: 13, snippet: 'A vida começa a cada manhã.' },
    { cfi: 'neopdf:v1;p=25;o=2984', label: 'INTRODUÇÃO', pct: 17, snippet: 'Outono de 2008 Continuei a desenvolver o meu milagre da manhã' },
    { cfi: 'neopdf:v1;p=45;o=296', label: 'CAPÍTULO 3', pct: 30, snippet: 'A cada dia que você e eu acordamos, deparamos com o mesmo desafio' },
  ]
  // Ordem das idas: para frente, para trás e de novo para frente (o estado de rolagem anterior não pode influir).
  const VISITS = [2, 0, 1, 2, 1]
  const ctx = await page.context().browser().newContext({ deviceScaleFactor: 3, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()

  // Onde está, na tela, o 1º span visível cujo texto começa como o snippet (normalizando espaços).
  const locate = (snippet) => p.evaluate((snip) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim()
    const want = norm(snip).slice(0, 18)
    const fxl = document.querySelector('foliate-view').renderer
    const host = fxl.getBoundingClientRect()
    let found = null
    for (const el of fxl.shadowRoot.querySelectorAll('.scroll-page')) {
      const f = el.querySelector('iframe'); const d = f?.contentDocument
      if (!d) continue
      const fr = f.getBoundingClientRect(); const s = fr.width / (f.offsetWidth || fr.width)
      // Junta spans consecutivos: o pdf.js quebra uma linha em vários spans (neste PDF, um por palavra e espaço).
      const spans = [...d.querySelectorAll('.textLayer span[data-nr-item]')]
      for (let i = 0; i < spans.length && !found; i++) {
        const joined = norm(spans.slice(i, i + 40).map((sp) => sp.textContent).join(''))
        if (joined.startsWith(want)) {
          const top = fr.top + spans[i].getBoundingClientRect().top * s
          found = { page: Number(el.dataset.index), item: Number(spans[i].dataset.nrItem), yInReader: Math.round(top - host.top), readerHeight: Math.round(host.height) }
        }
      }
      if (found) break
    }
    // O que está no topo da tela, para o relatório.
    let topText = null
    for (const el of fxl.shadowRoot.querySelectorAll('.scroll-page')) {
      const f = el.querySelector('iframe'); const d = f?.contentDocument
      const fr = f?.getBoundingClientRect()
      if (!d || !fr || fr.bottom < host.top + 5 || fr.top > host.top + 200) continue
      const s = fr.width / (f.offsetWidth || fr.width)
      for (const sp of d.querySelectorAll('.textLayer span[data-nr-item]')) {
        if (!sp.textContent.trim()) continue
        const y = fr.top + sp.getBoundingClientRect().bottom * s
        if (y > host.top + 2) { topText = `p${el.dataset.index}: "${sp.textContent.slice(0, 30)}"`; break }
      }
      if (topText) break
    }
    return { found, topText, scrollTop: Math.round(fxl.scrollTop) }
  }, snippet)

  try {
    await p.goto(BASE + '/scripts/verificacao-visual/harness/e2e.html')
    await p.waitForFunction(() => typeof window.__import === 'function')
    const head = await p.request.fetch(BASE + '/debug-books/pdf/' + encodeURIComponent(FILE), { method: 'HEAD' }).catch(() => null)
    if (!head?.ok() || !(head.headers()['content-type'] ?? '').includes('pdf')) return { summary: `PULADO: ${FILE} não está em debug-books/pdf/` }
    const r = await p.evaluate(([u, n]) => window.__import(u, n), ['/debug-books/pdf/' + encodeURIComponent(FILE), FILE])
    await p.evaluate(async ([id, list]) => {
      const { addBookmark } = await import('/src/db/bookmarks.ts')
      for (const b of list) await addBookmark(id, b.cfi, b.label, b.pct, { snippet: b.snippet })
    }, [r.id, BOOKMARKS])
    await p.evaluate((id) => window.__open(id), r.id)
    await p.waitForTimeout(4000)

    const rows = []
    for (const [k, idx] of VISITS.entries()) {
      const bm = BOOKMARKS[idx]
      // Abre a lista de marcadores pelo botão do chrome (clique via DOM: o chrome pode estar recolhido).
      await p.evaluate(() => document.querySelector('[aria-label="View bookmarks"]')?.click())
      await p.waitForTimeout(700)
      await p.getByText(bm.snippet.slice(0, 20), { exact: false }).first().click({ timeout: 5000 })
      await p.waitForTimeout(3000)
      const at = await locate(bm.snippet)
      const wantPage = Number(/p=(\d+)/.exec(bm.cfi)[1])
      const ok = !!at.found && at.found.page === wantPage && at.found.yInReader >= -4 && at.found.yInReader <= at.found.readerHeight * 0.25
      await p.screenshot({ path: `${OUT}/marcador-${k}-p${wantPage}.png` })
      rows.push(`${ok ? 'OK ' : 'FALHOU'} | ida ${k + 1} → ${bm.cfi} | parágrafo marcado: ${at.found ? `p${at.found.page} item ${at.found.item} a ${at.found.yInReader}px do topo (de ${at.found.readerHeight})` : 'não está na tela'} | topo da tela: ${at.topText}`)
    }
    const failed = rows.filter((row) => row.startsWith('FALHOU')).length
    return { summary: `${rows.length - failed}/${rows.length} idas aprovadas`, rows }
  } finally {
    await ctx.close()
  }
}
