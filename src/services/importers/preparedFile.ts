import { deleteLocalBookFile, type NativePreparedEpub } from '../NativeLibraryImportService'

export async function cleanupPreparedLocalFile(prepared: NativePreparedEpub): Promise<void> {
  if (prepared.diagnostics.localFileExisted) return
  await deleteLocalBookFile(prepared.localUri).catch(() => false)
}

export function preparedCoverToBlob(prepared: NativePreparedEpub): Blob | null {
  if (!prepared.cover) return null
  const binary = atob(prepared.cover.base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: prepared.cover.mimeType })
}
