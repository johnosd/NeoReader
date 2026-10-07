async (page) => {
  // TTS na página fiel (US4), no navegador, com a ReaderScreen e o PdfPageViewer REAIS.
  // O TTS nativo no navegador é o speechSynthesis; num teste automatizado ele não toca nem emite eventos de forma
  // confiável, então é trocado ANTES do app carregar por um falso que registra cada frase "falada" e termina em
  // UTTER_MS. Tudo o mais (useTTS, ReaderScreen, viewer, destaque, rolagem, troca de trecho) é o código real.
  //
  // Critérios:
  //  1. frases lidas sem quebra de linha física nem hífen de quebra (SC-004);
  //  2. o parágrafo lido fica destacado na página e dentro da tela (acompanhamento);
  //  3. ao acabar o trecho, a leitura continua sozinha no próximo (goToNextTtsSection → onSectionReady);
  //  4. o EPUB continua com o TTS dele (o falso também atende o EPUB) — coberto pelo gate EPUB, não aqui.
  //
  // COMO RODAR: dev server `npx vite --port 5199 --strictPort`, PDF em `debug-books/pdf/` e
  // browser_run_code_unsafe com filename = "scripts/verificacao-visual/pdf-tts.check.js".
  const BASE = 'http://localhost:5199'
  const OUT = '.playwright-mcp/verificacao-pdf'
  const FILE = page.__ttsFile ?? '1col.pdf'
  const RUN_MS = page.__ttsRunMs ?? 14000
  // 'page' = página fiel (PdfPageViewer); 'text' = modo texto (EpubViewer sobre o livro sintético, T062).
  const MODE = page.__ttsMode ?? 'page'
  const UTTER_MS = 120

  const ctx = await page.context().browser().newContext({ deviceScaleFactor: 2, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  await p.addInitScript((utterMs) => {
    window.__spoken = []
    let current = null
    let timer = null
    const fake = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [],
      speak(utterance) {
        current = utterance
        this.speaking = true
        window.__spoken.push({ t: Math.round(performance.now()), text: utterance.text })
        utterance.onstart?.(new Event('start'))
        timer = setTimeout(() => {
          this.speaking = false
          current = null
          utterance.onend?.(new Event('end'))
        }, utterMs)
      },
      cancel() {
        clearTimeout(timer)
        this.speaking = false
        // O plugin web chama cancel() antes de cada fala; a fala interrompida termina (como no Chrome real).
        const interrupted = current
        current = null
        interrupted?.onend?.(new Event('end'))
      },
      pause() {}, resume() {},
      addEventListener() {}, removeEventListener() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake })
  }, UTTER_MS)

  // Onde está o destaque de TTS na tela. Página fiel: spans `.nr-pdf-tts` por página do PDF. Modo texto: o
  // parágrafo `.nr-tts-hl` do EpubViewer, por seção (= trecho) do livro sintético.
  const ttsState = () => p.evaluate((mode) => {
    const renderer = document.querySelector('foliate-view')?.renderer
    if (!renderer?.shadowRoot) return null
    const host = renderer.getBoundingClientRect()
    const pages = []
    const frames = mode === 'page'
      ? [...renderer.shadowRoot.querySelectorAll('.scroll-page')].map((el) => ({ id: Number(el.dataset.index), f: el.querySelector('iframe') }))
      : [...renderer.shadowRoot.querySelectorAll('iframe')].map((f, i) => ({ id: i, f }))
    for (const { id, f } of frames) {
      const d = f?.contentDocument
      const marked = d ? [...d.querySelectorAll(mode === 'page' ? '.textLayer span.nr-pdf-tts' : '.nr-tts-hl')] : []
      if (!marked.length) continue
      const fr = f.getBoundingClientRect(); const s = fr.width / (f.offsetWidth || fr.width)
      const tops = marked.map((el) => fr.top + el.getBoundingClientRect().top * s - host.top)
      const bottoms = marked.map((el) => fr.top + el.getBoundingClientRect().bottom * s - host.top)
      pages.push({ page: id, spans: marked.length, topY: Math.round(Math.min(...tops)), bottomY: Math.round(Math.max(...bottoms)) })
    }
    return { pages, readerHeight: Math.round(host.height) }
  }, MODE)

  try {
    await p.goto(BASE + '/scripts/verificacao-visual/harness/e2e.html')
    await p.waitForFunction(() => typeof window.__import === 'function')
    const head = await p.request.fetch(BASE + '/debug-books/pdf/' + encodeURIComponent(FILE), { method: 'HEAD' }).catch(() => null)
    if (!head?.ok() || !(head.headers()['content-type'] ?? '').includes('pdf')) return { summary: `PULADO: ${FILE} não está em debug-books/pdf/` }
    const r = await p.evaluate(([u, n]) => window.__import(u, n), ['/debug-books/pdf/' + encodeURIComponent(FILE), FILE])
    // Provedor nativo explícito (sem chave de premium o app cairia nele de qualquer jeito, com aviso).
    await p.evaluate(async ([id, mode]) => {
      const { updateBookSettings } = await import('/src/db/bookSettings.ts')
      await updateBookSettings(id, { pdfReadingMode: mode })
    }, [r.id, MODE])
    await p.evaluate((id) => window.__open(id), r.id)
    await p.waitForFunction(() => !!document.querySelector('foliate-view')?.renderer?.shadowRoot?.querySelector('iframe'), null, { timeout: 20000 }).catch(() => undefined)
    await p.waitForTimeout(2500)

    // Botão de iniciar a leitura no chrome (clique via DOM: o chrome pode estar recolhido).
    const started = await p.evaluate(() => {
      const button = document.querySelector('[aria-label="Start reading"], [aria-label="Iniciar leitura"]')
      button?.click()
      return !!button
    })
    if (!started) return { summary: 'FALHOU: botão de iniciar leitura não encontrado' }

    const samples = []
    // Seções (rótulo do sumário) registradas no progresso salvo ao longo da leitura.
    const sections = new Set()
    const t0 = Date.now()
    while (Date.now() - t0 < RUN_MS) {
      await p.waitForTimeout(700)
      const s = await ttsState()
      if (s) samples.push({ t: Date.now() - t0, ...s })
      const progress = await p.evaluate(async (id) => (await window.__progress(id)) ?? null, r.id)
      if (progress?.sectionLabel) sections.add(progress.sectionLabel)
      if (samples.length === 3) await p.screenshot({ path: `${OUT}/tts-${MODE === 'page' ? 'pagina-fiel' : 'modo-texto'}.png` })
    }
    const spoken = await p.evaluate(() => window.__spoken)

    const brokenLines = spoken.filter((u) => /\n/.test(u.text) || /\p{L}- \p{Ll}/u.test(u.text))
    // Número de página sozinho e cabeçalho corrido (título do livro repetido em cada página) não podem ser lidos:
    // a reconstrução os remove (spec, Edge Cases). O título aparece UMA vez, na folha de rosto.
    const pageNumbers = spoken.filter((u) => /^\s*\d{1,4}\s*$/.test(u.text))
    const bookTitle = spoken[0]?.text.trim()
    const runningHeaders = spoken.filter((u) => u.text.trim() === bookTitle).length - 1
    const withHighlight = samples.filter((s) => s.pages.length > 0)
    // Acompanhamento: o destaque visível em algum lugar da tela (entre o topo e o fundo do leitor).
    const followed = withHighlight.filter((s) => s.pages.some((pg) => pg.bottomY >= 0 && pg.topY <= s.readerHeight))
    const highlightedPages = [...new Set(withHighlight.flatMap((s) => s.pages.map((pg) => pg.page)))].sort((a, b) => a - b)
    const sectionIndexes = await p.evaluate(async (id) => (await window.__progress(id)) ?? null, r.id)

    const rows = [
      `${spoken.length > 3 ? 'OK ' : 'FALHOU'} | frases lidas: ${spoken.length}`,
      `${brokenLines.length === 0 ? 'OK ' : 'FALHOU'} | frases com quebra de linha ou hífen de quebra: ${brokenLines.length}${brokenLines[0] ? ` (ex.: "${brokenLines[0].text.slice(0, 60)}")` : ''}`,
      `${withHighlight.length >= samples.length / 2 ? 'OK ' : 'FALHOU'} | amostras com destaque: ${withHighlight.length}/${samples.length}`,
      `${followed.length === withHighlight.length && withHighlight.length > 0 ? 'OK ' : 'FALHOU'} | destaque dentro da tela (acompanhamento): ${followed.length}/${withHighlight.length}`,
      // Página fiel: o destaque tem de passar por mais de uma página do PDF. Modo texto: a seção é uma página
      // contínua só, então basta ter destaque (a troca de seção é medida pelo critério de seções abaixo).
      `${MODE === 'text' || highlightedPages.length > 1 ? 'OK ' : 'FALHOU'} | ${MODE === 'page' ? 'páginas' : 'seções carregadas'} com destaque: ${highlightedPages.join(', ')}`,
      `${pageNumbers.length === 0 && runningHeaders === 0 ? 'OK ' : 'FALHOU'} | números de página lidos: ${pageNumbers.length}; cabeçalho corrido lido: ${Math.max(0, runningHeaders)}`,
      `${sections.size > 1 ? 'OK ' : 'FALHOU'} | leitura atravessou seções sozinha: ${[...sections].join(' → ') || 'nenhuma'}`,
    ]
    const failed = rows.filter((row) => row.startsWith('FALHOU')).length
    return {
      summary: `${rows.length - failed}/${rows.length} critérios aprovados`,
      rows,
      firstSpoken: spoken.slice(0, 4).map((u) => u.text.slice(0, 90)),
      lastSpoken: spoken.slice(-3).map((u) => u.text.slice(0, 90)),
      progress: sectionIndexes,
    }
  } finally {
    await ctx.close()
  }
}
