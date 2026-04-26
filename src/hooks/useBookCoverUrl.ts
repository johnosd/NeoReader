import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBookCover } from '../db/bookCovers'

export function useBookCoverUrl(bookId: number | undefined): string | null {
  const cover = useLiveQuery(
    () => (bookId === undefined ? Promise.resolve(undefined) : getBookCover(bookId)),
    [bookId],
  )
  const coverBlob = cover?.blob ?? null

  const coverUrl = useMemo(
    () => (coverBlob ? URL.createObjectURL(coverBlob) : null),
    [coverBlob],
  )

  useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl)
    }
  }, [coverUrl])

  return coverUrl
}
