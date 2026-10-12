import { useCallback, useMemo, useState } from 'react'

interface SelectableBook {
  id?: number
}

export interface LibrarySelection {
  selectedIds: ReadonlySet<number>
  // Modo de seleção = existe ao menos um livro marcado (feature 023, D-03).
  // Não há booleano separado: desmarcar o último encerra o modo sozinho.
  isSelecting: boolean
  toggle: (id: number) => void
  clear: () => void
}

// Seleção efêmera da Biblioteca (D-01): vive só enquanto a tela está montada.
export function useLibrarySelection(books: SelectableBook[]): LibrarySelection {
  const [rawIds, setRawIds] = useState<ReadonlySet<number>>(() => new Set())

  // Livros que deixaram de existir (excluídos por fora, por exemplo) saem da
  // seleção por derivação, sem efeito extra: a interseção é recalculada
  // sempre que a biblioteca muda.
  const selectedIds = useMemo(() => {
    if (rawIds.size === 0) return rawIds
    const existing = new Set(books.map((book) => book.id))
    const kept = [...rawIds].filter((id) => existing.has(id))
    return kept.length === rawIds.size ? rawIds : new Set(kept)
  }, [books, rawIds])

  // Serve tanto pro primeiro long-press (entra no modo) quanto pros toques seguintes.
  const toggle = useCallback((id: number) => {
    setRawIds((current) => {
      // Sempre um Set novo: o React compara estado por referência (como `is` em
      // Python), então mutar o Set antigo não dispararia re-render.
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setRawIds(new Set()), [])

  return { selectedIds, isSelecting: selectedIds.size > 0, toggle, clear }
}
