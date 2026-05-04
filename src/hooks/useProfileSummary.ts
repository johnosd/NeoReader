import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Book, ReadingProgress, ReadingStatus } from '../types/book'
import type { StoredBookInfo } from '../types/bookInfo'
import { resolveReadingState } from '../utils/readingState'

export interface ProfileHistoryItem {
  book: Book
  date: Date
  pageCount: number | null
  percentage: number
  rating: number | null
  readingStatus: ReadingStatus
}

export interface ProfileAchievement {
  id: string
  title: string
  description: string
  unlocked: boolean
}

export interface ProfileSummary {
  isLoading: boolean
  stats: {
    finished: number
    reading: number
    favorites: number
    vocabulary: number
  }
  history: ProfileHistoryItem[]
  achievements: ProfileAchievement[]
}

export function useProfileSummary(): ProfileSummary {
  const data = useLiveQuery(async () => {
    const [books, progress, bookInfo, vocabularyCount] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
      db.bookInfo.toArray(),
      db.vocabulary.count(),
    ])

    return { books, progress, bookInfo, vocabularyCount }
  }, [])

  return useMemo((): ProfileSummary => {
    if (!data) {
      return {
        isLoading: true,
        stats: { finished: 0, reading: 0, favorites: 0, vocabulary: 0 },
        history: [],
        achievements: buildAchievements({ opened: false, finished: 0, books: 0, vocabulary: 0 }),
      }
    }

    const progressMap = new Map(data.progress.map((progress) => [progress.bookId, progress]))
    const bookInfoMap = new Map(data.bookInfo.map((info) => [info.bookId, info]))

    const history = data.books
      .map((book) => buildHistoryItem(book, progressMap.get(book.id!), bookInfoMap.get(book.id!)))
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    const finished = history.filter((item) => item.readingStatus === 'finished').length
    const reading = history.filter((item) => item.readingStatus === 'reading').length
    const favorites = data.books.filter((book) => book.isFavorite).length
    const opened = data.books.some((book) => !!book.lastOpenedAt)

    return {
      isLoading: false,
      stats: {
        finished,
        reading,
        favorites,
        vocabulary: data.vocabularyCount,
      },
      history,
      achievements: buildAchievements({
        opened,
        finished,
        books: data.books.length,
        vocabulary: data.vocabularyCount,
      }),
    }
  }, [data])
}

function buildHistoryItem(
  book: Book,
  progress: ReadingProgress | undefined,
  bookInfo: StoredBookInfo | undefined,
): ProfileHistoryItem {
  const state = resolveReadingState(book, progress ?? null)

  return {
    book,
    date: progress?.updatedAt ?? book.lastOpenedAt ?? book.addedAt,
    pageCount: bookInfo?.pageCount?.value ?? null,
    percentage: state.percentage,
    rating: bookInfo?.rating?.value.average ?? null,
    readingStatus: state.readingStatus,
  }
}

function buildAchievements({
  opened,
  finished,
  books,
  vocabulary,
}: {
  opened: boolean
  finished: number
  books: number
  vocabulary: number
}): ProfileAchievement[] {
  return [
    {
      id: 'first-open',
      title: 'Primeira leitura',
      description: 'Abra seu primeiro livro.',
      unlocked: opened,
    },
    {
      id: 'first-finished',
      title: 'Livro concluido',
      description: 'Finalize uma leitura.',
      unlocked: finished >= 1,
    },
    {
      id: 'five-books',
      title: 'Biblioteca ativa',
      description: 'Tenha 5 livros na biblioteca.',
      unlocked: books >= 5,
    },
    {
      id: 'ten-vocab',
      title: 'Vocabulario em crescimento',
      description: 'Salve 10 termos no vocabulario.',
      unlocked: vocabulary >= 10,
    },
  ]
}
