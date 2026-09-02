import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { parseAtomFeed, parseOpenSearchDescription } from './OpdsAtomParser'
import { parseJsonFeed } from './OpdsJsonParser'
import { OpdsCredentialStore, type OpdsCredential } from './OpdsCredentialStore'
import type { OpdsCatalog, OpdsCatalogErrorKind, OpdsFeedEntry, OpdsFeedPage, OpdsSortOrder } from '../../types/opds'

const REQUEST_TIMEOUT_MS = 15_000
const ACCEPT_HEADER = 'application/atom+xml, application/opds+json;q=0.9'

export class OpdsCatalogFetchError extends Error {
  kind: OpdsCatalogErrorKind

  constructor(kind: OpdsCatalogErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'OpdsCatalogFetchError'
  }
}

// Duplicado de propósito em vez de reusar o helper HTTP de FishAudioService/
// PublicDomainDownloadService — domínios não relacionados (mesmo precedente
// já registrado no plan.md da feature 002, Decisões Invariantes).
function getHeaderValue(headers: Record<string, string>, name: string): string {
  const normalized = name.toLowerCase()
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === normalized)
  return entry?.[1] ?? ''
}

// Separado de buildAuthHeaders (abaixo) pra poder testar conexão com uma
// credencial ainda só em memória no formulário (não persistida no storage
// nativo ainda) — ver testConnection().
async function resolveCredentialFromStorage(catalog: OpdsCatalog): Promise<OpdsCredential | undefined> {
  if (!catalog.hasCredential || catalog.id == null) return undefined
  const credential = await OpdsCredentialStore.get(catalog.id)
  return credential ?? undefined
}

// Basic Auth simples — negociação de esquema (Digest) fica fora do v1
// (research.md #5): CapacitorHttp não suporta nativamente e exigiria MD5 do
// zero, ausente do Web Crypto.
function buildAuthHeaders(credential: OpdsCredential | undefined): Record<string, string> {
  if (!credential) return {}
  return { Authorization: `Basic ${btoa(`${credential.username}:${credential.password}`)}` }
}

