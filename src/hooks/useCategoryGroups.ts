import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { resolveReadingState } from '../utils/readingState'
import {
  normalizeCategory,
  CANONICAL_GENRE_ORDER,
  GENRE_LABELS,
  type CanonicalGenre,
} from '../utils/categoryNormalizer'
import type { BookWithProgress } from './useLibraryGroups'

export interface CategoryGroup {
  genre: CanonicalGenre
  label: string
  books: BookWithProgress[]
}

interface CategoryGroupsResult {
  isLoading: boolean
  groups: CategoryGroup[]
}

// Rows com menos de 2 livros ficam ocultas (parecem bug, não feature)
const MIN_BOOKS_PER_ROW = 2
// Limita rows na Home para evitar scroll infinito
const MAX_ROWS_HOME = 6

export function useCategoryGroups(): CategoryGroupsResult {
  // Mesmo padrão de useLibraryGroups: query reativa + memo separado
  const data = useLiveQuery(async () => {
    const [books, allProgress, allBookInfo] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
      db.bookInfo.toArray(),
    ])
    return { books, allProgress, allBookInfo }
  }, [])

  return useMemo((): CategoryGroupsResult => {
    if (data === undefined) return { isLoading: true, groups: [] }

    const { books, allProgress, allBookInfo } = data

    const progressMap = new Map(allProgress.map(p => [p.bookId, p]))
    const bookInfoMap = new Map(allBookInfo.map(info => [info.bookId, info]))

    const grouped = new Map<CanonicalGenre, BookWithProgress[]>()

    for (const book of books) {
      const info = bookInfoMap.get(book.id!) ?? null
      const rawCategories = info?.category?.value ?? []
      const genre = normalizeCategory(rawCategories)
      if (!genre) continue

      const bookWithProgress: BookWithProgress = {
        ...book,
        ...resolveReadingState(book, progressMap.get(book.id!) ?? null),
        bookInfo: info,
      }

      if (!grouped.has(genre)) grouped.set(genre, [])
      grouped.get(genre)!.push(bookWithProgress)
    }

    const groups: CategoryGroup[] = CANONICAL_GENRE_ORDER
      .filter(genre => (grouped.get(genre)?.length ?? 0) >= MIN_BOOKS_PER_ROW)
      .slice(0, MAX_ROWS_HOME)
      .map(genre => ({
        genre,
        label: GENRE_LABELS[genre],
        books: grouped.get(genre)!,
      }))

    return { isLoading: false, groups }
  }, [data])
}
