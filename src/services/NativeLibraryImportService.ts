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
  bytesRead: number
  offset: number
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
const NATIVE_FILE_CHUNK_SIZE = 256 * 1024
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
  const expectedSize = Math.max(0, file.size ?? 0)
  let offset = 0

  while (true) {
    const chunk = await NeoReaderLibrary.readFileChunk({
      ...file,
      offset,
      length: NATIVE_FILE_CHUNK_SIZE,
    })
    const chunkBytes = validateNativeChunk(chunk, offset, expectedSize)
    const bytesRead = chunk.bytesRead ?? 0

    if (chunkBytes) chunks.push(chunkBytes)
    offset += bytesRead

    if (bytesRead === 0 || chunk.done || (expectedSize > 0 && offset >= expectedSize)) break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (chunks.length === 0) throw new Error('Arquivo da pasta sem conteudo.')
  if (expectedSize > 0 && offset !== expectedSize) throw new Error(INVALID_NATIVE_CHUNK_ERROR)
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

function validateNativeChunk(chunk: NativeFileChunk, expectedOffset: number, expectedSize: number): ArrayBuffer | null {
  const bytesRead = chunk.bytesRead ?? 0
  if (chunk.offset !== expectedOffset || bytesRead < 0 || bytesRead > NATIVE_FILE_CHUNK_SIZE) {
    throw new Error(INVALID_NATIVE_CHUNK_ERROR)
  }

  if (bytesRead === 0) {
    if (expectedSize > 0 && expectedOffset < expectedSize) throw new Error(INVALID_NATIVE_CHUNK_ERROR)
    return null
  }

  if (!chunk.base64) throw new Error(INVALID_NATIVE_CHUNK_ERROR)
  const chunkBytes = base64ToArrayBuffer(chunk.base64)
  if (chunkBytes.byteLength !== bytesRead) {
    throw new Error(INVALID_NATIVE_CHUNK_ERROR)
  }

  if (expectedSize > 0 && expectedOffset + bytesRead > expectedSize) {
    throw new Error(INVALID_NATIVE_CHUNK_ERROR)
  }

  return chunkBytes
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
