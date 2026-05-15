import { db } from '../db/database'
import { saveBookCover } from '../db/bookCovers'
import { saveBookInfo } from '../db/bookInfo'
import { addBook } from '../db/books'
import { saveSourceFolder } from '../db/sourceFolders'
import { EpubService, type EpubMetadata } from './EpubService'
import { BookInfoService } from './bookInfo'
import { BookFileResolver } from './BookFileResolver'
import { readNativeFolderFile, type NativeFolderFile } from './NativeLibraryImportService'
import type { Book, BookStorageMode, SourceFolder } from '../types/book'

export interface FolderImportOptions {
  folderName: string
  folderUri: string
  includeSubfolders: boolean
  autoImportEnabled: boolean
}

export interface ImportPreviewItem {
  id: string
  file?: File
  nativeFile?: NativeFolderFile
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
  filePath?: string
  tags?: number[]
  sourceFolderId?: number | null
  uri?: string | null
  storageMode?: BookStorageMode
  deferBookInfo?: boolean
}

interface DuplicateCandidate {
  fileHash?: string
  fileName?: string
  fileSize?: number
  title?: string
  author?: string
  uri?: string
}

interface DuplicateIndex {
  uris: Set<string>
  fileHashes: Set<string>
  nameAndSize: Set<string>
  titleAndAuthor: Set<string>
}

