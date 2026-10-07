import { describe, expect, it } from 'vitest'
import { parseAtomFeed, parseOpenSearchDescription } from '@/services/opds/OpdsAtomParser'

const BASE_URL = 'https://example.com/opds/catalog'

const REAL_STYLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/">
  <id>urn:test:catalog</id>
  <title>Test Catalog</title>
  <link rel="next" href="/catalog?page=2" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="search" href="/opensearch.xml" type="application/opensearchdescription+xml"/>
  <entry>
    <title>A Folder</title>
    <id>urn:test:folder-1</id>
    <link rel="subsection" href="/catalog/folder-1" type="application/atom+xml;profile=opds-catalog"/>
  </entry>
  <entry>
    <title>Pride and Prejudice</title>
    <id>urn:test:book-1</id>
    <author><name>Jane Austen</name></author>
    <link rel="http://opds-spec.org/acquisition" href="/download/1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition" href="/download/1.mobi" type="application/x-mobipocket-ebook"/>
    <link rel="http://opds-spec.org/image" href="/covers/1.jpg" type="image/jpeg"/>
    <category scheme="http://purl.org/dc/terms/LCSH" term="England -- Fiction"/>
    <category scheme="http://purl.org/dc/terms/LCSH" term="Love stories"/>
    <category scheme="http://purl.org/dc/terms/LCSH" term="Sisters -- Fiction"/>
    <category scheme="http://purl.org/dc/terms/LCSH" term="Domestic fiction"/>
    <category scheme="http://purl.org/dc/terms/DCMIType" term="Text"/>
    <dcterms:language>en</dcterms:language>
  </entry>
  <entry>
    <title>Some PDF-only Book</title>
    <id>urn:test:book-2</id>
    <link rel="http://opds-spec.org/acquisition" href="/download/2.pdf" type="application/pdf"/>
  </entry>
</feed>`

const MESSY_SELF_HOSTED_FEED = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:test:messy</id>
  <title>Messy & Co</title>
  <entry>
    <title>Fish & Chips: A Novel</title>
    <id>urn:test:book-3</id>
    <link rel="http://opds-spec.org/acquisition" href="book3.epub" type="application/epub+zip"/>
  </entry>
</feed>`

const OPENSEARCH_DESCRIPTION = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Search</ShortName>
  <Url type="application/atom+xml" template="https://example.com/search?q={searchTerms}"/>
</OpenSearchDescription>`

describe('OpdsAtomParser', () => {
  it('normaliza navegação e publicação, escolhendo o link EPUB quando existe (FR-011/FR-012/FR-013)', () => {
    const page = parseAtomFeed(REAL_STYLE_FEED, BASE_URL)

    expect(page.title).toBe('Test Catalog')
    expect(page.entries).toHaveLength(3) // pasta + Pride and Prejudice + o livro só-PDF (FR-017 da 022)

    const folder = page.entries.find((entry) => entry.kind === 'navigation')
    expect(folder).toMatchObject({ title: 'A Folder', navigationUrl: 'https://example.com/catalog/folder-1' })
    expect(folder?.acquisitionFormat).toBeUndefined()

    const book = page.entries.find((entry) => entry.title === 'Pride and Prejudice')
    expect(book).toMatchObject({
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      acquisitionUrl: 'https://example.com/download/1.epub',
      acquisitionFormat: 'EPUB',
      coverUrl: 'https://example.com/covers/1.jpg', // resolvido contra baseUrl, não cru
      // 4 LCSH no feed, cap em 3; DCMIType ("Text") excluído por não ser assunto/gênero.
      subjects: ['England -- Fiction', 'Love stories', 'Sisters -- Fiction'],
      language: 'en',
    })
  })

  it('mostra a entrada só-PDF com o link PDF e acquisitionFormat PDF (FR-017 da 022)', () => {
    const page = parseAtomFeed(REAL_STYLE_FEED, BASE_URL)
    const pdfOnly = page.entries.find((entry) => entry.title === 'Some PDF-only Book')
    expect(pdfOnly).toMatchObject({
      kind: 'publication',
      acquisitionUrl: 'https://example.com/download/2.pdf',
      acquisitionFormat: 'PDF',
    })
  })

  it('entrada mista prefere EPUB mesmo com o PDF listado antes; sem EPUB/PDF direto, fica de fora', () => {
    const feed = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:test:mixed</id>
  <title>Mixed</title>
  <entry>
    <title>Mixed Book</title>
    <id>urn:test:mixed-1</id>
    <link rel="http://opds-spec.org/acquisition" href="/m.pdf" type="application/pdf"/>
    <link rel="http://opds-spec.org/acquisition/open-access" href="/m.epub" type="application/epub+zip"/>
  </entry>
  <entry>
    <title>Mobi Only</title>
    <id>urn:test:mobi</id>
    <link rel="http://opds-spec.org/acquisition" href="/x.mobi" type="application/x-mobipocket-ebook"/>
  </entry>
  <entry>
    <title>DRM PDF</title>
    <id>urn:test:drm</id>
    <link rel="http://opds-spec.org/acquisition/borrow" href="/x.acsm" type="application/vnd.adobe.adept+xml">
      <opds:indirectAcquisition type="application/pdf"/>
    </link>
  </entry>
</feed>`
    const page = parseAtomFeed(feed, BASE_URL)

    expect(page.entries.map((entry) => entry.title)).toEqual(['Mixed Book'])
    expect(page.entries[0]).toMatchObject({ acquisitionUrl: 'https://example.com/m.epub', acquisitionFormat: 'EPUB' })
  })

  it('resolve nextPageUrl como URL absoluta e deixa searchUrl cru (sem resolver ainda)', () => {
    const page = parseAtomFeed(REAL_STYLE_FEED, BASE_URL)
    expect(page.nextPageUrl).toBe('https://example.com/catalog?page=2')
    expect(page.searchUrl).toBe('/opensearch.xml')
  })

  it('sanitiza "&" não escapado antes de parsear (feed self-hosted real)', () => {
    const page = parseAtomFeed(MESSY_SELF_HOSTED_FEED, BASE_URL)
    expect(page.title).toBe('Messy & Co')
    expect(page.entries[0]?.title).toBe('Fish & Chips: A Novel')
  })

  it('lança erro claro pra XML genuinamente malformado', () => {
    expect(() => parseAtomFeed('<feed><entry><title>Broken</feed>', BASE_URL)).toThrow(/inválido/)
  })

  it('parseOpenSearchDescription expande o template pra uma URL de busca resolvida', () => {
    const buildSearchUrl = parseOpenSearchDescription(OPENSEARCH_DESCRIPTION, 'https://example.com/opensearch.xml')
    expect(buildSearchUrl('dune')).toBe('https://example.com/search?q=dune')
  })
})
