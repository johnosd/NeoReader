import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useSyncRef } from '../../hooks/useSyncRef'
import type { Book, Bookmark } from '../../types/book'
import type { View } from 'foliate-js/view.js'
import { getSentenceAt, escapeHtml } from '../../utils/readerUtils'
import { isCfiInLocation } from '../../utils/cfi'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

// Unidade mínima de leitura para o TTS.
// Texto é partido em frases (não parágrafos inteiros) para reduzir latência de API.
// offsetInPara: posição de início da frase no parágrafo completo — usada para
// alinhar o karaokê de palavras (offsets do Speechify são relativos ao chunk).
export interface TtsChunk {
  text: string
  paraIdx: number
  offsetInPara: number
}

// Divide um parágrafo em frases e agrupa as muito curtas (<minLen chars) com a próxima.
// Retorna array de { sentence, offset } onde offset é o índice de char no texto original.
function splitParagraphIntoChunks(text: string, minLen = 40): Array<{ sentence: string; offset: number }> {
  // matchAll retorna todos os matches com índice — mais preciso que match()
  const matches = [...text.matchAll(/[^.!?]*[.!?]+\s*/g)]
  const parts: Array<{ sentence: string; offset: number }> = matches.map(m => ({
    sentence: m[0],
    offset: m.index ?? 0,
  }))

  // Captura cauda sem pontuação final (ex: último parágrafo sem ponto)
  const lastEnd = matches.length > 0
    ? (matches[matches.length - 1].index ?? 0) + matches[matches.length - 1][0].length
    : 0
  const tail = text.slice(lastEnd).trim()
  if (tail) parts.push({ sentence: tail, offset: lastEnd })

  // Se não achou nenhuma frase delimitada, devolve o parágrafo inteiro
  if (parts.length === 0) return [{ sentence: text.trim(), offset: 0 }]

  // Agrupa frases curtas com a próxima até atingir minLen
  const merged: Array<{ sentence: string; offset: number }> = []
  let acc = ''
  let accOffset = 0

  for (const { sentence, offset } of parts) {
    if (!acc) { acc = sentence; accOffset = offset }
    else acc += sentence

    if (acc.trim().length >= minLen) {
      merged.push({ sentence: acc.trim(), offset: accOffset })
      acc = ''
    }
  }
  if (acc.trim()) merged.push({ sentence: acc.trim(), offset: accOffset })

  return merged
}

// Escapa caracteres HTML para inserção segura via innerHTML (karaokê de palavras)

// Envolve apenas a frase `sentence` num <span class="nr-hl-sentence"> dentro do parágrafo.
// Usa Range + surroundContents: funciona quando a frase está dentro de um único nó de texto.
// Se a frase cruzar tags internas (ex: <em>), usa o fallback de colorir o parágrafo inteiro.
function highlightSentenceInParagraph(para: Element, sentence: string): void {
  const doc = para.ownerDocument!
  const fullText = para.textContent ?? ''
  const sentenceStart = fullText.indexOf(sentence)

  if (sentenceStart < 0) {
    para.classList.add('nr-hl')  // fallback: parágrafo inteiro
    return
  }

  // Encontra o nó de texto e offset exato dentro do parágrafo
  const range = doc.createRange()
  let charCount = 0
  let startSet = false
  const walker = doc.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null

  while ((node = walker.nextNode()) !== null) {
    const len = node.textContent?.length ?? 0
    if (!startSet && charCount + len > sentenceStart) {
      range.setStart(node, sentenceStart - charCount)
      startSet = true
    }
    if (startSet && charCount + len >= sentenceStart + sentence.length) {
      range.setEnd(node, sentenceStart + sentence.length - charCount)
      break
    }
    charCount += len
  }

  if (!startSet) {
    para.classList.add('nr-hl')
    return
  }

  try {
    const span = doc.createElement('span')
    span.className = 'nr-hl-sentence'
    range.surroundContents(span)  // lança se a frase cruzar tags HTML
  } catch {
    para.classList.add('nr-hl')  // fallback
  }
}

// Usa caretRangeFromPoint (Blink/WebKit) para encontrar em qual caractere
// do parágrafo o usuário tocou, depois devolve a frase naquela posição.
// Fallback para texto completo se a API não estiver disponível.
function getSentenceFromClick(ev: MouseEvent, para: Element): string {
  const fullText = para.textContent?.trim() ?? ''

  // caretRangeFromPoint: retorna um Range apontando para onde o cursor
  // seria inserido no ponto (x, y) — disponível no Chrome/Android WebView
  const range = (ev.target as Element).ownerDocument?.caretRangeFromPoint?.(ev.clientX, ev.clientY)
  if (!range) return fullText

  // Calcula o offset de char dentro do textContent completo do parágrafo.
  // O Range aponta para um nó de texto interno; precisamos somar os offsets
  // de todos os nós de texto anteriores dentro do parágrafo.
  let charOffset = range.startOffset
  // Usa o document do iframe (ownerDocument) — não o document externo do React
  const walker = para.ownerDocument!.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode()) !== null) {
    if (node === range.startContainer) break
    charOffset += (node.textContent?.length ?? 0)
  }

  return getSentenceAt(fullText, charOffset)
}

