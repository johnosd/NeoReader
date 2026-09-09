import { useEffect, useRef, useState } from 'react'
import { getStoredBookInfo, markYoutubeReviewsChecked, patchBookInfo, saveBookInfo } from '../db/bookInfo'
import {
  BookInfoService,
  EpubBookInfoProvider,
  GoogleBooksProvider,
  OpenLibraryProvider,
  YouTubeReviewsProvider,
} from '../services/bookInfo'
import { BookFileResolver } from '../services/BookFileResolver'
import { createFlowId, getDiagnosticsNowMs, logError } from '../services/DiagnosticsLogger'
import {
  FeatureQuotaService,
  buildBookIntelligenceQuotaSubject,
  type FeatureQuotaSnapshot,
} from '../services/FeatureQuotaService'
import type { Book } from '../types/book'
import type {
  BookInfoProviderAttemptDiagnostic,
  ResolvedBookInfo,
  StoredBookInfo,
} from '../types/bookInfo'
import { BOOK_INFO_SCHEMA_VERSION as CURRENT_BOOK_INFO_SCHEMA_VERSION } from '../types/bookInfo'

interface UseBookInfoOptions {
  book: Book
  enabled: boolean
  youtubeApiKey: string
  refreshToken: number
  isPro: boolean | null
}

