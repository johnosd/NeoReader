import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Book } from '../../types/book'
import type { View } from 'foliate-js/view.js'
import {
  clearTranslationSelection,
  escapeHtml,
  getSentenceFromClick,
  highlightSentenceInParagraph,
  splitParagraphIntoChunks,
  type ActiveTranslationSelection,
} from './epubSelection'

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
  goTo(target: string | number | { fraction: number }): void
  getParagraphs(): string[]
  getSentenceChunks(): TtsChunk[]
  getFirstVisibleParagraphIndex(): number
  highlightTts(paraIdx: number, wordStart: number, wordEnd: number): void
  clearTts(): void
  scrollToParagraph(idx: number): void
  resetTtsScroll(): void
  showTranslationLoading(requestId: number): void
  injectTranslation(requestId: number, translatedText: string): void
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
  onSaveVocab: (sourceText: string, translatedText: string) => void
  onCenterTap: () => void
  onTranslate: (sourceText: string, requestId: number) => void
  onSpeakOne: (text: string, paraIdx: number) => void
  onParagraphTapForTts: (idx: number) => void
  ttsGlobalActive: boolean
  onAtBottom?: (atBottom: boolean, hasNext: boolean) => void
  onSwipeAtBottom?: () => void
}

export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  (
    {
      book, fontSize, savedCfi,
      onRelocate, onTocReady, onLoad, onError,
      onSaveVocab, onCenterTap, onTranslate,
      onSpeakOne, onParagraphTapForTts, ttsGlobalActive,
      onAtBottom, onSwipeAtBottom,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)

    const ttsParagraphsRef = useRef<Element[]>([])
    const ttsParagraphTextsRef = useRef<string[]>([])

    // A seleção ativa guarda o requestId para descartar respostas antigas de tradução.
    const activeSelectionRef = useRef<ActiveTranslationSelection | null>(null)
    const requestSeqRef = useRef(0)

    const ttsActiveRef = useRef(false)
    const userScrolledRef = useRef(false)
    const scrollingProgrammaticallyUntilRef = useRef(0)

    const onSaveVocabRef = useRef(onSaveVocab)
    useEffect(() => { onSaveVocabRef.current = onSaveVocab }, [onSaveVocab])
    const onCenterTapRef = useRef(onCenterTap)
    useEffect(() => { onCenterTapRef.current = onCenterTap }, [onCenterTap])
    const onTranslateRef = useRef(onTranslate)
    useEffect(() => { onTranslateRef.current = onTranslate }, [onTranslate])
    const onSpeakOneRef = useRef(onSpeakOne)
    useEffect(() => { onSpeakOneRef.current = onSpeakOne }, [onSpeakOne])
    const onParagraphTapForTtsRef = useRef(onParagraphTapForTts)
    useEffect(() => { onParagraphTapForTtsRef.current = onParagraphTapForTts }, [onParagraphTapForTts])
    const ttsGlobalActiveRef = useRef(ttsGlobalActive)
    useEffect(() => { ttsGlobalActiveRef.current = ttsGlobalActive }, [ttsGlobalActive])

    const isAtBottomRef = useRef(false)
    const currentSectionIdxRef = useRef(0)
    const totalSectionsRef = useRef(1)
    const onAtBottomRef = useRef(onAtBottom)
    const onSwipeAtBottomRef = useRef(onSwipeAtBottom)
    useEffect(() => { onAtBottomRef.current = onAtBottom }, [onAtBottom])
    useEffect(() => { onSwipeAtBottomRef.current = onSwipeAtBottom }, [onSwipeAtBottom])

    useImperativeHandle(ref, () => ({
      next: () => { void viewRef.current?.next() },
      prev: () => { void viewRef.current?.prev() },
      goTo: (target) => { void viewRef.current?.goTo(target) },

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
          const rect = (paras[i] as HTMLElement).getBoundingClientRect()
          if (rect.bottom > 0) return i
        }
        return 0
      },

      scrollToParagraph: (idx: number) => {
        if (userScrolledRef.current) return
        const para = ttsParagraphsRef.current[idx] as HTMLElement | undefined
        if (!para) return
        scrollingProgrammaticallyUntilRef.current = Date.now() + 1000
        para.scrollIntoView({ block: 'center', behavior: 'smooth' })
      },

      resetTtsScroll: () => {
        userScrolledRef.current = false
        ttsActiveRef.current = true
      },

      highlightTts: (paraIdx, wordStart, wordEnd) => {
        ttsParagraphsRef.current.forEach((el) => {
          el.classList.remove('nr-tts-hl')
          const htmlEl = el as HTMLElement
          if (htmlEl.dataset.originalHtml) {
            el.innerHTML = htmlEl.dataset.originalHtml
            delete htmlEl.dataset.originalHtml
          }
        })

        const para = ttsParagraphsRef.current[paraIdx]
        if (!para) return

        para.classList.add('nr-tts-hl')
        if (wordStart === 0 && wordEnd === 0) return

        const htmlPara = para as HTMLElement
        if (!htmlPara.dataset.originalHtml) {
          htmlPara.dataset.originalHtml = para.innerHTML
        }

        const text = para.textContent ?? ''
        para.innerHTML =
          escapeHtml(text.slice(0, wordStart)) +
          `<mark class="nr-tts-word">${escapeHtml(text.slice(wordStart, wordEnd))}</mark>` +
          escapeHtml(text.slice(wordEnd))
      },

      clearTts: () => {
        ttsActiveRef.current = false
        ttsParagraphsRef.current.forEach((el) => {
          el.classList.remove('nr-tts-hl')
          const htmlEl = el as HTMLElement
          if (htmlEl.dataset.originalHtml) {
            el.innerHTML = htmlEl.dataset.originalHtml
            delete htmlEl.dataset.originalHtml
          }
        })
      },

      showTranslationLoading: (requestId: number) => {
        const activeSelection = activeSelectionRef.current
        if (!activeSelection || activeSelection.requestId !== requestId) return

        const doc = activeSelection.para.ownerDocument!
        doc.getElementById('nr-translation-block')?.remove()

        const block = doc.createElement('div')
        block.id = 'nr-translation-block'
        block.className = 'nr-translation-block'
        block.innerHTML = `
          <div class="nr-tr-loading">
            <span class="nr-tr-spinner"></span>
            <span>Traduzindo…</span>
          </div>`
        activeSelection.para.after(block)
      },

      injectTranslation: (requestId: number, translatedText: string) => {
        const activeSelection = activeSelectionRef.current
        if (!activeSelection || activeSelection.requestId !== requestId) return

        const block = activeSelection.para.ownerDocument?.getElementById('nr-translation-block')
        if (!block) return

        activeSelection.translatedText = translatedText
        block.innerHTML = `
          <p class="nr-tr-text">${escapeHtml(translatedText)}</p>
          <div class="nr-tr-actions">
            <button data-nr-action="speak">🔊 Ouvir</button>
            <button data-nr-action="save">⭐ Salvar</button>
          </div>`
      },

      clearTranslation: () => {
        clearTranslationSelection(activeSelectionRef.current)
        activeSelectionRef.current = null
      },
    }))

    useEffect(() => {
      viewRef.current?.renderer.setStyles?.(buildReaderCSS(fontSize))
    }, [fontSize])

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      let cancelled = false
      let view: View | null = null
      const host = container

      async function setup() {
        await import('foliate-js/view.js')
        if (cancelled) return

        view = document.createElement('foliate-view') as unknown as View
        view.style.cssText = 'width:100%;height:100%;display:block'
        host.appendChild(view)
        viewRef.current = view

        view.addEventListener('relocate', (e: CustomEvent<RelocateDetail>) => {
          const { cfi, fraction, tocItem } = e.detail
          onRelocate(cfi, Math.round(fraction * 100), tocItem?.label)
        })

        view.addEventListener('load', (e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc } = e.detail
          const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'

          clearTranslationSelection(activeSelectionRef.current)
          activeSelectionRef.current = null

          ttsParagraphsRef.current = Array.from(doc.querySelectorAll(BLOCK))
            .filter((el) => (el.textContent?.trim().length ?? 0) > 2)
          ttsParagraphTextsRef.current = ttsParagraphsRef.current
            .map((el) => el.textContent!.trim())

          currentSectionIdxRef.current = e.detail.index
          isAtBottomRef.current = false
          onAtBottomRef.current?.(false, false)

          doc.defaultView?.addEventListener('scroll', () => {
            if (ttsActiveRef.current && Date.now() > scrollingProgrammaticallyUntilRef.current) {
              userScrolledRef.current = true
            }

            const dv = doc.defaultView!
            const atBottom = dv.scrollY + dv.innerHeight >= doc.documentElement.scrollHeight - 20
            if (atBottom !== isAtBottomRef.current) {
              isAtBottomRef.current = atBottom
              const hasNext = currentSectionIdxRef.current < totalSectionsRef.current - 1
              onAtBottomRef.current?.(atBottom, hasNext)
            }
          }, { passive: true, capture: true })

          let touchStartY = 0
          let wasAtBottomOnTouchStart = false
          doc.addEventListener('touchstart', (ev: TouchEvent) => {
            touchStartY = ev.touches[0].clientY
            wasAtBottomOnTouchStart = isAtBottomRef.current
          }, { passive: true })
          doc.addEventListener('touchend', (ev: TouchEvent) => {
            const deltaY = touchStartY - ev.changedTouches[0].clientY
            if (wasAtBottomOnTouchStart && isAtBottomRef.current && deltaY > 30) {
              onSwipeAtBottomRef.current?.()
            }
          }, { passive: true })

          doc.addEventListener('click', (ev: MouseEvent) => {
            const target = ev.target as Element

            const actionBtn = target.closest('[data-nr-action]') as HTMLElement | null
            if (actionBtn) {
              const activeSelection = activeSelectionRef.current
              if (!activeSelection) return

              const action = actionBtn.dataset.nrAction
              if (action === 'speak') {
                onSpeakOneRef.current(activeSelection.sourceText, activeSelection.paraIdx)
              } else if (action === 'save' && activeSelection.translatedText) {
                onSaveVocabRef.current(activeSelection.sourceText, activeSelection.translatedText)
                actionBtn.textContent = '✓ Salvo!'
                setTimeout(() => { if (actionBtn.isConnected) actionBtn.textContent = '⭐ Salvar' }, 1500)
              }
              return
            }

            const para = target.closest(BLOCK)
            if (!para || (para.textContent?.trim() ?? '').length < 3) {
              onCenterTapRef.current()
              return
            }

            if (ttsGlobalActiveRef.current) {
              const idx = ttsParagraphsRef.current.indexOf(para)
              if (idx >= 0) onParagraphTapForTtsRef.current(idx)
              return
            }

            if (para.hasAttribute('data-nr-active')) {
              clearTranslationSelection(activeSelectionRef.current)
              activeSelectionRef.current = null
              return
            }

            clearTranslationSelection(activeSelectionRef.current)

            const paraIdx = ttsParagraphsRef.current.indexOf(para)
            const sourceText = getSentenceFromClick(ev, para)
            const requestId = ++requestSeqRef.current
            para.setAttribute('data-nr-active', '1')
            highlightSentenceInParagraph(para, sourceText)

            activeSelectionRef.current = {
              para,
              paraIdx: paraIdx >= 0 ? paraIdx : 0,
              sourceText,
              translatedText: '',
              requestId,
            }
            onTranslateRef.current(sourceText, requestId)
          })
        })

        try {
          await view.open(book.fileBlob)
          if (cancelled) return

          totalSectionsRef.current = view.book?.sections?.length ?? 1
          view.renderer.setAttribute('flow', 'scrolled')
          view.renderer.setAttribute('margin', '48px')
          view.renderer.setAttribute('animated', '')
          view.renderer.setStyles?.(buildReaderCSS(fontSize))

          onTocReady(view.book?.toc ?? [])

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
        clearTranslationSelection(activeSelectionRef.current)
        activeSelectionRef.current = null
        view?.close()
        view?.remove()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id])

    return <div ref={containerRef} className="w-full h-full" />
  },
)

EpubViewer.displayName = 'EpubViewer'
