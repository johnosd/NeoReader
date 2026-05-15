import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  createImportDiagnosticContext,
  errorImportDiagnostic,
  logImportDiagnostic,
  warnImportDiagnostic,
  withImportTimeout,
  type ImportDiagnosticContext,
} from './ImportDiagnostics'
import type { BookIdentifier } from '../types/bookInfo'

export interface NativeFolderFile {
  name: string
  uri: string
  path?: string
  size: number
  base64?: string
}

interface NativeFolderResult {
  folderName: string
  folderUri: string
  files: NativeFolderFile[]
  fileCount?: number
  nextOffset?: number
  hasMoreFiles?: boolean
}

interface NativeFolderFilesPage {
  files: NativeFolderFile[]
  fileCount?: number
  nextOffset?: number
  hasMoreFiles?: boolean
}

interface NativeFileChunk {
  base64: string
  bytesRead: number | string
  offset: number | string
  done?: boolean
}

interface NativeFileReadSession {
  sessionId?: string
  size?: number | string
  mode?: string
}

export interface NativePreparedEpub {
  importId: string
  name: string
  path?: string
  size: number
  sha256: string
  localUri: string
  originalUri: string
  metadata: {
    title: string
    author: string
    identifiers?: BookIdentifier[]
    language?: string | null
    description?: string | null
  }
  cover?: {
    base64: string
    mimeType: string
  }
  diagnostics: {
    copyMs: number
    inspectMs: number
    bytesCopied: number
    localFileExisted?: boolean
  }
}

