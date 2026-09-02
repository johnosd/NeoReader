import { useEffect, useRef, useState } from 'react'
import { getBookById } from '../db/books'
import { findDownloadedBookId } from '../db/opdsDownloadedEntries'
import { OpdsCatalogService } from '../services/opds/OpdsCatalogService'
import { OpdsDownloadService } from '../services/opds/OpdsDownloadService'
import {
  completeOpdsDownload,
  getOpdsDownloadState,
  subscribeOpdsDownloads,
} from '../services/opds/OpdsDownloadCoordinator'
import type { Book } from '../types/book'
import type { OpdsCatalog, OpdsDownloadState, OpdsFeedEntry, OpdsFeedPage, OpdsSortOrder } from '../types/opds'

const SEARCH_DEBOUNCE_MS = 400

export interface BreadcrumbItem {
  title: string
  url: string
}

interface UseOpdsCatalogBrowseResult {
  entries: OpdsFeedEntry[]
  loading: boolean
  error: boolean
  breadcrumb: BreadcrumbItem[]
  canSearch: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortOrder: OpdsSortOrder
  setSortOrder: (sortOrder: OpdsSortOrder) => void
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  navigateTo: (entry: OpdsFeedEntry) => void
  navigateToBreadcrumb: (index: number) => void
  getState: (entry: OpdsFeedEntry) => OpdsDownloadState
  download: (entry: OpdsFeedEntry) => void
  openDownloaded: (entry: OpdsFeedEntry) => void
}

export function useOpdsCatalogBrowse(
  catalog: OpdsCatalog,
  rootTitle: string,
  onOpenBook: (book: Book) => void,
  // Permite abrir a tela já dentro de uma pasta específica (ex: usuário tocou
  // numa entry de navegação direto na row de amostra de Descobrir, sem passar
  // pela raiz do catálogo primeiro) — o breadcrumb já nasce com os 2 níveis,
  // então "voltar" continua funcionando normalmente.
  initialFolder?: BreadcrumbItem,
): UseOpdsCatalogBrowseResult {
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(
    initialFolder ? [{ title: rootTitle, url: catalog.baseUrl }, initialFolder] : [{ title: rootTitle, url: catalog.baseUrl }],
  )
  const [entries, setEntries] = useState<OpdsFeedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [nextPageUrl, setNextPageUrl] = useState<string | undefined>()
  const [canSearch, setCanSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Convenção do Gutenberg (sort_order), não padrão OPDS — ver
  // OpdsCatalogService.ts. Fica em state (não resetado ao navegar) de
  // propósito: se o usuário volta pra raiz do catálogo depois de entrar
  // numa pasta, a ordem escolhida continua aplicada.
  const [sortOrder, setSortOrder] = useState<OpdsSortOrder>('default')
  const [, forceRender] = useState(0)

  const currentUrl = breadcrumb[breadcrumb.length - 1]!.url
  // Ref (não state) de propósito: usado só pra decidir, dentro do efeito de
  // busca, qual request disparar — colocar em state e no array de deps do
  // efeito causaria um segundo fetch redundante assim que o valor chegasse
  // do primeiro carregamento (undefined -> URL real dispararia o efeito de
  // novo).
  const searchUrlRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const trimmedQuery = searchQuery.trim()

    function applyPage(page: OpdsFeedPage, isSearchResult: boolean) {
      if (cancelled) return
      setEntries(page.entries)
      setNextPageUrl(page.nextPageUrl)
      if (!isSearchResult) {
        searchUrlRef.current = page.searchUrl
        setCanSearch(Boolean(page.searchUrl))
      }
      setLoading(false)
    }

    function runFetch() {
      setLoading(true)
      setError(false)
      const request = trimmedQuery && searchUrlRef.current
        ? OpdsCatalogService.search(catalog, searchUrlRef.current, trimmedQuery, sortOrder)
        : OpdsCatalogService.fetchPage(catalog, currentUrl, sortOrder)

      request
        // Catálogo com credencial exige auth em toda URL, inclusive capa —
        // <img src> puro nunca carregaria (mesmo caso de useOpdsCatalogs.ts).
        .then((page) => OpdsCatalogService.resolveEntryCovers(catalog, page.entries).then((entries) => ({ ...page, entries })))
        .then((page) => applyPage(page, Boolean(trimmedQuery)))
        .catch(() => {
          if (cancelled) return
          setEntries([])
          setNextPageUrl(undefined)
          setLoading(false)
          setError(true)
        })
    }

    if (trimmedQuery) {
      const timeoutId = setTimeout(runFetch, SEARCH_DEBOUNCE_MS)
      return () => {
        cancelled = true
        clearTimeout(timeoutId)
      }
    }

    runFetch()
    return () => {
      cancelled = true
    }
  }, [currentUrl, searchQuery, catalog, sortOrder])

  useEffect(() => subscribeOpdsDownloads(() => forceRender((count) => count + 1)), [])

  // Reconciliação "já na biblioteca" — mesma lógica de useOpdsCatalogs,
  // repetida aqui porque a navegação completa carrega entries diferentes da
  // amostra (User Story 3, Acceptance Scenario 5).
  useEffect(() => {
    if (catalog.id == null) return
    const catalogId = catalog.id
    let cancelled = false

    void Promise.all(
      entries
        .filter((entry) => entry.kind === 'publication')
        .map(async (entry) => {
          if (getOpdsDownloadState(catalogId, entry.id).status !== 'idle') return
          const bookId = await findDownloadedBookId(catalogId, entry.id)
          if (!cancelled && bookId != null) completeOpdsDownload(catalogId, entry.id, bookId)
        }),
    )

    return () => {
      cancelled = true
    }
  }, [entries, catalog.id])

  return {
    entries,
    loading,
    error,
    breadcrumb,
    canSearch,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    hasMore: Boolean(nextPageUrl),
    loadingMore,
    loadMore: () => {
      if (!nextPageUrl || loadingMore) return
      setLoadingMore(true)
      OpdsCatalogService.fetchPage(catalog, nextPageUrl)
        .then((page) => OpdsCatalogService.resolveEntryCovers(catalog, page.entries).then((entries) => ({ ...page, entries })))
        .then((page) => {
          setEntries((prev) => [...prev, ...page.entries])
          setNextPageUrl(page.nextPageUrl)
          setLoadingMore(false)
        })
        .catch(() => setLoadingMore(false))
    },
    navigateTo: (entry) => {
      if (entry.kind !== 'navigation' || !entry.navigationUrl) return
      setSearchQuery('')
      setBreadcrumb((prev) => [...prev, { title: entry.title, url: entry.navigationUrl! }])
    },
    navigateToBreadcrumb: (index) => {
      setSearchQuery('')
      setBreadcrumb((prev) => prev.slice(0, index + 1))
    },
    getState: (entry) => (catalog.id != null ? getOpdsDownloadState(catalog.id, entry.id) : { key: entry.id, status: 'idle' }),
    download: (entry) => {
      void OpdsDownloadService.download(catalog, entry).catch(() => {})
    },
    openDownloaded: (entry) => {
      if (catalog.id == null) return
      const { bookId } = getOpdsDownloadState(catalog.id, entry.id)
      if (bookId == null) return
      void getBookById(bookId).then((book) => {
        if (book) onOpenBook(book)
      })
    },
  }
}
