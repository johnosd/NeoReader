import { useCallback, useEffect, useState } from 'react'
import { getBookById } from '../db/books'
import { listCatalogs } from '../db/opdsCatalogs'
import { findDownloadedBookId } from '../db/opdsDownloadedEntries'
import { OpdsCatalogService } from '../services/opds/OpdsCatalogService'
import { OpdsDownloadService } from '../services/opds/OpdsDownloadService'
import {
  completeOpdsDownload,
  getOpdsDownloadState,
  subscribeOpdsDownloads,
} from '../services/opds/OpdsDownloadCoordinator'
import type { Book } from '../types/book'
import type { OpdsCatalog, OpdsDownloadState, OpdsFeedEntry } from '../types/opds'

interface CatalogSample {
  entries: OpdsFeedEntry[]
  loading: boolean
  error: boolean
  // true quando o erro foi detectado como falta de conexão — deixa a UI
  // mostrar "sem conexão" em vez de um erro genérico (User Story 5).
  offline: boolean
}

export interface OpdsCatalogRowData {
  catalog: OpdsCatalog
  entries: OpdsFeedEntry[]
  loading: boolean
  error: boolean
  offline: boolean
}

interface UseOpdsCatalogsResult {
  rows: OpdsCatalogRowData[]
  getState: (catalogId: number, entry: OpdsFeedEntry) => OpdsDownloadState
  download: (catalog: OpdsCatalog, entry: OpdsFeedEntry) => void
  openDownloaded: (catalog: OpdsCatalog, entry: OpdsFeedEntry) => void
  retryCatalog: (catalog: OpdsCatalog) => void
}

const EMPTY_SAMPLE: CatalogSample = { entries: [], loading: true, error: false, offline: false }

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function useOpdsCatalogs(onOpenBook: (book: Book) => void): UseOpdsCatalogsResult {
  const [catalogs, setCatalogs] = useState<OpdsCatalog[]>([])
  const [samples, setSamples] = useState<Record<number, CatalogSample>>({})
  const [, forceRender] = useState(0)

  // Sem mecanismo de refresh manual de propósito: catálogo só muda via CRUD
  // em Settings (OpdsCatalogSettingsScreen), uma tela separada na pilha de
  // navegação — voltar pra Descobrir sempre remonta este hook do zero
  // (App.tsx só renderiza a tela do topo da pilha), o que já recarrega a
  // lista automaticamente. Adicionar um `refresh()` aqui seria estado sem
  // nenhum chamador real.
  useEffect(() => {
    let cancelled = false
    void listCatalogs().then((list) => {
      if (!cancelled) setCatalogs(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const fetchCatalogSample = useCallback((catalog: OpdsCatalog) => {
    if (catalog.id == null) return
    const catalogId = catalog.id

    OpdsCatalogService.fetchSample(catalog)
      // Catálogo com credencial (ex: Calibre) exige auth em toda URL,
      // inclusive capa — <img src> puro nunca carregaria (sem header
      // Authorization). Resolve pra data URI antes de exibir.
      .then((page) => OpdsCatalogService.resolveEntryCovers(catalog, page.entries))
      .then((entries) => {
        setSamples((prev) => ({ ...prev, [catalogId]: { entries, loading: false, error: false, offline: false } }))
      })
      .catch(() => {
        // Erro de um catálogo fica isolado nesse catálogo — os demais
        // continuam funcionando normalmente (User Story 5, AC3).
        setSamples((prev) => ({ ...prev, [catalogId]: { entries: [], loading: false, error: true, offline: isOffline() } }))
      })
  }, [])

  useEffect(() => {
    // Não marca "loading" sincronamente aqui (viraria setState direto no
    // corpo do efeito) — um catálogo sem entrada em `samples` já cai no
    // EMPTY_SAMPLE (loading: true) via o map de `rows` abaixo; um catálogo
    // já carregado antes só atualiza quando a busca nova resolver, sem
    // "piscar" loading de novo a cada refresh.
    for (const catalog of catalogs) fetchCatalogSample(catalog)
  }, [catalogs, fetchCatalogSample])

  useEffect(() => subscribeOpdsDownloads(() => forceRender((count) => count + 1)), [])

  // Reconciliação: pra cada entry de publicação já carregada na amostra,
  // se o coordinator ainda acha que está 'idle', confere se já foi baixada
  // numa sessão anterior (o coordinator só vive em memória da sessão atual).
  useEffect(() => {
    let cancelled = false
    const entriesByCatalog = Object.entries(samples).flatMap(([catalogIdText, sample]) =>
      sample.entries
        .filter((entry) => entry.kind === 'publication')
        .map((entry) => ({ catalogId: Number(catalogIdText), entry })),
    )

    void Promise.all(entriesByCatalog.map(async ({ catalogId, entry }) => {
      if (getOpdsDownloadState(catalogId, entry.id).status !== 'idle') return
      const bookId = await findDownloadedBookId(catalogId, entry.id)
      if (!cancelled && bookId != null) completeOpdsDownload(catalogId, entry.id, bookId)
    }))

    return () => {
      cancelled = true
    }
  }, [samples])

  return {
    rows: catalogs.map((catalog) => {
      const sample = (catalog.id != null ? samples[catalog.id] : undefined) ?? EMPTY_SAMPLE
      return { catalog, entries: sample.entries, loading: sample.loading, error: sample.error, offline: sample.offline }
    }),
    getState: (catalogId, entry) => getOpdsDownloadState(catalogId, entry.id),
    download: (catalog, entry) => {
      // Fire-and-forget: o resultado já chega pela UI via subscribeOpdsDownloads.
      void OpdsDownloadService.download(catalog, entry).catch(() => {})
    },
    openDownloaded: (catalog, entry) => {
      if (catalog.id == null) return
      const { bookId } = getOpdsDownloadState(catalog.id, entry.id)
      if (bookId == null) return
      void getBookById(bookId).then((book) => {
        if (book) onOpenBook(book)
      })
    },
    retryCatalog: (catalog) => {
      if (catalog.id == null) return
      setSamples((prev) => ({ ...prev, [catalog.id!]: { entries: [], loading: true, error: false, offline: false } }))
      fetchCatalogSample(catalog)
    },
  }
}