interface NeoReaderLibraryPlugin {
  selectEpubFolder(): Promise<NativeFolderResult>
  selectEpubFile(): Promise<NativeFolderFile>
  consumePendingFolderSelection(): Promise<Partial<NativeFolderResult>>
  consumePendingFileSelection(): Promise<Partial<NativeFolderFile>>
  listSelectedFolderFiles(options: { offset: number; limit: number }): Promise<NativeFolderFilesPage>
  readFile(file: NativeFolderFile): Promise<NativeFolderFile & { base64: string }>
  readFileChunk(options: NativeFolderFile & { offset: number; length: number; sessionId?: string }): Promise<NativeFileChunk>
  openFileReadSession?(file: NativeFolderFile): Promise<NativeFileReadSession>
  closeFileReadSession?(options: { sessionId: string }): Promise<{ closed?: boolean }>
  prepareLocalEpubImport?(file: NativeFolderFile & { importId?: string }): Promise<NativePreparedEpub>
  cancelImport?(options: { importId: string }): Promise<{ canceled?: boolean }>
  deleteLocalBookFile?(options: { uri: string }): Promise<{ deleted?: boolean }>
  cleanupImportTemp?(): Promise<{ deleted?: number }>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibraryPlugin>('NeoReaderLibrary')
const FOLDER_FILE_PAGE_SIZE = 100
export const NATIVE_FILE_CHUNK_SIZE = 1024 * 1024
export const NATIVE_FILE_CHUNK_TIMEOUT_MS = 30_000
export const NATIVE_FILE_READ_TIMEOUT_MS = 5 * 60_000
export const NATIVE_LOCAL_IMPORT_TIMEOUT_MS = 10 * 60_000
const NATIVE_FILE_SESSION_REQUIRED_BYTES = 5 * 1024 * 1024
const INVALID_NATIVE_CHUNK_ERROR = 'Chunk invalido ao ler EPUB nativo.'

export interface NativeReadFileOptions {
  importId?: string
  chunkTimeoutMs?: number
  readTimeoutMs?: number
  signal?: AbortSignal
}

export interface NativeLocalImportOptions {
  importId?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export async function selectNativeEpubFolder(): Promise<{ folderName: string; folderUri: string; files: NativeFolderFile[] } | null> {
  if (!Capacitor.isNativePlatform()) return null

  let result: NativeFolderResult
  try {
    result = await NeoReaderLibrary.selectEpubFolder()
  } catch (error) {
    if (isFolderSelectionCanceled(error)) throw new DOMException('Selecao de pasta cancelada.', 'AbortError')
    throw error
  }
  const files = await loadAllSelectedFolderFiles(result)
  await NeoReaderLibrary.consumePendingFolderSelection().catch(() => undefined)

  return {
    folderName: result.folderName,
    folderUri: result.folderUri,
    files,
  }
}

export async function consumePendingNativeFolderSelection(): Promise<{ folderName: string; folderUri: string; files: NativeFolderFile[] } | null> {
  if (!Capacitor.isNativePlatform()) return null

  const result = await NeoReaderLibrary.consumePendingFolderSelection()
  if (!result.folderName || !result.folderUri || !Array.isArray(result.files)) return null
  const files = await loadAllSelectedFolderFiles(result)

  return {
    folderName: result.folderName,
    folderUri: result.folderUri,
    files,
  }
}

export async function selectNativeEpubFile(): Promise<NativeFolderFile | null> {
  if (!Capacitor.isNativePlatform()) return null

  try {
    return await NeoReaderLibrary.selectEpubFile()
  } catch (error) {
    if (isFileSelectionCanceled(error)) throw new DOMException('Selecao de arquivo cancelada.', 'AbortError')
    throw error
  }
}

export async function consumePendingNativeFileSelection(): Promise<NativeFolderFile | null> {
  if (!Capacitor.isNativePlatform()) return null

  const result = await NeoReaderLibrary.consumePendingFileSelection()
  if (!result.name || !result.uri) return null
  return {
    name: result.name,
    uri: result.uri,
    path: result.path,
    size: result.size ?? 0,
  }
}

export async function prepareLocalEpubImport(
  file: NativeFolderFile,
  options: NativeLocalImportOptions = {},
): Promise<NativePreparedEpub> {
  if (typeof NeoReaderLibrary.prepareLocalEpubImport !== 'function') {
    throw new Error('Importacao local nativa indisponivel nesta versao do app Android.')
  }

  const importId = options.importId ?? `native-local-${Date.now().toString(36)}`
  const context: ImportDiagnosticContext = options.importId
    ? { importId, mode: 'native-read', startedAt: performance.now() }
    : createImportDiagnosticContext('native-read', {
      fileName: file.name,
      reportedSize: file.size,
      stage: 'native-local-prepare-start',
    })
  if (options.importId) {
    logImportDiagnostic(context, 'native-local-prepare-start', {
      fileName: file.name,
      reportedSize: file.size,
    })
  }
  throwIfNativeReadAborted(options.signal, context, {
    fileName: file.name,
    reportedSize: file.size,
  })

  const startedAt = performance.now()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let cleanupAbortListener: (() => void) | undefined
  const nativeTask = NeoReaderLibrary.prepareLocalEpubImport({ ...file, importId })

  const cancelNative = () => {
    if (typeof NeoReaderLibrary.cancelImport === 'function') {
      void NeoReaderLibrary.cancelImport({ importId }).catch(() => undefined)
    }
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      cancelNative()
      const error = new Error('Tempo limite excedido durante native-local-prepare.')
      errorImportDiagnostic(context, 'timeout', error, {
        importId,
        timedOutStage: 'native-local-prepare',
        timeoutMs: options.timeoutMs ?? NATIVE_LOCAL_IMPORT_TIMEOUT_MS,
        fileName: file.name,
        reportedSize: file.size,
      })
      reject(error)
    }, options.timeoutMs ?? NATIVE_LOCAL_IMPORT_TIMEOUT_MS)
  })

  const abortPromise = new Promise<never>((_, reject) => {
    if (!options.signal) return
    const handleAbort = () => {
      cancelNative()
      const error = nativeReadAbortError(options.signal!)
      errorImportDiagnostic(context, 'native-local-prepare-aborted', error, {
        importId,
        fileName: file.name,
        reportedSize: file.size,
      })
      reject(error)
    }
    options.signal.addEventListener('abort', handleAbort, { once: true })
    cleanupAbortListener = () => options.signal?.removeEventListener('abort', handleAbort)
  })

  try {
    const prepared = await Promise.race([nativeTask, timeoutPromise, abortPromise])
    logImportDiagnostic(context, 'native-local-prepare-finished', {
      fileName: prepared.name,
      reportedSize: file.size,
      localSize: prepared.size,
      localUri: prepared.localUri,
      originalUri: prepared.originalUri,
      sha256Prefix: prepared.sha256.slice(0, 12),
      copyMs: prepared.diagnostics.copyMs,
      inspectMs: prepared.diagnostics.inspectMs,
      bytesCopied: prepared.diagnostics.bytesCopied,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    return prepared
  } catch (error) {
    errorImportDiagnostic(context, 'native-local-prepare-failed', error, {
      fileName: file.name,
      reportedSize: file.size,
      elapsedMs: Math.round(performance.now() - startedAt),
    })
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    cleanupAbortListener?.()
  }
}

export async function deleteLocalBookFile(uri: string): Promise<boolean> {
  if (typeof NeoReaderLibrary.deleteLocalBookFile !== 'function') return false
  const result = await NeoReaderLibrary.deleteLocalBookFile({ uri })
  return result.deleted === true
}

export async function cleanupNativeImportTemp(): Promise<number> {
  if (typeof NeoReaderLibrary.cleanupImportTemp !== 'function') return 0
  const result = await NeoReaderLibrary.cleanupImportTemp()
  return typeof result.deleted === 'number' ? result.deleted : 0
}

export async function readNativeFolderFile(file: NativeFolderFile, options: NativeReadFileOptions = {}): Promise<File> {
  throwIfNativeReadAborted(options.signal, undefined, {
    fileName: file.name,
    reportedSize: file.size,
  })

  if (file.base64) {
    const context = createNativeReadContext(file, options)
    const buffer = base64ToArrayBuffer(file.base64)
    throwIfNativeReadAborted(options.signal, context, {
      fileName: file.name,
      reportedSize: file.size,
    })
    logImportDiagnostic(context, 'native-read-base64-finished', {
      fileName: file.name,
      bytesRead: buffer.byteLength,
      reportedSize: file.size,
    })
    return fileFromChunks([buffer], file.name, file.path)
  }

  return readNativeFolderFileInChunks(file, options)
}

function isFolderSelectionCanceled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('cancelad')
}

