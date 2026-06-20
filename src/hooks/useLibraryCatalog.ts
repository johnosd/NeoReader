import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { resolveReadingState } from '../utils/readingState'
import { includesNormalizedText, normalizeLibraryText } from '../utils/librarySearch'
import type { Book, BookCollection, BookTag, ReadingProgress, ReadingStatus } from '../types/book'

export type LibraryFilter = 'all' | 'reading' | 'unread' | 'finished' | 'favorites' | 'untagged' | `tag:${number}` | `collection:${number}`
export type LibrarySort = 'recent' | 'title' | 'author' | 'importedAt' | 'format' | 'fileName'

export interface LibraryBook extends Book {
  percentage: number
  readingStatus: ReadingStatus
  tagRecords: BookTag[]
}

const SORT_KEY = 'neoreader:library-sort'

export function getStoredLibrarySort(): LibrarySort {
  try {
    const value = window.localStorage.getItem(SORT_KEY)
    if (value === 'recent' || value === 'title' || value === 'author' || value === 'importedAt' || value === 'format' || value === 'fileName') {
      return value
    }
  } catch {
    // Ignore unavailable localStorage.
  }
  return 'recent'
}

export function storeLibrarySort(value: LibrarySort): void {
  try {
    window.localStorage.setItem(SORT_KEY, value)
  } catch {
    // Sorting still works for the current session.
  }
}

export function useLibraryCatalog() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all')
  const [sort, setSortState] = useState<LibrarySort>(() => getStoredLibrarySort())

  const data = useLiveQuery(async () => {
    const [books, progress, tags, collections] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
      db.tags.orderBy('name').toArray(),
      db.collections.orderBy('name').toArray(),
    ])
    return { books, progress, tags, collections }
  }, [])

  function setSort(nextSort: LibrarySort) {
    setSortState(nextSort)
    storeLibrarySort(nextSort)
  }

  const catalog = useMemo(() => {
    if (!data) {
      return {
        isLoading: true,
        books: [] as LibraryBook[],
        filteredBooks: [] as LibraryBook[],
        tags: [] as BookTag[],
        collections: [] as BookCollection[],
      }
    }

    const progressMap = new Map<number, ReadingProgress>()
    for (const progressItem of data.progress) {
      progressMap.set(progressItem.bookId, progressItem)
    }
    const tagMap = new Map(data.tags.filter((tag) => tag.id !== undefined).map((tag) => [tag.id!, tag]))

    const books = data.books.map((book): LibraryBook => {
      const readingState = resolveReadingState(book, book.id !== undefined ? progressMap.get(book.id) : null)
      return {
        ...book,
        format: book.format ?? 'EPUB',
        fileName: book.fileName ?? `${book.title}.epub`,
        fileSize: book.fileSize ?? book.fileBlob?.size ?? 0,
        importedAt: book.importedAt ?? book.addedAt,
        tags: book.tags ?? [],
        missingFile: book.missingFile ?? false,
        ...readingState,
        tagRecords: (book.tags ?? []).map((id) => tagMap.get(id)).filter((tag): tag is BookTag => Boolean(tag)),
      }
    })

    return {
      isLoading: false,
      books,
      filteredBooks: sortBooks(filterBooks(books, activeFilter, search), sort),
      tags: data.tags,
      collections: data.collections,
    }
  }, [activeFilter, data, search, sort])

  return {
    ...catalog,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
    sort,
    setSort,
  }
}

export type { BookCollection }

function filterBooks(books: LibraryBook[], filter: LibraryFilter, search: string): LibraryBook[] {
  const searched = search.trim()
    ? books.filter((book) => matchesSearch(book, search))
    : books

  if (filter === 'all') return searched
  if (filter === 'reading') return searched.filter((book) => book.readingStatus === 'reading')
  if (filter === 'unread') return searched.filter((book) => book.readingStatus === 'unread')
  if (filter === 'finished') return searched.filter((book) => book.readingStatus === 'finished')
  if (filter === 'favorites') return searched.filter((book) => book.isFavorite)
  if (filter === 'untagged') return searched.filter((book) => (book.tags ?? []).length === 0)

  if (filter.startsWith('collection:')) {
    const collectionId = Number(filter.replace('collection:', ''))
    return searched
      .filter((book) => book.collectionId === collectionId)
      .sort((a, b) => (a.collectionOrder ?? 0) - (b.collectionOrder ?? 0))
  }

  const tagId = Number(filter.replace('tag:', ''))
  return searched.filter((book) => (book.tags ?? []).includes(tagId))
}

function matchesSearch(book: LibraryBook, search: string): boolean {
  const fields = [
    book.title,
    book.author,
    book.fileName ?? '',
    book.format ?? 'EPUB',
    ...book.tagRecords.map((tag) => tag.name),
  ]
  return fields.some((field) => includesNormalizedText(field, search))
}

function sortBooks(books: LibraryBook[], sort: LibrarySort): LibraryBook[] {
  return [...books].sort((a, b) => {
    if (sort === 'title') return compareText(a.title, b.title)
    if (sort === 'author') return compareText(a.author, b.author)
    if (sort === 'importedAt') return compareDate(b.importedAt ?? b.addedAt, a.importedAt ?? a.addedAt)
    if (sort === 'format') return compareText(a.format ?? 'EPUB', b.format ?? 'EPUB') || compareText(a.title, b.title)
    if (sort === 'fileName') return compareText(a.fileName ?? '', b.fileName ?? '')
    return compareDate(b.lastOpenedAt ?? b.importedAt ?? b.addedAt, a.lastOpenedAt ?? a.importedAt ?? a.addedAt)
  })
}

function compareText(a: string, b: string): number {
  return normalizeLibraryText(a).localeCompare(normalizeLibraryText(b), 'pt-BR')
}

function compareDate(a: Date, b: Date): number {
  return new Date(a).getTime() - new Date(b).getTime()
}