// CSS injetado dentro do iframe do foliate para tema escuro + tamanho de fonte.
// Precisa usar !important porque o EPUB tem seus próprios estilos inline e no <link>.
// As classes .nr-* são usadas para highlight e tradução inline sem conflito com o EPUB.
function buildReaderCSS(fontSize: FontSize): string {
  const sizes: Record<FontSize, string> = {
    sm: '16px',
    md: '18px',
    lg: '22px',
    xl: '26px',
  }
  return `
    html, body {
      background-color: #0a0a0a !important;
      color: #e8e8e8 !important;
      font-family: Georgia, Charter, serif !important;
    }

    /* Aplica tema escuro + tamanho de fonte SOMENTE em elementos de texto.
       Evitar usar * aqui: quebraria containers de imagem que usam em/% para
       dimensionamento, e removeria backgrounds necessários para capas de livro. */
    p, li, blockquote, span, td, th, pre, code,
    div, section, article, aside, main, nav, header, footer {
      font-size: ${sizes[fontSize]} !important;
      line-height: 1.7 !important;
      color: #e8e8e8 !important;
      background-color: transparent !important;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #ffffff !important;
      background-color: transparent !important;
    }
    a { color: #818cf8 !important; }

    /* Imagens e SVGs: renderizam com suas dimensões naturais, sem override de cor.
       max-width garante que não vazem fora do viewport em qualquer tamanho de tela. */
    img, svg, figure, picture {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Parágrafo selecionado para tradução (fallback quando frase ocupa o parágrafo todo) */
    .nr-hl {
      background-color: rgba(99, 102, 241, 0.15) !important;
      border-radius: 3px !important;
    }
    /* Frase específica destacada dentro do parágrafo */
    .nr-hl-sentence {
      background-color: rgba(99, 102, 241, 0.25) !important;
      border-radius: 2px !important;
    }
    /* Parágrafo sendo lido pelo TTS — fundo verde suave */
    .nr-tts-hl {
      background-color: rgba(34, 197, 94, 0.15) !important;
      border-radius: 3px !important;
    }
    /* Palavra atual no karaokê de palavras */
    .nr-tts-word {
      font-weight: bold !important;
      text-decoration: underline !important;
    }

    /* Bloco de tradução inline — injetado após o parágrafo selecionado */
    #nr-translation-block {
      margin: 8px 0 16px 0 !important;
      padding: 10px 12px !important;
      border-radius: 8px !important;
      background: rgba(99, 102, 241, 0.10) !important;
      border-left: 3px solid #6366f1 !important;
    }
    .nr-tr-text {
      color: #c77dff !important;
      font-size: 14px !important;
      font-style: italic !important;
      line-height: 1.5 !important;
      margin: 0 0 8px 0 !important;
      background: transparent !important;
    }
    .nr-tr-loading {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      color: #a5a5a5 !important;
      font-size: 14px !important;
    }
    .nr-tr-spinner {
      display: inline-block !important;
      width: 14px !important;
      height: 14px !important;
      border: 2px solid #9d4edd !important;
      border-top-color: transparent !important;
      border-radius: 50% !important;
      animation: nr-spin 0.6s linear infinite !important;
      flex-shrink: 0 !important;
    }
    @keyframes nr-spin { to { transform: rotate(360deg); } }
    .nr-tr-actions {
      display: flex !important;
      gap: 8px !important;
    }
    .nr-tr-actions button {
      flex: 1 !important;
      padding: 6px 0 !important;
      border-radius: 8px !important;
      background: #2d2942 !important;
      color: #fff !important;
      font-size: 13px !important;
      border: none !important;
      cursor: pointer !important;
      font-family: inherit !important;
    }

    /* Marcador visual de bookmark no próprio livro.
       A fonte de verdade continua sendo o CFI salvo; isso é apenas projeção visual. */
    [data-nr-bookmark] {
      position: relative !important;
      padding-inline-start: 18px !important;
    }
    [data-nr-bookmark]::before {
      content: '' !important;
      position: absolute !important;
      left: 0 !important;
      top: 0.35em !important;
      width: 10px !important;
      height: 14px !important;
      border-radius: 3px 3px 1px 1px !important;
      background: #6366f1 !important;
      clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%) !important;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
    }
    [data-nr-bookmark="emerald"]::before { background: #22c55e !important; }
    [data-nr-bookmark="amber"]::before { background: #f59e0b !important; }
    [data-nr-bookmark="rose"]::before { background: #f43f5e !important; }
  `
}

export interface EpubViewerHandle {
  next(): void
  prev(): void
  // Navega para o capítulo anterior e posiciona no final (último parágrafo)
  prevToEnd(): void
  goTo(target: string | number | { fraction: number }): void
  getVisibleLocation(): { cfi: string | null; tocLabel?: string; percentage?: number }
  // TTS: retorna os textos puros de todos os parágrafos da seção atual
  getParagraphs(): string[]
  // TTS: retorna frases agrupadas com paraIdx e offsetInPara para karaokê preciso
  getSentenceChunks(): TtsChunk[]
  // TTS: retorna o índice do primeiro parágrafo visível na tela (para iniciar pelo ponto de leitura)
  getFirstVisibleParagraphIndex(): number
  // TTS: destaca parágrafo + palavra (wordStart === wordEnd === 0 → só parágrafo)
  highlightTts(paraIdx: number, wordStart: number, wordEnd: number): void
  // TTS: remove todos os destaques de audiobook
  clearTts(): void
  // TTS: rola suavemente para centralizar o parágrafo na tela (respeitando scroll do usuário)
  scrollToParagraph(idx: number): void
  // TTS: prepara scroll automático — limpa flag de "usuário rolou", chama no início do play
  resetTtsScroll(): void
  // Tradução inline: injeta bloco com spinner logo após o parágrafo ativo
  showTranslationLoading(): void
  // Tradução inline: substitui spinner pelo texto traduzido + botões de ação
  injectTranslation(translatedText: string): void
  // Tradução inline: remove bloco e highlight do parágrafo ativo
  clearTranslation(): void
}