// research.md #10: servidor real pode devolver link http:// mesmo servindo
// HTTPS (confirmado ao vivo — o OpenSearch description do Gutenberg anuncia
// template com "http://m.gutenberg.org/..."). Mas NÃO upgrada quando o
// catálogo em si já é http:// — self-hosted na rede local (Calibre-Web,
// Kavita) frequentemente é http:// puro de propósito, sem TLS configurado
// (confirmado ao vivo: forçar https nesse caso quebra a conexão, já que o
// servidor não fala TLS naquela porta). R-010 em plan.md.
function upgradeToHttps(url: string, catalogBaseUrl: string): string {
  if (!catalogBaseUrl.startsWith('https://')) return url
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

async function rawRequest(
  catalogBaseUrl: string,
  url: string,
  accept: string,
  credential: OpdsCredential | undefined,
): Promise<{ headers: Record<string, string>; body: string }> {
  // Feature é Android-only por escopo (FR-022) — CapacitorHttp fora do
  // nativo cai pra fetch() do browser, sujeito a CORS que self-hosted
  // tipicamente não libera.
  if (!Capacitor.isNativePlatform()) {
    throw new OpdsCatalogFetchError('network', 'Catálogos OPDS só são suportados no Android nativo.')
  }

  const headers = { Accept: accept, ...buildAuthHeaders(credential) }

  let response
  try {
    response = await CapacitorHttp.request({
      url: upgradeToHttps(url, catalogBaseUrl),
      method: 'GET',
      headers,
      responseType: 'text',
      connectTimeout: REQUEST_TIMEOUT_MS,
      readTimeout: REQUEST_TIMEOUT_MS,
    })
  } catch (error) {
    throw new OpdsCatalogFetchError('network', error instanceof Error ? error.message : 'Falha de rede ao acessar o catálogo.')
  }

  if (response.status === 401 || response.status === 403) {
    throw new OpdsCatalogFetchError('invalid-credential', 'Usuário ou senha incorretos para este catálogo.')
  }
  if (response.status < 200 || response.status >= 300) {
    throw new OpdsCatalogFetchError('network', `Falha ao acessar o catálogo (${response.status}).`)
  }

  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
  return { headers: response.headers, body }
}

function detectFormat(headers: Record<string, string>, body: string): 'atom' | 'json' {
  const contentType = getHeaderValue(headers, 'content-type').toLowerCase()
  if (contentType.includes('opds+json') || contentType.includes('application/json')) return 'json'
  if (contentType.includes('atom+xml') || contentType.includes('xml')) return 'atom'

  // Fallback pra servidor self-hosted mal configurado (Content-Type genérico
  // ou ausente) — sniff pelo primeiro caractere não-whitespace do corpo
  // (research.md #3).
  const firstChar = body.trimStart()[0]
  if (firstChar === '{' || firstChar === '[') return 'json'
  if (firstChar === '<') return 'atom'

  throw new OpdsCatalogFetchError('invalid-format', 'Catálogo em formato inválido (não é OPDS 1.x nem 2.0).')
}

function parseFeedBody(format: 'atom' | 'json', body: string, url: string): OpdsFeedPage {
  try {
    return format === 'json' ? parseJsonFeed(JSON.parse(body), url) : parseAtomFeed(body, url)
  } catch (error) {
    throw new OpdsCatalogFetchError('invalid-format', error instanceof Error ? error.message : 'Catálogo em formato inválido.')
  }
}

async function fetchFeedPage(catalog: OpdsCatalog, url: string): Promise<OpdsFeedPage> {
  const credential = await resolveCredentialFromStorage(catalog)
  const { headers, body } = await rawRequest(catalog.baseUrl, url, ACCEPT_HEADER, credential)
  const format = detectFormat(headers, body)
  return parseFeedBody(format, body, url)
}

function resolveUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString()
}

