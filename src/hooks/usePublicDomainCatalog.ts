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

const FALLBACK_SAMPLE_SIZE = 8

interface UsePublicDomainCatalogResult {
  entries: PublicDomainCatalogEntry[]
  sampleEntries: PublicDomainCatalogEntry[]
  loading: boolean
  sampleLoading: boolean
  error: boolean
  getState: (entryId: string) => PublicDomainDownloadState
  download: (entry: PublicDomainCatalogEntry) => void
  openDownloaded: (entry: PublicDomainCatalogEntry) => void
}

export function usePublicDomainCatalog(onOpenBook: (book: Book) => void): UsePublicDomainCatalogResult {
  const [entries, setEntries] = useState<PublicDomainCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sampleEntries, setSampleEntries] = useState<PublicDomainCatalogEntry[]>([])
  const [sampleLoading, setSampleLoading] = useState(true)
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

  // Amostra ao vivo (US4) — se o feed falhar (offline, servidor fora do ar),
  // cai pros primeiros itens da lista curada em vez de deixar a row vazia
  // (a seção continua funcionando, só sem refletir lançamentos recentes).
  // Busca listCatalog() de novo dentro do .catch() (em vez de reusar o
  // `entries` do state/closure) de propósito — evita depender da ordem de
  // resolução entre os dois efeitos, que rodam em paralelo e não têm
  // garantia de qual termina primeiro.
  useEffect(() => {
    let cancelled = false
    PublicDomainCatalogService.fetchNewReleasesSample()
      .then((sample) => {
        if (!cancelled) setSampleEntries(sample)
      })
      .catch(() => {
        void PublicDomainCatalogService.listCatalog()
          .then((catalog) => {
            if (!cancelled) setSampleEntries(catalog.slice(0, FALLBACK_SAMPLE_SIZE))
          })
          .catch(() => undefined)
      })
      .finally(() => {
        if (!cancelled) setSampleLoading(false)
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
  // em vez de deixar a UI achar que ainda não foi baixado. Cobre tanto a
  // lista curada quanto a amostra ao vivo (mesmo formato de id/fileName).
  useEffect(() => {
    const allEntries = [...entries, ...sampleEntries]
    if (allEntries.length === 0) return
    let cancelled = false
    void Promise.all(allEntries.map(async (entry) => {
      if (getPublicDomainDownloadState(entry.id).status !== 'idle') return
      const existingBook = await findBookByFileName(buildPublicDomainFileName(entry))
      if (!cancelled && existingBook?.id != null) {
        completePublicDomainDownload(entry.id, existingBook.id)
      }
    }))
    return () => {
      cancelled = true
    }
  }, [entries, sampleEntries])

  return {
    entries,
    sampleEntries,
    loading,
    sampleLoading,
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
