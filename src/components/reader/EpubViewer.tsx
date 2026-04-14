import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Book } from '../../types/book'
import type { View } from 'foliate-js/view.js'
import { translate } from '../../services/TranslationService'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

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
    * {
      font-size: ${sizes[fontSize]} !important;
      line-height: 1.7 !important;
      color: #e8e8e8 !important;
      background-color: transparent !important;
    }
    a { color: #818cf8 !important; }
    h1, h2, h3, h4, h5, h6 {
      color: #ffffff !important;
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
    /* Bloco de tradução injetado após o parágrafo */
    .nr-tr {
      color: #a5b4fc !important;
      font-style: italic !important;
      font-size: 0.85em !important;
      margin-top: 6px !important;
      display: block !important;
      background-color: transparent !important;
    }
    /* Botão ⭐ dentro do bloco de tradução */
    .nr-save {
      cursor: pointer !important;
      color: #6366f1 !important;
      background: none !important;
      border: none !important;
      padding: 0 4px !important;
      font-size: inherit !important;
      vertical-align: middle !important;
    }
    /* Botão 🔊 dentro do bloco de tradução */
    .nr-tts-btn {
      cursor: pointer !important;
      background: none !important;
      border: none !important;
      padding: 0 4px !important;
      font-size: inherit !important;
      vertical-align: middle !important;
    }
    /* Linha de botões centralizada abaixo do texto de tradução */
    .nr-btn-row {
      display: block !important;
      text-align: center !important;
      margin-top: 6px !important;
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
  `
}

export interface EpubViewerHandle {
  next(): void
  prev(): void
  goTo(target: string | number | { fraction: number }): void
  // TTS: retorna os textos puros de todos os parágrafos da seção atual
  getParagraphs(): string[]
  // TTS: destaca parágrafo + palavra (wordStart === wordEnd === 0 → só parágrafo)
  highlightTts(paraIdx: number, wordStart: number, wordEnd: number): void
  // TTS: remove todos os destaques de audiobook
  clearTts(): void
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
  // TTS: lê um único parágrafo (acionado pelo botão 🔊 no bloco de tradução)
  onSpeakOne: (text: string) => void
  // TTS: quando audiobook está tocando, tap em parágrafo pula para ele
  onParagraphTapForTts: (idx: number) => void
  // TTS: true quando audiobook está rodando (muda o comportamento do tap em parágrafo)
  ttsIsPlaying: boolean
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  (
    {
      book, fontSize, savedCfi,
      onRelocate, onTocReady, onLoad, onError,
      onSaveVocab, onCenterTap,
      onSpeakOne, onParagraphTapForTts, ttsIsPlaying,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)

    // Elementos e textos dos parágrafos da seção atual — atualizados no evento 'load'
    const ttsParagraphsRef = useRef<Element[]>([])
    const ttsParagraphTextsRef = useRef<string[]>([])

    // Refs para os callbacks mais recentes — evita stale closure nos listeners do iframe.
    // Os listeners são criados uma vez por seção (no evento 'load'), mas os callbacks
    // podem mudar entre renders. Os refs garantem que sempre invocamos a versão atual.
    const onSaveVocabRef = useRef(onSaveVocab)
    useEffect(() => { onSaveVocabRef.current = onSaveVocab }, [onSaveVocab])
    const onCenterTapRef = useRef(onCenterTap)
    useEffect(() => { onCenterTapRef.current = onCenterTap }, [onCenterTap])
    const onSpeakOneRef = useRef(onSpeakOne)
    useEffect(() => { onSpeakOneRef.current = onSpeakOne }, [onSpeakOne])
    const onParagraphTapForTtsRef = useRef(onParagraphTapForTts)
    useEffect(() => { onParagraphTapForTtsRef.current = onParagraphTapForTts }, [onParagraphTapForTts])
    // ttsIsPlaying como ref para ser lido dentro do click handler sem stale closure
    const ttsIsPlayingRef = useRef(ttsIsPlaying)
    useEffect(() => { ttsIsPlayingRef.current = ttsIsPlaying }, [ttsIsPlaying])

    // Expõe API imperativa para o ReaderScreen via ref
    useImperativeHandle(ref, () => ({
      next: () => { viewRef.current?.next() },
      prev: () => { viewRef.current?.prev() },
      goTo: (target) => { viewRef.current?.goTo(target) },

      getParagraphs: () => ttsParagraphTextsRef.current,

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
        ttsParagraphsRef.current.forEach(el => {
          el.classList.remove('nr-tts-hl')
          const htmlEl = el as HTMLElement
          if (htmlEl.dataset.originalHtml) {
            el.innerHTML = htmlEl.dataset.originalHtml
            delete htmlEl.dataset.originalHtml
          }
        })
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

          doc.addEventListener('click', (ev: MouseEvent) => {
            const target = ev.target as Element

            // Clique no botão ⭐ — salva no vocabulário e troca para ✓
            const saveBtn = target.closest('.nr-save') as HTMLElement | null
            if (saveBtn) {
              ev.stopPropagation()  // impede foliate de tratar como page-turn
              if (saveBtn.dataset.saved) return  // já salvo, ignora
              saveBtn.dataset.saved = '1'
              saveBtn.textContent = '✓'
              const trDiv = saveBtn.closest('[data-source]') as HTMLElement
              onSaveVocabRef.current(trDiv.dataset.source ?? '', trDiv.dataset.translated ?? '')
              return
            }

            // Clique no botão 🔊 — lê o parágrafo original em inglês
            if (target.closest('.nr-tts-btn')) {
              ev.stopPropagation()  // impede foliate de tratar como page-turn
              const trDiv = target.closest('[data-source]') as HTMLElement | null
              onSpeakOneRef.current(trDiv?.dataset.source ?? '')
              return
            }

            const para = target.closest(BLOCK)

            // Tap fora de parágrafo → toggle do chrome
            if (!para || (para.textContent?.trim() ?? '').length < 3) {
              onCenterTapRef.current()
              return
            }

            // Se o audiobook está tocando: tap em parágrafo = pula para ele
            if (ttsIsPlayingRef.current) {
              const idx = ttsParagraphsRef.current.indexOf(para)
              if (idx >= 0) onParagraphTapForTtsRef.current(idx)
              return
            }

            // Toggle off: parágrafo já traduzido → remove highlight e tradução
            if (para.hasAttribute('data-nr-active')) {
              para.removeAttribute('data-nr-active')
              para.classList.remove('nr-hl')
              // Remove o span de frase se existir (unwrap: move filhos para cima)
              const sentSpan = para.querySelector('.nr-hl-sentence')
              if (sentSpan) {
                const parent = sentSpan.parentNode!
                while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
                sentSpan.remove()
              }
              const next = para.nextElementSibling
              if (next?.classList.contains('nr-tr')) next.remove()
              return
            }

            // Toggle on: detecta a frase clicada primeiro, depois destaca e traduz
            const sourceText = getSentenceFromClick(ev, para)
            para.setAttribute('data-nr-active', '1')
            highlightSentenceInParagraph(para, sourceText)

            const trDiv = doc.createElement('p')
            trDiv.className = 'nr-tr'
            trDiv.textContent = '...'   // placeholder enquanto traduz
            para.insertAdjacentElement('afterend', trDiv)
            trDiv.dataset.source = sourceText

            translate(sourceText)
              .then((translated) => {
                trDiv.dataset.translated = translated
                // innerHTML: safe aqui pois `translated` vem da nossa API,
                // não de conteúdo do livro. Os botões ficam numa linha centrada abaixo.
                trDiv.innerHTML = `${translated}<span class="nr-btn-row"><button class="nr-save">⭐</button><button class="nr-tts-btn">🔊</button></span>`
              })
              .catch(() => { trDiv.textContent = 'Erro ao traduzir.' })
          })
        })

        try {
          await view.open(book.fileBlob)
          if (cancelled) return

          // Configura o renderer (elemento filho do foliate-view)
          view.renderer.setAttribute('flow', 'paginated')
          view.renderer.setAttribute('gap', '5%')
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
