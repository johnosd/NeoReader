import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  request: vi.fn(),
  getCredential: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))

vi.mock('@/services/opds/OpdsCredentialStore', () => ({
  OpdsCredentialStore: { get: mocks.getCredential },
}))

import { OpdsCatalogFetchError, OpdsCatalogService } from '@/services/opds/OpdsCatalogService'

const ATOM_BODY = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:test</id>
  <title>Atom Catalog</title>
  <link rel="search" href="/opensearch.xml" type="application/opensearchdescription+xml"/>
  <entry>
    <title>Dune</title>
    <id>urn:book-1</id>
    <link rel="http://opds-spec.org/acquisition" href="/1.epub" type="application/epub+zip"/>
  </entry>
</feed>`

const OPENSEARCH_DESCRIPTION = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <Url type="application/atom+xml" template="https://example.com/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`

// Caso real do Gutenberg: o próprio OpenSearch description anuncia um
// template http:// (subdomínio diferente do catálogo), mesmo o servidor
// servindo HTTPS normalmente — confirmado ao vivo, request original falhava
// com "Cleartext HTTP traffic ... not permitted" no Android.
const OPENSEARCH_DESCRIPTION_HTTP = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <Url type="application/atom+xml" template="http://m.example.com/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`

const JSON_BODY = JSON.stringify({
  metadata: { title: 'JSON Catalog' },
  links: [{ rel: 'search', href: '/search{?query}' }],
  publications: [
    {
      metadata: { title: 'Foundation' },
      links: [{ rel: 'http://opds-spec.org/acquisition', href: '/2.epub', type: 'application/epub+zip' }],
    },
  ],
})