interface EpubViewerProps {
  book: Book
  bookmarks: Bookmark[]
  fontSize: FontSize
  savedCfi: string | null
  onRelocate: (cfi: string, percentage: number, tocLabel: string | undefined, sectionIndex: number) => void
  onTocReady: (toc: TocItem[]) => void
  onLoad: () => void
  onError: (err: Error) => void
  // Chamado quando o usuário salva um par original/tradução via ⭐
  onSaveVocab: (sourceText: string, translatedText: string) => void
  // Chamado quando o tap cai fora de qualquer parágrafo (margem, imagem),
  // OU quando o chrome está visível e qualquer toque fecha os menus
  onCenterTap: () => void
  // Quando true, qualquer toque no iframe fecha o chrome em vez de acionar tradução/TTS.
  // Resolve o problema de compositing do Android WebView que ignora z-index de overlays.
  chromeVisible: boolean
  // Tradução: emite o texto da frase tocada para o ReaderScreen traduzir e exibir
  // num painel React fora do iframe (evita problema de paginação no mobile)
  onTranslate: (sourceText: string) => void
  // TTS: lê um único parágrafo (acionado pelo botão 🔊 no bloco de tradução)
  onSpeakOne: (text: string) => void
  // TTS: quando audiobook está tocando, tap em parágrafo pula para ele
  onParagraphTapForTts: (idx: number) => void
  // TTS: true quando o modo leitura contínua está ativo — inclui pausado.
  // Quando true, tap em parágrafo navega o TTS em vez de abrir tradução.
  ttsGlobalActive: boolean
  // Capítulo: emitido quando o usuário chega ao fundo (ou sai do fundo) da seção atual.
  // hasNext: false quando é a última seção do livro.
  onAtBottom?: (atBottom: boolean, hasNext: boolean) => void
  // Capítulo: emitido quando o usuário faz swipe para baixo estando já no fundo —
  // sinal de intenção de avançar para o próximo capítulo.
  onSwipeAtBottom?: () => void
  // Capítulo: emitido quando o usuário faz swipe para cima estando já no topo —
  // sinal de intenção de voltar ao final do capítulo anterior.
  onSwipeAtTop?: () => void
  // Bookmarks: remove o marcador ao tocar no ícone projetado no parágrafo.
  onBookmarkTap?: (bookmarkId: number) => void
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  (
    {
      book, bookmarks, fontSize, savedCfi,
      onRelocate, onTocReady, onLoad, onError,
      onSaveVocab, onCenterTap, onTranslate,
      onSpeakOne, onParagraphTapForTts, ttsGlobalActive,
      chromeVisible,
      onAtBottom, onSwipeAtBottom, onSwipeAtTop, onBookmarkTap,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    const currentDocRef = useRef<Document | null>(null)

    // Elementos e textos dos parágrafos da seção atual — atualizados no evento 'load'
    const ttsParagraphsRef = useRef<Element[]>([])
    const ttsParagraphTextsRef = useRef<string[]>([])

    // Ref do parágrafo com highlight de tradução ativo — usado por clearTranslation()
    const activeTranslationParaRef = useRef<Element | null>(null)
    // Texto original e traduzido da frase ativa — usados pelos botões Ouvir/Salvar no iframe
    const activeSourceTextRef = useRef<string>('')
    const activeTranslatedTextRef = useRef<string>('')
    // Lock: bloqueia nova seleção enquanto a tradução HTTP anterior ainda está em voo.
    // Evita que dois parágrafos fiquem simultaneamente marcados com data-nr-active.
    const translationInProgressRef = useRef(false)

    // TTS scroll automático: controla se o auto-scroll deve seguir o TTS ou foi bloqueado
    // pelo usuário rolar manualmente durante a leitura
    const ttsActiveRef = useRef(false)       // true enquanto TTS está tocando
    const userScrolledRef = useRef(false)    // true se usuário rolou durante TTS
    // Janela de tempo em que scrolls são considerados programáticos (cobre animação smooth)
    const scrollingProgrammaticallyUntilRef = useRef(0)

    // Refs para os callbacks mais recentes — evita stale closure nos listeners do iframe.
    // Os listeners são criados uma vez por seção (no evento 'load'), mas os callbacks
    // podem mudar entre renders. useSyncRef mantém sempre a versão atual sem recriar o listener.
    const onSaveVocabRef = useSyncRef(onSaveVocab)
    const onCenterTapRef = useSyncRef(onCenterTap)
    const onTranslateRef = useSyncRef(onTranslate)
    const onSpeakOneRef = useSyncRef(onSpeakOne)
    const onParagraphTapForTtsRef = useSyncRef(onParagraphTapForTts)
    // ttsGlobalActive: modo leitura contínua ativo (inclui pausado) — gating do clique
    const ttsGlobalActiveRef = useSyncRef(ttsGlobalActive)
    // chromeVisible: quando true, qualquer toque no iframe fecha o chrome imediatamente
    const chromeVisibleRef = useSyncRef(chromeVisible)

    // Navegação entre capítulos: detecta fundo visual + swipe para avançar
    const isAtBottomRef = useRef(false)
    const currentSectionIdxRef = useRef(0)
    const totalSectionsRef = useRef(1)
    const onAtBottomRef = useSyncRef(onAtBottom)
    const onSwipeAtBottomRef = useSyncRef(onSwipeAtBottom)
    const onSwipeAtTopRef = useSyncRef(onSwipeAtTop)
    // Flag: próximo evento 'load' deve rolar a seção até o fundo (usado após prevToEnd)
    const scrollToBottomOnLoadRef = useRef(false)
    const lastRelocateRef = useRef<RelocateDetail | null>(null)
    const autoSkipChapterStubDirectionRef = useRef<-1 | 0 | 1>(0)
    const autoSkipChapterStubCountRef = useRef(0)
    const scrollListenerCleanupRef = useRef<(() => void) | null>(null)
    const pendingSectionRef = useRef<{ doc: Document; index: number; version: number } | null>(null)
    const pendingSectionVersionRef = useRef(0)
    const finalizedSectionVersionRef = useRef(0)
    const finalizeSectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const initialInteractiveReadyRef = useRef(false)
    const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'
    const bookmarksRef = useSyncRef(bookmarks)
    const onBookmarkTapRef = useSyncRef(onBookmarkTap)

    function getParagraphIndexFromRange(range?: Range | null): number {
      const paras = ttsParagraphsRef.current
      if (!range || paras.length === 0) return 0

      const startNode = range.startContainer
      const startElement =
        startNode.nodeType === Node.ELEMENT_NODE
          ? (startNode as Element)
          : startNode.parentElement

      if (!startElement) return 0

      const directIdx = paras.findIndex((para) => para === startElement || para.contains(startNode))
      if (directIdx >= 0) return directIdx

      const block = startElement.closest(BLOCK)
      if (!block) return 0

      const blockIdx = paras.indexOf(block)
      return blockIdx >= 0 ? blockIdx : 0
    }

    function getVisibleParagraphInternal(): { para: Element | null; paraIndex: number } {
      const paras = ttsParagraphsRef.current
      if (paras.length === 0) return { para: null, paraIndex: 0 }

      const paraIndex = getParagraphIndexFromRange(lastRelocateRef.current?.range)
      return {
        para: paras[paraIndex] ?? null,
        paraIndex,
      }
    }

    function getFirstVisibleParagraphIndexInternal(): number {
      return getVisibleParagraphInternal().paraIndex
    }

    function isChapterStubSection(doc: Document): boolean {
      const blockTexts = Array.from(doc.querySelectorAll('p, li, blockquote'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean)
      const headingCount = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length
      const bodyBlockCount = blockTexts.length
      const longestBlockLength = blockTexts.reduce((max, text) => Math.max(max, text.length), 0)
      const textLength = doc.body?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0
      const hasChapterMarker =
        !!doc.querySelector('[data-type="chapter"]') ||
        !!doc.querySelector('[epub\\:type~="chapter"]')
      const hasPartMarker =
        !!doc.querySelector('[data-type="part"]') ||
        !!doc.querySelector('[epub\\:type~="part"]') ||
        !!doc.querySelector('[data-pdf-bookmark^="Part "]')

      if (hasPartMarker) return true
      if (hasChapterMarker) return false
      return headingCount > 0 && bodyBlockCount <= 1 && longestBlockLength <= 40 && textLength > 0 && textLength <= 220
    }

    function getRendererScrollContainer(): HTMLElement | null {
      if (!(viewRef.current?.renderer instanceof HTMLElement)) return null
      return viewRef.current.renderer.shadowRoot?.getElementById('container') as HTMLElement | null
    }

    function getScrollMetrics(doc: Document) {
      const container = getRendererScrollContainer()
      if (container) {
        return {
          position: container.scrollTop,
          viewport: container.clientHeight,
          extent: container.scrollHeight,
          scrollToBottom: () => { container.scrollTop = container.scrollHeight },
          target: container as EventTarget,
        }
      }

      const win = doc.defaultView
      return {
        position: win?.scrollY ?? 0,
        viewport: win?.innerHeight ?? doc.documentElement.clientHeight,
        extent: doc.documentElement.scrollHeight,
        scrollToBottom: () => { win?.scrollTo(0, doc.documentElement.scrollHeight) },
        target: (win ?? doc) as EventTarget,
      }
    }

    function clearFinalizeSectionTimeout(): void {
      if (finalizeSectionTimeoutRef.current) {
        clearTimeout(finalizeSectionTimeoutRef.current)
        finalizeSectionTimeoutRef.current = null
      }
    }

    function scheduleSectionFinalization(reason: 'stabilized' | 'relocate'): void {
      const schedule =
        currentDocRef.current?.defaultView?.requestAnimationFrame?.bind(currentDocRef.current.defaultView) ??
        requestAnimationFrame
      schedule(() => finalizePendingSection(reason))
    }

    function setupScrollTracking(doc: Document): void {
      scrollListenerCleanupRef.current?.()

      const onScroll = () => {
        if (ttsActiveRef.current && Date.now() > scrollingProgrammaticallyUntilRef.current) {
          userScrolledRef.current = true
        }

        const metrics = getScrollMetrics(doc)
        const currentScrollY = metrics.position
        const atBottom = currentScrollY + metrics.viewport >= metrics.extent - 20
        if (atBottom !== isAtBottomRef.current) {
          isAtBottomRef.current = atBottom
          const hasNext = currentSectionIdxRef.current < totalSectionsRef.current - 1
          onAtBottomRef.current?.(atBottom, hasNext)
        }
      }

      const scrollMetrics = getScrollMetrics(doc)
      scrollMetrics.target.addEventListener('scroll', onScroll, { passive: true })
      scrollListenerCleanupRef.current = () => {
        scrollMetrics.target.removeEventListener('scroll', onScroll as EventListener)
      }
      onScroll()
    }

    function finalizePendingSection(reason: 'stabilized' | 'relocate' | 'timeout'): void {
      const pendingSection = pendingSectionRef.current
      if (!pendingSection) return
      if (finalizedSectionVersionRef.current === pendingSection.version) return
      if (pendingSection.doc !== currentDocRef.current || pendingSection.index !== currentSectionIdxRef.current) return

      clearFinalizeSectionTimeout()

      const { doc, index, version } = pendingSection
      const hasNextSection = index < totalSectionsRef.current - 1
      const skipDirection = autoSkipChapterStubDirectionRef.current

      console.log('[nr-debug]', 'finalize section', { reason, sectionIndex: index })

      if (
        skipDirection !== 0 &&
        (skipDirection > 0 ? hasNextSection : index > 0) &&
        isChapterStubSection(doc) &&
        autoSkipChapterStubCountRef.current < 4
      ) {
        pendingSectionRef.current = null
        autoSkipChapterStubCountRef.current += 1
        doc.defaultView?.requestAnimationFrame(() => {
          goToAdjacentSection(skipDirection)
        })
        return
      }

      autoSkipChapterStubDirectionRef.current = 0
      autoSkipChapterStubCountRef.current = 0

      if (scrollToBottomOnLoadRef.current) {
        scrollToBottomOnLoadRef.current = false
        doc.defaultView?.requestAnimationFrame(() => {
          getScrollMetrics(doc).scrollToBottom()
        })
      }

      setupScrollTracking(doc)
      finalizedSectionVersionRef.current = version

      if (!initialInteractiveReadyRef.current) {
        initialInteractiveReadyRef.current = true
        onLoad()
      }
    }

    function clearBookmarkMarkers(doc?: Document | null): void {
      doc?.querySelectorAll<HTMLElement>('[data-nr-bookmark]').forEach((el) => {
        el.removeAttribute('data-nr-bookmark')
        el.removeAttribute('data-nr-bookmark-id')
      })
    }

    function renderBookmarkMarkers(doc = currentDocRef.current): void {
      const view = viewRef.current
      const activeBookmarks = bookmarksRef.current
      if (!doc || !view) return

      clearBookmarkMarkers(doc)
      if (ttsParagraphsRef.current.length === 0 || activeBookmarks.length === 0) return

      for (const para of ttsParagraphsRef.current) {
        const range = doc.createRange()
        range.selectNodeContents(para)
        const paraLocationCfi = view.getCFI(currentSectionIdxRef.current, range)
        const matchedBookmark = activeBookmarks.find((bookmark) => isCfiInLocation(bookmark.cfi, paraLocationCfi))
        if (!matchedBookmark) continue

        const paraEl = para as HTMLElement
        paraEl.setAttribute('data-nr-bookmark', matchedBookmark.color ?? 'indigo')
        if (matchedBookmark.id !== undefined) {
          paraEl.setAttribute('data-nr-bookmark-id', String(matchedBookmark.id))
        }
      }
    }

    function goToAdjacentSection(direction: 1 | -1): void {
      const view = viewRef.current
      if (!view) return

      if (direction > 0 && typeof view.renderer.nextSection === 'function') {
        void view.renderer.nextSection()
        return
      }
      if (direction < 0 && typeof view.renderer.prevSection === 'function') {
        void view.renderer.prevSection()
        return
      }

      const targetIndex = currentSectionIdxRef.current + direction
      if (targetIndex < 0 || targetIndex >= totalSectionsRef.current) return

      void view.goTo(targetIndex)
    }

    // Expõe API imperativa para o ReaderScreen via ref
    useImperativeHandle(ref, () => ({
      next: () => {
        autoSkipChapterStubDirectionRef.current = 1
        autoSkipChapterStubCountRef.current = 0
        goToAdjacentSection(1)
      },
      prev: () => {
        autoSkipChapterStubDirectionRef.current = 0
        viewRef.current?.prev()
      },
      prevToEnd: () => {
        autoSkipChapterStubDirectionRef.current = -1
        autoSkipChapterStubCountRef.current = 0
        scrollToBottomOnLoadRef.current = true
        goToAdjacentSection(-1)
      },
      goTo: (target) => {
        autoSkipChapterStubDirectionRef.current = 0
        viewRef.current?.goTo(target)
      },
      getVisibleLocation: () => {
        const view = viewRef.current
        const location = lastRelocateRef.current ?? view?.lastLocation
        if (!view || !location?.cfi) return { cfi: null }

        const { para, paraIndex } = getVisibleParagraphInternal()
        if (!para) {
          return {
            cfi: location.cfi,
            tocLabel: location.tocItem?.label,
            percentage: Math.round(location.fraction * 100),
          }
        }

        const doc = para.ownerDocument!
        const range = doc.createRange()
        range.selectNodeContents(para)
        range.collapse(true)

        const cfi = view.getCFI(currentSectionIdxRef.current, range)
        const progress = view.getProgressOf(currentSectionIdxRef.current, range)
        const fractions = view.getSectionFractions()
        const sectionStart = fractions[currentSectionIdxRef.current] ?? location.fraction
        const sectionEnd = fractions[currentSectionIdxRef.current + 1] ?? location.fraction
        const paraFraction = ttsParagraphsRef.current.length > 1
          ? paraIndex / (ttsParagraphsRef.current.length - 1)
          : 0

        return {
          cfi,
          tocLabel: progress.tocItem?.label ?? location.tocItem?.label,
          percentage: Math.round((sectionStart + (sectionEnd - sectionStart) * paraFraction) * 100),
        }
      },

      getParagraphs: () => ttsParagraphTextsRef.current,

      getSentenceChunks: (): TtsChunk[] => {
        const chunks: TtsChunk[] = []
        for (let paraIdx = 0; paraIdx < ttsParagraphTextsRef.current.length; paraIdx++) {
          const text = ttsParagraphTextsRef.current[paraIdx]
          for (const { sentence, offset } of splitParagraphIntoChunks(text)) {
            chunks.push({ text: sentence, paraIdx, offsetInPara: offset })
          }
        }
        return chunks
      },

      getFirstVisibleParagraphIndex: () => getFirstVisibleParagraphIndexInternal(),

      scrollToParagraph: (idx: number) => {
        // Usuário rolou manualmente durante o TTS: não override a posição dele
        if (userScrolledRef.current) return
        const para = ttsParagraphsRef.current[idx] as HTMLElement | undefined
        if (!para) return
        // Marca como scroll programático por 1s (cobre animação smooth)
        scrollingProgrammaticallyUntilRef.current = Date.now() + 1000
        para.scrollIntoView({ block: 'center', behavior: 'smooth' })
      },

      resetTtsScroll: () => {
        userScrolledRef.current = false
        ttsActiveRef.current = true
      },

      highlightTts: (paraIdx, wordStart, wordEnd) => {
        // Remove destaques do parágrafo anterior (TTS e karaokê)
        ttsParagraphsRef.current.forEach(el => {
          el.classList.remove('nr-tts-hl')
          const htmlEl = el as HTMLElement
          if (htmlEl.dataset.originalHtml) {
            el.innerHTML = htmlEl.dataset.originalHtml
            delete htmlEl.dataset.originalHtml
          }
        })

        const para = ttsParagraphsRef.current[paraIdx]
        if (!para) return

        // Destaca o parágrafo atual
        para.classList.add('nr-tts-hl')

        // Karaokê: wordStart === wordEnd === 0 significa "só muda o parágrafo"
        if (wordStart === 0 && wordEnd === 0) return

        // Salva o HTML original antes de modificar (na primeira palavra do parágrafo)
        const htmlPara = para as HTMLElement
        if (!htmlPara.dataset.originalHtml) {
          htmlPara.dataset.originalHtml = para.innerHTML
        }

        // Reconstrói innerHTML com <mark> na palavra atual
        const text = para.textContent ?? ''
        para.innerHTML =
          escapeHtml(text.slice(0, wordStart)) +
          `<mark class="nr-tts-word">${escapeHtml(text.slice(wordStart, wordEnd))}</mark>` +
          escapeHtml(text.slice(wordEnd))
      },

      clearTts: () => {
        ttsActiveRef.current = false
        ttsParagraphsRef.current.forEach(el => {
          el.classList.remove('nr-tts-hl')
          const htmlEl = el as HTMLElement
          if (htmlEl.dataset.originalHtml) {
            el.innerHTML = htmlEl.dataset.originalHtml
            delete htmlEl.dataset.originalHtml
          }
        })
      },

      showTranslationLoading: () => {
        const para = activeTranslationParaRef.current
        if (!para) return
        translationInProgressRef.current = true
        const doc = para.ownerDocument!
        doc.getElementById('nr-translation-block')?.remove()
        const block = doc.createElement('div')
        block.id = 'nr-translation-block'
        block.className = 'nr-translation-block'
        block.innerHTML = `
          <div class="nr-tr-loading">
            <span class="nr-tr-spinner"></span>
            <span>Traduzindo…</span>
          </div>`
        para.after(block)

        // Se há texto após a frase destacada, move-o para um <p> temporário
        // abaixo do bloco — assim o bloco aparece logo após a frase, não ao
        // final do parágrafo inteiro.
        const span = para.querySelector('.nr-hl-sentence')
        if (span?.nextSibling) {
          const range = doc.createRange()
          range.setStartAfter(span)
          range.setEndAfter(para.lastChild!)
          const extracted = range.extractContents()
          if (extracted.textContent?.trim()) {
            const remainder = doc.createElement('p')
            remainder.id = 'nr-para-remainder'
            remainder.className = para.className
            const styleAttr = para.getAttribute('style')
            if (styleAttr) remainder.setAttribute('style', styleAttr)
            remainder.appendChild(extracted)
            block.after(remainder)
          }
        }

        // Rola o parágrafo para o topo para que frase + bloco fiquem visíveis.
        para.ownerDocument?.defaultView?.requestAnimationFrame(() => {
          para.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      },

      injectTranslation: (translatedText: string) => {
        translationInProgressRef.current = false
        const para = activeTranslationParaRef.current
        if (!para) return
        const block = para.ownerDocument?.getElementById('nr-translation-block')
        if (!block) return
        activeTranslatedTextRef.current = translatedText
        block.innerHTML = `
          <p class="nr-tr-text">${escapeHtml(translatedText)}</p>
          <div class="nr-tr-actions">
            <button data-nr-action="speak">🔊 Ouvir</button>
            <button data-nr-action="save">⭐ Salvar</button>
          </div>`
      },

      clearTranslation: () => {
        translationInProgressRef.current = false
        const para = activeTranslationParaRef.current
        if (!para) return
        // Reintegra o texto extraído de volta ao parágrafo original antes de remover o bloco
        const remainder = para.ownerDocument?.getElementById('nr-para-remainder')
        if (remainder) {
          while (remainder.firstChild) para.appendChild(remainder.firstChild)
          remainder.remove()
        }
        para.ownerDocument?.getElementById('nr-translation-block')?.remove()
        para.removeAttribute('data-nr-active')
        para.classList.remove('nr-hl')
        const sentSpan = para.querySelector('.nr-hl-sentence')
        if (sentSpan) {
          const parent = sentSpan.parentNode!
          while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
          sentSpan.remove()
        }
        activeSourceTextRef.current = ''
        activeTranslatedTextRef.current = ''
        activeTranslationParaRef.current = null
      },
    }))

    // Atualiza fonte sem recriar o view (efeito separado intencional)
    useEffect(() => {
      viewRef.current?.renderer.setStyles?.(buildReaderCSS(fontSize))
    }, [fontSize])

    useEffect(() => {
      renderBookmarkMarkers()
    }, [bookmarks])

    // Setup principal: cria o elemento foliate, abre o EPUB, configura renderer.
    // Roda apenas quando o bookId muda (novo livro), não a cada re-render.
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      let cancelled = false
      let view: View | null = null
      let rendererStabilizedListener: EventListener | null = null

      async function setup() {
        // [nr-debug] Instrumentação para diagnosticar tela preta.
        // Prefixo [nr-debug] permite filtrar: `adb logcat | grep nr-debug`
        const DBG = '[nr-debug]'
        console.log(DBG, 'setup start', {
          bookId: book.id,
          title: book.title,
          fileBlobSize: book.fileBlob?.size,
          fileBlobType: book.fileBlob?.type,
          savedCfi,
        })

        // Import dinâmico: registra o custom element como side-effect
        // e mantém o bundle do foliate fora do chunk inicial
        await import('foliate-js/view.js')
        if (cancelled) return
        console.log(DBG, 'foliate-js view.js imported')

        view = document.createElement('foliate-view') as unknown as View
        view.style.cssText = 'width:100%;height:100%;display:block'
        container!.appendChild(view)
        viewRef.current = view
        console.log(DBG, 'foliate-view element created and appended')

        view.addEventListener('relocate', (e: CustomEvent<RelocateDetail>) => {
          const { cfi, fraction, tocItem, section } = e.detail
          // section?.current é o índice da spine atual; fallback para currentSectionIdxRef
          const sIdx = section?.current ?? currentSectionIdxRef.current
          lastRelocateRef.current = e.detail
          console.log(DBG, 'relocate event', { cfi, fraction, tocLabel: tocItem?.label, sIdx })
          onRelocate(cfi, Math.round(fraction * 100), tocItem?.label, sIdx)
          if (pendingSectionRef.current?.index === sIdx) {
            scheduleSectionFinalization('relocate')
          }
        })

        // Cada seção do EPUB carrega num iframe separado. O evento 'load' expõe
        // o Document do iframe — toda a lógica de tradução inline acontece aqui.
        view.addEventListener('load', (e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc } = e.detail
          currentDocRef.current = doc
          // [nr-debug] Inspeção do Document do iframe — fonte principal da "tela preta"
          const htmlLen = doc.documentElement?.outerHTML?.length ?? 0
          const bodyText = doc.body?.textContent?.trim() ?? ''
          const paraCount = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li').length
          const imgCount = doc.querySelectorAll('img, svg').length
          console.log('[nr-debug]', 'section load event', {
            sectionIndex: e.detail.index,
            htmlLength: htmlLen,
            bodyTextLength: bodyText.length,
            bodyTextPreview: bodyText.slice(0, 80),
            elementCount: paraCount,
            imageCount: imgCount,
            bodyComputedDisplay: doc.defaultView?.getComputedStyle?.(doc.body)?.display,
            bodyComputedVisibility: doc.defaultView?.getComputedStyle?.(doc.body)?.visibility,
          })
          // Captura erros do próprio iframe (ex: falha de CSS/script do EPUB)
          doc.defaultView?.addEventListener('error', (err: ErrorEvent) => {
            console.error('[nr-debug]', 'iframe error', {
              message: err.message,
              filename: err.filename,
              lineno: err.lineno,
            })
          })

          // Armazena parágrafos da seção para uso pelo TTS (audiobook e karaokê)
          ttsParagraphsRef.current = Array.from(doc.querySelectorAll(BLOCK))
            .filter(el => (el.textContent?.trim().length ?? 0) > 2)
          ttsParagraphTextsRef.current = ttsParagraphsRef.current
            .map(el => el.textContent!.trim())

          // Rastreia seção atual e marca a nova seção como pendente até o renderer estabilizar.
          currentSectionIdxRef.current = e.detail.index
          lastRelocateRef.current = null
          pendingSectionVersionRef.current += 1
          pendingSectionRef.current = {
            doc,
            index: e.detail.index,
            version: pendingSectionVersionRef.current,
          }
          isAtBottomRef.current = false
          onAtBottomRef.current?.(false, e.detail.index < totalSectionsRef.current - 1)
          clearFinalizeSectionTimeout()
          finalizeSectionTimeoutRef.current = setTimeout(() => {
            finalizePendingSection('timeout')
          }, 400)
          renderBookmarkMarkers(doc)

          // Detecta swipe para baixo quando no fundo — 2 gestos consecutivos avançam o capítulo.
          // didScroll: Android WebView dispara 'click' mesmo após scroll curto.
          // Rastreamos touchmove para distinguir tap intencional de fim de scroll.
          let touchStartY = 0
          let touchStartX = 0
          let didScroll = false
          let scrollOverflowCount = 0
          let scrollOverflowTopCount = 0
          doc.addEventListener('touchstart', (ev: TouchEvent) => {
            touchStartY = ev.touches[0].clientY
            touchStartX = ev.touches[0].clientX
            didScroll = false
          }, { passive: true })
          doc.addEventListener('touchmove', (ev: TouchEvent) => {
            // Tap slop ~8px: qualquer movimento acima disso é intenção de scroll
            const dy = Math.abs(ev.touches[0].clientY - touchStartY)
            const dx = Math.abs(ev.touches[0].clientX - touchStartX)
            if (dy > 8 || dx > 8) didScroll = true
          }, { passive: true })
          doc.addEventListener('touchend', (ev: TouchEvent) => {
            const deltaY = touchStartY - ev.changedTouches[0].clientY
            const metrics = getScrollMetrics(doc)

            // deltaY positivo = dedo foi para cima = intenção de rolar para baixo
            if (deltaY > 30) {
              // Lê posição diretamente — não depende de isAtBottomRef ser atualizado
              // pelo scroll event antes do touchend (timing não garantido no Android WebView)
              const atBottom = metrics.position + metrics.viewport >= metrics.extent - 20
              if (!atBottom) { scrollOverflowCount = 0; return }
              const hasNext = currentSectionIdxRef.current < totalSectionsRef.current - 1
              if (!hasNext) return
              scrollOverflowCount++
              if (scrollOverflowCount >= 2) {
                scrollOverflowCount = 0
                onSwipeAtBottomRef.current?.()
              }
              return
            }

            // deltaY negativo = dedo foi para baixo = intenção de rolar para cima
            if (deltaY < -30) {
              const atTop = metrics.position <= 20
              if (!atTop) { scrollOverflowTopCount = 0; return }
              const hasPrev = currentSectionIdxRef.current > 0
              if (!hasPrev) return
              scrollOverflowTopCount++
              // 2ª tentativa consecutiva de scroll além do início → volta ao capítulo anterior
              if (scrollOverflowTopCount >= 2) {
                scrollOverflowTopCount = 0
                onSwipeAtTopRef.current?.()
              }
            }
          }, { passive: true })

          doc.addEventListener('click', (ev: MouseEvent) => {
            // Ignora clicks que são resíduo de um gesto de scroll
            if (didScroll) return

            // Chrome visível: qualquer toque fecha os menus sem acionar tradução/TTS.
            // Solução para o Android WebView que ignora z-index de overlays React
            // e entrega o toque diretamente ao iframe (camada de composição separada).
            if (chromeVisibleRef.current) {
              onCenterTapRef.current()
              return
            }

            const target = ev.target as Element
            const para = target.closest(BLOCK) as HTMLElement | null
            if (para?.hasAttribute('data-nr-bookmark') && para.dataset.nrBookmarkId) {
              const rect = para.getBoundingClientRect()
              const clickedBookmarkIcon =
                ev.clientX <= rect.left + 18 &&
                ev.clientY >= rect.top &&
                ev.clientY <= rect.top + 24

              if (clickedBookmarkIcon) {
                const bookmarkId = Number(para.dataset.nrBookmarkId)
                if (Number.isFinite(bookmarkId)) onBookmarkTapRef.current?.(bookmarkId)
                return
              }
            }

            // Intercepta botões Ouvir/Salvar dentro do bloco de tradução inline
            const actionBtn = target.closest('[data-nr-action]') as HTMLElement | null
            if (actionBtn) {
              const action = actionBtn.dataset.nrAction
              if (action === 'speak') {
                onSpeakOneRef.current(activeSourceTextRef.current)
              } else if (action === 'save' && activeTranslatedTextRef.current) {
                onSaveVocabRef.current(activeSourceTextRef.current, activeTranslatedTextRef.current)
                // Feedback visual temporário no botão
                actionBtn.textContent = '✓ Salvo!'
                setTimeout(() => { if (actionBtn.isConnected) actionBtn.textContent = '⭐ Salvar' }, 1500)
              }
              return
            }

            // Tap fora de parágrafo → toggle do chrome
            if (!para || (para.textContent?.trim() ?? '').length < 3) {
              onCenterTapRef.current()
              return
            }

            // Modo leitura contínua ativo (tocando OU pausado): tap navega o TTS
            // ttsGlobalActive abrange os dois estados — evita abrir tradução por engano
            if (ttsGlobalActiveRef.current) {
              const idx = ttsParagraphsRef.current.indexOf(para)
              if (idx >= 0) onParagraphTapForTtsRef.current(idx)
              return
            }

            // Toggle off: parágrafo já destacado → limpa highlight e bloco de tradução inline
            if (para.hasAttribute('data-nr-active')) {
              para.ownerDocument?.getElementById('nr-translation-block')?.remove()
              para.removeAttribute('data-nr-active')
              para.classList.remove('nr-hl')
              const sentSpan = para.querySelector('.nr-hl-sentence')
              if (sentSpan) {
                const parent = sentSpan.parentNode!
                while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
                sentSpan.remove()
              }
              activeTranslationParaRef.current = null
              activeSourceTextRef.current = ''
              activeTranslatedTextRef.current = ''
              return
            }

            // Bloqueia nova seleção enquanto a tradução anterior ainda está em voo
            if (translationInProgressRef.current) return

            // Limpa parágrafo anterior se o tap foi em um parágrafo diferente
            const prevPara = activeTranslationParaRef.current
            if (prevPara && prevPara !== para) {
              prevPara.ownerDocument?.getElementById('nr-translation-block')?.remove()
              prevPara.removeAttribute('data-nr-active')
              prevPara.classList.remove('nr-hl')
              const prevSpan = prevPara.querySelector('.nr-hl-sentence')
              if (prevSpan) {
                const parent = prevSpan.parentNode!
                while (prevSpan.firstChild) parent.insertBefore(prevSpan.firstChild, prevSpan)
                prevSpan.remove()
              }
            }

            // Toggle on: detecta a frase clicada, destaca no iframe e emite para o ReaderScreen.
            // O ReaderScreen injeta o bloco de tradução diretamente no iframe via showTranslationLoading/injectTranslation.
            const sourceText = getSentenceFromClick(ev, para)
            para.setAttribute('data-nr-active', '1')
            highlightSentenceInParagraph(para, sourceText)
            activeTranslationParaRef.current = para
            activeSourceTextRef.current = sourceText
            activeTranslatedTextRef.current = ''
            onTranslateRef.current(sourceText)
          })
        })

        // Se open()+init() não concluírem em 15 s, EPUB provavelmente está corrompido
        // ou em formato não suportado (foliate-js pode travar silenciosamente sem lançar).
        let loadTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          loadTimeout = null
          if (!cancelled) {
            cancelled = true
            onError(new Error('Não foi possível abrir este livro. O arquivo pode estar corrompido ou em formato não suportado.'))
          }
        }, 8_000)

        try {
          console.log('[nr-debug]', 'calling view.open()')
          await view.open(book.fileBlob)
          if (cancelled) { clearTimeout(loadTimeout!); return }

          rendererStabilizedListener = () => {
            scheduleSectionFinalization('stabilized')
          }
          if (view.renderer?.addEventListener) {
            view.renderer.addEventListener('stabilized', rendererStabilizedListener)
          } else {
            console.warn('[nr-debug]', 'renderer not ready for stabilized listener after open')
          }

          // [nr-debug] Após open(): inspeciona estrutura do book parseado.
          // Um spine vazio/ausente aqui é uma das principais causas de tela preta.
          const bk = view.book as unknown as {
            sections?: unknown[]
            toc?: unknown[]
            spine?: unknown[]
            metadata?: { title?: string; language?: string }
            resources?: unknown
          } | undefined
          console.log('[nr-debug]', 'view.open() resolved', {
            hasBook: !!bk,
            sectionsLength: bk?.sections?.length,
            tocLength: bk?.toc?.length,
            spineLength: bk?.spine?.length,
            metadataTitle: bk?.metadata?.title,
            metadataLanguage: bk?.metadata?.language,
            firstSectionExists: !!(bk?.sections?.[0]),
          })

          // Total de seções: usado para checar se há próximo capítulo ao atingir o fundo
          totalSectionsRef.current = view.book?.sections?.length ?? 1

          // Configura o renderer (elemento filho do foliate-view)
          // flow 'scrolled': leitura contínua com scroll — sem paginação lateral
          view.renderer.setAttribute('flow', 'scrolled')
          view.renderer.setAttribute('margin', '48px')
          view.renderer.setAttribute('animated', '')
          view.renderer.setStyles?.(buildReaderCSS(fontSize))
          console.log('[nr-debug]', 'renderer configured')

          onTocReady(view.book?.toc ?? [])

          // CFI com [Cover] = capa sem conteúdo legível → tela preta no tema escuro.
          // Tratamos como "sem posição salva" e começamos pelo primeiro texto real.
          const isAtCover = !!savedCfi?.match(/\[Cover\]/i)
          const initCfi = savedCfi && !isAtCover ? savedCfi : null
          console.log('[nr-debug]', 'calling view.init()', { savedCfi, isAtCover, initCfi })
          await view.init(
            initCfi
              ? { lastLocation: initCfi }
              : { showTextStart: true },
          )
          console.log('[nr-debug]', 'view.init() resolved')

          if (loadTimeout) clearTimeout(loadTimeout)
          if (!cancelled) onLoad()
        } catch (err) {
          // [nr-debug] Loga erro ANTES de propagar — garante que nenhuma exceção silenciosa seja perdida
          console.error('[nr-debug]', 'setup caught exception', err)
          if (loadTimeout) clearTimeout(loadTimeout)
          if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)))
        }
      }

      void setup()

      return () => {
        cancelled = true
        clearFinalizeSectionTimeout()
        scrollListenerCleanupRef.current?.()
        scrollListenerCleanupRef.current = null
        pendingSectionRef.current = null
        currentDocRef.current = null
        lastRelocateRef.current = null
        autoSkipChapterStubDirectionRef.current = 0
        autoSkipChapterStubCountRef.current = 0
        if (rendererStabilizedListener) {
          view?.renderer.removeEventListener?.('stabilized', rendererStabilizedListener)
        }
        view?.close()
        view?.remove()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id]) // Apenas quando muda o livro. Callbacks são estáveis no ReaderScreen.

    return <div ref={containerRef} className="w-full h-full" />
  },
)

EpubViewer.displayName = 'EpubViewer'
