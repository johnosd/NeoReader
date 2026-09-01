import type { OpdsFeedEntry, OpdsFeedPage } from '../../types/opds'

const EPUB_TYPE = 'application/epub+zip'
const ACQ_REL = 'http://opds-spec.org/acquisition'

interface JsonLink {
  rel?: string | string[]
  href?: string
  type?: string
}

interface JsonNavigationItem extends JsonLink {
  title?: string
}

interface JsonAuthor {
  name?: string
}

interface JsonSubject {
  name?: string
}

interface JsonPublication {
  metadata?: {
    title?: string
    author?: JsonAuthor | JsonAuthor[] | string
    subject?: (JsonSubject | string)[]
    language?: string | string[]
  }
  links?: JsonLink[]
  images?: JsonLink[]
}

interface OpdsJsonFeedShape {
  metadata?: { title?: string }
  links?: JsonLink[]
  navigation?: JsonNavigationItem[]
  publications?: JsonPublication[]
}

function relList(link: JsonLink): string[] {
  if (!link.rel) return []
  return Array.isArray(link.rel) ? link.rel : [link.rel]
}

function hasRel(link: JsonLink, rel: string): boolean {
  return relList(link).includes(rel)
}

function hasAcquisitionRel(link: JsonLink): boolean {
  return relList(link).some((r) => r === ACQ_REL || r.startsWith(`${ACQ_REL}/`))
}

// FR-011/FR-012: mantém só o link EPUB, mesmo se a entry tiver vários formatos.
function pickAcquisitionUrl(links: JsonLink[]): string | undefined {
  return links.find((link) => hasAcquisitionRel(link) && link.type?.includes(EPUB_TYPE))?.href
}

function pickCoverUrl(images: JsonLink[] | undefined, baseUrl: string): string | undefined {
  const href = images?.[0]?.href
  return href ? resolveUrl(href, baseUrl) : undefined
}

const MAX_SUBJECT_TAGS = 3

// Mesma ideia do OpdsAtomParser: vira tag automática, cap em 3 pra não
// poluir a lista de tags do usuário. OPDS 2.0/Readium Web Pub Manifest
// permite "subject" como array de string OU de objeto com "name".
function pickSubjects(subject: (JsonSubject | string)[] | undefined): string[] | undefined {
  if (!subject?.length) return undefined
  const names = subject
    .map((item) => (typeof item === 'string' ? item : item.name))
    .filter((name): name is string => Boolean(name))
  return names.length ? names.slice(0, MAX_SUBJECT_TAGS) : undefined
}

function primaryLanguage(language: string | string[] | undefined): string | undefined {
  return Array.isArray(language) ? language[0] : language
}

function authorName(author: JsonAuthor | JsonAuthor[] | string | undefined): string | undefined {
  if (!author) return undefined
  if (typeof author === 'string') return author
  const first = Array.isArray(author) ? author[0] : author
  return first?.name
}

function resolveUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString()
}

export function parseJsonFeed(json: unknown, baseUrl: string): OpdsFeedPage {
  if (!json || typeof json !== 'object') {
    throw new Error('Feed OPDS (JSON) inválido: corpo vazio ou malformado.')
  }
  const feed = json as OpdsJsonFeedShape

  const entries: OpdsFeedEntry[] = []

  for (const navItem of feed.navigation ?? []) {
    // FR-013: entry de navegação (pasta/seção) sempre passa, sem filtro de formato.
    if (!navItem.href) continue
    entries.push({
      id: resolveUrl(navItem.href, baseUrl),
      title: navItem.title || 'Sem título',
      kind: 'navigation',
      navigationUrl: resolveUrl(navItem.href, baseUrl),
    })
  }

  for (const publication of feed.publications ?? []) {
    const acquisitionUrl = pickAcquisitionUrl(publication.links ?? [])
    if (!acquisitionUrl) continue // FR-011: sem link EPUB, fica oculta da lista

    entries.push({
      id: acquisitionUrl,
      title: publication.metadata?.title || 'Sem título',
      author: authorName(publication.metadata?.author),
      coverUrl: pickCoverUrl(publication.images, baseUrl),
      subjects: pickSubjects(publication.metadata?.subject),
      language: primaryLanguage(publication.metadata?.language),
      kind: 'publication',
      acquisitionUrl: resolveUrl(acquisitionUrl, baseUrl),
    })
  }

  const links = feed.links ?? []
  const nextLink = links.find((link) => hasRel(link, 'next'))
  const searchLink = links.find((link) => hasRel(link, 'search'))

  return {
    title: feed.metadata?.title,
    entries,
    nextPageUrl: nextLink?.href ? resolveUrl(nextLink.href, baseUrl) : undefined,
    // Cru, sem resolver: diferente do Atom, o link de busca do OPDS 2.0 já É
    // o template (`{searchTerms}`/`{?query}`), não aponta pra um documento de
    // descrição separado — mas resolver a URL antes de expandir o template
    // corromperia as chaves (research.md #8), então isso fica pro
    // OpdsCatalogService.search() decidir e expandir na ordem certa.
    searchUrl: searchLink?.href,
  }
}
