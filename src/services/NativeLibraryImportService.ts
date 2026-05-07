import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeFolderFile {
  name: string
  uri: string
  path?: string
  size: number
  base64: string
}

interface NativeFolderResult {
  folderName: string
  folderUri: string
  files: NativeFolderFile[]
}

interface NeoReaderLibraryPlugin {
  selectEpubFolder(): Promise<NativeFolderResult>
}

const NeoReaderLibrary = registerPlugin<NeoReaderLibraryPlugin>('NeoReaderLibrary')

export async function selectNativeEpubFolder(): Promise<{ folderName: string; folderUri: string; files: File[] } | null> {
  if (!Capacitor.isNativePlatform()) return null

  const result = await NeoReaderLibrary.selectEpubFolder()
  const files = result.files.map((file) => base64ToFile(file.base64, file.name, file.path))

  return {
    folderName: result.folderName,
    folderUri: result.folderUri,
    files,
  }
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
