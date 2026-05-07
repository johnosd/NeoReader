import { db } from '../db/database'
import { saveBookCover } from '../db/bookCovers'
import { saveBookInfo } from '../db/bookInfo'
import { addBook } from '../db/books'
import { saveSourceFolder } from '../db/sourceFolders'
import { EpubService, type EpubMetadata } from './EpubService'
import { BookInfoService } from './bookInfo'
import type { Book, SourceFolder } from '../types/book'

export interface FolderImportOptions {
  folderName: string
  folderUri: string
  includeSubfolders: boolean
  autoImportEnabled: boolean
}

export interface ImportPreviewItem {
  id: string
  file: File
  fileName: string
  fileSize: number
  format: 'EPUB' | 'UNSUPPORTED'
  supported: boolean
  duplicate: boolean
  selected: boolean
  reason?: string
  fileHash?: string
}

export interface ImportSummary {
  imported: number
  duplicate: number
  unsupported: number
  errors: number
}

export interface ImportProgress {
  phase: 'preparing' | 'processing' | 'finishing'
  current: number
  total: number
  fileName?: string
  imported: number
  duplicate: number
  unsupported: number
  errors: number
}

interface ImportSingleEpubOptions {
  metadata?: EpubMetadata
  fileHash?: string
  fileName?: string
  fileSize?: number
  tags?: number[]
  sourceFolderId?: number | null
  uri?: string | null
}

export class BookImportService {
  static async importEpub(file: File): Promise<number> {
    const metadata = await EpubService.parseMetadata(file)
    const fileHash = await this.hashFile(file)
    const duplicate = await this.findDuplicateBook({
      fileHash,
      fileName: file.name,
      fileSize: file.size,
      title: metadata.title,
      author: metadata.author,
    })

    if (duplicate) {
      throw new Error('Este livro ja esta na biblioteca.')
    }

    return this.importSingleEpubRecord(file, {
      metadata,
      fileHash,
      tags: [],
      sourceFolderId: null,
      uri: null,
    })
  }

