import { describe, expect, it } from 'vitest'
import { PublicDomainCatalogService, buildStandardEbooksUrls } from '@/services/PublicDomainCatalogService'

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status: ok ? status : 500 })) as unknown as typeof fetch
}

describe('PublicDomainCatalogService', () => {
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
