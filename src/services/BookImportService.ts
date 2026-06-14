import { db } from '../db/database'
import { saveBookCover } from '../db/bookCovers'
import { saveBookInfo } from '../db/bookInfo'
import { addBook } from '../db/books'
import { saveSourceFolder } from '../db/sourceFolders'
import { EpubService, type EpubMetadata } from './EpubService'
import { BookInfoService } from './bookInfo'
import { BookFileResolver } from './BookFileResolver'
import {
  deleteLocalBookFile,
  prepareLocalEpubImport,
  type NativeFolderFile,
  type NativePreparedEpub,
} from './NativeLibraryImportService'
import {
  createImportDiagnosticContext,
  errorImportDiagnostic,
  logImportDiagnostic,
  withImportTimeout,
  type ImportDiagnosticContext,
} from './ImportDiagnostics'
import {
  cancelActiveImport,
  isImportInProgress,
  runExclusiveImport,
  subscribeImportActivity,
} from './ImportCoordinator'
import type { Book, BookStorageMode, SourceFolder } from '../types/book'
import type { BookIdentifier, ResolvedBookInfo } from '../types/bookInfo'

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
  importId?: string
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
  originalUri?: string | null
  storageMode?: BookStorageMode
  deferBookInfo?: boolean
  diagnostic?: ImportDiagnosticContext
  bookInfoContext?: Partial<ResolvedBookInfo>
}

interface DuplicateCandidate {
  fileHash?: string
  fileName?: string
  fileSize?: number
  title?: string
  author?: string
  uri?: string
  originalUri?: string
}

interface DuplicateIndex {
  uris: Set<string>
  fileHashes: Set<string>
  nameAndSize: Set<string>
  titleAndAuthor: Set<string>
}

const EPUB_METADATA_TIMEOUT_MS = 2 * 60_000
const EPUB_HASH_TIMEOUT_MS = 2 * 60_000
const EPUB_RECORD_SAVE_TIMEOUT_MS = 60_000

export class BookImportService {
  static async importEpub(file: File): Promise<number> {
    return runExclusiveImport('web', file.name, (signal) => this.importEpubUnlocked(file, signal))
  }

  static async importNativeEpub(nativeFile: NativeFolderFile): Promise<number> {
    return runExclusiveImport('native-single', nativeFile.name, (signal) => this.importNativeEpubUnlocked(nativeFile, signal))
  }

  static isImportInProgress(): boolean {
    return isImportInProgress()
  }

  static subscribeImportActivity(listener: () => void): () => void {
    return subscribeImportActivity(listener)
  }

  static cancelActiveImport(reason: string): void {
    cancelActiveImport(reason)
  }

