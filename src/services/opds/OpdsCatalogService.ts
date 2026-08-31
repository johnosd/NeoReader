import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { parseAtomFeed, parseOpenSearchDescription } from './OpdsAtomParser'
import { parseJsonFeed } from './OpdsJsonParser'
import { OpdsCredentialStore } from './OpdsCredentialStore'
import type { OpdsCatalog, OpdsCatalogErrorKind, OpdsFeedPage } from '../../types/opds'

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

async function buildAuthHeaders(catalog: OpdsCatalog): Promise<Record<string, string>> {
  if (!catalog.hasCredential || catalog.id == null) return {}
  const credential = await OpdsCredentialStore.get(catalog.id)
  if (!credential) return {}
  // Basic Auth simples — negociação de esquema (Digest) fica fora do v1
  // (research.md #5): CapacitorHttp não suporta nativamente e exigiria MD5
  // do zero, ausente do Web Crypto.
  return { Authorization: `Basic ${btoa(`${credential.username}:${credential.password}`)}` }
}

async function rawRequest(
  catalog: OpdsCatalog,
  url: string,
  accept: string,
): Promise<{ headers: Record<string, string>; body: string }> {
  // Feature é Android-only por escopo (FR-022) — CapacitorHttp fora do
  // nativo cai pra fetch() do browser, sujeito a CORS que self-hosted
  // tipicamente não libera.
  if (!Capacitor.isNativePlatform()) {
    throw new OpdsCatalogFetchError('network', 'Catálogos OPDS só são suportados no Android nativo.')
  }

  const headers = { Accept: accept, ...(await buildAuthHeaders(catalog)) }

  let response
  try {
    response = await CapacitorHttp.request({
      url,
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
  const { headers, body } = await rawRequest(catalog, url, ACCEPT_HEADER)
  const format = detectFormat(headers, body)
  return parseFeedBody(format, body, url)
}

function resolveUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString()
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
  const { body } = await rawRequest(catalog, descriptionUrl, 'application/opensearchdescription+xml')
  const buildSearchUrl = parseOpenSearchDescription(body, descriptionUrl)
  return buildSearchUrl(query)
}

export const OpdsCatalogService = {
  async fetchSample(catalog: OpdsCatalog): Promise<OpdsFeedPage> {
    return fetchFeedPage(catalog, catalog.baseUrl)
  },

  async fetchPage(catalog: OpdsCatalog, url: string): Promise<OpdsFeedPage> {
    return fetchFeedPage(catalog, url)
  },

  async search(catalog: OpdsCatalog, searchUrl: string, query: string): Promise<OpdsFeedPage> {
    const resolvedUrl = await resolveSearchUrl(catalog, searchUrl, query)
    return fetchFeedPage(catalog, resolvedUrl)
  },
}
