import { markYoutubeReviewsChecked, saveBookInfo } from '../../db/bookInfo'
import { getSettings } from '../../db/settings'
import { BookFileResolver } from '../BookFileResolver'
import type { Book } from '../../types/book'
import type { BookInfoProviderAttemptDiagnostic, StoredBookInfo } from '../../types/bookInfo'
import { BookInfoService } from './BookInfoService'
import { EpubBookInfoProvider } from './EpubBookInfoProvider'
import { GoogleBooksProvider } from './GoogleBooksProvider'
import { OpenLibraryProvider } from './OpenLibraryProvider'
import { YouTubeReviewsProvider } from './YouTubeReviewsProvider'

interface RefreshBookInfoOptions {
  onProviderAttempt?: (attempt: BookInfoProviderAttemptDiagnostic) => void
}

export class BookInfoRefreshService {
  static async refreshBookInfo(
    book: Book,
    options: RefreshBookInfoOptions = {},
  ): Promise<StoredBookInfo> {
    if (!book.id) throw new Error('Livro sem identificador local.')

    const settings = await getSettings()
    const youtubeApiKey = settings.appSettings.youtubeApiKey
    const file = await BookFileResolver.resolveFile(book)

    let youtubeAttemptFailed = false
    const collected = await new BookInfoService([
      new EpubBookInfoProvider({ bookId: book.id }),
      new GoogleBooksProvider(),
      new OpenLibraryProvider(),
      new YouTubeReviewsProvider({ apiKey: youtubeApiKey }),
    ], {
      ...options,
      onProviderAttempt: (attempt) => {
        if (attempt.source === 'youtube' && attempt.status === 'failed') youtubeAttemptFailed = true
        options.onProviderAttempt?.(attempt)
      },
    }).collect(file, {
      lookupHints: {
        title: book.title,
        author: book.author,
        identifiers: [],
      },
    })

    const saved = await saveBookInfo(book.id, collected)
    // Refresh manual ("Atualizar informacoes") sempre roda o YouTube de novo —
    // marca o timestamp pra useBookInfo nao repetir essa mesma busca logo em
    // seguida na proxima abertura da tela de detalhes.
    if (youtubeApiKey && !youtubeAttemptFailed) {
      await markYoutubeReviewsChecked(book.id)
    }

    return saved
  }
}
