import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useSyncRef } from '../../hooks/useSyncRef'
import type { Book } from '../../types/book'
import type { View } from 'foliate-js/view.js'

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
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Retorna a frase do texto que contém o offset de caractere dado.
// Frases são delimitadas por . ! ? seguidos de espaço ou fim de string.
// Fallback: retorna o texto inteiro se não encontrar delimitadores.
function getSentenceAt(text: string, charOffset: number): string {
  // Divide em frases: qualquer sequência que termina com . ! ou ?
  const parts = text.match(/[^.!?]*[.!?]+\s*/g)
  if (!parts || parts.length <= 1) return text.trim()

  let pos = 0
  for (const part of parts) {
    pos += part.length
    if (charOffset < pos) return part.trim()
  }
  // offset além do último ponto (cauda sem pontuação) → última frase encontrada
  return parts[parts.length - 1].trim()
}

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
  `
}

export interface EpubViewerHandle {
  next(): void
  prev(): void
  // Navega para o capítulo anterior e posiciona no final (último parágrafo)
  prevToEnd(): void
  goTo(target: string | number | { fraction: number }): void
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
  fontSize: FontSize
  savedCfi: string | null
  onRelocate: (cfi: string, percentage: number, tocLabel: string | undefined) => void
  onTocReady: (toc: TocItem[]) => void
  onLoad: () => void
  onError: (err: Error) => void
  // Chamado quando o usuário salva um par original/tradução via ⭐
  onSaveVocab: (sourceText: string, translatedText: string) => void
  // Chamado quando o tap cai fora de qualquer parágrafo (margem, imagem)
  // Usado pelo ReaderScreen para toggle do chrome sem overlay
  onCenterTap: () => void
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
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  (
    {
      book, fontSize, savedCfi,
      onRelocate, onTocReady, onLoad, onError,
      onSaveVocab, onCenterTap, onTranslate,
      onSpeakOne, onParagraphTapForTts, ttsGlobalActive,
      onAtBottom, onSwipeAtBottom, onSwipeAtTop,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)

    // Elementos e textos dos parágrafos da seção atual — atualizados no evento 'load'
    const ttsParagraphsRef = useRef<Element[]>([])
    const ttsParagraphTextsRef = useRef<string[]>([])

    // Ref do parágrafo com highlight de tradução ativo — usado por clearTranslation()
    const activeTranslationParaRef = useRef<Element | null>(null)
    // Texto original e traduzido da frase ativa — usados pelos botões Ouvir/Salvar no iframe
    const activeSourceTextRef = useRef<string>('')
    const activeTranslatedTextRef = useRef<string>('')

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

    // Navegação entre capítulos: detecta fundo visual + swipe para avançar
    const isAtBottomRef = useRef(false)
    const currentSectionIdxRef = useRef(0)
    const totalSectionsRef = useRef(1)
    const onAtBottomRef = useSyncRef(onAtBottom)
    const onSwipeAtBottomRef = useSyncRef(onSwipeAtBottom)
    const onSwipeAtTopRef = useSyncRef(onSwipeAtTop)
    // Flag: próximo evento 'load' deve rolar a seção até o fundo (usado após prevToEnd)
    const scrollToBottomOnLoadRef = useRef(false)

    // Expõe API imperativa para o ReaderScreen via ref
    useImperativeHandle(ref, () => ({
      next: () => { viewRef.current?.next() },
      prev: () => { viewRef.current?.prev() },
      prevToEnd: () => {
        scrollToBottomOnLoadRef.current = true
        viewRef.current?.prev()
      },
      goTo: (target) => { viewRef.current?.goTo(target) },

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

      getFirstVisibleParagraphIndex: () => {
        const paras = ttsParagraphsRef.current
        for (let i = 0; i < paras.length; i++) {
          // getBoundingClientRect: coordenadas relativas ao viewport do iframe.
          // rect.bottom > 0 = parágrafo ainda não saiu completamente pelo topo.
          const rect = (paras[i] as HTMLElement).getBoundingClientRect()
          if (rect.bottom > 0) return i
        }
        return 0
      },

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
        const doc = para.ownerDocument!
        // Remove bloco anterior caso exista (ex: tap rápido em parágrafos diferentes)
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
      },

      injectTranslation: (translatedText: string) => {
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
        const para = activeTranslationParaRef.current
        if (!para) return
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

    // Setup principal: cria o elemento foliate, abre o EPUB, configura renderer.
    // Roda apenas quando o bookId muda (novo livro), não a cada re-render.
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      let cancelled = false
      let view: View | null = null

      async function setup() {
        // Import dinâmico: registra o custom element como side-effect
        // e mantém o bundle do foliate fora do chunk inicial
        await import('foliate-js/view.js')
        if (cancelled) return

        view = document.createElement('foliate-view') as unknown as View
        view.style.cssText = 'width:100%;height:100%;display:block'
        container!.appendChild(view)
        viewRef.current = view

        view.addEventListener('relocate', (e: CustomEvent<RelocateDetail>) => {
          const { cfi, fraction, tocItem } = e.detail
          onRelocate(cfi, Math.round(fraction * 100), tocItem?.label)
        })

        // Cada seção do EPUB carrega num iframe separado. O evento 'load' expõe
        // o Document do iframe — toda a lógica de tradução inline acontece aqui.
        view.addEventListener('load', (e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc } = e.detail
          const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'

          // Armazena parágrafos da seção para uso pelo TTS (audiobook e karaokê)
          ttsParagraphsRef.current = Array.from(doc.querySelectorAll(BLOCK))
            .filter(el => (el.textContent?.trim().length ?? 0) > 2)
          ttsParagraphTextsRef.current = ttsParagraphsRef.current
            .map(el => el.textContent!.trim())

          // Rastreia seção atual + reseta estado de fundo (nova seção sempre começa no topo)
          currentSectionIdxRef.current = e.detail.index
          isAtBottomRef.current = false
          onAtBottomRef.current?.(false, false)

          // prevToEnd: rola até o fundo assim que o layout da seção estiver pronto
          if (scrollToBottomOnLoadRef.current) {
            scrollToBottomOnLoadRef.current = false
            // rAF garante que o conteúdo foi renderizado antes de medir scrollHeight
            doc.defaultView?.requestAnimationFrame(() => {
              doc.defaultView?.scrollTo(0, doc.documentElement.scrollHeight)
            })
          }

          // Detecta scroll: TTS auto-scroll + fundo do capítulo.
          // passive:true = não bloqueia o scroll nativo (performance).
          // capture:true = captura antes de qualquer handler filho (garante que não perca eventos).
          let lastScrollY = 0
          // scrollOverflowCount: contador de tentativas de scroll além do fim do capítulo.
          // Resetado ao rolar para cima ou ao carregar nova seção (re-declarado no load).
          let scrollOverflowCount = 0
          doc.defaultView?.addEventListener('scroll', () => {
            // TTS: detecta scroll manual durante leitura para pausar auto-scroll
            if (ttsActiveRef.current && Date.now() > scrollingProgrammaticallyUntilRef.current) {
              userScrolledRef.current = true
            }
            // Capítulo: detecta quando o usuário chega ao fundo da seção
            // scrollHeight - innerHeight - scrollY ≤ 20px → considerado "no fundo"
            const dv = doc.defaultView!
            const currentScrollY = dv.scrollY
            // Scroll para cima cancela intenção de avançar capítulo
            if (currentScrollY < lastScrollY - 5) scrollOverflowCount = 0
            lastScrollY = currentScrollY
            const atBottom = currentScrollY + dv.innerHeight >= doc.documentElement.scrollHeight - 20
            if (atBottom !== isAtBottomRef.current) {
              isAtBottomRef.current = atBottom
              const hasNext = currentSectionIdxRef.current < totalSectionsRef.current - 1
              onAtBottomRef.current?.(atBottom, hasNext)
            }
          }, { passive: true, capture: true })

          // Detecta swipe para baixo quando no fundo — 2 gestos consecutivos avançam o capítulo.
          // didScroll: Android WebView dispara 'click' mesmo após scroll curto.
          // Rastreamos touchmove para distinguir tap intencional de fim de scroll.
          let touchStartY = 0
          let touchStartX = 0
          let didScroll = false
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
            const dv = doc.defaultView!

            // deltaY positivo = dedo foi para cima = intenção de rolar para baixo
            if (deltaY > 30) {
              // Lê posição diretamente — não depende de isAtBottomRef ser atualizado
              // pelo scroll event antes do touchend (timing não garantido no Android WebView)
              const atBottom = dv.scrollY + dv.innerHeight >= doc.documentElement.scrollHeight - 20
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
              const atTop = dv.scrollY <= 20
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
            const target = ev.target as Element

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

            const para = target.closest(BLOCK)

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

            // Toggle on: detecta a frase clicada, destaca no iframe e emite para o ReaderScreen.
            // O ReaderScreen injeta o bloco de tradução diretamente no iframe via showTranslationLoading/injectTranslation.
            const sourceText = getSentenceFromClick(ev, para)
            para.setAttribute('data-nr-active', '1')
            highlightSentenceInParagraph(para, sourceText)
            activeTranslationParaRef.current = para
            activeSourceTextRef.current = sourceText
            onTranslateRef.current(sourceText)
          })
        })

        try {
          await view.open(book.fileBlob)
          if (cancelled) return

          // Total de seções: usado para checar se há próximo capítulo ao atingir o fundo
          totalSectionsRef.current = view.book?.sections?.length ?? 1

          // Configura o renderer (elemento filho do foliate-view)
          // flow 'scrolled': leitura contínua com scroll — sem paginação lateral
          view.renderer.setAttribute('flow', 'scrolled')
          view.renderer.setAttribute('margin', '48px')
          view.renderer.setAttribute('animated', '')
          view.renderer.setStyles?.(buildReaderCSS(fontSize))

          onTocReady(view.book?.toc ?? [])

          // Restaura posição ou vai para o início do texto principal
          await view.init(
            savedCfi
              ? { lastLocation: savedCfi }
              : { showTextStart: true },
          )

          if (!cancelled) onLoad()
        } catch (err) {
          if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)))
        }
      }

      void setup()

      return () => {
        cancelled = true
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