export class BookImportService {
  static async importEpub(file: File): Promise<number> {
    const startedAt = performance.now()
    logEpubImportDiagnostic('file-import-start', {
      fileName: file.name,
      fileSize: file.size,
    })
    const metadata = await EpubService.parseMetadata(file)
    logEpubImportDiagnostic('file-metadata-parsed', {
      fileName: file.name,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    const fileHash = await this.hashFile(file)
    logEpubImportDiagnostic('file-hash-computed', {
      fileName: file.name,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
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

    const bookId = await this.importSingleEpubRecord(file, {
      metadata,
      fileHash,
      tags: [],
      sourceFolderId: null,
      uri: null,
      storageMode: 'embedded',
    })
    logEpubImportDiagnostic('file-import-finished', {
      fileName: file.name,
      bookId,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    return bookId
  }

  static async importNativeEpub(nativeFile: NativeFolderFile): Promise<number> {
    const startedAt = performance.now()
    logEpubImportDiagnostic('native-import-start', {
      fileName: nativeFile.name,
      reportedSize: nativeFile.size,
      hasPath: Boolean(nativeFile.path),
    })
    const file = await readNativeFolderFile(nativeFile)
    logEpubImportDiagnostic('native-file-read', {
      fileName: nativeFile.name,
      fileSize: file.size,
      reportedSize: nativeFile.size,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    const metadata = await EpubService.parseMetadata(file)
    logEpubImportDiagnostic('native-metadata-parsed', {
      fileName: nativeFile.name,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    const fileHash = await this.hashFile(file)
    logEpubImportDiagnostic('native-hash-computed', {
      fileName: nativeFile.name,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    const fileSize = file.size || nativeFile.size
    const duplicate = await this.findDuplicateBook({
      fileHash,
      fileName: nativeFile.name,
      fileSize,
      title: metadata.title,
      author: metadata.author,
      uri: nativeFile.uri,
    })

    if (duplicate) {
      throw new Error('Este livro ja esta na biblioteca.')
    }

    const bookId = await this.importSingleEpubRecord(file, {
      metadata,
      fileHash,
      fileName: nativeFile.name,
      fileSize,
      filePath: nativeFile.path,
      tags: [],
      sourceFolderId: null,
      uri: nativeFile.uri,
      storageMode: 'external',
    })
    logEpubImportDiagnostic('native-import-finished', {
      fileName: nativeFile.name,
      bookId,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    return bookId
  }

  static async buildImportPreview(files: File[]): Promise<ImportPreviewItem[]> {
    const duplicateIndex = await this.buildDuplicateIndex()
    const items: ImportPreviewItem[] = []

    for (const file of files) {
      const supported = this.isSupportedEpub(file)
      const fileHash = supported ? await this.hashFile(file) : undefined
      const candidate = {
        fileHash,
        fileName: file.name,
        fileSize: file.size,
      }
      const duplicate = supported && this.hasDuplicateBook(candidate, duplicateIndex)

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

      if (supported && !duplicate) {
        this.registerDuplicate(duplicateIndex, candidate)
      }
    }

    return items
  }

  static async buildNativeImportPreview(files: NativeFolderFile[]): Promise<ImportPreviewItem[]> {
    const duplicateIndex = await this.buildDuplicateIndex()

    return files.map((file) => {
      const supported = /\.epub$/i.test(file.name)
      const candidate = {
        fileName: file.name,
        fileSize: file.size,
        uri: file.uri,
      }
      const duplicate = supported && this.hasDuplicateBook(candidate, duplicateIndex)

      if (supported && !duplicate) {
        this.registerDuplicate(duplicateIndex, candidate)
      }

      return {
        id: `${file.uri}-${file.size}`,
        nativeFile: file,
        fileName: file.name,
        fileSize: file.size,
        format: supported ? 'EPUB' : 'UNSUPPORTED',
        supported,
        duplicate,
        selected: supported && !duplicate,
        reason: supported ? (duplicate ? 'Ja importado' : undefined) : 'Formato nao suportado',
      }
    })
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
    const duplicateIndex = await this.buildDuplicateIndex()

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
        const itemStartedAt = performance.now()
        logEpubImportDiagnostic('batch-item-start', {
          fileName: item.fileName,
          native: Boolean(item.nativeFile),
          reportedSize: item.fileSize,
        })
        const file = item.file ?? (item.nativeFile ? await readNativeFolderFile(item.nativeFile) : null)
        if (!file) throw new Error('Arquivo invalido.')
        logEpubImportDiagnostic('batch-item-file-read', {
          fileName: item.fileName,
          native: Boolean(item.nativeFile),
          fileSize: file.size,
          elapsedMs: Math.round(performance.now() - itemStartedAt),
        })
        const metadata = await EpubService.parseMetadata(file)
        logEpubImportDiagnostic('batch-item-metadata-parsed', {
          fileName: item.fileName,
          elapsedMs: Math.round(performance.now() - itemStartedAt),
        })
        const fileHash = item.fileHash ?? await this.hashFile(file)
        logEpubImportDiagnostic('batch-item-hash-computed', {
          fileName: item.fileName,
          elapsedMs: Math.round(performance.now() - itemStartedAt),
        })
        const fileSize = item.nativeFile ? (file.size || item.fileSize) : (item.fileSize || file.size)
        const candidate = {
          fileHash,
          fileName: item.fileName,
          fileSize,
          title: metadata.title,
          author: metadata.author,
          uri: item.nativeFile?.uri,
        }
        const duplicate = this.hasDuplicateBook(candidate, duplicateIndex)

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

        await this.importSingleEpubRecord(file, {
          metadata,
          fileHash,
          fileName: item.fileName,
          fileSize,
          filePath: item.nativeFile?.path ?? item.file?.webkitRelativePath,
          tags: params.tagIds,
          sourceFolderId,
          uri: item.nativeFile?.uri ?? item.file?.webkitRelativePath ?? item.fileName,
          storageMode: item.nativeFile ? 'external' : 'embedded',
          deferBookInfo: true,
        })
        this.registerDuplicate(duplicateIndex, candidate)
        summary.imported += 1
        logEpubImportDiagnostic('batch-item-finished', {
          fileName: item.fileName,
          elapsedMs: Math.round(performance.now() - itemStartedAt),
        })
      } catch (error) {
        console.warn(`Book import failed: ${item.fileName}`, error instanceof Error ? error.message : String(error))
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

  static async reextractCover(book: Book): Promise<boolean> {
    if (book.id === undefined) throw new Error('Livro sem id para reextrair capa.')

    const metadata = await EpubService.parseMetadata(await BookFileResolver.resolveEpubFile(book))
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
        fileBlob: options.storageMode === 'external' ? undefined : file,
        storageMode: options.storageMode ?? 'embedded',
        fileName: options.fileName ?? file.name,
        filePath: options.filePath,
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

    if (options.deferBookInfo) {
      void this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author)
    } else {
      await this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author)
    }
    return bookId
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

  private static async findDuplicateBook(candidate: DuplicateCandidate): Promise<boolean> {
    return this.hasDuplicateBook(candidate, await this.buildDuplicateIndex())
  }

  private static async buildDuplicateIndex(): Promise<DuplicateIndex> {
    return this.createDuplicateIndex(await db.books.toArray())
  }

  private static createDuplicateIndex(books: Book[]): DuplicateIndex {
    const index: DuplicateIndex = {
      uris: new Set(),
      fileHashes: new Set(),
      nameAndSize: new Set(),
      titleAndAuthor: new Set(),
    }

    for (const book of books) {
      this.registerDuplicate(index, {
        fileHash: book.fileHash,
        fileName: book.fileName,
        fileSize: book.fileSize,
        title: book.title,
        author: book.author,
        uri: book.uri,
      })
    }

    return index
  }

  private static hasDuplicateBook(candidate: DuplicateCandidate, index: DuplicateIndex): boolean {
    return (
      (!!candidate.uri && index.uris.has(candidate.uri)) ||
      (!!candidate.fileHash && index.fileHashes.has(candidate.fileHash)) ||
      index.nameAndSize.has(this.fileNameSizeKey(candidate.fileName, candidate.fileSize)) ||
      (!!candidate.title && !!candidate.author && index.titleAndAuthor.has(this.titleAuthorKey(candidate.title, candidate.author)))
    )
  }

  private static registerDuplicate(index: DuplicateIndex, candidate: DuplicateCandidate): void {
    if (candidate.uri) {
      index.uris.add(candidate.uri)
    }
    if (candidate.fileHash) {
      index.fileHashes.add(candidate.fileHash)
    }
    index.nameAndSize.add(this.fileNameSizeKey(candidate.fileName, candidate.fileSize))
    if (candidate.title && candidate.author) {
      index.titleAndAuthor.add(this.titleAuthorKey(candidate.title, candidate.author))
    }
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

function logEpubImportDiagnostic(stage: string, details: Record<string, unknown>): void {
  console.info(`EPUB import ${stage}`, safeDiagnosticJson(details))
}

function safeDiagnosticJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}
