export interface NytBook {
  rank: number
  title: string
  author: string
  book_image: string
  description: string
  amazon_product_url: string
  weeks_on_list: number
}

export interface NytList {
  display_name: string
  updated: string
  books: NytBook[]
}

interface CacheEntry {
  timestamp: number
  data: NytList
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface NytListResponse {
  results: {
    display_name: string
    updated: string
    books: NytBook[]
  }
}

export class NytBooksService {
  private static BASE_URL = 'https://api.nytimes.com/svc/books/v3'

  static async fetchList(listName: string): Promise<NytList> {
    const cached = NytBooksService.readCache(listName)
    if (cached) return cached

    const apiKey = import.meta.env.VITE_NYT_API_KEY as string | undefined
    if (!apiKey) throw new Error('NYT API key missing')

    const url = `${NytBooksService.BASE_URL}/lists/current/${listName}.json?api-key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url)

    if (!response.ok) throw new Error(`NYT API error ${response.status}`)

    const json = await response.json() as NytListResponse
    const list: NytList = {
      display_name: json.results.display_name,
      updated: json.results.updated,
      books: json.results.books.slice(0, 10),
    }

    NytBooksService.writeCache(listName, list)
    return list
  }

  private static cacheKey(listName: string) {
    return `nyt_cache_${listName}`
  }

  private static readCache(listName: string): NytList | null {
    try {
      const raw = localStorage.getItem(NytBooksService.cacheKey(listName))
      if (!raw) return null

      const entry = JSON.parse(raw) as CacheEntry
      return Date.now() - entry.timestamp <= CACHE_TTL_MS ? entry.data : null
    } catch {
      return null
    }
  }

  private static writeCache(listName: string, data: NytList) {
    try {
      localStorage.setItem(NytBooksService.cacheKey(listName), JSON.stringify({ timestamp: Date.now(), data }))
    } catch {
      // Cache is optional; quota/private-mode failures should not break the library.
    }
  }
}
