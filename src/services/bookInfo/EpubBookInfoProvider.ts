import { unzip } from 'fflate'
import type {
  BookCategory,
  BookIdentifier,
  BookInfoProvider,
  BookInfoValue,
  BookRating,
  BookReview,
  ResolvedBookInfo,
} from '../../types/bookInfo'
import { htmlToPlainText } from '../../utils/textSanitizer'

interface ManifestItem {
  id: string | null
  href: string
  mediaType: string | null
  properties: string[]
}

interface EpubPackage {
  opfPath: string
  opfXml: string
  opfDoc: Document
  files: Record<string, Uint8Array>
}

interface SubjectEntry {
  id: string | null
  label: string
}

const EMPTY_LOOKUP_HINTS = {
  title: null,
  author: null,
  identifiers: [],
}

export class EpubBookInfoProvider implements BookInfoProvider {
  readonly source = 'epub-metadata' as const

  async collect(fileBlob: Blob): Promise<Partial<ResolvedBookInfo>> {
    const epubPackage = await this.openPackage(fileBlob)
    if (!epubPackage) {
      return { lookupHints: EMPTY_LOOKUP_HINTS }
    }

    const identifiers = this.extractIdentifiers(epubPackage.opfDoc)
    const lookupHints = {
      title: this.firstText(epubPackage.opfDoc, 'title'),
      author: this.firstText(epubPackage.opfDoc, 'creator'),
      identifiers,
    }

    return {
      category: this.extractCategory(epubPackage.opfDoc),
      rating: this.extractRating(epubPackage.opfDoc),
      synopsis: this.extractSynopsis(epubPackage.opfDoc),
      pageCount: this.extractPageCount(epubPackage),
      publishedDate: this.extractPublishedDate(epubPackage.opfDoc),
      universalIdentifier: this.extractUniversalIdentifier(epubPackage.opfDoc, identifiers),
      reviews: this.extractReviews(epubPackage.opfDoc),
      lookupHints,
    }
  }

