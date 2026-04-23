import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBookCover } from '../db/bookCovers'

export function useBookCoverUrl(bookId: number | undefined): string | null {
  const cover = useLiveQuery(
    () => (bookId === undefined ? Promise.resolve(undefined) : getBookCover(bookId)),
    [bookId],
  )
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!cover?.blob) {
      setCoverUrl(null)
      return
    }

    const nextCoverUrl = URL.createObjectURL(cover.blob)
    setCoverUrl(nextCoverUrl)

    return () => {
      URL.revokeObjectURL(nextCoverUrl)
    }
  }, [cover?.blob])

  return coverUrl
}
