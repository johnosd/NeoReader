async (page) => {
  // Verificação da pinça (zoom com dois dedos) no PDF em página fiel, no navegador (Chromium, toque real via CDP).
  // Criada depois do bug do device (O Milagre da Manhã): durante a pinça o texto "sumia" (a origem do scale()
  // escorregava para fora da tela) e, ao soltar, a leitura pulava para outro ponto.
  // Critério: o MESMO trecho de texto fica sob os dedos durante e depois de cada pinça, e o zoom final é a razão
  // do gesto (limitada a 100–400%).
  //
  // COMO RODAR (Claude Code com o Playwright MCP): dev server `npx vite --port 5199 --strictPort`, PDF em
  // `debug-books/pdf/` e browser_run_code_unsafe com filename = "scripts/verificacao-visual/pdf-pinca.check.js".
  // CONTROLE NEGATIVO: com `git show 19eae7b:src/components/reader/PdfPageViewer.tsx` (antes da correção) REPROVA.
  const BASE = 'http://localhost:5199'
  const OUT = '.playwright-mcp/verificacao-pdf'
  const FILE = 'O Milagre Da Manhã.pdf'
  const PX = 280, PY = 700 // fora do centro e sobre um parágrafo da página de miolo
  // Gestos em sequência; 'scroll' rola e pinça logo depois (iframes sem pointer-events: o toque cai no contêiner).
  const SEQ = [2.5, 0.5, 'scroll', 1.6, 0.2]
  const ctx = await page.context().browser().newContext({ deviceScaleFactor: 3, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  const textAt = () => p.evaluate(([x, y]) => {
    const fxl = document.querySelector('foliate-view')?.renderer
    for (const el of fxl?.shadowRoot?.querySelectorAll('.scroll-page') ?? []) {
      const f = el.querySelector('iframe'); const r = f?.getBoundingClientRect(); const d = f?.contentDocument
      if (!r || !d || y < r.top || y > r.bottom || x < r.left || x > r.right) continue
      const s = r.width / (f.offsetWidth || r.width) // escala visual aplicada (feedback da pinça)
      const span = d.elementFromPoint((x - r.left) / s, (y - r.top) / s)?.closest?.('.textLayer span')
      return span ? `p${el.dataset.index}#${span.dataset.nrItem} "${span.textContent.slice(0, 24)}"` : `p${el.dataset.index} (sem texto)`
    }
    return '(fora das páginas)'
  }, [PX, PY])
  const zoomPct = () => p.evaluate(() => Number(document.querySelector('foliate-view').renderer.getAttribute('scale-factor') ?? 100))
  try {
    await p.goto(BASE + '/scripts/verificacao-visual/harness/e2e.html')
    await p.waitForFunction(() => typeof window.__import === 'function')
    const head = await p.request.fetch(BASE + '/debug-books/pdf/' + encodeURIComponent(FILE), { method: 'HEAD' }).catch(() => null)
    if (!head?.ok() || !(head.headers()['content-type'] ?? '').includes('pdf')) return { summary: `PULADO: ${FILE} não está em debug-books/pdf/` }
    const r = await p.evaluate(([u, n]) => window.__import(u, n), ['/debug-books/pdf/' + encodeURIComponent(FILE), FILE])
    await p.evaluate((id) => window.__open(id), r.id)
    await p.waitForTimeout(4000)
    await p.evaluate(() => { const fxl = document.querySelector('foliate-view').renderer; fxl.scrollTop = fxl.scrollHeight * 0.3 })
    await p.waitForTimeout(3000)

    const cdp = await ctx.newCDPSession(p)
    const pts = (d) => [{ x: PX - d, y: PY, id: 0 }, { x: PX + d, y: PY, id: 1 }]
    const rows = []
    let anchor = await textAt()
    let pct = await zoomPct()
    for (const [k, step] of SEQ.entries()) {
      if (step === 'scroll') {
        await p.evaluate(() => document.querySelector('foliate-view').renderer.scrollBy(0, 40))
        await p.waitForTimeout(30)
        anchor = await textAt()
        continue
      }
      const d0 = step >= 1 ? 50 : 50 / step
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) })
      for (let i = 1; i <= 15; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 * (1 + (step - 1) * i / 15)) })
        await p.waitForTimeout(25)
      }
      const during = await textAt()
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await p.waitForTimeout(2500)
      const after = await textAt()
      const expected = Math.round(Math.min(400, Math.max(100, pct * step)))
      pct = await zoomPct()
      await p.screenshot({ path: `${OUT}/pinca-${k}-x${step}.png` })
      const ok = during === anchor && after === anchor && Math.abs(pct - expected) <= 1
      rows.push(`${ok ? 'OK ' : 'FALHOU'} | ×${step} → ${pct}% (esperado ${expected}%) | sob os dedos: antes ${anchor} | durante ${during} | depois ${after}`)
    }
    const failed = rows.filter((row) => row.startsWith('FALHOU')).length
    return { summary: `${rows.length - failed}/${rows.length} pinças aprovadas`, rows }
  } finally {
    await ctx.close()
  }
}
