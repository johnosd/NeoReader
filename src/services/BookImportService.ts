import { db } from '../db/database'
import { saveBookCover } from '../db/bookCovers'
import { saveBookInfo } from '../db/bookInfo'
import { addBook } from '../db/books'
import { EpubService } from './EpubService'
import { BookInfoService } from './bookInfo'
import type { Book } from '../types/book'

export class BookImportService {
  static async importEpub(file: File): Promise<number> {
    const metadata = await EpubService.parseMetadata(file)

    const bookId = await db.transaction('rw', db.books, db.bookCovers, async () => {
      const bookId = await addBook({
        title: metadata.title,
        author: metadata.author,
        fileBlob: file,
        addedAt: new Date(),
        lastOpenedAt: null,
      })

      if (metadata.coverBlob) {
        await saveBookCover(bookId, metadata.coverBlob, 'epub-extracted')
      }

      return bookId
    })

    await this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author)
    return bookId
  }

  static async reextractCover(book: Pick<Book, 'id' | 'title' | 'fileBlob'>): Promise<boolean> {
    if (book.id === undefined) throw new Error('Livro sem id para reextrair capa.')

    const metadata = await EpubService.parseMetadata(this.toStoredFile(book))
    if (!metadata.coverBlob) return false

    await saveBookCover(book.id, metadata.coverBlob, 'epub-extracted')
    // Invalida cache de extras para refletir possíveis mudanças no EPUB
    EpubService.invalidateExtrasCache(book.id)
    return true
  }

  static async updateManualCover(bookId: number, coverBlob: Blob): Promise<void> {
    await saveBookCover(bookId, coverBlob, 'manual-upload')
  }

  private static async collectAndSaveBookInfo(
    bookId: number,
    file: File,
    title: string,
    author: string,
  ): Promise<void> {
    try {
      const info = await new BookInfoService().collect(file, {
        lookupHints: {
          title,
          author,
          identifiers: [],
        },
      })
      await saveBookInfo(bookId, info)
    } catch (error) {
      console.warn('Book info enrichment failed during import.', error)
    }
  }

  private static toStoredFile(book: Pick<Book, 'title' | 'fileBlob'>): File {
    return new File([book.fileBlob], `${book.title}.epub`, {
      type: 'application/epub+zip',
    })
  }
}
