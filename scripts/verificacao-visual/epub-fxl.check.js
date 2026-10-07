async (page) => {
  // EPUB de layout fixo (pre-paginated) no EpubViewer: usa o MESMO renderer do PDF (foliate-fxl em flow=scrolled),
  // então os patches do vite.config.ts feitos para o PDF (descarte de páginas, R-027) também o afetam. O corpus de
  // debug não tem nenhum EPUB assim; o arquivo é gerado por `gerar-epub-fxl.py`.
  //
  // COMO RODAR: `python -I scripts/verificacao-visual/gerar-epub-fxl.py debug-books/fxl/layout-fixo.epub 24`,
  // dev server `npx vite --port 5199 --strictPort` e browser_run_code_unsafe com
  // filename = "scripts/verificacao-visual/epub-fxl.check.js".
  // ESTADO EM 2026-10-07: 4/4 aprovados após os bugfixes de abertura e toque. Antes reprovava também no
  // `main` (6c1acb9): o registro da página era podado durante load, antes de o FXL publicá-la em getContents().
  // Critérios: renderer foliate-fxl; páginas visíveis com tinta na tela e o título "Página N" certo; depois de rolar
  // até o fim e voltar, a página 1 reaparece; iframes vivos ≤ 8 (teto do foliate); nenhum erro de página no console.
  const BASE = 'http://localhost:5199'
  const OUT = '.playwright-mcp/verificacao-pdf'
  const FILE = '/debug-books/fxl/layout-fixo.epub'
  const ctx = await page.context().browser().newContext({ deviceScaleFactor: 3, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 1500)) })
  // Resposta controlada: este teste cobre o painel/marcador, sem depender do provedor de tradução.
  await p.route('**/api.mymemory.translated.net/get**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Tradução de teste.' } }),
  }))

  // Páginas visíveis: índice, título lido de dentro do iframe e se a página tem iframe carregado.
  const visible = () => p.evaluate(() => {
    const fxl = document.querySelector('foliate-view')?.renderer
    if (!fxl?.shadowRoot) return { renderer: fxl?.tagName ?? null, pages: [] }
    const host = fxl.getBoundingClientRect()
    const pages = [...fxl.shadowRoot.querySelectorAll('.scroll-page')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > host.top + 60 && r.top < host.bottom - 60 })
      .map((el) => ({ i: Number(el.dataset.index), title: el.querySelector('iframe')?.contentDocument?.querySelector('h1')?.textContent ?? null }))
    const alive = [...fxl.shadowRoot.querySelectorAll('.scroll-page')].filter((el) => el.querySelector('iframe')).length
    return { renderer: fxl.tagName, flow: fxl.getAttribute('flow'), pages, alive }
  })
  // Fração da tela (faixa de leitura) com pixels diferentes do fundo.
  const ink = async (name) => {
    const png = await p.screenshot({ path: `${OUT}/epub-fxl-${name}.png` })
    return p.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
      const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      const d = g.getImageData(0, Math.round(c.height * 0.15), c.width, Math.round(c.height * 0.7)).data
      let bgR = d[0], bgG = d[1], bgB = d[2], n = 0, t = 0
      for (let k = 0; k < d.length; k += 16) { t++; if (Math.abs(d[k] - bgR) + Math.abs(d[k + 1] - bgG) + Math.abs(d[k + 2] - bgB) > 90) n++ }
      return +(100 * n / t).toFixed(1)
    }, png.toString('base64'))
  }

  try {
    await p.goto(BASE + '/scripts/verificacao-visual/harness/e2e.html')
    await p.waitForFunction(() => typeof window.__import === 'function')
    const head = await p.request.fetch(BASE + FILE, { method: 'HEAD' }).catch(() => null)
    if (!head?.ok()) return { summary: `PULADO: ${FILE} ausente (rode gerar-epub-fxl.py)` }
    const r = await p.evaluate(([u, n]) => window.__import(u, n), [FILE, 'layout-fixo.epub'])
    if (!r.ok) return { summary: 'FALHOU: import', error: r.message }
    await p.evaluate((id) => window.__open(id), r.id)
    await p.waitForTimeout(5000)
    // Ambiente web isolado não tem voz TTS instalada; dispensar o aviso que
    // cobre o painel após scrollIntoView, sem alterar preferências do leitor.
    const dismiss = p.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()

    const rows = []
    const check = async (label, expectFirst) => {
      const v = await visible()
      const tinta = await ink(label)
      const titlesOk = v.pages.length > 0 && v.pages.every((pg) => pg.title === `Página ${pg.i + 1}`)
      const firstOk = expectFirst === undefined || v.pages.some((pg) => pg.i === expectFirst)
      const ok = v.renderer === 'FOLIATE-FXL' && tinta >= 1 && titlesOk && firstOk && v.alive <= 8
      rows.push(`${ok ? 'OK ' : 'FALHOU'} | ${label} | renderer ${v.renderer} flow=${v.flow} | visíveis ${v.pages.map((pg) => `${pg.i + 1}:"${pg.title}"`).join(' ')} | iframes vivos ${v.alive} | tinta ${tinta}%`)
    }
    await check('abertura', 0)

    // Rolagem rápida até o fim (fling) e de volta ao início.
    for (let k = 0; k < 30; k++) {
      await p.evaluate(() => { const fxl = document.querySelector('foliate-view').renderer; fxl.scrollBy({ top: fxl.clientHeight * 1.2, behavior: 'instant' }) })
      await p.waitForTimeout(40)
    }
    await p.waitForTimeout(2500)
    await check('fim')
    await p.evaluate(() => { document.querySelector('foliate-view').renderer.scrollTop = 0 })
    await p.waitForTimeout(2500)
    await check('volta ao início', 0)

    // Clique físico na margem central da página reduzida (600x800 -> largura 412).
    // Antes: zona de chrome falsa; depois: erro XML pelo atributo hidden sem valor.
    await p.mouse.click(206, 450)
    const bookmarkButton = p.locator('foliate-view iframe[data-section-index="0"]').contentFrame().locator('[data-nr-action="bookmark"]')
    await bookmarkButton.waitFor({ state: 'visible', timeout: 10000 })
    // A abertura rola o parágrafo suavemente; FXL bloqueia eventos durante
    // essa animação. Esperar seu término antes do próximo gesto físico.
    await p.waitForTimeout(700)
    const menuStyle = await bookmarkButton.evaluate(button => {
      const doc = button.ownerDocument
      const win = doc.defaultView
      const block = doc.getElementById('nr-translation-block')
      return {
        radius: win.getComputedStyle(block).borderRadius,
        font: win.getComputedStyle(block).fontFamily,
        grid: win.getComputedStyle(doc.querySelector('.nr-tr-actions')).display,
        tile: win.getComputedStyle(button.querySelector('.nr-tr-action-tile')).width,
        icon: win.getComputedStyle(button.querySelector('svg')).width,
        originalFont: win.getComputedStyle(doc.querySelector('body > p')).fontSize,
        originalBackground: win.getComputedStyle(doc.body).backgroundColor,
      }
    })
    const styled = menuStyle.radius === '18px' && menuStyle.font.includes('Inter') &&
      menuStyle.grid === 'grid' && menuStyle.tile === '40px' && menuStyle.icon === '17px' &&
      menuStyle.originalFont === '28px' && menuStyle.originalBackground === 'rgb(255, 255, 255)'
    rows.push(`${styled ? 'OK ' : 'FALHOU'} | menu com design do leitor, página original preservada | ${JSON.stringify(menuStyle)}`)
    await p.screenshot({ path: `${OUT}/epub-fxl-menu.png` })
    await bookmarkButton.click()
    const readBookmarkCount = () => p.evaluate(async (id) => {
      const { db } = await import('/src/db/database.ts')
      return await db.bookmarks.where('bookId').equals(id).count()
    }, r.id)
    let savedCount = 0
    for (let attempt = 0; attempt < 20 && savedCount !== 1; attempt++) {
      savedCount = await readBookmarkCount()
      if (savedCount !== 1) await p.waitForTimeout(100)
    }
    if (savedCount !== 1) return { summary: 'FALHOU: marcador', savedCount, errors }
    await p.evaluate((id) => window.__open(id), r.id)
    await p.waitForTimeout(1000)
    const persistedCount = await p.evaluate(async (id) => {
      const { db } = await import('/src/db/database.ts')
      return await db.bookmarks.where('bookId').equals(id).count()
    }, r.id)
    const persisted = persistedCount === 1
    rows.push(`${persisted ? 'OK ' : 'FALHOU'} | toque central abre painel, botão cria marcador e persiste ao reabrir | count=${persistedCount}`)

    const failed = rows.filter((row) => row.startsWith('FALHOU')).length + (errors.length ? 1 : 0)
    return { summary: failed ? `FALHOU (${failed})` : `${rows.length}/${rows.length} aprovados`, rows, errors: errors.slice(0, 8) }
  } finally {
    await ctx.close()
  }
}