  static async buildImportPreview(files: File[]): Promise<ImportPreviewItem[]> {
    const existingBooks = await db.books.toArray()
    const existingHashes = new Set(existingBooks.map((book) => book.fileHash).filter(Boolean))
    const existingNameAndSize = new Set(existingBooks.map((book) => this.fileNameSizeKey(book.fileName, book.fileSize)))

    const items: ImportPreviewItem[] = []

    for (const file of files) {
      const supported = this.isSupportedEpub(file)
      const fileHash = supported ? await this.hashFile(file) : undefined
      const duplicate = supported && (
        (fileHash ? existingHashes.has(fileHash) : false) ||
        existingNameAndSize.has(this.fileNameSizeKey(file.name, file.size))
      )

      items.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        format: supported ? 'EPUB' : 'UNSUPPORTED',
        supported,
        duplicate,
        selected: supported && !duplicate,
        reason: supported ? (duplicate ? 'Ja importado' : undefined) : 'Formato nao suportado',
        fileHash,
      })
    }

    return items
  }

  static async importSelectedBooks(params: {
    items: ImportPreviewItem[]
    tagIds: number[]
    sourceFolder: FolderImportOptions
    onProgress?: (progress: ImportProgress) => void
  }): Promise<ImportSummary> {
    const sourceFolderId = await this.saveImportSource(params.sourceFolder)
    const summary: ImportSummary = {
      imported: 0,
      duplicate: 0,
      unsupported: 0,
      errors: 0,
    }
    const selectedItems = params.items.filter((item) => item.selected)
    const total = selectedItems.length

    params.onProgress?.({
      phase: 'preparing',
      current: 0,
      total,
      ...summary,
    })

    for (const [index, item] of selectedItems.entries()) {
      params.onProgress?.({
        phase: 'processing',
        current: index + 1,
        total,
        fileName: item.fileName,
        ...summary,
      })

      if (!item.supported) {
        summary.unsupported += 1
        params.onProgress?.({
          phase: 'processing',
          current: index + 1,
          total,
          fileName: item.fileName,
          ...summary,
        })
        await this.yieldToUi()
        continue
      }

      try {
        const metadata = await EpubService.parseMetadata(item.file)
        const duplicate = await this.findDuplicateBook({
          fileHash: item.fileHash,
          fileName: item.fileName,
          fileSize: item.fileSize,
          title: metadata.title,
          author: metadata.author,
        })

        if (duplicate) {
          summary.duplicate += 1
          params.onProgress?.({
            phase: 'processing',
            current: index + 1,
            total,
            fileName: item.fileName,
            ...summary,
          })
          await this.yieldToUi()
          continue
        }

        await this.importSingleEpubRecord(item.file, {
          metadata,
          fileHash: item.fileHash,
          fileName: item.fileName,
          fileSize: item.fileSize,
          tags: params.tagIds,
          sourceFolderId,
          uri: item.file.webkitRelativePath || item.fileName,
        })
        summary.imported += 1
      } catch (error) {
        console.warn('Book import failed.', error)
        summary.errors += 1
      }

      params.onProgress?.({
        phase: 'processing',
        current: index + 1,
        total,
        fileName: item.fileName,
        ...summary,
      })
      await this.yieldToUi()
    }

    params.onProgress?.({
      phase: 'finishing',
      current: total,
      total,
      ...summary,
    })

    return summary
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

  private static async importSingleEpubRecord(
    file: File,
    options: ImportSingleEpubOptions = {},
  ): Promise<number> {
    const metadata = options.metadata ?? await EpubService.parseMetadata(file)
    const fileHash = options.fileHash ?? await this.hashFile(file)
    const now = new Date()

    const bookId = await db.transaction('rw', db.books, db.bookCovers, async () => {
      const bookId = await addBook({
        title: metadata.title,
        author: metadata.author,
        fileBlob: file,
        fileName: options.fileName ?? file.name,
        fileSize: options.fileSize ?? file.size,
        fileHash,
        format: 'EPUB',
        addedAt: now,
        importedAt: now,
        lastOpenedAt: null,
        readingStatus: 'unread',
        isFavorite: false,
        tags: options.tags ?? [],
        sourceFolderId: options.sourceFolderId ?? null,
        uri: options.uri ?? undefined,
        missingFile: false,
      })

      if (metadata.coverBlob) {
        await saveBookCover(bookId, metadata.coverBlob, 'epub-extracted')
      }

      return bookId
    })

    await this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author)
    return bookId
  }

  private static toStoredFile(book: Pick<Book, 'title' | 'fileBlob'>): File {
    return new File([book.fileBlob], `${book.title}.epub`, {
      type: 'application/epub+zip',
    })
  }

  private static async saveImportSource(folder: FolderImportOptions): Promise<number> {
    const now = new Date()
    const sourceFolder: Omit<SourceFolder, 'id'> = {
      name: folder.folderName,
      uri: folder.folderUri,
      includeSubfolders: folder.includeSubfolders,
      autoImportEnabled: folder.autoImportEnabled,
      createdAt: now,
      lastScannedAt: now,
    }
    return saveSourceFolder(sourceFolder)
  }

  private static async findDuplicateBook(candidate: {
    fileHash?: string
    fileName?: string
    fileSize?: number
    title: string
    author: string
  }): Promise<Book | undefined> {
    const books = await db.books.toArray()
    const titleAuthorKey = this.titleAuthorKey(candidate.title, candidate.author)
    const nameSizeKey = this.fileNameSizeKey(candidate.fileName, candidate.fileSize)

    return books.find((book) => (
      (!!candidate.fileHash && book.fileHash === candidate.fileHash) ||
      this.fileNameSizeKey(book.fileName, book.fileSize) === nameSizeKey ||
      this.titleAuthorKey(book.title, book.author) === titleAuthorKey
    ))
  }

  private static isSupportedEpub(file: File): boolean {
    return /\.epub$/i.test(file.name)
  }

  private static fileNameSizeKey(fileName?: string, fileSize?: number): string {
    return `${(fileName ?? '').trim().toLowerCase()}::${fileSize ?? 0}`
  }

  private static titleAuthorKey(title: string, author: string): string {
    return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`
  }

  private static async hashFile(file: File): Promise<string | undefined> {
    try {
      const buffer = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      return undefined
    }
  }

  private static async yieldToUi(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
