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
}

interface NeoReaderLibraryPlugin {
  selectEpubFolder(): Promise<NativeFolderResult>
  readFile(file: NativeFolderFile): Promise<NativeFolderFile & { base64: string }>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibraryPlugin>('NeoReaderLibrary')

export async function selectNativeEpubFolder(): Promise<{ folderName: string; folderUri: string; files: NativeFolderFile[] } | null> {
  if (!Capacitor.isNativePlatform()) return null

  const result = await NeoReaderLibrary.selectEpubFolder()

  return {
    folderName: result.folderName,
    folderUri: result.folderUri,
    files: result.files,
  }
}

export async function readNativeFolderFile(file: NativeFolderFile): Promise<File> {
  const result = file.base64 ? file : await NeoReaderLibrary.readFile(file)
  if (!result.base64) throw new Error('Arquivo da pasta sem conteudo.')
  return base64ToFile(result.base64, result.name, result.path)
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
