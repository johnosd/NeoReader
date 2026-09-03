import { useEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'

interface UseWindowVirtualListOptions {
  count: number
  estimateSize: (index: number) => number
  overscan?: number
}

/**
 * Wrapper fino sobre useWindowVirtualizer (@tanstack/react-virtual): usa a
 * `window` como scroll container em vez de um elemento com altura fixa, pra
 * manter o scroll de página inteira já existente na tela de Biblioteca
 * (cabeçalho + filtros + lista/grid rolando juntos — FR-002 da spec).
 * Compartilhado entre o modo lista (LibraryScreen) e o modo grid
 * (LibraryGridView, virtualizado por linha de 3 livros).
 */
export function useWindowVirtualList({ count, estimateSize, overscan = 5 }: UseWindowVirtualListOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Refs não podem ser lidos durante o render, nem setState chamado
  // sincronamente dentro de um effect (regras do eslint-plugin react-hooks
  // v7) — só é aceito dentro do callback de uma subscrição a um sistema
  // externo. Um ResizeObserver no <body> dispara sempre que a altura total
  // da página muda, inclusive quando só o cabeçalho acima do container
  // (filtros/tags que podem quebrar linha) cresce/encolhe, já que isso
  // empurra o body inteiro.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setScrollMargin(element.offsetTop)
    })
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize,
    overscan,
    scrollMargin,
    // Por padrão a lib usa flushSync pra recalcular a janela visível de
    // forma síncrona — colide com o React quando lista e grid desmontam/
    // montam no mesmo commit (troca de viewMode), gerando o erro "flushSync
    // was called from inside a lifecycle method" (achado testando no
    // browser real). Sem isso o recálculo só demora 1 frame a mais,
    // imperceptível pro usuário.
    useFlushSync: false,
  })

  return { containerRef, virtualizer }
}