function catalog(overrides: Partial<OpdsCatalog> = {}): OpdsCatalog {
  return {
    id: 1,
    name: 'Test',
    baseUrl: 'https://example.com/opds/',
    hasCredential: false,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('OpdsCatalogService', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.request.mockReset()
    mocks.getCredential.mockReset()
  })

  it('detecta Atom pelo Content-Type e parseia a amostra', async () => {
    mocks.request.mockResolvedValueOnce({
      status: 200,
      headers: { 'Content-Type': 'application/atom+xml;profile=opds-catalog' },
      data: ATOM_BODY,
    })

    const page = await OpdsCatalogService.fetchSample(catalog())
    expect(page.entries).toEqual([expect.objectContaining({ title: 'Dune' })])
  })

  it('detecta OPDS 2.0 JSON pelo Content-Type e parseia', async () => {
    mocks.request.mockResolvedValueOnce({
      status: 200,
      headers: { 'Content-Type': 'application/opds+json' },
      data: JSON_BODY,
    })

    const page = await OpdsCatalogService.fetchSample(catalog())
    expect(page.entries).toEqual([expect.objectContaining({ title: 'Foundation' })])
  })

  it('cai no fallback de sniff quando o Content-Type é genérico/ausente', async () => {
    mocks.request.mockResolvedValueOnce({ status: 200, headers: {}, data: JSON_BODY })
    const page = await OpdsCatalogService.fetchSample(catalog())
    expect(page.entries).toEqual([expect.objectContaining({ title: 'Foundation' })])
  })

  it('lança invalid-format quando nem Content-Type nem o corpo dão pra detectar formato', async () => {
    mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'text/html' }, data: 'Not Found' })

    const error = await OpdsCatalogService.fetchSample(catalog()).catch((e) => e)
    expect(error).toBeInstanceOf(OpdsCatalogFetchError)
    expect((error as InstanceType<typeof OpdsCatalogFetchError>).kind).toBe('invalid-format')
  })

  it('lança invalid-credential em 401/403 (FR-005)', async () => {
    mocks.request.mockResolvedValueOnce({ status: 401, headers: {}, data: '' })
    const error = await OpdsCatalogService.fetchSample(catalog()).catch((e) => e)
    expect(error).toBeInstanceOf(OpdsCatalogFetchError)
    expect((error as InstanceType<typeof OpdsCatalogFetchError>).kind).toBe('invalid-credential')
  })

  it('lança network em outros status de erro', async () => {
    mocks.request.mockResolvedValueOnce({ status: 500, headers: {}, data: '' })
    const error = await OpdsCatalogService.fetchSample(catalog()).catch((e) => e)
    expect(error).toBeInstanceOf(OpdsCatalogFetchError)
    expect((error as InstanceType<typeof OpdsCatalogFetchError>).kind).toBe('network')
  })

  it('recusa rodar fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    const error = await OpdsCatalogService.fetchSample(catalog()).catch((e) => e)
    expect(error).toBeInstanceOf(OpdsCatalogFetchError)
    expect((error as InstanceType<typeof OpdsCatalogFetchError>).kind).toBe('network')
  })

  it('adiciona Authorization Basic só quando o catálogo tem credencial', async () => {
    mocks.getCredential.mockResolvedValue({ username: 'user', password: 'pass' })
    mocks.request.mockResolvedValue({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

    await OpdsCatalogService.fetchSample(catalog({ id: 2, hasCredential: true }))
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Basic ${btoa('user:pass')}` }),
    }))

    mocks.request.mockClear()
    await OpdsCatalogService.fetchSample(catalog({ hasCredential: false }))
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }))
  })

  it('fetchPage busca a URL informada, não a baseUrl do catálogo', async () => {
    mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })
    await OpdsCatalogService.fetchPage(catalog(), 'https://example.com/opds/folder-1')
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/opds/folder-1' }))
  })

  it('search com template pronto (OPDS 2.0 JSON) expande e busca num fetch só', async () => {
    mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/opds+json' }, data: JSON_BODY })

    // Sem "/" inicial de propósito: resolve relativo ao baseUrl do catálogo
    // ("https://example.com/opds/"), não à raiz do domínio.
    const page = await OpdsCatalogService.search(catalog(), 'search{?query}', 'dune')

    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/opds/search?query=dune',
    }))
    expect(page.entries).toEqual([expect.objectContaining({ title: 'Foundation' })])
  })

  it('search com description document (Atom) faz 2 fetches: busca o template, depois os resultados', async () => {
    mocks.request
      .mockResolvedValueOnce({ status: 200, headers: {}, data: OPENSEARCH_DESCRIPTION })
      .mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

    // Sem "/" inicial de propósito: resolve relativo ao baseUrl do catálogo.
    const page = await OpdsCatalogService.search(catalog(), 'opensearch.xml', 'dune')

    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(mocks.request).toHaveBeenNthCalledWith(1, expect.objectContaining({ url: 'https://example.com/opds/opensearch.xml' }))
    expect(mocks.request).toHaveBeenNthCalledWith(2, expect.objectContaining({ url: 'https://example.com/opds/search?q=dune' }))
    expect(page.entries).toEqual([expect.objectContaining({ title: 'Dune' })])
  })

  it('fetchPage anexa sort_order quando informado, e não mexe na URL quando é "default" ou omitido (convenção do Gutenberg, não padrão OPDS)', async () => {
    mocks.request.mockResolvedValue({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

    await OpdsCatalogService.fetchPage(catalog(), 'https://example.com/opds/folder-1')
    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/opds/folder-1' }))

    await OpdsCatalogService.fetchPage(catalog(), 'https://example.com/opds/folder-1', 'default')
    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/opds/folder-1' }))

    await OpdsCatalogService.fetchPage(catalog(), 'https://example.com/opds/folder-1', 'downloads')
    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/opds/folder-1?sort_order=downloads' }))

    // URL que já tem query string própria — usa "&", não "?" de novo.
    await OpdsCatalogService.fetchPage(catalog(), 'https://example.com/opds/?query=love', 'release_date')
    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/opds/?query=love&sort_order=release_date' }))
  })

  it('faz upgrade de http:// pra https:// antes de requisitar, mesmo quando o próprio OpenSearch description manda um template http:// (research.md #10, bug real do Gutenberg) — só quando o catálogo em si é https', async () => {
    mocks.request
      .mockResolvedValueOnce({ status: 200, headers: {}, data: OPENSEARCH_DESCRIPTION_HTTP })
      .mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

    await OpdsCatalogService.search(catalog(), 'opensearch.xml', 'dune')

    expect(mocks.request).toHaveBeenNthCalledWith(2, expect.objectContaining({ url: 'https://m.example.com/opds/search?q=dune' }))
  })

  it('NÃO faz upgrade pra https quando o catálogo em si é http:// — self-hosted na rede local costuma ser http:// puro de propósito (R-010)', async () => {
    mocks.request.mockResolvedValue({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

    await OpdsCatalogService.fetchPage(catalog({ baseUrl: 'http://192.168.0.14:8083/opds' }), 'http://192.168.0.14:8083/opds/folder-1')

    expect(mocks.request).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'http://192.168.0.14:8083/opds/folder-1' }))
  })

  describe('testConnection', () => {
    it('testa com credencial explícita, sem tocar no storage nativo (catálogo ainda não persistido)', async () => {
      mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

      const page = await OpdsCatalogService.testConnection('https://example.com/opds/', { username: 'joao', password: 'segredo' })

      expect(mocks.getCredential).not.toHaveBeenCalled()
      expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://example.com/opds/',
        headers: expect.objectContaining({ Authorization: `Basic ${btoa('joao:segredo')}` }),
      }))
      expect(page.entries).toEqual([expect.objectContaining({ title: 'Dune' })])
    })

    it('testa sem credencial quando nenhuma é passada', async () => {
      mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'application/atom+xml' }, data: ATOM_BODY })

      await OpdsCatalogService.testConnection('https://example.com/opds/')

      expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }))
    })

    it('propaga OpdsCatalogFetchError (ex: invalid-credential) igual ao fetchSample', async () => {
      mocks.request.mockResolvedValueOnce({ status: 401, headers: {}, data: '' })

      const error = await OpdsCatalogService.testConnection('https://example.com/opds/', { username: 'x', password: 'errada' }).catch((e) => e)
      expect(error).toBeInstanceOf(OpdsCatalogFetchError)
      expect((error as InstanceType<typeof OpdsCatalogFetchError>).kind).toBe('invalid-credential')
    })
  })

  describe('resolveEntryCovers', () => {
    function entry(overrides: Partial<import('@/types/opds').OpdsFeedEntry> = {}): import('@/types/opds').OpdsFeedEntry {
      return { id: 'e1', title: 'Dune', kind: 'publication', coverUrl: 'https://example.com/opds/cover.jpg', ...overrides }
    }

    it('devolve as entries sem mudar quando o catálogo não tem credencial (evita round-trip desnecessário)', async () => {
      const entries = [entry()]
      const resolved = await OpdsCatalogService.resolveEntryCovers(catalog({ hasCredential: false }), entries)
      expect(resolved).toBe(entries)
      expect(mocks.request).not.toHaveBeenCalled()
    })

    it('busca a capa autenticada e converte pra data URI quando o catálogo tem credencial', async () => {
      mocks.getCredential.mockResolvedValue({ username: 'user', password: 'pass' })
      mocks.request.mockResolvedValueOnce({ status: 200, headers: { 'Content-Type': 'image/jpeg' }, data: 'YmFzZTY0' })

      const [resolved] = await OpdsCatalogService.resolveEntryCovers(catalog({ id: 2, hasCredential: true }), [entry()])

      expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://example.com/opds/cover.jpg',
        responseType: 'arraybuffer',
        headers: expect.objectContaining({ Authorization: `Basic ${btoa('user:pass')}` }),
      }))
      expect(resolved!.coverUrl).toBe('data:image/jpeg;base64,YmFzZTY0')
    })

    it('remove coverUrl (em vez de deixar a URL original, que 401 de qualquer forma) quando a busca autenticada falha', async () => {
      mocks.getCredential.mockResolvedValue({ username: 'user', password: 'pass' })
      mocks.request.mockResolvedValueOnce({ status: 401, headers: {}, data: '' })

      const [resolved] = await OpdsCatalogService.resolveEntryCovers(catalog({ id: 2, hasCredential: true }), [entry()])

      expect(resolved!.coverUrl).toBeUndefined()
    })

    it('não mexe em entry sem coverUrl', async () => {
      mocks.getCredential.mockResolvedValue({ username: 'user', password: 'pass' })
      const noCover = entry({ coverUrl: undefined })

      const [resolved] = await OpdsCatalogService.resolveEntryCovers(catalog({ id: 2, hasCredential: true }), [noCover])

      expect(resolved).toBe(noCover)
      expect(mocks.request).not.toHaveBeenCalled()
    })
  })
})