function isFileSelectionCanceled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('cancelad')
}

async function loadAllSelectedFolderFiles(initialPage: Partial<NativeFolderResult>): Promise<NativeFolderFile[]> {
  const files = [...(initialPage.files ?? [])]
  let nextOffset = initialPage.nextOffset ?? files.length
  let hasMore = initialPage.hasMoreFiles === true

  while (hasMore) {
    const page = await NeoReaderLibrary.listSelectedFolderFiles({
      offset: nextOffset,
      limit: FOLDER_FILE_PAGE_SIZE,
    })
    files.push(...page.files)
    nextOffset = page.nextOffset ?? files.length
    hasMore = page.hasMoreFiles === true
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return files
}

async function readNativeFolderFileInChunks(file: NativeFolderFile, options: NativeReadFileOptions): Promise<File> {
  const chunks: ArrayBuffer[] = []
  let offset = 0
  let chunkCount = 0
  const startedAt = performance.now()
  const readTimeoutMs = options.readTimeoutMs ?? NATIVE_FILE_READ_TIMEOUT_MS
  let lastProgressLogAt = startedAt
  const context = createNativeReadContext(file, options)
  throwIfNativeReadAborted(options.signal, context, {
    fileName: file.name,
    reportedSize: file.size,
    stage: 'before-session-open',
  })
  const sessionId = await openNativeFileReadSession(file, options, context)

  try {
    while (true) {
      throwIfNativeReadAborted(options.signal, context, {
        fileName: file.name,
        reportedSize: file.size,
        bytesRead: offset,
        chunks: chunkCount,
      })

      if (performance.now() - startedAt > readTimeoutMs) {
        const error = new Error(`Tempo limite excedido durante leitura nativa do EPUB ${file.name}.`)
        errorImportDiagnostic(context, 'native-read-timeout', error, {
          fileName: file.name,
          chunks: chunkCount,
          bytesRead: offset,
          reportedSize: file.size,
          timeoutMs: readTimeoutMs,
          hasSession: Boolean(sessionId),
        })
        throw error
      }

      const chunk = await readNativeChunkWithTimeout(file, offset, options, context, sessionId)
      throwIfNativeReadAborted(options.signal, context, {
        fileName: file.name,
        reportedSize: file.size,
        bytesRead: offset,
        chunks: chunkCount,
        stage: 'after-chunk',
      })
      const chunkBytes = validateNativeChunk(chunk, offset)
      const bytesRead = chunkBytes?.byteLength ?? 0

      if (chunkBytes) chunks.push(chunkBytes)
      offset += bytesRead
      chunkCount += 1

      const now = performance.now()
      if (chunk.done || bytesRead === 0 || now - lastProgressLogAt >= 1000) {
        logImportDiagnostic(context, 'native-read-progress', {
          fileName: file.name,
          chunks: chunkCount,
          bytesRead: offset,
          reportedSize: file.size,
          lastChunkBytes: bytesRead,
          done: chunk.done === true,
          hasSession: Boolean(sessionId),
          elapsedMs: Math.round(now - startedAt),
        })
        lastProgressLogAt = now
      }

      if (bytesRead === 0 || chunk.done) break
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    await closeNativeFileReadSession(sessionId, options, context)
  }

  if (chunks.length === 0) throw new Error('Arquivo da pasta sem conteudo.')
  logImportDiagnostic(context, 'native-read-finished', {
    fileName: file.name,
    chunks: chunkCount,
    bytesRead: offset,
    reportedSize: file.size,
    hasSession: Boolean(sessionId),
    elapsedMs: Math.round(performance.now() - startedAt),
  })
  return fileFromChunks(chunks, file.name, file.path)
}

async function openNativeFileReadSession(
  file: NativeFolderFile,
  options: NativeReadFileOptions,
  context: ImportDiagnosticContext,
): Promise<string | undefined> {
  if (typeof NeoReaderLibrary.openFileReadSession !== 'function') return undefined

  const requireSession = shouldRequireNativeReadSession(file)
  let closeLateSession = false
  try {
    const sessionTask = NeoReaderLibrary.openFileReadSession(file)
    if (!sessionTask || typeof sessionTask.then !== 'function') return undefined
    void sessionTask
      .then((session) => {
        const sessionId = typeof session?.sessionId === 'string' ? session.sessionId : undefined
        if ((options.signal?.aborted || closeLateSession) && sessionId) {
          void closeNativeFileReadSession(sessionId, options, context)
        }
      })
      .catch(() => undefined)

    const session = await withImportTimeout(
      withNativeReadAbort(
        sessionTask,
        options.signal,
        context,
        'native-read-session-open-aborted',
        {
          fileName: file.name,
          reportedSize: file.size,
        },
      ),
      {
        context,
        stage: 'native-read-session-open',
        timeoutMs: options.chunkTimeoutMs ?? NATIVE_FILE_CHUNK_TIMEOUT_MS,
        details: {
          fileName: file.name,
          reportedSize: file.size,
        },
      },
    )
    const sessionId = typeof session?.sessionId === 'string' ? session.sessionId : undefined
    if (!session) return undefined

    if (!sessionId) {
      const details = {
        fileName: file.name,
        reportedSize: file.size,
        responseKeys: session ? Object.keys(session) : [],
      }
      if (requireSession) {
        const error = new Error(`Nao foi possivel abrir sessao nativa de leitura para ${file.name}.`)
        errorImportDiagnostic(context, 'native-read-session-open-failed', error, details)
        throw error
      }
      warnImportDiagnostic(context, 'native-read-session-open-empty', details)
      return undefined
    }

    logImportDiagnostic(context, 'native-read-session-opened', {
      fileName: file.name,
      reportedSize: file.size,
      nativeSize: session.size,
      mode: session.mode,
      hasSession: true,
    })
    return sessionId
  } catch (error) {
    closeLateSession = true
    if (isAbortError(error)) throw error
    const details = {
      fileName: file.name,
      reportedSize: file.size,
      error: error instanceof Error ? error.message : String(error),
      requireSession,
    }
    if (requireSession) {
      errorImportDiagnostic(context, 'native-read-session-open-failed', error, details)
      throw new Error(`Nao foi possivel abrir sessao nativa de leitura para ${file.name}.`)
    }
    warnImportDiagnostic(context, 'native-read-session-open-fallback', details)
    return undefined
  }
}

async function closeNativeFileReadSession(
  sessionId: string | undefined,
  options: NativeReadFileOptions,
  context: ImportDiagnosticContext,
): Promise<void> {
  if (!sessionId || typeof NeoReaderLibrary.closeFileReadSession !== 'function') return

  try {
    const result = await withImportTimeout(
      NeoReaderLibrary.closeFileReadSession({ sessionId }),
      {
        context,
        stage: 'native-read-session-close',
        timeoutMs: Math.min(options.chunkTimeoutMs ?? NATIVE_FILE_CHUNK_TIMEOUT_MS, 5_000),
        details: {
          sessionId,
        },
      },
    )
    logImportDiagnostic(context, 'native-read-session-closed', {
      closed: result.closed === true,
    })
  } catch (error) {
    warnImportDiagnostic(context, 'native-read-session-close-failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function createNativeReadContext(file: NativeFolderFile, options: NativeReadFileOptions): ImportDiagnosticContext {
  if (options.importId) {
    const context: ImportDiagnosticContext = {
      importId: options.importId,
      mode: 'native-read',
      startedAt: performance.now(),
    }
    logImportDiagnostic(context, 'native-read-start', {
      fileName: file.name,
      reportedSize: file.size,
      hasPath: Boolean(file.path),
      chunkSize: NATIVE_FILE_CHUNK_SIZE,
      chunkTimeoutMs: options.chunkTimeoutMs ?? NATIVE_FILE_CHUNK_TIMEOUT_MS,
      readTimeoutMs: options.readTimeoutMs ?? NATIVE_FILE_READ_TIMEOUT_MS,
    })
    return context
  }

  return createImportDiagnosticContext('native-read', {
    fileName: file.name,
    reportedSize: file.size,
    hasPath: Boolean(file.path),
    chunkSize: NATIVE_FILE_CHUNK_SIZE,
    chunkTimeoutMs: options.chunkTimeoutMs ?? NATIVE_FILE_CHUNK_TIMEOUT_MS,
    readTimeoutMs: options.readTimeoutMs ?? NATIVE_FILE_READ_TIMEOUT_MS,
  })
}

async function readNativeChunkWithTimeout(
  file: NativeFolderFile,
  offset: number,
  options: NativeReadFileOptions,
  context: ImportDiagnosticContext,
  sessionId?: string,
): Promise<NativeFileChunk> {
  return withImportTimeout(
    withNativeReadAbort(
      NeoReaderLibrary.readFileChunk({
        ...file,
        offset,
        length: NATIVE_FILE_CHUNK_SIZE,
        sessionId,
      }),
      options.signal,
      context,
      'native-read-chunk-aborted',
      {
        fileName: file.name,
        offset,
        length: NATIVE_FILE_CHUNK_SIZE,
        hasSession: Boolean(sessionId),
      },
    ),
    {
      context,
      stage: 'native-read-chunk',
      timeoutMs: options.chunkTimeoutMs ?? NATIVE_FILE_CHUNK_TIMEOUT_MS,
      details: {
        fileName: file.name,
        offset,
        length: NATIVE_FILE_CHUNK_SIZE,
        hasSession: Boolean(sessionId),
      },
    },
  )
}

function shouldRequireNativeReadSession(file: NativeFolderFile): boolean {
  return file.size >= NATIVE_FILE_SESSION_REQUIRED_BYTES
}

function throwIfNativeReadAborted(
  signal: AbortSignal | undefined,
  context: ImportDiagnosticContext | undefined,
  details: Record<string, unknown>,
): void {
  if (!signal?.aborted) return
  const error = nativeReadAbortError(signal)
  errorImportDiagnostic(context ?? 'native-read', 'native-read-aborted', error, details)
  throw error
}

async function withNativeReadAbort<T>(
  task: Promise<T>,
  signal: AbortSignal | undefined,
  context: ImportDiagnosticContext,
  stage: string,
  details: Record<string, unknown>,
): Promise<T> {
  if (!signal) return task
  throwIfNativeReadAborted(signal, context, details)

  let cleanup: (() => void) | undefined
  const abortPromise = new Promise<never>((_, reject) => {
    const handleAbort = () => {
      const error = nativeReadAbortError(signal)
      errorImportDiagnostic(context, stage, error, details)
      reject(error)
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    cleanup = () => signal.removeEventListener('abort', handleAbort)
  })

  try {
    return await Promise.race([task, abortPromise])
  } finally {
    cleanup?.()
  }
}

function nativeReadAbortError(signal: AbortSignal): Error {
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function validateNativeChunk(chunk: NativeFileChunk | null | undefined, expectedOffset: number): ArrayBuffer | null {
  if (!chunk) {
    throwInvalidNativeChunk('empty-response', { expectedOffset })
  }

  const reportedOffset = toFiniteNumber(chunk.offset, expectedOffset)
  if (reportedOffset !== expectedOffset) {
    throwInvalidNativeChunk('offset-mismatch', {
      expectedOffset,
      reportedOffset,
      ...nativeChunkDiagnostics(chunk),
    })
  }

  const bytesRead = toFiniteNumber(chunk.bytesRead, 0)
  if (!chunk.base64) {
    if (bytesRead === 0) return null
    throwInvalidNativeChunk('base64-missing', {
      expectedOffset,
      bytesRead,
      ...nativeChunkDiagnostics(chunk),
    })
  }

  if (chunk.base64.trim() === '') {
    if (bytesRead > 0) {
      throwInvalidNativeChunk('base64-blank', {
        expectedOffset,
        bytesRead,
        ...nativeChunkDiagnostics(chunk),
      })
    }
    return null
  }

  let chunkBytes: ArrayBuffer
  try {
    chunkBytes = base64ToArrayBuffer(chunk.base64)
  } catch (error) {
    throwInvalidNativeChunk('base64-decode-failed', {
      expectedOffset,
      error: error instanceof Error ? error.message : String(error),
      ...nativeChunkDiagnostics(chunk),
    })
  }

  if (chunkBytes.byteLength === 0) {
    return null
  }

  if (chunkBytes.byteLength > NATIVE_FILE_CHUNK_SIZE) {
    throwInvalidNativeChunk('chunk-too-large', {
      expectedOffset,
      decodedBytes: chunkBytes.byteLength,
      maxChunkBytes: NATIVE_FILE_CHUNK_SIZE,
      ...nativeChunkDiagnostics(chunk),
    })
  }

  if (bytesRead > 0 && chunkBytes.byteLength !== bytesRead) {
    warnNativeChunkMismatch('bytesRead', {
      expectedOffset,
      reportedBytesRead: bytesRead,
      decodedBytes: chunkBytes.byteLength,
    })
  }

  return chunkBytes
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function throwInvalidNativeChunk(reason: string, details: Record<string, unknown>): never {
  errorImportDiagnostic('native-read', 'native-chunk-invalid', new Error(reason), details)
  throw new Error(`${INVALID_NATIVE_CHUNK_ERROR} [${reason}]`)
}

function warnNativeChunkMismatch(kind: string, details: Record<string, unknown>): void {
  warnImportDiagnostic('native-read', `native-chunk-${kind}-mismatch`, details)
}

function nativeChunkDiagnostics(chunk: NativeFileChunk): Record<string, unknown> {
  return {
    chunkKeys: Object.keys(chunk),
    reportedOffset: chunk.offset,
    reportedOffsetType: typeof chunk.offset,
    reportedBytesRead: chunk.bytesRead,
    reportedBytesReadType: typeof chunk.bytesRead,
    done: chunk.done,
    base64Length: typeof chunk.base64 === 'string' ? chunk.base64.length : null,
  }
}

function fileFromChunks(chunks: ArrayBuffer[], fileName: string, relativePath?: string): File {
  const file = new File(chunks, fileName, { type: 'application/epub+zip' })
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    })
  }
  return file
}
