import { useEffect, useState } from 'react'
import { NytBooksService, type NytBook } from '../services/NytBooksService'

interface NytTrendingResult {
  books: NytBook[]
  displayName: string
  loading: boolean
  error: string | null
}

export function useNytTrending(listName: string): NytTrendingResult {
  const [books, setBooks] = useState<NytBook[]>([])
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const list = await NytBooksService.fetchList(listName)
        if (cancelled) return

        setBooks(list.books)
        setDisplayName(list.display_name)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar lista')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [listName])

  return { books, displayName, loading, error }
}
