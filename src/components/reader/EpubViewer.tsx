import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback } from 'react'
import type { Book } from '../../types/book'
import type { View } from 'foliate-js/view.js'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

// CSS injetado dentro do iframe do foliate para tema escuro + tamanho de fonte.
// Precisa usar !important porque o EPUB tem seus próprios estilos inline e no <link>.
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
  onParagraphTap: (text: string, siblings: Element[]) => void
}

// forwardRef: padrão React para expor métodos imperativos ao componente pai.
// Equivale a um "ref de objeto" que o pai chama com viewerRef.current.next().
export const EpubViewer = forwardRef<EpubViewerHandle, EpubViewerProps>(
  ({ book, fontSize, savedCfi, onRelocate, onTocReady, onLoad, onError, onParagraphTap }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<View | null>(null)
    // Ref para o callback mais recente — evita stale closure nos listeners do iframe.
    // Os listeners são criados uma vez por seção (no evento 'load'), mas o callback
    // pode mudar entre renders. O ref garante que sempre invocamos a versão atual.
    const onParagraphTapRef = useRef(onParagraphTap)
    useEffect(() => { onParagraphTapRef.current = onParagraphTap }, [onParagraphTap])

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
        // o Document do iframe — anexamos aqui o listener de tap em parágrafos.
        // Usamos onParagraphTapRef para evitar stale closure (ver comentário acima).
        view.addEventListener('load', (e: CustomEvent<{ doc: Document; index: number }>) => {
          const { doc } = e.detail
          const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'

          doc.addEventListener('click', (ev: MouseEvent) => {
            const target = ev.target as Element
            const para = target.closest(BLOCK)
            if (!para) return

            const text = para.textContent?.trim() ?? ''
            if (text.length < 3) return

            // Coleta todos os blocos a partir do parágrafo clicado (para o botão +10)
            const allBlocks = Array.from(doc.querySelectorAll(BLOCK))
            const idx = allBlocks.indexOf(para)
            const siblings = allBlocks.slice(idx)

            onParagraphTapRef.current(text, siblings)
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
