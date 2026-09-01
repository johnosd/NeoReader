import { getFeed, getOpenSearch, REL, type OpdsLink, type OpdsSubject } from 'foliate-js/opds.js'
import type { OpdsFeedEntry, OpdsFeedPage } from '../../types/opds'

const EPUB_TYPE = 'application/epub+zip'

// Servidor self-hosted real às vezes manda `&` cru fora de uma entidade válida
// (&amp; &lt; etc) — isso quebra o DOMParser. Escapa só o `&` "solto" (não
// seguido de uma entidade conhecida ou #dígitos), sem tocar no resto do XML
// (research.md #10, lição real observada no Readest).
function sanitizeUnescapedAmpersands(xml: string): string {
  return xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
}

function parseXmlDocument(xml: string): Document {
  const doc = new DOMParser().parseFromString(sanitizeUnescapedAmpersands(xml), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Feed OPDS (Atom) inválido: XML malformado.')
  }
  return doc
}

function hasRel(link: OpdsLink, rel: string): boolean {
  return (link.rel ?? []).includes(rel)
}

function hasAcquisitionRel(link: OpdsLink): boolean {
  return (link.rel ?? []).some((r) => r === REL.ACQ || r.startsWith(`${REL.ACQ}/`))
}

// FR-011/FR-012: mantém só o link EPUB, mesmo se a entry tiver vários formatos.
function pickAcquisitionUrl(links: OpdsLink[]): string | undefined {
  const epubLink = links.find((link) => hasAcquisitionRel(link) && link.type?.includes(EPUB_TYPE))
  return epubLink?.href
}

function pickCoverUrl(images: OpdsLink[], baseUrl: string): string | undefined {
  const href = images[0]?.href
  return href ? resolveUrl(href, baseUrl) : undefined
}

const DCMI_TYPE_SCHEME = 'http://purl.org/dc/terms/DCMIType'
const MAX_SUBJECT_TAGS = 3

// Vira tag automática no livro baixado (OpdsDownloadService), não é exibido
// na navegação — por isso fica frouxo: usa label quando existe (mais legível,
// ex: "Language and Literatures: English literature") senão cai pro term
// cru (ex: "Love stories"). Só exclui DCMIType (classificação de tipo de
// conteúdo, ex: "Text" — sempre igual pra todo EPUB, zero valor como filtro),
// mantém LCSH/LCC/qualquer outro esquema. Cap em 3 pra não poluir a lista de
// tags do usuário com assuntos hiper-granulares de um catálogo só.
function pickSubjects(subjects: OpdsSubject[] | undefined): string[] | undefined {
  if (!subjects?.length) return undefined
  const names = subjects
    .filter((subject) => subject.scheme !== DCMI_TYPE_SCHEME)
    .map((subject) => subject.name ?? subject.code)
    .filter((name): name is string => Boolean(name))
  return names.length ? names.slice(0, MAX_SUBJECT_TAGS) : undefined
}

function resolveUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString()
}

export function parseAtomFeed(xml: string, baseUrl: string): OpdsFeedPage {
  const doc = parseXmlDocument(xml)
  const feed = getFeed(doc)

  const entries: OpdsFeedEntry[] = []

  for (const navItem of feed.navigation ?? []) {
    // FR-013: entry de navegação (pasta/seção) sempre passa, sem filtro de formato.
    // Sem capa de propósito: catálogos reais (Gutenberg confirmado ao vivo)
    // mandam um link de imagem na entry de navegação, mas é um ícone
    // genérico idêntico pra toda entry do feed, não uma capa por item — usar
    // isso deixaria a UI pior, não melhor (ver R-008 em plan.md).
    if (!navItem.href) continue
    entries.push({
      id: resolveUrl(navItem.href, baseUrl),
      title: navItem.title || 'Sem título',
      kind: 'navigation',
      navigationUrl: resolveUrl(navItem.href, baseUrl),
    })
  }

  for (const publication of feed.publications ?? []) {
    const acquisitionUrl = pickAcquisitionUrl(publication.links)
    if (!acquisitionUrl) continue // FR-011: sem link EPUB, fica oculta da lista

    entries.push({
      id: publication.metadata.id ?? acquisitionUrl,
      title: publication.metadata.title || 'Sem título',
      author: publication.metadata.author[0]?.name,
      coverUrl: pickCoverUrl(publication.images, baseUrl),
      subjects: pickSubjects(publication.metadata.subject),
      language: publication.metadata.language,
      kind: 'publication',
      acquisitionUrl: resolveUrl(acquisitionUrl, baseUrl),
    })
  }

  const nextLink = feed.links.find((link) => hasRel(link, 'next'))
  const searchLink = feed.links.find((link) => hasRel(link, 'search'))

  return {
    title: feed.metadata.title,
    entries,
    nextPageUrl: nextLink?.href ? resolveUrl(nextLink.href, baseUrl) : undefined,
    // Deixa cru (sem resolver ainda) de propósito — quem resolve URL relativa
    // vs. template é OpdsCatalogService.search(), que sabe se isso é uma
    // description document (Atom) ou um template pronto (JSON) e trata cada
    // caso na ordem certa (research.md #8: nunca resolver URL antes de
    // expandir um template, senão `{...}` vira lixo percent-encoded).
    searchUrl: searchLink?.href,
  }
}

// Segundo hop da busca Atom: recebe o XML da description document OpenSearch
// (baixada a partir do searchUrl acima) e devolve uma função que expande o
// template pra uma URL de busca já resolvida — SEMPRE expandir antes de
// resolver contra a base (research.md #8: resolver primeiro corrompe chaves
// de template como `{?query}`).
export function parseOpenSearchDescription(xml: string, baseUrl: string): (query: string) => string {
  const doc = parseXmlDocument(xml)
  const openSearch = getOpenSearch(doc)

  return (query: string) => {
    const expanded = openSearch.search(new Map([[null, new Map([['searchTerms', query]])]]))
    return resolveUrl(expanded, baseUrl)
  }
}
