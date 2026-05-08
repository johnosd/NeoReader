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

interface NeoReaderLibraryPlugin {
  selectEpubFolder(): Promise<NativeFolderResult>
  selectEpubFile(): Promise<NativeFolderFile>
  consumePendingFolderSelection(): Promise<Partial<NativeFolderResult>>
  consumePendingFileSelection(): Promise<Partial<NativeFolderFile>>
  listSelectedFolderFiles(options: { offset: number; limit: number }): Promise<NativeFolderFilesPage>
  readFile(file: NativeFolderFile): Promise<NativeFolderFile & { base64: string }>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibraryPlugin>('NeoReaderLibrary')
const FOLDER_FILE_PAGE_SIZE = 100

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
  const result = file.base64 ? file : await NeoReaderLibrary.readFile(file)
  if (!result.base64) throw new Error('Arquivo da pasta sem conteudo.')
  return base64ToFile(result.base64, result.name, result.path)
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

function base64ToFile(base64: string, fileName: string, relativePath?: string): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const file = new File([bytes], fileName, { type: 'application/epub+zip' })
  if (relativePath) {
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: relativePath,
    })
  }
  return file
}
