import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { BookImportService } from './BookImportService'
import { buildStandardEbooksUrls, type PublicDomainCatalogEntry } from './PublicDomainCatalogService'
import {
  beginPublicDomainDownload,
  completePublicDomainDownload,
  failPublicDomainDownload,
} from './PublicDomainDownloadCoordinator'

const DOWNLOAD_TIMEOUT_MS = 30_000
const GENERIC_ERROR_MESSAGE = 'Nao foi possivel baixar o livro. Tente novamente.'

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  // new ArrayBuffer(...) (em vez de reusar bytes.buffer) garante o tipo
  // ArrayBuffer exato que File/BlobPart exige — Uint8Array.buffer tipa como
  // ArrayBufferLike (aceita SharedArrayBuffer), que o TS rejeita aqui.
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return buffer
}

async function fetchEpubBytes(url: string): Promise<ArrayBuffer> {
  // CapacitorHttp roda a chamada nativa (sem CORS) no Android — mesmo padrao
  // ja validado em FishAudioService.ts. Feature e Android-only por spec, por
  // isso nao ha fallback fetch() pra Web aqui (ver plan.md, Decisoes Invariantes).
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Download de dominio publico so e suportado no Android nativo.')
  }

  const response = await CapacitorHttp.request({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    connectTimeout: DOWNLOAD_TIMEOUT_MS,
    readTimeout: DOWNLOAD_TIMEOUT_MS,
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Falha ao baixar o livro (${response.status})`)
  }

  // CapacitorHttp devolve corpo binario como string base64 quando
  // responseType e 'arraybuffer' — decodifica pra bytes reais do EPUB.
  return decodeBase64ToArrayBuffer(response.data as string)
}

export const PublicDomainDownloadService = {
  // Retorna o bookId em sucesso, ou null se um download pro mesmo entry ja
  // estava em andamento (toque duplicado ignorado, FR-011).
  async download(entry: PublicDomainCatalogEntry): Promise<number | null> {
    if (!beginPublicDomainDownload(entry.id)) return null

    try {
      // ?source=download e obrigatorio — sem isso a URL devolve uma pagina
      // HTML de interstitial, nao o EPUB (research.md #1).
      const { epubUrl } = buildStandardEbooksUrls(entry.authorSlug, entry.titleSlug)
      const epubBuffer = await fetchEpubBytes(epubUrl)
      const fileName = `${entry.authorSlug}_${entry.titleSlug}.epub`
      const file = new File([epubBuffer], fileName, { type: 'application/epub+zip' })

      const bookId = await BookImportService.importEpub(file, { importSource: 'public-domain' })
      completePublicDomainDownload(entry.id, bookId)
      return bookId
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : GENERIC_ERROR_MESSAGE
      failPublicDomainDownload(entry.id, message)
      throw error
    }
  },
}
