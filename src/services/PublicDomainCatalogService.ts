import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface PublicDomainCatalogEntry {
  id: string
  title: string
  author: string
  authorSlug: string
  titleSlug: string
}

export interface StandardEbooksUrls {
  epubUrl: string
  coverUrl: string
}

const CATALOG_URL = `${import.meta.env.BASE_URL}domain-publico/catalog.json`

// Nome de arquivo determinístico usado tanto pro download quanto pra
// detectar (via fileName no Book salvo) se um título já foi baixado antes,
// em sessões anteriores do app.
export function buildPublicDomainFileName(entry: Pick<PublicDomainCatalogEntry, 'authorSlug' | 'titleSlug'>): string {
  return `${entry.authorSlug}_${entry.titleSlug}.epub`
}

// Standard Ebooks exige "?source=download" pra devolver o EPUB de verdade —
// sem isso, o servidor responde com uma página HTML de interstitial em vez
// do binário (ver sdd/specs/002-biblioteca-dominio-publico/research.md #1).
export function buildStandardEbooksUrls(authorSlug: string, titleSlug: string): StandardEbooksUrls {
  const base = `https://standardebooks.org/ebooks/${authorSlug}/${titleSlug}/downloads`
  return {
    epubUrl: `${base}/${buildPublicDomainFileName({ authorSlug, titleSlug })}?source=download`,
    coverUrl: `${base}/cover.jpg`,
  }
}

function isValidEntry(value: unknown): value is PublicDomainCatalogEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.author === 'string' &&
    typeof entry.authorSlug === 'string' &&
    typeof entry.titleSlug === 'string'
  )
}

const NEW_RELEASES_FEED_URL = 'https://standardebooks.org/feeds/atom/new-releases'
const SAMPLE_TIMEOUT_MS = 10_000

// <id> de cada entry desse feed: https://standardebooks.org/ebooks/{authorSlug}/{titleSlug}
// (2 segmentos). Títulos com edição extra (ilustrador/tradutor) usam um 3º
// segmento e ficam de fora — mesma limitação já documentada em
// buildStandardEbooksUrls/Cuidados para Retomada da feature 002.
const EBOOK_ID_PATTERN = /^https:\/\/standardebooks\.org\/ebooks\/([^/]+)\/([^/]+)$/

async function fetchNewReleasesXml(): Promise<string> {
  // Feature é Android-only por escopo (mesma restrição de CORS já assumida
  // na feature 002) — sem fallback fetch() pra Web.
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Amostra ao vivo de "Clássicos em Inglês" só é suportada no Android nativo.')
  }

  const response = await CapacitorHttp.request({
    url: NEW_RELEASES_FEED_URL,
    method: 'GET',
    headers: { Accept: 'application/atom+xml' },
    responseType: 'text',
    connectTimeout: SAMPLE_TIMEOUT_MS,
    readTimeout: SAMPLE_TIMEOUT_MS,
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Falha ao buscar novidades do Standard Ebooks (${response.status})`)
  }

  return typeof response.data === 'string' ? response.data : String(response.data)
}

// Esse feed NÃO é um catálogo OPDS de verdade — usa rel="enclosure" (padrão
// Atom/RSS genérico), não rel="http://opds-spec.org/acquisition" (OPDS-spec).
// Por isso não reusa OpdsAtomParser/foliate-js aqui (descoberto ao inspecionar
// o feed ao vivo durante a implementação desta fase) — parser pequeno e
// dedicado, só extraindo o que já basta pra reconstruir a URL de download via
// buildStandardEbooksUrls (mesma fórmula da lista curada).
function parseNewReleasesFeed(xml: string): PublicDomainCatalogEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Feed de novidades do Standard Ebooks inválido.')
  }

  const entries: PublicDomainCatalogEntry[] = []
  for (const entryEl of Array.from(doc.getElementsByTagName('entry'))) {
    const id = entryEl.getElementsByTagName('id')[0]?.textContent?.trim()
    const title = entryEl.getElementsByTagName('title')[0]?.textContent?.trim()
    if (!id || !title) continue

    const match = EBOOK_ID_PATTERN.exec(id)
    if (!match) continue
    const [, authorSlug, titleSlug] = match as unknown as [string, string, string]

    const authorNames = Array.from(entryEl.getElementsByTagName('author'))
      .map((authorEl) => authorEl.getElementsByTagName('name')[0]?.textContent?.trim())
      .filter((name): name is string => Boolean(name))
    if (authorNames.length === 0) continue

    entries.push({
      id: `${authorSlug}_${titleSlug}`,
      title,
      author: authorNames.join(', '),
      authorSlug,
      titleSlug,
    })
  }
  return entries
}

export const PublicDomainCatalogService = {
  async listCatalog(fetchImpl: typeof fetch = fetch): Promise<PublicDomainCatalogEntry[]> {
    const response = await fetchImpl(CATALOG_URL)
    if (!response.ok) {
      throw new Error(`Catalogo de dominio publico indisponivel (${response.status})`)
    }

    const data = await response.json() as unknown
    if (!Array.isArray(data) || !data.every(isValidEntry)) {
      throw new Error('Catalogo de dominio publico em formato invalido')
    }

    return data
  },

  // Amostra ao vivo pro layout row-amostra + "ver mais" (User Story 4) — "ver
  // mais" continua usando listCatalog() (lista curada), não isso. O feed
  // completo do Standard Ebooks exige conta de supporter (confirmado 401 ao
  // vivo na assessment desta feature); esse é o feed público de novidades,
  // sem login.
  async fetchNewReleasesSample(): Promise<PublicDomainCatalogEntry[]> {
    const xml = await fetchNewReleasesXml()
    return parseNewReleasesFeed(xml)
  },
}