  private async openPackage(fileBlob: Blob): Promise<EpubPackage | null> {
    const buffer = await fileBlob.arrayBuffer()
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(new Uint8Array(buffer), (error, data) => {
        if (error) reject(error)
        else resolve(data)
      })
    })

    const containerXml = this.readFileAsText(files, 'META-INF/container.xml')
    if (!containerXml) return null

    const containerDoc = this.parseXml(containerXml)
    const rootfile = this.elements(containerDoc, 'rootfile')[0]
    const opfPath = rootfile?.getAttribute('full-path')
      ?? containerXml.match(/\bfull-path\s*=\s*["']([^"']+\.opf)["']/i)?.[1]
    if (!opfPath) return null

    const opfXml = this.readFileAsText(files, opfPath)
    if (!opfXml) return null

    const opfDoc = this.parseXml(opfXml)
    return { opfPath, opfXml, opfDoc, files }
  }

  private extractCategory(opfDoc: Document): BookInfoValue<BookCategory[]> | null {
    const subjects = this.elements(opfDoc, 'subject')
      .map((element): SubjectEntry => ({
        id: element.getAttribute('id'),
        label: this.cleanText(element.textContent),
      }))
      .filter((subject) => subject.label)

    if (subjects.length === 0) return null

    const refinements = this.extractRefinements(opfDoc)
    const categories = subjects.map((subject) => {
      const refined = subject.id ? refinements.get(subject.id) : undefined
      return {
        label: subject.label,
        ...(refined?.authority ? { scheme: refined.authority } : {}),
        ...(refined?.term ? { code: refined.term } : {}),
      }
    })

    return this.fromEpub(categories, 'high')
  }

  private extractRating(opfDoc: Document): BookInfoValue<BookRating> | null {
    const ratingValue = this.metaValue(opfDoc, 'schema:ratingValue')
      ?? this.metaValue(opfDoc, 'ratingValue')
      ?? this.namedMetaValue(opfDoc, 'calibre:rating')

    if (!ratingValue) return null

    const rawAverage = Number.parseFloat(ratingValue.replace(',', '.'))
    if (!Number.isFinite(rawAverage) || rawAverage <= 0) return null

    const rawCount = this.metaValue(opfDoc, 'schema:ratingCount')
      ?? this.metaValue(opfDoc, 'ratingCount')
    const count = rawCount ? Number.parseInt(rawCount, 10) : undefined
    const scale = rawAverage > 5 ? 10 : 5
    const average = scale === 10 ? rawAverage / 2 : rawAverage

    return this.fromEpub({
      average,
      ...(Number.isFinite(count) ? { count } : {}),
      scale: 5,
    }, 'medium')
  }

  private extractSynopsis(opfDoc: Document): BookInfoValue<string> | null {
    const value = this.firstText(opfDoc, 'description')
      ?? this.metaValue(opfDoc, 'dcterms:abstract')
      ?? this.metaValue(opfDoc, 'abstract')

    const synopsis = htmlToPlainText(value)

    return synopsis ? this.fromEpub(synopsis, 'high') : null
  }

  private extractPageCount(epubPackage: EpubPackage): BookInfoValue<number> | null {
    const declaredPages = this.metaValue(epubPackage.opfDoc, 'schema:numberOfPages')
      ?? this.metaValue(epubPackage.opfDoc, 'numberOfPages')

    if (declaredPages) {
      const count = Number.parseInt(declaredPages, 10)
      if (Number.isFinite(count) && count > 0) return this.fromEpub(count, 'high')
    }

    const manifest = this.extractManifestItems(epubPackage.opfDoc)
    const navItem = manifest.find((item) => item.properties.includes('nav'))
    if (navItem) {
      const navHtml = this.readFileAsText(
        epubPackage.files,
        this.resolveZipPath(epubPackage.opfPath, navItem.href),
      )
      const pageListCount = navHtml ? this.countPageListEntries(navHtml) : 0
      if (pageListCount > 0) return this.fromEpub(pageListCount, 'medium')
    }

    const pageBreakCount = manifest
      .filter((item) => this.isHtmlResource(item))
      .reduce((sum, item) => {
        const html = this.readFileAsText(epubPackage.files, this.resolveZipPath(epubPackage.opfPath, item.href))
        return sum + (html ? this.countPageBreaks(html) : 0)
      }, 0)

    return pageBreakCount > 0 ? this.fromEpub(pageBreakCount, 'medium') : null
  }

  private extractPublishedDate(opfDoc: Document): BookInfoValue<string> | null {
    const value = this.firstText(opfDoc, 'date')
      ?? this.metaValue(opfDoc, 'dcterms:issued')
      ?? this.metaValue(opfDoc, 'issued')

    return value ? this.fromEpub(value, 'high') : null
  }

  private extractUniversalIdentifier(
    opfDoc: Document,
    identifiers: BookIdentifier[],
  ): BookInfoValue<BookIdentifier> | null {
    if (identifiers.length === 0) return null

    const uniqueId = this.elements(opfDoc, 'package')[0]?.getAttribute('unique-identifier')
    const uniqueIdentifier = uniqueId
      ? identifiers.find((identifier) => {
        const element = this.elements(opfDoc, 'identifier')
          .find((candidate) => candidate.getAttribute('id') === uniqueId)
        return element && identifier.raw === this.cleanText(element.textContent)
      })
      : undefined

    const preferred = uniqueIdentifier
      ?? identifiers.find((identifier) => identifier.kind === 'ISBN_13')
      ?? identifiers.find((identifier) => identifier.kind === 'ISBN_10')
      ?? identifiers.find((identifier) => identifier.kind === 'UUID')
      ?? identifiers[0]

    return this.fromEpub(preferred, preferred.kind === 'OTHER' ? 'medium' : 'high')
  }

  private extractReviews(opfDoc: Document): BookInfoValue<BookReview[]> | null {
    const textReview = this.metaValue(opfDoc, 'schema:review')
      ?? this.metaValue(opfDoc, 'review')
    const linkReviews = this.elements(opfDoc, 'link')
      .map((element): BookReview | null => {
        const rel = (element.getAttribute('rel') ?? '').toLowerCase()
        const href = element.getAttribute('href')
        if (!href || !/\breview\b/.test(rel)) return null
        return {
          title: element.getAttribute('title') ?? 'Review',
          url: href,
          provider: 'epub',
        }
      })
      .filter((review): review is BookReview => Boolean(review))

    const reviews = [
      ...(textReview ? [{ title: 'Review', description: textReview, provider: 'epub' as const }] : []),
      ...linkReviews,
    ]

    return reviews.length > 0 ? this.fromEpub(reviews, 'medium') : null
  }

  private extractIdentifiers(opfDoc: Document): BookIdentifier[] {
    const identifiers = this.elements(opfDoc, 'identifier')
      .map((element) => this.normalizeIdentifier(this.cleanText(element.textContent)))
      .filter((identifier): identifier is BookIdentifier => Boolean(identifier))

    const seen = new Set<string>()
    return identifiers.filter((identifier) => {
      const key = `${identifier.kind}:${identifier.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private normalizeIdentifier(raw: string): BookIdentifier | null {
    if (!raw) return null

    const trimmed = raw.trim()
    const isbnCandidate = trimmed.replace(/^urn:isbn:/i, '').replace(/[^0-9X]/gi, '')
    if (this.isValidIsbn13(isbnCandidate)) {
      return { kind: 'ISBN_13', value: isbnCandidate, raw: trimmed }
    }
    if (this.isValidIsbn10(isbnCandidate)) {
      return { kind: 'ISBN_10', value: isbnCandidate.toUpperCase(), raw: trimmed }
    }

    const uuid = trimmed.match(/^(?:urn:uuid:)?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)?.[1]
    if (uuid) return { kind: 'UUID', value: uuid.toLowerCase(), raw: trimmed }

    if (/^urn:/i.test(trimmed)) return { kind: 'URN', value: trimmed, raw: trimmed }
    return { kind: 'OTHER', value: trimmed, raw: trimmed }
  }

  private isValidIsbn13(value: string): boolean {
    if (!/^\d{13}$/.test(value)) return false
    const sum = value
      .slice(0, 12)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
    const check = (10 - (sum % 10)) % 10
    return check === Number(value[12])
  }

  private isValidIsbn10(value: string): boolean {
    if (!/^\d{9}[\dX]$/i.test(value)) return false
    const sum = value
      .toUpperCase()
      .split('')
      .reduce((total, digit, index) => {
        const numeric = digit === 'X' ? 10 : Number(digit)
        return total + numeric * (10 - index)
      }, 0)
    return sum % 11 === 0
  }

  private extractRefinements(opfDoc: Document): Map<string, Record<string, string>> {
    const refinements = new Map<string, Record<string, string>>()

    for (const meta of this.elements(opfDoc, 'meta')) {
      const refines = meta.getAttribute('refines')?.replace(/^#/, '')
      const property = meta.getAttribute('property')
      if (!refines || !property) continue

      const current = refinements.get(refines) ?? {}
      current[property] = this.cleanText(meta.textContent)
      refinements.set(refines, current)
    }

    return refinements
  }

  private countPageListEntries(navHtml: string): number {
    const doc = this.parseHtml(navHtml)
    const pageListNav = this.elements(doc, 'nav').find((nav) => {
      const type = [
        nav.getAttribute('epub:type'),
        nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type'),
      ].filter(Boolean).join(' ')
      return type.toLowerCase().split(/\s+/).includes('page-list')
    })
    if (!pageListNav) return 0

    return this.elements(pageListNav, 'a').length
      + this.elements(pageListNav, 'span').length
  }

  private countPageBreaks(html: string): number {
    const doc = this.parseHtml(html)
    const parsedCount = Array.from(doc.querySelectorAll('*'))
      .filter((element) => {
        const type = [
          element.getAttribute('epub:type'),
          element.getAttributeNS('http://www.idpf.org/2007/ops', 'type'),
        ].filter(Boolean).join(' ')
        return type.toLowerCase().split(/\s+/).includes('pagebreak')
      }).length

    if (parsedCount > 0) return parsedCount
    return Array.from(html.matchAll(/\bepub:type\s*=\s*["'][^"']*\bpagebreak\b/gi)).length
  }

  private metaValue(opfDoc: Document, property: string): string | null {
    const normalizedProperty = property.toLowerCase()
    for (const meta of this.elements(opfDoc, 'meta')) {
      const prop = meta.getAttribute('property')?.toLowerCase()
      if (prop !== normalizedProperty) continue

      const value = meta.getAttribute('content') ?? this.cleanText(meta.textContent)
      if (value) return this.cleanText(value)
    }

    return null
  }

  private namedMetaValue(opfDoc: Document, name: string): string | null {
    const normalizedName = name.toLowerCase()
    for (const meta of this.elements(opfDoc, 'meta')) {
      const metaName = meta.getAttribute('name')?.toLowerCase()
      if (metaName !== normalizedName) continue

      const value = meta.getAttribute('content') ?? this.cleanText(meta.textContent)
      if (value) return this.cleanText(value)
    }

    return null
  }

  private firstText(root: ParentNode, localName: string): string | null {
    const value = this.elements(root, localName)
      .map((element) => this.cleanText(element.textContent))
      .find(Boolean)

    return value ?? null
  }

  private fromEpub<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }

  private extractManifestItems(opfDoc: Document): ManifestItem[] {
    return this.elements(opfDoc, 'item')
      .map((element) => ({
        id: element.getAttribute('id'),
        href: element.getAttribute('href') ?? '',
        mediaType: element.getAttribute('media-type'),
        properties: (element.getAttribute('properties') ?? '')
          .split(/\s+/)
          .map((property) => property.trim().toLowerCase())
          .filter(Boolean),
      }))
      .filter((item) => item.href)
  }

  private isHtmlResource(item: ManifestItem): boolean {
    const mediaType = item.mediaType?.toLowerCase() ?? ''
    return mediaType === 'application/xhtml+xml'
      || mediaType === 'text/html'
      || /\.(x?html?|xhtm)$/i.test(item.href)
  }

  private readFileAsText(files: Record<string, Uint8Array>, path: string): string | null {
    const normalizedPath = this.normalizeZipPath(path)
    const data = files[path] ?? files[normalizedPath] ?? files[normalizedPath.replace(/^\//, '')]
    return data ? new TextDecoder('utf-8').decode(data) : null
  }

  private resolveZipPath(basePath: string, href: string): string {
    const target = href.trim()
    if (!target) return ''
    if (/^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(target)) return target

    try {
      const root = 'https://invalid.invalid/'
      const url = new URL(target, `${root}${basePath.replace(/^\//, '')}`)
      url.search = ''
      url.hash = ''
      return decodeURI(url.href.replace(root, '')).replace(/^\//, '')
    } catch {
      const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/') + 1)
        : ''
      return this.normalizeZipPath(`${baseDir}${target}`).replace(/^\//, '')
    }
  }

  private normalizeZipPath(path: string): string {
    const resolved: string[] = []
    for (const part of path.replace(/\\/g, '/').replace(/[?#].*$/, '').split('/')) {
      if (!part || part === '.') continue
      if (part === '..') {
        resolved.pop()
        continue
      }
      try {
        resolved.push(decodeURIComponent(part))
      } catch {
        resolved.push(part)
      }
    }
    return resolved.join('/')
  }

  private parseXml(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'application/xml')
  }

  private parseHtml(html: string): Document {
    return new DOMParser().parseFromString(html, 'text/html')
  }

  private elements(root: ParentNode, localName: string): Element[] {
    const expected = localName.toLowerCase()
    const elementRoot = root as Document | Element
    return Array.from(elementRoot.getElementsByTagName('*'))
      .filter((element) => element.localName.toLowerCase() === expected)
  }

  private cleanText(value?: string | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim()
  }
}
