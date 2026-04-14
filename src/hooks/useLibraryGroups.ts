import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Book } from '../types/book'

// Book enriquecido com o percentual de leitura já resolvido
export interface BookWithProgress extends Book {
  percentage: number
}

interface LibraryGroups {
  isLoading: boolean
  isEmpty: boolean
  heroBook: BookWithProgress | null       // último livro aberto
  inProgressBooks: BookWithProgress[]     // com progresso > 0, exceto hero
  recentBooks: BookWithProgress[]         // todos por addedAt desc, exceto hero
}

export function useLibraryGroups(): LibraryGroups {
  // Uma única query reativa que junta books + progress do IndexedDB.
  // Promise.all garante que as duas tabelas sejam lidas em paralelo.
  const data = useLiveQuery(async () => {
    const [books, allProgress] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
    ])
    return { books, allProgress }
  }, [])

  // useMemo evita recomputar os grupos a cada render quando `data` não mudou.
  // Separar a query (useLiveQuery) do cálculo (useMemo) é boa prática:
  // a query reage ao IndexedDB, o memo só recalcula quando o resultado muda.
  return useMemo((): LibraryGroups => {
    if (data === undefined) {
      return { isLoading: true, isEmpty: false, heroBook: null, inProgressBooks: [], recentBooks: [] }
    }

    const { books, allProgress } = data

    // Map bookId → percentage para lookup O(1)
    const progressMap = new Map(allProgress.map(p => [p.bookId, p.percentage]))

    const withProgress: BookWithProgress[] = books.map(b => ({
      ...b,
      percentage: progressMap.get(b.id!) ?? 0,
    }))

    if (withProgress.length === 0) {
      return { isLoading: false, isEmpty: true, heroBook: null, inProgressBooks: [], recentBooks: [] }
    }

    // Hero: livro com lastOpenedAt mais recente (o último que o usuário abriu)
    const opened = withProgress
      .filter(b => b.lastOpenedAt !== null)
      .sort((a, b) => b.lastOpenedAt!.getTime() - a.lastOpenedAt!.getTime())
    const heroBook = opened[0] ?? null
    const heroId = heroBook?.id

    // "Continue lendo": com progresso, excluindo o hero, por lastOpenedAt desc
    const inProgressBooks = withProgress
      .filter(b => b.percentage > 0 && b.id !== heroId)
      .sort((a, b) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))

    // "Adicionados recentemente": todos exceto hero, por addedAt desc
    const recentBooks = withProgress
      .filter(b => b.id !== heroId)
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())

    return { isLoading: false, isEmpty: false, heroBook, inProgressBooks, recentBooks }
  }, [data])
}
