import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  request: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { request: mocks.request },
}))

import { PublicDomainCatalogService, buildStandardEbooksUrls } from '@/services/PublicDomainCatalogService'

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: ok ? status : 500 })) as unknown as typeof fetch
}

// Estrutura real do feed (verificada ao vivo durante a implementação desta
// fase) — usa rel="enclosure", NÃO rel="http://opds-spec.org/acquisition"
// (não é um feed OPDS de verdade, por isso o parser dedicado, sem reusar
// OpdsAtomParser).
const NEW_RELEASES_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://standardebooks.org/feeds/atom/new-releases</id>
  <title>Standard Ebooks - Newest Ebooks</title>
  <entry>
    <id>https://standardebooks.org/ebooks/samuel-taylor-coleridge_robert-southey/the-fall-of-robespierre</id>
    <title>The Fall of Robespierre</title>
    <author><name>Samuel Taylor Coleridge</name></author>
    <author><name>Robert Southey</name></author>
    <link href="https://standardebooks.org/ebooks/samuel-taylor-coleridge_robert-southey/the-fall-of-robespierre/downloads/samuel-taylor-coleridge-robert-southey_the-fall-of-robespierre.epub?source=feed" rel="enclosure" title="Recommended compatible epub" type="application/epub+zip"/>
    <link href="https://standardebooks.org/ebooks/samuel-taylor-coleridge_robert-southey/the-fall-of-robespierre/downloads/samuel-taylor-coleridge-robert-southey_the-fall-of-robespierre_advanced.epub?source=feed" rel="enclosure" title="Advanced epub" type="application/epub+zip"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel</id>
    <title>Alice's Adventures in Wonderland (edição com 3 segmentos, sem suporte ainda)</title>
    <author><name>Lewis Carroll</name></author>
    <link href="https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel/downloads/x.epub?source=feed" rel="enclosure" title="Recommended compatible epub" type="application/epub+zip"/>
  </entry>
</feed>`

describe('PublicDomainCatalogService.listCatalog', () => {
  it('carrega e valida o catalogo bundled', async () => {
    const entries = [
      { id: 'a', title: 'Pride and Prejudice', author: 'Jane Austen', authorSlug: 'jane-austen', titleSlug: 'pride-and-prejudice' },
    ]

    const catalog = await PublicDomainCatalogService.listCatalog(fakeFetch(entries))

    expect(catalog).toEqual(entries)
  })

  it('rejeita quando a resposta nao e ok', async () => {
    await expect(PublicDomainCatalogService.listCatalog(fakeFetch([], false, 500))).rejects.toThrow(/indisponivel/)
  })

  it('rejeita quando uma entrada do catalogo esta incompleta', async () => {
    const invalidEntries = [{ id: 'a', title: 'Sem autor' }]

    await expect(PublicDomainCatalogService.listCatalog(fakeFetch(invalidEntries))).rejects.toThrow(/invalido/)
  })
})

describe('PublicDomainCatalogService.fetchNewReleasesSample', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(true)
    mocks.request.mockReset()
  })

  it('extrai title/author/slugs a partir do <id> de cada entry (2 segmentos)', async () => {
    mocks.request.mockResolvedValue({ status: 200, data: NEW_RELEASES_FEED })

    const sample = await PublicDomainCatalogService.fetchNewReleasesSample()

    expect(sample).toHaveLength(1) // a entry de 3 segmentos fica de fora
    expect(sample[0]).toEqual({
      id: 'samuel-taylor-coleridge_robert-southey_the-fall-of-robespierre',
      title: 'The Fall of Robespierre',
      author: 'Samuel Taylor Coleridge, Robert Southey',
      authorSlug: 'samuel-taylor-coleridge_robert-southey',
      titleSlug: 'the-fall-of-robespierre',
    })
  })

  it('recusa rodar fora do Android nativo', async () => {
    mocks.isNativePlatform.mockReturnValue(false)
    await expect(PublicDomainCatalogService.fetchNewReleasesSample()).rejects.toThrow(/Android nativo/)
  })

  it('lança erro em status HTTP de falha', async () => {
    mocks.request.mockResolvedValue({ status: 503, data: '' })
    await expect(PublicDomainCatalogService.fetchNewReleasesSample()).rejects.toThrow(/503/)
  })

  it('lança erro em XML malformado', async () => {
    mocks.request.mockResolvedValue({ status: 200, data: '<feed><entry><title>Broken</feed>' })
    await expect(PublicDomainCatalogService.fetchNewReleasesSample()).rejects.toThrow(/inválido/)
  })
})

describe('buildStandardEbooksUrls', () => {
  it('deriva as URLs de download e capa a partir dos slugs', () => {
    const urls = buildStandardEbooksUrls('jane-austen', 'pride-and-prejudice')

    expect(urls.epubUrl).toBe(
      'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download',
    )
    expect(urls.coverUrl).toBe(
      'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover.jpg',
    )
  })
})
