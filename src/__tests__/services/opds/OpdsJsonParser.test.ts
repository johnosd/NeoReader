import { describe, expect, it } from 'vitest'
import { parseJsonFeed } from '@/services/opds/OpdsJsonParser'

const BASE_URL = 'https://example.com/opds/'

const FEED = {
  metadata: { title: 'Test JSON Catalog' },
  links: [
    { rel: 'next', href: '/catalog?page=2' },
    { rel: 'search', href: '/search{?query}' },
  ],
  navigation: [
    { title: 'A Folder', href: '/catalog/folder-1' },
  ],
  publications: [
    {
      metadata: { title: 'Dune', author: { name: 'Frank Herbert' } },
      links: [
        { rel: 'http://opds-spec.org/acquisition', href: '/download/1.epub', type: 'application/epub+zip' },
        { rel: 'http://opds-spec.org/acquisition', href: '/download/1.mobi', type: 'application/x-mobipocket-ebook' },
      ],
      images: [{ href: '/covers/1.jpg', type: 'image/jpeg' }],
    },
    {
      metadata: { title: 'PDF Only' },
      links: [{ rel: 'http://opds-spec.org/acquisition', href: '/download/2.pdf', type: 'application/pdf' }],
    },
    {
      metadata: { title: 'Vários Autores', author: [{ name: 'Autor Um' }, { name: 'Autor Dois' }] },
      links: [{ rel: ['http://opds-spec.org/acquisition'], href: '/download/3.epub', type: 'application/epub+zip' }],
    },
  ],
}

describe('OpdsJsonParser', () => {
  it('normaliza navegação e publicação, filtrando pra só o link EPUB (FR-011/FR-012/FR-013)', () => {
    const page = parseJsonFeed(FEED, BASE_URL)

    expect(page.title).toBe('Test JSON Catalog')
    // 1 pasta + Dune + Vários Autores — PDF Only fica de fora
    expect(page.entries).toHaveLength(3)

    const folder = page.entries.find((entry) => entry.kind === 'navigation')
    expect(folder).toMatchObject({ title: 'A Folder', navigationUrl: 'https://example.com/catalog/folder-1' })

    const dune = page.entries.find((entry) => entry.title === 'Dune')
    expect(dune).toMatchObject({
      author: 'Frank Herbert',
      acquisitionUrl: 'https://example.com/download/1.epub',
      coverUrl: 'https://example.com/covers/1.jpg',
    })
  })

  it('aceita rel como string ou array de strings, e author como objeto/array/string', () => {
    const page = parseJsonFeed(FEED, BASE_URL)
    const variosAutores = page.entries.find((entry) => entry.title === 'Vários Autores')
    expect(variosAutores?.author).toBe('Autor Um')
  })

  it('resolve nextPageUrl como URL absoluta e deixa searchUrl cru (template não expandido)', () => {
    const page = parseJsonFeed(FEED, BASE_URL)
    expect(page.nextPageUrl).toBe('https://example.com/catalog?page=2')
    expect(page.searchUrl).toBe('/search{?query}')
  })

  it('lança erro claro pra corpo que não é um objeto', () => {
    expect(() => parseJsonFeed(null, BASE_URL)).toThrow(/inválido/)
    expect(() => parseJsonFeed('texto qualquer', BASE_URL)).toThrow(/inválido/)
  })
})
