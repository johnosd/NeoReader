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
      metadata: {
        title: 'Dune',
        author: { name: 'Frank Herbert' },
        // 4 assuntos (string e objeto {name} misturados) pra testar cap em 3.
        subject: ['Science fiction', { name: 'Adventure' }, 'Desert planets', 'Politics'],
        language: ['en', 'fr'],
      },
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
  it('normaliza navegação e publicação, escolhendo o link EPUB quando existe (FR-011/FR-012/FR-013)', () => {
    const page = parseJsonFeed(FEED, BASE_URL)

    expect(page.title).toBe('Test JSON Catalog')
    // 1 pasta + Dune + PDF Only + Vários Autores (só-PDF entra pela FR-017 da 022)
    expect(page.entries).toHaveLength(4)

    const folder = page.entries.find((entry) => entry.kind === 'navigation')
    expect(folder).toMatchObject({ title: 'A Folder', navigationUrl: 'https://example.com/catalog/folder-1' })

    const dune = page.entries.find((entry) => entry.title === 'Dune')
    expect(dune).toMatchObject({
      author: 'Frank Herbert',
      acquisitionUrl: 'https://example.com/download/1.epub',
      acquisitionFormat: 'EPUB',
      coverUrl: 'https://example.com/covers/1.jpg',
      subjects: ['Science fiction', 'Adventure', 'Desert planets'], // cap em 3
      language: 'en', // primeiro item quando "language" vem como array
    })
  })

  it('mostra a entrada só-PDF com o link PDF e acquisitionFormat PDF (FR-017 da 022)', () => {
    const page = parseJsonFeed(FEED, BASE_URL)
    expect(page.entries.find((entry) => entry.title === 'PDF Only')).toMatchObject({
      kind: 'publication',
      acquisitionUrl: 'https://example.com/download/2.pdf',
      acquisitionFormat: 'PDF',
    })
  })

  it('entrada mista prefere EPUB mesmo com o PDF listado antes; sem EPUB/PDF, fica de fora', () => {
    const page = parseJsonFeed({
      publications: [
        {
          metadata: { title: 'Mixed' },
          links: [
            { rel: 'http://opds-spec.org/acquisition', href: '/m.pdf', type: 'application/pdf' },
            { rel: 'http://opds-spec.org/acquisition/open-access', href: '/m.epub', type: 'application/epub+zip' },
          ],
        },
        {
          metadata: { title: 'Mobi Only' },
          links: [{ rel: 'http://opds-spec.org/acquisition', href: '/x.mobi', type: 'application/x-mobipocket-ebook' }],
        },
      ],
    }, BASE_URL)

    expect(page.entries.map((entry) => entry.title)).toEqual(['Mixed'])
    expect(page.entries[0]).toMatchObject({ acquisitionUrl: 'https://example.com/m.epub', acquisitionFormat: 'EPUB' })
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
