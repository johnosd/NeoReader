import { Capacitor, registerPlugin } from '@capacitor/core'

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

interface NeoReaderLibraryPlugin {
  selectEpubFolder(): Promise<NativeFolderResult>
  selectEpubFile(): Promise<NativeFolderFile>
  consumePendingFolderSelection(): Promise<Partial<NativeFolderResult>>
  consumePendingFileSelection(): Promise<Partial<NativeFolderFile>>
  listSelectedFolderFiles(options: { offset: number; limit: number }): Promise<NativeFolderFilesPage>
  readFile(file: NativeFolderFile): Promise<NativeFolderFile & { base64: string }>
  readFileChunk(options: NativeFolderFile & { offset: number; length: number }): Promise<NativeFileChunk>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibraryPlugin>('NeoReaderLibrary')
const FOLDER_FILE_PAGE_SIZE = 100
const NATIVE_FILE_CHUNK_SIZE = 512 * 1024
const INVALID_NATIVE_CHUNK_ERROR = 'Chunk invalido ao ler EPUB nativo.'

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

export async function readNativeFolderFile(file: NativeFolderFile): Promise<File> {
  if (file.base64) return fileFromChunks([base64ToArrayBuffer(file.base64)], file.name, file.path)
  return readNativeFolderFileInChunks(file)
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

async function readNativeFolderFileInChunks(file: NativeFolderFile): Promise<File> {
  const chunks: ArrayBuffer[] = []
  let offset = 0
  let chunkCount = 0
  const startedAt = performance.now()
  let lastProgressLogAt = startedAt

  logNativeImportDiagnostic('read-start', {
    fileName: file.name,
    reportedSize: file.size,
    hasPath: Boolean(file.path),
    chunkSize: NATIVE_FILE_CHUNK_SIZE,
  })

  while (true) {
    const chunk = await NeoReaderLibrary.readFileChunk({
      ...file,
      offset,
      length: NATIVE_FILE_CHUNK_SIZE,
    })
    const chunkBytes = validateNativeChunk(chunk, offset)
    const bytesRead = chunkBytes?.byteLength ?? 0

    if (chunkBytes) chunks.push(chunkBytes)
    offset += bytesRead
    chunkCount += 1

    const now = performance.now()
    if (chunk.done || bytesRead === 0 || now - lastProgressLogAt >= 1000) {
      logNativeImportDiagnostic('read-progress', {
        fileName: file.name,
        chunks: chunkCount,
        bytesRead: offset,
        reportedSize: file.size,
        lastChunkBytes: bytesRead,
        done: chunk.done === true,
        elapsedMs: Math.round(now - startedAt),
      })
      lastProgressLogAt = now
    }

    if (bytesRead === 0 || chunk.done) break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (chunks.length === 0) throw new Error('Arquivo da pasta sem conteudo.')
  logNativeImportDiagnostic('read-finished', {
    fileName: file.name,
    chunks: chunkCount,
    bytesRead: offset,
    reportedSize: file.size,
    elapsedMs: Math.round(performance.now() - startedAt),
  })
  return fileFromChunks(chunks, file.name, file.path)
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
    warnNativeChunkMismatch('offset', {
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
  console.error('Native EPUB chunk invalid', safeDiagnosticJson({
    reason,
    ...details,
  }))
  throw new Error(`${INVALID_NATIVE_CHUNK_ERROR} [${reason}]`)
}

function warnNativeChunkMismatch(kind: string, details: Record<string, unknown>): void {
  console.warn(`Native EPUB chunk ${kind} mismatch`, safeDiagnosticJson(details))
}

function logNativeImportDiagnostic(stage: string, details: Record<string, unknown>): void {
  console.info(`Native EPUB import ${stage}`, safeDiagnosticJson(details))
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

function safeDiagnosticJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
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
