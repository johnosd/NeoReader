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
}
