import { useEffect, useState } from 'react'
import { getStoredBookInfo, patchBookInfo, saveBookInfo } from '../db/bookInfo'
import {
  BookInfoService,
  EpubBookInfoProvider,
  GoogleBooksProvider,
  OpenLibraryProvider,
  YouTubeReviewsProvider,
} from '../services/bookInfo'
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
}

export function useBookInfo({
  book,
  enabled,
  youtubeApiKey,
  refreshToken,
}: UseBookInfoOptions) {
  const requestKey = `${book.id ?? 'new'}::${refreshToken}::${youtubeApiKey}`
  const [state, setState] = useState<{
    key: string
    info: StoredBookInfo | null
    loading: boolean
    diagnostics: BookInfoProviderAttemptDiagnostic[]
  }>({
    key: requestKey,
    info: null,
    loading: true,
    diagnostics: [],
  })

  useEffect(() => {
    if (!book.id || !enabled) return

    let cancelled = false

    async function loadBookInfo() {
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
        const isOutdated = (stored?.metadataSchemaVersion ?? 1) < CURRENT_BOOK_INFO_SCHEMA_VERSION
        const needsBaseCollection = !stored || isOutdated || !hasDisplayableBookInfo(stored) || refreshToken > 0
        const needsYoutubeReviews = Boolean(youtubeApiKey)
          && !stored?.reviews?.value.some((review) => review.provider === 'youtube')

        if (needsBaseCollection) {
          const collected = await new BookInfoService([
            new EpubBookInfoProvider(),
            new GoogleBooksProvider(),
            new OpenLibraryProvider(),
            new YouTubeReviewsProvider({ apiKey: youtubeApiKey }),
          ], { onProviderAttempt: recordDiagnostic }).collect(book.fileBlob, {
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
          ], { onProviderAttempt: recordDiagnostic }).collect(book.fileBlob, stored)

          if (collected.reviews) {
            nextInfo = await patchBookInfo(book.id!, {
              reviews: collected.reviews,
              lookupHints: collected.lookupHints,
            })
          }
        }

        if (!cancelled) {
          setState({
            key: requestKey,
            info: nextInfo,
            loading: false,
            diagnostics: providerAttempts,
          })
        }
      } catch (error) {
        console.warn('Book info enrichment failed in details screen.', error)
        if (!cancelled) {
          setState({
            key: requestKey,
            info: null,
            loading: false,
            diagnostics: providerAttempts,
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
  }, [book.author, book.fileBlob, book.id, book.title, enabled, requestKey, refreshToken, youtubeApiKey])

  return {
    info: state.key === requestKey ? state.info : null,
    loading: enabled ? state.key !== requestKey || state.loading : true,
    diagnostics: state.key === requestKey ? state.diagnostics : [],
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
