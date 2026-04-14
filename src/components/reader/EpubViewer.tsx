import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Book } from '../../types/book'
import type { View } from 'foliate-js/view.js'
import { translate } from '../../services/TranslationService'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

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

    /* Parágrafo selecionado para tradução */
    .nr-hl {
      background-color: rgba(99, 102, 241, 0.15) !important;
      border-radius: 3px !important;
    }
    /* Bloco de tradução injetado após o parágrafo */
    .nr-tr {
      color: #a5b4fc !important;
      font-style: italic !important;
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
  `
}

export interface EpubViewerHandle {
  next(): void
  prev(): void
  goTo(target: string | number | { fraction: number }): void
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
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  ({ book, fontSize, savedCfi, onRelocate, onTocReady, onLoad, onError, onSaveVocab, onCenterTap }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    // Refs para os callbacks mais recentes — evita stale closure nos listeners do iframe.
    // Os listeners são criados uma vez por seção (no evento 'load'), mas os callbacks
    // podem mudar entre renders. Os refs garantem que sempre invocamos a versão atual.
    const onSaveVocabRef = useRef(onSaveVocab)
    useEffect(() => { onSaveVocabRef.current = onSaveVocab }, [onSaveVocab])
    const onCenterTapRef = useRef(onCenterTap)
    useEffect(() => { onCenterTapRef.current = onCenterTap }, [onCenterTap])

    // Expõe API imperativa para o ReaderScreen via ref
    useImperativeHandle(ref, () => ({
      next: () => { viewRef.current?.next() },
      prev: () => { viewRef.current?.prev() },
      goTo: (target) => { viewRef.current?.goTo(target) },
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
        // container não pode ser null aqui: verificamos no início do useEffect
        // e o elemento DOM não some enquanto o componente está montado
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

          doc.addEventListener('click', (ev: MouseEvent) => {
            const target = ev.target as Element

            // Clique no botão ⭐ — salva no vocabulário e troca para ✓
            const saveBtn = target.closest('.nr-save') as HTMLElement | null
            if (saveBtn) {
              if (saveBtn.dataset.saved) return  // já salvo, ignora
              saveBtn.dataset.saved = '1'
              saveBtn.textContent = '✓'
              const trDiv = saveBtn.parentElement as HTMLElement
              onSaveVocabRef.current(trDiv.dataset.source ?? '', trDiv.dataset.translated ?? '')
              return
            }

            const para = target.closest(BLOCK)

            // Tap fora de parágrafo → toggle do chrome
            if (!para || (para.textContent?.trim() ?? '').length < 3) {
              onCenterTapRef.current()
              return
            }

            // Toggle off: parágrafo já destacado → remove highlight e tradução
            if (para.classList.contains('nr-hl')) {
              para.classList.remove('nr-hl')
              const next = para.nextElementSibling
              if (next?.classList.contains('nr-tr')) next.remove()
              return
            }

            // Toggle on: destaca parágrafo e injeta div de tradução logo abaixo
            para.classList.add('nr-hl')
            const trDiv = doc.createElement('p')
            trDiv.className = 'nr-tr'
            trDiv.textContent = '...'   // placeholder enquanto traduz
            para.insertAdjacentElement('afterend', trDiv)

            const sourceText = para.textContent!.trim()
            trDiv.dataset.source = sourceText

            translate(sourceText)
              .then((translated) => {
                trDiv.dataset.translated = translated
                // innerHTML: safe aqui pois `translated` vem da nossa API,
                // não de conteúdo do livro. O botão é criado por nós.
                trDiv.innerHTML = `${translated} <button class="nr-save">⭐</button>`
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
