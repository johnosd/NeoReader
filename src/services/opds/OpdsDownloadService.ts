import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { BookImportService } from '../BookImportService'
import { recordDownload } from '../../db/opdsDownloadedEntries'
import { OpdsCredentialStore } from './OpdsCredentialStore'
import { beginOpdsDownload, completeOpdsDownload, failOpdsDownload } from './OpdsDownloadCoordinator'
import type { OpdsCatalog, OpdsFeedEntry } from '../../types/opds'

const DOWNLOAD_TIMEOUT_MS = 30_000
const GENERIC_ERROR_MESSAGE = 'Não foi possível baixar o livro. Tente novamente.'

// Duplicado de propósito em vez de reusar o helper de decode de
// PublicDomainDownloadService.ts/FishAudioService.ts — mesmo precedente já
// registrado no plan.md da feature 002 (domínios não relacionados, extrair
// cedo acoplaria sem necessidade real).
function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return buffer
}

// Catálogo OPDS não garante um slug/nome de arquivo limpo como o Standard
// Ebooks curado (feature 002) — deriva um nome seguro a partir do título.
function buildFileName(entry: OpdsFeedEntry): string {
  const safeTitle = entry.title
    .normalize('NFKD')
    // \p{Diacritic} (Unicode property escape, precisa da flag "u") casa as
    // marcas de acento que sobram após NFKD, ex: "é" vira "e" + marca —
    // descarta a marca. Mais confiável que um range de caracteres escrito à
    // mão no código-fonte.
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'livro'
  return `opds-${safeTitle}.epub`
}

async function fetchEpubBytes(catalog: OpdsCatalog, url: string): Promise<ArrayBuffer> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Download de catálogo OPDS só é suportado no Android nativo.')
  }

  const headers: Record<string, string> = {}
  if (catalog.hasCredential && catalog.id != null) {
    const credential = await OpdsCredentialStore.get(catalog.id)
    if (credential) headers.Authorization = `Basic ${btoa(`${credential.username}:${credential.password}`)}`
  }

  const response = await CapacitorHttp.request({
    url,
    method: 'GET',
    headers,
    responseType: 'arraybuffer',
    connectTimeout: DOWNLOAD_TIMEOUT_MS,
    readTimeout: DOWNLOAD_TIMEOUT_MS,
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Falha ao baixar o livro (${response.status})`)
  }

  // CapacitorHttp devolve corpo binário como string base64 quando
  // responseType é 'arraybuffer' — decodifica pra bytes reais do EPUB.
  return decodeBase64ToArrayBuffer(response.data as string)
}

export const OpdsDownloadService = {
  // Retorna o bookId em sucesso, ou null se um download pra mesma entry já
  // estava em andamento (toque duplicado ignorado).
  async download(catalog: OpdsCatalog, entry: OpdsFeedEntry): Promise<number | null> {
    if (catalog.id == null) throw new Error('Catálogo sem id — não é possível baixar.')
    if (!entry.acquisitionUrl) throw new Error('Entry sem link de download.')
    if (!beginOpdsDownload(catalog.id, entry.id)) return null

    try {
      const epubBuffer = await fetchEpubBytes(catalog, entry.acquisitionUrl)
      const fileName = buildFileName(entry)
      const file = new File([epubBuffer], fileName, { type: 'application/epub+zip' })

      const bookId = await BookImportService.importEpub(file, { importSource: 'opds' })
      await recordDownload(catalog.id, entry.id, bookId)
      completeOpdsDownload(catalog.id, entry.id, bookId)
      return bookId
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : GENERIC_ERROR_MESSAGE
      // navigator.onLine=false no momento da falha é um sinal forte de que o
      // erro foi por falta de conexão (User Story 5).
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      failOpdsDownload(catalog.id, entry.id, message, offline ? { offline: true } : undefined)
      throw error
    }
  },
}