// Convenção do Gutenberg (`?sort_order=downloads|release_date|random`), não
// padrão OPDS — confirmado ao vivo contra o feed raiz real (`/ebooks.opds/`,
// entries "Popular"/"Latest"/"Random"). Anexado como query param extra em
// qualquer catálogo: servidor que não reconhece tipicamente ignora e
// devolve a ordem de sempre, sem erro.
function appendSortOrder(url: string, sortOrder?: OpdsSortOrder): string {
  if (!sortOrder || sortOrder === 'default') return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}sort_order=${sortOrder}`
}

// Só a variável de busca (`searchTerms`/`query`), sem depender de uma lib de
// URI Template inteira (research.md #2/#8) — cobre `{searchTerms}` (simples)
// e `{?searchTerms}`/`{?query}` (form-style).
function expandSearchTemplate(template: string, query: string): string {
  const encoded = encodeURIComponent(query)
  return template.replace(/\{(\??)([a-zA-Z]+)\}/, (_match, prefix: string, varName: string) =>
    prefix === '?' ? `?${varName}=${encoded}` : encoded,
  )
}

// Atom aponta pra uma OpenSearch description document (2 hops); OPDS 2.0
// JSON já traz o template pronto no link (1 hop). Em ambos os casos, SEMPRE
// expande o template antes de resolver a URL (research.md #8) — resolver
// primeiro corrompe chaves como `{?query}`.
async function resolveSearchUrl(catalog: OpdsCatalog, rawSearchUrl: string, query: string): Promise<string> {
  if (rawSearchUrl.includes('{')) {
    return resolveUrl(expandSearchTemplate(rawSearchUrl, query), catalog.baseUrl)
  }

  const descriptionUrl = resolveUrl(rawSearchUrl, catalog.baseUrl)
  const credential = await resolveCredentialFromStorage(catalog)
  const { body } = await rawRequest(catalog.baseUrl, descriptionUrl, 'application/opensearchdescription+xml', credential)
  const buildSearchUrl = parseOpenSearchDescription(body, descriptionUrl)
  return buildSearchUrl(query)
}

// Capa protegida por auth (ex: Calibre content server exige Basic Auth em
// todo endpoint, capa inclusa) nunca carregaria via <img src> direto — a tag
// não manda o header Authorization. Busca autenticada + converte pra data
// URI, que o <img> consegue renderizar sem precisar de rede de novo. Só
// entries de catálogo COM credencial passam por aqui (sem credencial, a URL
// original já funciona direto e evita esse round-trip extra).
async function fetchCoverDataUrl(catalog: OpdsCatalog, coverUrl: string, credential: OpdsCredential | undefined): Promise<string | undefined> {
  if (!Capacitor.isNativePlatform()) return coverUrl
  try {
    const response = await CapacitorHttp.request({
      url: upgradeToHttps(coverUrl, catalog.baseUrl),
      method: 'GET',
      headers: buildAuthHeaders(credential),
      responseType: 'arraybuffer',
      connectTimeout: REQUEST_TIMEOUT_MS,
      readTimeout: REQUEST_TIMEOUT_MS,
    })
    if (response.status < 200 || response.status >= 300) return undefined
    const contentType = getHeaderValue(response.headers, 'content-type') || 'image/jpeg'
    // CapacitorHttp devolve corpo binário como string base64 quando
    // responseType é 'arraybuffer' — já é o formato que <img src="data:..."> espera.
    return `data:${contentType};base64,${response.data as string}`
  } catch {
    return undefined
  }
}

export const OpdsCatalogService = {
  async fetchSample(catalog: OpdsCatalog): Promise<OpdsFeedPage> {
    return fetchFeedPage(catalog, catalog.baseUrl)
  },

  async fetchPage(catalog: OpdsCatalog, url: string, sortOrder?: OpdsSortOrder): Promise<OpdsFeedPage> {
    return fetchFeedPage(catalog, appendSortOrder(url, sortOrder))
  },

  async search(catalog: OpdsCatalog, searchUrl: string, query: string, sortOrder?: OpdsSortOrder): Promise<OpdsFeedPage> {
    const resolvedUrl = await resolveSearchUrl(catalog, searchUrl, query)
    return fetchFeedPage(catalog, appendSortOrder(resolvedUrl, sortOrder))
  },

  // Testa conectividade com uma credencial explícita (ainda em memória no
  // formulário, não persistida) — usado por Settings pra validar ANTES de
  // salvar o catálogo (pedido do usuário: não salvar se a conexão falhar).
  // Não depende de um `id`/storage nativo como fetchSample.
  async testConnection(baseUrl: string, credential?: OpdsCredential): Promise<OpdsFeedPage> {
    const { headers, body } = await rawRequest(baseUrl, baseUrl, ACCEPT_HEADER, credential)
    const format = detectFormat(headers, body)
    return parseFeedBody(format, body, baseUrl)
  },

  // Resolve capas protegidas por auth pra data URI (ver fetchCoverDataUrl).
  // Catálogo sem credencial devolve as entries como vieram — sem round-trip
  // extra, já que <img src> direto funciona nesse caso.
  async resolveEntryCovers(catalog: OpdsCatalog, entries: OpdsFeedEntry[]): Promise<OpdsFeedEntry[]> {
    if (!catalog.hasCredential) return entries
    const credential = await resolveCredentialFromStorage(catalog)
    if (!credential) return entries

    return Promise.all(entries.map(async (entry) => {
      if (!entry.coverUrl) return entry
      const dataUrl = await fetchCoverDataUrl(catalog, entry.coverUrl, credential)
      return dataUrl ? { ...entry, coverUrl: dataUrl } : { ...entry, coverUrl: undefined }
    }))
  },
}