export function useBookInfo({
  book,
  enabled,
  youtubeApiKey,
  refreshToken,
  isPro,
}: UseBookInfoOptions) {
  // Ref: lê isPro atualizado dentro do effect sem torná-lo dep (evita re-runs).
  // O service-level billingLoading já protege contra consumo errado quando isPro=null.
  const isProRef = useRef(isPro)
  isProRef.current = isPro
  const requestKey = `${book.id ?? 'new'}::${refreshToken}::${youtubeApiKey}`
  const [state, setState] = useState<{
    key: string
    info: StoredBookInfo | null
    loading: boolean
    diagnostics: BookInfoProviderAttemptDiagnostic[]
    quota: FeatureQuotaSnapshot | null
  }>({
    key: requestKey,
    info: null,
    loading: true,
    diagnostics: [],
    quota: null,
  })

  useEffect(() => {
    if (!book.id || !enabled) return

    let cancelled = false

    async function loadBookInfo() {
      const flowId = createFlowId('bookinfo-details')
      const startedAt = getDiagnosticsNowMs()
      const providerAttempts: BookInfoProviderAttemptDiagnostic[] = []
      const recordDiagnostic = (attempt: BookInfoProviderAttemptDiagnostic) => {
        providerAttempts.push(attempt)
        if (import.meta.env.DEV && !cancelled) {
          setState((previous) => ({
            ...previous,
            key: requestKey,
            loading: true,
            diagnostics: [...providerAttempts],
          }))
        }
      }

      try {
        const stored = await getStoredBookInfo(book.id!)
        if (cancelled) return

        let nextInfo = stored ?? null
        let quota: FeatureQuotaSnapshot | null = null
        const isOutdated = (stored?.metadataSchemaVersion ?? 1) < CURRENT_BOOK_INFO_SCHEMA_VERSION
        const needsBaseCollection = !stored || isOutdated || !hasDisplayableBookInfo(stored) || refreshToken > 0
        // youtubeReviewsCheckedAt (nao "ja tem review de youtube salva"): uma
        // busca que rodou e nao achou nada tambem conta como "verificado" —
        // senao repete a busca em toda abertura da tela pra livros sem
        // cobertura no YouTube, gastando cota a toa.
        const needsYoutubeReviews = Boolean(youtubeApiKey) && !stored?.youtubeReviewsCheckedAt
        const needsCollection = needsBaseCollection || needsYoutubeReviews
        // So resolve o arquivo do EPUB quando a colheita base precisa dele —
        // o YoutubeReviewsProvider (unico provider do branch needsYoutubeReviews
        // isolado) nunca le o fileBlob. Resolver o arquivo à toa aqui já
        // travou a tela inteira: se o arquivo tiver sumido, resolveFile
        // lança, e o catch abaixo descartava o `stored` que já estava bom.
        const file = needsBaseCollection ? await BookFileResolver.resolveFile(book) : null

        if (needsCollection) {
          quota = FeatureQuotaService.consume('book-intelligence', {
            isPro: isProRef.current,
            subjectKey: buildBookIntelligenceQuotaSubject({
              bookId: book.id,
              title: book.title,
              author: book.author,
            }),
          })

          if (!quota.allowed) {
            if (!cancelled) {
              setState({
                key: requestKey,
                info: nextInfo,
                loading: false,
                diagnostics: providerAttempts,
                quota,
              })
            }
            return
          }
        }

        if (needsBaseCollection) {
          const collected = await new BookInfoService([
            new EpubBookInfoProvider({ bookId: book.id }),
            new GoogleBooksProvider(),
            new OpenLibraryProvider(),
            new YouTubeReviewsProvider({ apiKey: youtubeApiKey }),
          ], { onProviderAttempt: recordDiagnostic, flowId, screen: 'book-details' }).collect(file, {
            lookupHints: {
              title: book.title,
              author: book.author,
              identifiers: [],
            },
          })
          nextInfo = await saveBookInfo(book.id!, collected)
        } else if (needsYoutubeReviews) {
          const collected = await new BookInfoService([
            new YouTubeReviewsProvider({ apiKey: youtubeApiKey }),
          ], { onProviderAttempt: recordDiagnostic, flowId, screen: 'book-details' }).collect(file, stored)

          if (collected.reviews) {
            nextInfo = await patchBookInfo(book.id!, {
              reviews: collected.reviews,
              lookupHints: collected.lookupHints,
            })
          }
        }

        if (needsYoutubeReviews) {
          const youtubeAttempt = providerAttempts.find((attempt) => attempt.source === 'youtube')
          if (youtubeAttempt && youtubeAttempt.status !== 'failed') {
            await markYoutubeReviewsChecked(book.id!)
          }
        }

        if (!cancelled) {
          setState({
            key: requestKey,
            info: nextInfo,
            loading: false,
            diagnostics: providerAttempts,
            quota,
          })
        }
      } catch (error) {
        console.warn('Book info enrichment failed in details screen.', error)
        logError('bookinfo.collect.failure', error, {
          flowId,
          screen: 'book-details',
          status: 'failure',
          durationMs: getDiagnosticsNowMs() - startedAt,
          details: {
            bookId: book.id,
            providerAttempts: providerAttempts.length,
            hasYoutubeKey: Boolean(youtubeApiKey),
          },
        })
        if (!cancelled) {
          setState({
            key: requestKey,
            info: null,
            loading: false,
            diagnostics: providerAttempts,
            quota: null,
          })
        }
      } finally {
        if (!cancelled) {
          setState((previous) => (
            previous.key === requestKey
              ? { ...previous, loading: false }
              : previous
          ))
        }
      }
    }

    void loadBookInfo()

    return () => {
      cancelled = true
    }
  }, [book, book.author, book.fileBlob, book.id, book.storageMode, book.title, book.uri, enabled, requestKey, refreshToken, youtubeApiKey])

  return {
    info: state.key === requestKey ? state.info : null,
    loading: enabled ? state.key !== requestKey || state.loading : true,
    diagnostics: state.key === requestKey ? state.diagnostics : [],
    quota: state.key === requestKey ? state.quota : null,
  }
}

function hasDisplayableBookInfo(info: ResolvedBookInfo | null | undefined): boolean {
  return Boolean(
    info?.synopsis
    || info?.category
    || info?.rating
    || info?.pageCount
    || info?.publishedDate
    || info?.publisher
    || info?.language
    || info?.isbn10
    || info?.isbn13
    || info?.subtitle
    || info?.series
    || info?.edition
    || info?.universalIdentifier
    || (info?.reviews?.value.length ?? 0) > 0,
  )
}
