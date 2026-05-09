import { saveBookInfo } from '../../db/bookInfo'
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
    const file = await BookFileResolver.resolveFile(book)
    const collected = await new BookInfoService([
      new EpubBookInfoProvider(),
      new GoogleBooksProvider(),
      new OpenLibraryProvider(),
      new YouTubeReviewsProvider({ apiKey: settings.appSettings.youtubeApiKey }),
    ], options).collect(file, {
      lookupHints: {
        title: book.title,
        author: book.author,
        identifiers: [],
      },
    })

    return saveBookInfo(book.id, collected)
  }
}
