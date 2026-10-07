import { Capacitor } from '@capacitor/core'
import { BookImportService } from '../BookImportService'
import { downloadBookToLocal } from '../NativeLibraryImportService'
import { recordDownload } from '../../db/opdsDownloadedEntries'
import { createTag } from '../../db/tags'
import { getLanguageLabel } from '../../utils/languageOptions'
import { OpdsCredentialStore } from './OpdsCredentialStore'
import { beginOpdsDownload, completeOpdsDownload, failOpdsDownload } from './OpdsDownloadCoordinator'
import type { BookFormat } from '../../types/book'
import type { OpdsCatalog, OpdsFeedEntry } from '../../types/opds'

// Prazo de cada conexão/leitura no plugin (download parado falha em vez de ficar "baixando").
const DOWNLOAD_STALL_TIMEOUT_MS = 30_000
// Prazo total do lado JS: PDFs de catálogo chegam a dezenas de MB em rede lenta.
const DOWNLOAD_TOTAL_TIMEOUT_MS = 10 * 60_000
const GENERIC_ERROR_MESSAGE = 'Não foi possível baixar o livro. Tente novamente.'

// Catálogo OPDS não garante um slug/nome de arquivo limpo como o Standard
// Ebooks curado (feature 002) — deriva um nome seguro a partir do título.
function buildFileName(entry: OpdsFeedEntry, format: BookFormat): string {
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
  return `opds-${safeTitle}.${format === 'PDF' ? 'pdf' : 'epub'}`
}

// research.md #10 / mesmo caso de OpdsCatalogService.ts: servidor real pode
// anunciar link http:// mesmo servindo HTTPS. Mas NÃO upgrada quando o
// catálogo em si já é http:// — self-hosted na rede local costuma ser
// http:// puro de propósito, sem TLS configurado (R-010 em plan.md).
function upgradeToHttps(url: string, catalog: OpdsCatalog): string {
  if (!catalog.baseUrl.startsWith('https://')) return url
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

async function authHeaders(catalog: OpdsCatalog): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  if (catalog.hasCredential && catalog.id != null) {
    const credential = await OpdsCredentialStore.get(catalog.id)
    if (credential) headers.Authorization = `Basic ${btoa(`${credential.username}:${credential.password}`)}`
  }
  return headers
}

// O plugin baixa direto para o armazenamento do app (T079e): antes o CapacitorHttp devolvia o
// livro inteiro em base64 pela ponte do WebView, o que travava com PDFs de dezenas de MB.
// O formato vem dos bytes, no plugin (DI-011): o feed pode mentir no `type`.
async function downloadToLocal(catalog: OpdsCatalog, entry: OpdsFeedEntry, url: string) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Download de catálogo OPDS só é suportado no Android nativo.')
  }
  const prepared = await downloadBookToLocal(
    {
      url: upgradeToHttps(url, catalog),
      // Nome provisório pelo formato anunciado; o definitivo sai do formato real (abaixo).
      name: buildFileName(entry, entry.acquisitionFormat ?? 'EPUB'),
      headers: await authHeaders(catalog),
      timeoutMs: DOWNLOAD_STALL_TIMEOUT_MS,
    },
    { timeoutMs: DOWNLOAD_TOTAL_TIMEOUT_MS },
  )
  return { ...prepared, name: buildFileName(entry, prepared.format ?? 'EPUB') }
}

// Assunto/idioma do feed viram tag automática no livro importado —
// createTag já é idempotente por nome (case-insensitive), então baixar o
// mesmo assunto/idioma em livros diferentes reusa a mesma tag em vez de
// duplicar.
async function resolveEntryTags(entry: OpdsFeedEntry): Promise<number[]> {
  const names = [...(entry.subjects ?? []), getLanguageLabel(entry.language)].filter(
    (name): name is string => Boolean(name),
  )
  return Promise.all(names.map((name) => createTag(name)))
}

export const OpdsDownloadService = {
  // Retorna o bookId em sucesso, ou null se um download pra mesma entry já
  // estava em andamento (toque duplicado ignorado).
  async download(catalog: OpdsCatalog, entry: OpdsFeedEntry): Promise<number | null> {
    if (catalog.id == null) throw new Error('Catálogo sem id — não é possível baixar.')
    if (!entry.acquisitionUrl) throw new Error('Entry sem link de download.')
    if (!beginOpdsDownload(catalog.id, entry.id)) return null

    try {
      const [prepared, tagIds] = await Promise.all([
        downloadToLocal(catalog, entry, entry.acquisitionUrl),
        resolveEntryTags(entry),
      ])
      // Mesmo caminho do import nativo: dedupe (inclusive título/autor do PDF), metadados e capa.
      const bookId = await BookImportService.importPreparedNativeBook(prepared, { importSource: 'opds', tags: tagIds })
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
