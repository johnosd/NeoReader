async (page) => {
  // Verificação visual do PDF em página fiel, no navegador (Chromium) com o MESMO sandbox do APK.
  // Mede os pixels que aparecem DE FATO na tela (screenshot), não o DOM: uma página em branco reprova.
  // Criada depois que o PDF passou nos testes e saiu em branco no celular (feature 022, R-030).
  //
  // COMO RODAR (Claude Code com o Playwright MCP):
  //   1. `npx vite --port 5199 --strictPort` (no PowerShell, `npm run dev -- --port` não repassa a porta)
  //   2. PDFs do corpus local em `debug-books/pdf/` (não versionado; arquivo ausente é pulado, não reprova)
  //   3. browser_run_code_unsafe com filename = "scripts/verificacao-visual/pdf-pagina-fiel.check.js"
  //   Saída: "N/M aprovados" + uma linha por PDF/configuração; screenshots em `.playwright-mcp/verificacao-pdf/`.
  //
  // CONTROLE NEGATIVO (provar que a checagem pega o defeito): colocar temporariamente uma versão quebrada (ex.:
  // `git show 6122d20:src/services/pdf/pdfPageRender.ts`, que exibia <canvas>) e rodar — tem que REPROVAR.
  // Para rodar só alguns PDFs: numa chamada anterior, `async (page) => { page.__pdfCheckFiles = ['1col.pdf'] }`
  // (e `delete page.__pdfCheckFiles` para voltar à lista completa).
  const BASE = 'http://localhost:5199'
  const HARNESS = '/scripts/verificacao-visual/harness/e2e.html'
  const OUT = '.playwright-mcp/verificacao-pdf'
  // Lista reduzida opcional (ex.: controle negativo): page.__pdfCheckFiles definido numa chamada anterior.
  const FILES = page.__pdfCheckFiles ?? [
    '1col.pdf', '2col.pdf', 'tabelas.pdf', 'escaneado.pdf', 'misto.pdf',
    'O Milagre Da Manhã.pdf', 'Os Noturnos - Flávia Muniz.pdf',
    'Web Scraping com Python - 2ª Edição - Ryan Mitchell - 2019.pdf',
    'Storytelling com Dados by Cole Nussbaumer Knaflic - Edicao Colorida.pdf', 'GTD_Trello_A4.pdf',
  ]
  const CONFIGS = [
    { name: 'dpr1-escuro', dpr: 1, theme: 'dark' },
    { name: 'dpr3-claro', dpr: 3, theme: 'paper' },
  ]
  const MIN_INK = 0.01 // pelo menos 1% da área de leitura com "tinta" (texto/imagem) visível
  const slug = (s) => s.replace(/\.pdf$/i, '').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

  // Conta pixels diferentes do fundo (cor mais frequente) na faixa de leitura do screenshot (fora do chrome).
  async function inkRatio(p, png, dpr) {
    return p.evaluate(async ([b64, dpr]) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const y0 = Math.round(140 * dpr), y1 = Math.round(780 * dpr), x0 = Math.round(8 * dpr), x1 = c.width - Math.round(16 * dpr)
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      const freq = new Map()
      for (let i = 0; i < d.length; i += 16) { const k = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3); freq.set(k, (freq.get(k) ?? 0) + 1) }
      const bg = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => Number(v) << 3)
      let ink = 0, total = 0
      for (let i = 0; i < d.length; i += 4) {
        total++
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) ink++
      }
      return ink / total
    }, [png.toString('base64'), dpr])
  }

  async function visiblePagesDom(p) {
    return p.evaluate(() => {
      const fxl = document.querySelector('foliate-view')?.renderer
      if (!fxl?.shadowRoot) return []
      const host = fxl.getBoundingClientRect()
      return [...fxl.shadowRoot.querySelectorAll('.scroll-page')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > host.top + 140 && r.top < host.top + 780 })
        .map((el) => {
          const f = el.querySelector('iframe')
          const d = f?.contentDocument
          return { page: Number(el.dataset.index), sandbox: f?.getAttribute('sandbox') ?? null, img: !!d?.querySelector('#canvas img'), canvas: !!d?.querySelector('#canvas canvas') }
        })
    })
  }

  async function waitVisibleImg(p) {
    await p.waitForFunction(() => {
      const fxl = document.querySelector('foliate-view')?.renderer
      const host = fxl?.getBoundingClientRect()
      return [...(fxl?.shadowRoot?.querySelectorAll('.scroll-page') ?? [])].some((el) => {
        const r = el.getBoundingClientRect()
        return r.bottom > host.top + 300 && r.top < host.top + 500 && el.querySelector('iframe')?.contentDocument?.querySelector('#canvas img, #canvas canvas')
      })
    }, null, { timeout: 20000 }).catch(() => undefined)
    await p.waitForTimeout(1200)
  }

  const browser = page.context().browser()
  const results = []
  for (const cfg of CONFIGS) {
    const ctx = await browser.newContext({ deviceScaleFactor: cfg.dpr, viewport: { width: 412, height: 915 }, hasTouch: true })
    const p = await ctx.newPage()
    try {
      await p.goto(BASE + HARNESS)
      await p.waitForFunction(() => typeof window.__import === 'function')
      for (const f of FILES) {
        const url = '/debug-books/pdf/' + encodeURIComponent(f)
        // Corpus é local (não versionado): arquivo ausente nesta máquina é pulado, não conta como reprovação.
        const head = await p.request.fetch(BASE + url, { method: 'HEAD' }).catch(() => null)
        if (!head?.ok() || !(head.headers()['content-type'] ?? '').includes('pdf')) {
          results.push({ cfg: cfg.name, file: f, ok: true, skipped: true })
          continue
        }
        const r = await p.evaluate(([u, n]) => window.__import(u, n), [url, f])
        if (!r.ok) { results.push({ cfg: cfg.name, file: f, ok: false, error: r.message }); continue }
        await p.evaluate(async ([id, theme]) => {
          const { updateBookSettings } = await import('/src/db/bookSettings.ts')
          await updateBookSettings(id, { readerTheme: theme })
        }, [r.id, cfg.theme])
        await p.evaluate((id) => window.__open(id), r.id)
        await waitVisibleImg(p)
        // vai para o meio do livro também (página de miolo, não só a capa)
        const shots = []
        for (const where of ['inicio', 'meio']) {
          if (where === 'meio') {
            await p.evaluate(() => { const fxl = document.querySelector('foliate-view').renderer; fxl.scrollTop = fxl.scrollHeight * 0.45 })
            await waitVisibleImg(p)
          }
          // Mede só a página: esconde avisos/banners do app que cairiam na faixa medida e contariam como "tinta"
          // (o aviso de PDF escaneado fazia uma página em branco parecer ter 12% de tinta).
          await p.evaluate(() => {
            for (const el of document.querySelectorAll('[data-testid="pdf-notices"], [role="status"], [role="alert"]')) el.style.visibility = 'hidden'
          })
          const file = `${OUT}/${cfg.name}-${slug(f)}-${where}.png`
          const png = await p.screenshot({ path: file })
          const ink = await inkRatio(p, png, cfg.dpr)
          const dom = await visiblePagesDom(p)
          shots.push({ where, ink: +(ink * 100).toFixed(1), domPages: dom.map((d) => d.page), allImg: dom.length > 0 && dom.every((d) => d.img && !d.canvas), sandboxOk: dom.every((d) => d.sandbox === 'allow-same-origin'), file })
        }
        results.push({ cfg: cfg.name, file: f, ok: shots.every((s) => s.ink >= MIN_INK * 100 && s.allImg && s.sandboxOk), shots })
      }
    } finally {
      await ctx.close()
    }
  }
  const checked = results.filter((r) => !r.skipped)
  const failed = checked.filter((r) => !r.ok)
  return {
    summary: `${checked.length - failed.length}/${checked.length} aprovados` + (results.length > checked.length ? ` (${results.length - checked.length} pulados: arquivo ausente)` : ''),
    rows: results.map((r) => {
      if (r.skipped) return `PULADO | ${r.cfg} | ${r.file} | não está em debug-books/pdf/`
      if (r.error) return `FALHOU | ${r.cfg} | ${r.file} | ERRO ${r.error}`
      return `${r.ok ? 'OK ' : 'FALHOU'} | ${r.cfg} | ${r.file.slice(0, 34)} | tinta ${r.shots.map((s) => s.where + '=' + s.ink + '%').join(' ')} | <img> ${r.shots.every((s) => s.allImg)} | sandbox ${r.shots.every((s) => s.sandboxOk)}`
    }),
  }
}