  private static async importEpubUnlocked(file: File, signal: AbortSignal): Promise<number> {
    const diagnostic = createImportDiagnosticContext('web', {
      fileName: file.name,
      fileSize: file.size,
    })

    try {
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: file.name,
        fileSize: file.size,
      })
      const metadata = await this.parseMetadataWithDiagnostics(file, diagnostic, 'file')
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: file.name,
        fileSize: file.size,
        stage: 'after-metadata',
      })
      const fileHash = await this.hashFileWithDiagnostics(file, diagnostic, 'file')
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: file.name,
        fileSize: file.size,
        stage: 'after-hash',
      })
      const duplicate = await this.findDuplicateBook({
        fileHash,
        fileName: file.name,
        fileSize: file.size,
        title: metadata.title,
        author: metadata.author,
      })

      if (duplicate) {
        logImportDiagnostic(diagnostic, 'file-duplicate-found', {
          fileName: file.name,
          fileSize: file.size,
          fileHash,
        })
        throw new Error('Este livro ja esta na biblioteca.')
      }

      const bookId = await this.importSingleEpubRecord(file, {
        metadata,
        fileHash,
        tags: [],
        sourceFolderId: null,
        uri: null,
        storageMode: 'embedded',
        diagnostic,
      })
      logImportDiagnostic(diagnostic, 'file-import-finished', {
        fileName: file.name,
        bookId,
      })
      return bookId
    } catch (error) {
      errorImportDiagnostic(diagnostic, 'file-import-failed', error, {
        fileName: file.name,
        fileSize: file.size,
      })
      throw error
    }
  }

  private static async importNativeEpubUnlocked(nativeFile: NativeFolderFile, signal: AbortSignal): Promise<number> {
    const diagnostic = createImportDiagnosticContext('native-single', {
      fileName: nativeFile.name,
      reportedSize: nativeFile.size,
      hasPath: Boolean(nativeFile.path),
      hasUri: Boolean(nativeFile.uri),
    })

    try {
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: nativeFile.name,
        reportedSize: nativeFile.size,
      })
      const prepared = await prepareLocalEpubImport(nativeFile, {
        importId: diagnostic.importId,
        signal,
      })
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: prepared.name,
        reportedSize: prepared.size,
        stage: 'after-native-local-prepare',
      })
      const duplicateIndex = await this.buildDuplicateIndex()
      const duplicate = this.hasDuplicateBook(this.duplicateCandidateFromPrepared(prepared), duplicateIndex)

      if (duplicate) {
        await this.cleanupPreparedDuplicate(prepared)
        logImportDiagnostic(diagnostic, 'native-duplicate-found', {
          fileName: prepared.name,
          fileSize: prepared.size,
          fileHash: prepared.sha256,
          localUri: prepared.localUri,
          originalUri: prepared.originalUri,
        })
        throw new Error('Este livro ja esta na biblioteca.')
      }

      const bookId = await this.importPreparedNativeEpubRecord(prepared, {
        tags: [],
        sourceFolderId: null,
        diagnostic,
      })
      logImportDiagnostic(diagnostic, 'native-import-finished', {
        fileName: prepared.name,
        bookId,
      })
      return bookId
    } catch (error) {
      errorImportDiagnostic(diagnostic, 'native-import-failed', error, {
        fileName: nativeFile.name,
        reportedSize: nativeFile.size,
      })
      throw error
    }
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
    const selectedItems = params.items.filter((item) => item.selected)
    const kind = selectedItems.some((item) => item.nativeFile) ? 'native-batch' : 'web-batch'
    return runExclusiveImport(kind, params.sourceFolder.folderName, (signal) => this.importSelectedBooksUnlocked(params, signal))
  }

  private static async importSelectedBooksUnlocked(params: {
    items: ImportPreviewItem[]
    tagIds: number[]
    sourceFolder: FolderImportOptions
    onProgress?: (progress: ImportProgress) => void
  }, signal: AbortSignal): Promise<ImportSummary> {
    const sourceFolderId = await this.saveImportSource(params.sourceFolder)
    const summary: ImportSummary = {
      imported: 0,
      duplicate: 0,
      unsupported: 0,
      errors: 0,
    }
    const selectedItems = params.items.filter((item) => item.selected)
    const total = selectedItems.length
    const diagnostic = createImportDiagnosticContext(
      selectedItems.some((item) => item.nativeFile) ? 'native-batch' : 'web-batch',
      {
        total,
        folderName: params.sourceFolder.folderName,
        folderUri: params.sourceFolder.folderUri,
        selected: selectedItems.length,
      },
    )
    const duplicateIndex = await this.buildDuplicateIndex()

    this.throwIfImportAborted(signal, diagnostic, {
      folderName: params.sourceFolder.folderName,
      total,
    })

    params.onProgress?.({
      importId: diagnostic.importId,
      phase: 'preparing',
      current: 0,
      total,
      ...summary,
    })

    for (const [index, item] of selectedItems.entries()) {
      this.throwIfImportAborted(signal, diagnostic, {
        fileName: item.fileName,
        index: index + 1,
        total,
      })

      params.onProgress?.({
        importId: diagnostic.importId,
        phase: 'processing',
        current: index + 1,
        total,
        fileName: item.fileName,
        ...summary,
      })

      if (!item.supported) {
        summary.unsupported += 1
        logImportDiagnostic(diagnostic, 'batch-item-unsupported', {
          fileName: item.fileName,
          index: index + 1,
          total,
        })
        params.onProgress?.({
          importId: diagnostic.importId,
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
        logImportDiagnostic(diagnostic, 'batch-item-start', {
          fileName: item.fileName,
          index: index + 1,
          total,
          native: Boolean(item.nativeFile),
          reportedSize: item.fileSize,
        })
        if (item.nativeFile) {
          const prepared = await prepareLocalEpubImport(item.nativeFile, {
            importId: diagnostic.importId,
            signal,
          })
          this.throwIfImportAborted(signal, diagnostic, {
            fileName: item.fileName,
            index: index + 1,
            total,
            stage: 'after-native-local-prepare',
          })
          const candidate = this.duplicateCandidateFromPrepared(prepared)
          const duplicate = this.hasDuplicateBook(candidate, duplicateIndex)

          if (duplicate) {
            await this.cleanupPreparedDuplicate(prepared)
            summary.duplicate += 1
            logImportDiagnostic(diagnostic, 'batch-item-duplicate-found', {
              fileName: item.fileName,
              index: index + 1,
              total,
              fileSize: prepared.size,
              fileHash: prepared.sha256,
              localUri: prepared.localUri,
              originalUri: prepared.originalUri,
            })
            params.onProgress?.({
              importId: diagnostic.importId,
              phase: 'processing',
              current: index + 1,
              total,
              fileName: item.fileName,
              ...summary,
            })
            await this.yieldToUi()
            continue
          }

          await this.importPreparedNativeEpubRecord(prepared, {
            tags: params.tagIds,
            sourceFolderId,
            diagnostic,
          })
          this.registerDuplicate(duplicateIndex, candidate)
          summary.imported += 1
          logImportDiagnostic(diagnostic, 'batch-item-finished', {
            fileName: item.fileName,
            index: index + 1,
            total,
            local: true,
          })
          continue
        }

        const file = item.file ?? null
        if (!file) throw new Error('Arquivo invalido.')
        this.throwIfImportAborted(signal, diagnostic, {
          fileName: item.fileName,
          index: index + 1,
          total,
          stage: 'after-file-read',
        })
        logImportDiagnostic(diagnostic, 'batch-item-file-read', {
          fileName: item.fileName,
          index: index + 1,
          native: Boolean(item.nativeFile),
          fileSize: file.size,
        })
        const metadata = await this.parseMetadataWithDiagnostics(file, diagnostic, 'batch-item')
        this.throwIfImportAborted(signal, diagnostic, {
          fileName: item.fileName,
          index: index + 1,
          total,
          stage: 'after-metadata',
        })
        const fileHash = item.fileHash ?? await this.hashFileWithDiagnostics(file, diagnostic, 'batch-item')
        this.throwIfImportAborted(signal, diagnostic, {
          fileName: item.fileName,
          index: index + 1,
          total,
          stage: 'after-hash',
        })
        const fileSize = item.fileSize || file.size
        const candidate = {
          fileHash,
          fileName: item.fileName,
          fileSize,
          title: metadata.title,
          author: metadata.author,
        }
        const duplicate = this.hasDuplicateBook(candidate, duplicateIndex)

        if (duplicate) {
          summary.duplicate += 1
          logImportDiagnostic(diagnostic, 'batch-item-duplicate-found', {
            fileName: item.fileName,
            index: index + 1,
            total,
            fileSize,
            fileHash,
          })
          params.onProgress?.({
            importId: diagnostic.importId,
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
          filePath: item.file?.webkitRelativePath,
          tags: params.tagIds,
          sourceFolderId,
          uri: item.file?.webkitRelativePath ?? item.fileName,
          storageMode: 'embedded',
          deferBookInfo: true,
          diagnostic,
        })
        this.registerDuplicate(duplicateIndex, candidate)
        summary.imported += 1
        logImportDiagnostic(diagnostic, 'batch-item-finished', {
          fileName: item.fileName,
          index: index + 1,
          total,
        })
      } catch (error) {
        errorImportDiagnostic(diagnostic, 'batch-item-failed', error, {
          fileName: item.fileName,
          index: index + 1,
          total,
        })
        if (this.isAbortError(error)) throw error
        summary.errors += 1
      }

      params.onProgress?.({
        importId: diagnostic.importId,
        phase: 'processing',
        current: index + 1,
        total,
        fileName: item.fileName,
        ...summary,
      })
      await this.yieldToUi()
    }

    this.throwIfImportAborted(signal, diagnostic, {
      folderName: params.sourceFolder.folderName,
      total,
      stage: 'before-finish',
    })

    params.onProgress?.({
      importId: diagnostic.importId,
      phase: 'finishing',
      current: total,
      total,
      ...summary,
    })
    logImportDiagnostic(diagnostic, 'batch-import-finished', { ...summary })

    return summary
  }

  private static async importPreparedNativeEpubRecord(
    prepared: NativePreparedEpub,
    options: {
      tags: number[]
      sourceFolderId: number | null
      diagnostic: ImportDiagnosticContext
    },
  ): Promise<number> {
    const metadata = this.metadataFromPreparedNativeEpub(prepared)
    const bookInfoContext = this.bookInfoContextFromPreparedNativeEpub(prepared)

    return this.importSingleEpubRecord(null, {
      metadata,
      fileHash: prepared.sha256,
      fileName: prepared.name,
      fileSize: prepared.size,
      filePath: prepared.path,
      tags: options.tags,
      sourceFolderId: options.sourceFolderId,
      uri: prepared.localUri,
      originalUri: prepared.originalUri,
      storageMode: 'local',
      deferBookInfo: true,
      diagnostic: options.diagnostic,
      bookInfoContext,
    })
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
    file: File | null,
    title: string,
    author: string,
    diagnostic?: ImportDiagnosticContext,
    context: Partial<ResolvedBookInfo> = {},
  ): Promise<void> {
    try {
      if (diagnostic) {
        logImportDiagnostic(diagnostic, 'book-info-enrichment-start', {
          bookId,
          fileName: file?.name,
          title,
          author,
          hasFile: Boolean(file),
        })
      }
      const info = await new BookInfoService(undefined, {
        flowId: diagnostic?.importId,
        screen: 'import',
      }).collect(file, {
        ...context,
        lookupHints: {
          ...context.lookupHints,
          title,
          author,
          identifiers: context.lookupHints?.identifiers ?? [],
        },
      })
      await saveBookInfo(bookId, info)
      if (diagnostic) {
        logImportDiagnostic(diagnostic, 'book-info-enrichment-finished', {
          bookId,
          fileName: file?.name,
        })
      }
    } catch (error) {
      if (diagnostic) {
        errorImportDiagnostic(diagnostic, 'book-info-enrichment-failed', error, {
          bookId,
          fileName: file?.name,
        })
      } else {
        console.warn('Book info enrichment failed during import.', error)
      }
    }
  }

  private static async importSingleEpubRecord(
    file: File | null,
    options: ImportSingleEpubOptions = {},
  ): Promise<number> {
    const diagnostic = options.diagnostic
    if (!file && !options.metadata) throw new Error('Metadados ausentes para salvar o livro.')
    const metadata = options.metadata ?? await this.parseMetadataWithDiagnostics(file!, diagnostic, 'record')
    const fileHash = options.fileHash ?? (file ? await this.hashFileWithDiagnostics(file, diagnostic, 'record') : undefined)
    const now = new Date()
    const fileName = options.fileName ?? file?.name ?? 'book.epub'
    const fileSize = options.fileSize ?? file?.size ?? 0
    const storageMode = options.storageMode ?? 'embedded'

    if (diagnostic) {
      logImportDiagnostic(diagnostic, 'record-save-start', {
        fileName,
        storageMode,
        fileSize,
        hasCover: Boolean(metadata.coverBlob),
      })
    }

    const transaction = db.transaction('rw', db.books, db.bookCovers, async () => {
      const bookId = await addBook({
        title: metadata.title,
        author: metadata.author,
        fileBlob: storageMode === 'embedded' ? file ?? undefined : undefined,
        storageMode,
        fileName,
        filePath: options.filePath,
        fileSize,
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
        originalUri: options.originalUri ?? undefined,
        missingFile: false,
      })

      if (metadata.coverBlob) {
        if (diagnostic) {
          logImportDiagnostic(diagnostic, 'cover-save-start', {
            bookId,
            fileName,
            coverType: metadata.coverBlob.type,
            coverSize: metadata.coverBlob.size,
          })
        }
        await saveBookCover(bookId, metadata.coverBlob, 'epub-extracted')
        if (diagnostic) {
          logImportDiagnostic(diagnostic, 'cover-save-finished', {
            bookId,
            fileName,
          })
        }
      }

      return bookId
    })
    const bookId = diagnostic
      ? await withImportTimeout(transaction, {
        context: diagnostic,
        stage: 'record-save',
        timeoutMs: EPUB_RECORD_SAVE_TIMEOUT_MS,
        details: {
          fileName,
          storageMode,
        },
      })
      : await transaction

    if (diagnostic) {
      logImportDiagnostic(diagnostic, 'record-save-finished', {
        bookId,
        fileName,
      })
    }

    if (options.deferBookInfo) {
      if (diagnostic) {
        logImportDiagnostic(diagnostic, 'book-info-enrichment-deferred', {
          bookId,
          fileName,
        })
      }
      void this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author, diagnostic, options.bookInfoContext)
    } else {
      await this.collectAndSaveBookInfo(bookId, file, metadata.title, metadata.author, diagnostic, options.bookInfoContext)
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
        originalUri: book.originalUri,
      })
    }

    return index
  }

  private static hasDuplicateBook(candidate: DuplicateCandidate, index: DuplicateIndex): boolean {
    return (
      (!!candidate.uri && index.uris.has(candidate.uri)) ||
      (!!candidate.originalUri && index.uris.has(candidate.originalUri)) ||
      (!!candidate.fileHash && index.fileHashes.has(candidate.fileHash)) ||
      index.nameAndSize.has(this.fileNameSizeKey(candidate.fileName, candidate.fileSize)) ||
      (!!candidate.title && !!candidate.author && index.titleAndAuthor.has(this.titleAuthorKey(candidate.title, candidate.author)))
    )
  }

  private static registerDuplicate(index: DuplicateIndex, candidate: DuplicateCandidate): void {
    if (candidate.uri) {
      index.uris.add(candidate.uri)
    }
    if (candidate.originalUri) {
      index.uris.add(candidate.originalUri)
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

  private static duplicateCandidateFromPrepared(prepared: NativePreparedEpub): DuplicateCandidate {
    return {
      fileHash: prepared.sha256,
      fileName: prepared.name,
      fileSize: prepared.size,
      title: prepared.metadata.title,
      author: prepared.metadata.author,
      uri: prepared.localUri,
      originalUri: prepared.originalUri,
    }
  }

  private static async cleanupPreparedDuplicate(prepared: NativePreparedEpub): Promise<void> {
    if (prepared.diagnostics.localFileExisted) return
    await deleteLocalBookFile(prepared.localUri).catch(() => false)
  }

  private static metadataFromPreparedNativeEpub(prepared: NativePreparedEpub): EpubMetadata {
    return {
      title: prepared.metadata.title || prepared.name.replace(/\.epub$/i, ''),
      author: prepared.metadata.author || 'Autor desconhecido',
      coverBlob: prepared.cover
        ? this.base64ToBlob(prepared.cover.base64, prepared.cover.mimeType)
        : null,
    }
  }

  private static bookInfoContextFromPreparedNativeEpub(prepared: NativePreparedEpub): Partial<ResolvedBookInfo> {
    const identifiers = prepared.metadata.identifiers ?? []

    return {
      ...(prepared.metadata.language ? {
        language: {
          value: prepared.metadata.language,
          source: 'epub-metadata',
          confidence: 'high',
        },
      } : {}),
      ...(prepared.metadata.description ? {
        synopsis: {
          value: prepared.metadata.description,
          source: 'epub-metadata',
          confidence: 'high',
        },
      } : {}),
      lookupHints: {
        title: prepared.metadata.title,
        author: prepared.metadata.author,
        identifiers,
      },
      isbn10: this.bookIdentifierValue(identifiers, 'ISBN_10'),
      isbn13: this.bookIdentifierValue(identifiers, 'ISBN_13'),
      universalIdentifier: identifiers[0]
        ? {
          value: identifiers[0],
          source: 'epub-metadata',
          confidence: identifiers[0].kind === 'OTHER' ? 'medium' : 'high',
        }
        : null,
    }
  }

  private static bookIdentifierValue(identifiers: BookIdentifier[], kind: 'ISBN_10' | 'ISBN_13') {
    const identifier = identifiers.find((candidate) => candidate.kind === kind)
    return identifier
      ? {
        value: identifier,
        source: 'epub-metadata' as const,
        confidence: 'high' as const,
      }
      : null
  }

  private static base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  }

  private static fileNameSizeKey(fileName?: string, fileSize?: number): string {
    return `${(fileName ?? '').trim().toLowerCase()}::${fileSize ?? 0}`
  }

  private static titleAuthorKey(title: string, author: string): string {
    return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`
  }

  private static async parseMetadataWithDiagnostics(
    file: File,
    diagnostic: ImportDiagnosticContext | undefined,
    stagePrefix: string,
  ): Promise<EpubMetadata> {
    if (diagnostic) {
      logImportDiagnostic(diagnostic, `${stagePrefix}-metadata-start`, {
        fileName: file.name,
        fileSize: file.size,
      })
    }

    const metadataTask = EpubService.parseMetadata(file)
    const metadata = diagnostic
      ? await withImportTimeout(metadataTask, {
        context: diagnostic,
        stage: `${stagePrefix}-metadata`,
        timeoutMs: EPUB_METADATA_TIMEOUT_MS,
        details: {
          fileName: file.name,
          fileSize: file.size,
        },
      })
      : await metadataTask

    if (diagnostic) {
      logImportDiagnostic(diagnostic, `${stagePrefix}-metadata-parsed`, {
        fileName: file.name,
        title: metadata.title,
        author: metadata.author,
        hasCover: Boolean(metadata.coverBlob),
      })
    }

    return metadata
  }

  private static async hashFileWithDiagnostics(
    file: File,
    diagnostic: ImportDiagnosticContext | undefined,
    stagePrefix: string,
  ): Promise<string | undefined> {
    if (diagnostic) {
      logImportDiagnostic(diagnostic, `${stagePrefix}-hash-start`, {
        fileName: file.name,
        fileSize: file.size,
      })
    }

    const hashTask = this.hashFile(file)
    const fileHash = diagnostic
      ? await withImportTimeout(hashTask, {
        context: diagnostic,
        stage: `${stagePrefix}-hash`,
        timeoutMs: EPUB_HASH_TIMEOUT_MS,
        details: {
          fileName: file.name,
          fileSize: file.size,
        },
      })
      : await hashTask

    if (diagnostic) {
      logImportDiagnostic(diagnostic, `${stagePrefix}-hash-computed`, {
        fileName: file.name,
        hasHash: Boolean(fileHash),
        fileHashPrefix: fileHash?.slice(0, 12),
      })
    }

    return fileHash
  }

  private static async hashFile(file: File): Promise<string | undefined> {
    try {
      const buffer = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    } catch (error) {
      errorImportDiagnostic('web', 'file-hash-failed', error, {
        fileName: file.name,
        fileSize: file.size,
      })
      return undefined
    }
  }

  private static throwIfImportAborted(
    signal: AbortSignal,
    diagnostic: ImportDiagnosticContext,
    details: Record<string, unknown>,
  ): void {
    if (!signal.aborted) return
    const error = this.importAbortError(signal)
    errorImportDiagnostic(diagnostic, 'import-aborted', error, details)
    throw error
  }

  private static importAbortError(signal: AbortSignal): Error {
    const reason = signal.reason
    if (reason instanceof Error) return reason
    const message = typeof reason === 'string' && reason.trim()
      ? reason
      : 'Importacao cancelada.'
    if (typeof DOMException !== 'undefined') {
      return new DOMException(message, 'AbortError')
    }
    const error = new Error(message)
    error.name = 'AbortError'
    return error
  }

  private static isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }

  private static async yieldToUi(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
