import { useEffect, useState } from 'react'
import { findBookByFileName, getBookById } from '../db/books'
import { buildPublicDomainFileName, PublicDomainCatalogService, type PublicDomainCatalogEntry } from '../services/PublicDomainCatalogService'
import { PublicDomainDownloadService } from '../services/PublicDomainDownloadService'
import {
  completePublicDomainDownload,
  getPublicDomainDownloadState,
  subscribePublicDomainDownloads,
  type PublicDomainDownloadState,
} from '../services/PublicDomainDownloadCoordinator'
import type { Book } from '../types/book'

interface UsePublicDomainCatalogResult {
  entries: PublicDomainCatalogEntry[]
  loading: boolean
  error: boolean
  getState: (entryId: string) => PublicDomainDownloadState
  download: (entry: PublicDomainCatalogEntry) => void
  openDownloaded: (entry: PublicDomainCatalogEntry) => void
}

export function usePublicDomainCatalog(onOpenBook: (book: Book) => void): UsePublicDomainCatalogResult {
  const [entries, setEntries] = useState<PublicDomainCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // O catalogo em si nao muda, mas o estado de download (coordinator) sim —
  // esse contador so existe pra forçar um re-render quando ele notifica.
  const [, forceRender] = useState(0)

  useEffect(() => {
    let cancelled = false
    PublicDomainCatalogService.listCatalog()
      .then((catalog) => {
        if (!cancelled) setEntries(catalog)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => subscribePublicDomainDownloads(() => forceRender((count) => count + 1)), [])

  // O coordinator so vive em memoria da sessao atual do app — depois de um
  // restart ele nao "lembra" que um titulo ja foi baixado antes. Aqui a
  // Biblioteca real e a fonte da verdade: se ja existe um Book com o
  // fileName determinístico desse entry, reconcilia o estado pra 'success'
  // em vez de deixar a UI achar que ainda não foi baixado.
  useEffect(() => {
    if (entries.length === 0) return
    let cancelled = false
    void Promise.all(entries.map(async (entry) => {
      if (getPublicDomainDownloadState(entry.id).status !== 'idle') return
      const existingBook = await findBookByFileName(buildPublicDomainFileName(entry))
      if (!cancelled && existingBook?.id != null) {
        completePublicDomainDownload(entry.id, existingBook.id)
      }
    }))
    return () => {
      cancelled = true
    }
  }, [entries])

  return {
    entries,
    loading,
    error,
    getState: getPublicDomainDownloadState,
    download: (entry) => {
      // Fire-and-forget: o resultado (sucesso/erro) ja chega pela UI via
      // subscribePublicDomainDownloads acima, nao precisa de await aqui.
      void PublicDomainDownloadService.download(entry).catch(() => {})
    },
    openDownloaded: (entry) => {
      const { bookId } = getPublicDomainDownloadState(entry.id)
      if (bookId == null) return
      void getBookById(bookId).then((book) => {
        if (book) onOpenBook(book)
      })
    },
  }
}
