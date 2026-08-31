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
})
