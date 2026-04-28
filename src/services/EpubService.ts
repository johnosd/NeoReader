import { unzip } from 'fflate'

export interface EpubMetadata {
  title: string
  author: string
  coverBlob: Blob | null
}

interface ManifestItem {
  id: string | null
  href: string
  mediaType: string | null
  properties: string[]
}

interface GuideReference {
  type: string | null
  href: string
}

interface SpineDocument {
  href: string
  path: string
  label: string
}

interface TocResolution {
  index: number
  path: string
}

export type EpubStyleIssue =
  | 'hardcoded-text-color'
  | 'hardcoded-background-color'
  | 'small-font-size'
  | 'tight-line-height'

export interface EpubStyleDiagnostic {
  issue: EpubStyleIssue
  label: string
}

// Campos extras extraídos do EPUB para a tela de detalhes do livro
export interface EpubExtras {
  description: string | null   // dc:description do OPF (frequentemente ausente)
  language: string | null      // dc:language do OPF (ex: "en", "pt-BR")
  toc: TocItem[]               // capítulos do livro (EPUB3 nav ou EPUB2 ncx)
  previewText: string | null
  styleDiagnostics: EpubStyleDiagnostic[]
}

const EMPTY_EPUB_EXTRAS: EpubExtras = {
  description: null,
  language: null,
  toc: [],
  previewText: null,
  styleDiagnostics: [],
}

// EPUB é um ZIP. Esse serviço abre o ZIP e extrai os metadados do OPF.
// Fluxo: container.xml → caminho do .opf → title/author/cover
export class EpubService {
  // Cache de sessão: evita recomprimir o mesmo EPUB quando BookDetailsScreen remonta.
  // Map<bookId, Promise> — a Promise garante que chamadas simultâneas não disparem 2 unzips.
  private static extrasCache = new Map<number, Promise<EpubExtras>>()

  static invalidateExtrasCache(bookId: number): void {
    EpubService.extrasCache.delete(bookId)
  }

  static async parseMetadata(file: File): Promise<EpubMetadata> {
    const buffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(buffer)

    // fflate.unzip é callback-based; wrapeamos em Promise
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(uint8, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    // 1. Ler container.xml para achar o path do OPF
    const containerXml = this.readFileAsText(files, 'META-INF/container.xml')
    if (!containerXml) throw new Error('EPUB inválido: META-INF/container.xml não encontrado')

    const opfPath = this.extractOpfPath(containerXml)
    if (!opfPath) throw new Error('EPUB inválido: path do OPF não encontrado')

    // 2. Ler o OPF e extrair metadados
    const opfXml = this.readFileAsText(files, opfPath)
    if (!opfXml) throw new Error(`EPUB inválido: OPF não encontrado em ${opfPath}`)

    const title = this.extractXmlTextByLocalName(opfXml, 'title') ?? file.name.replace('.epub', '')
    const author = this.extractXmlTextByLocalName(opfXml, 'creator') ?? 'Autor desconhecido'

    // 3. Extrair capa (opcional — muitos EPUBs não têm)
    const coverBlob = this.extractCover(opfXml, opfPath, files, title, author)

    return { title, author, coverBlob }
  }

  // Extrai campos adicionais do EPUB para a tela de detalhes (descrição, idioma, capítulos).
  // Aceita Blob porque book.fileBlob está tipado como Blob (não File).
  // bookId opcional: quando fornecido, armazena o resultado em cache para reutilizar
  // sem recomprimir o ZIP a cada vez que BookDetailsScreen remonta.
  static async parseExtras(fileBlob: Blob, bookId?: number): Promise<EpubExtras> {
    if (bookId !== undefined) {
      let cached = EpubService.extrasCache.get(bookId)
      if (!cached) {
        cached = EpubService._parseExtrasInternal(fileBlob)
        EpubService.extrasCache.set(bookId, cached)
      }
      return cached
    }
    return EpubService._parseExtrasInternal(fileBlob)
  }

  private static async _parseExtrasInternal(fileBlob: Blob): Promise<EpubExtras> {
    try {
      const buffer = await fileBlob.arrayBuffer()
      const uint8 = new Uint8Array(buffer)
      const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(uint8, (err, data) => err ? reject(err) : resolve(data))
      })

      const containerXml = this.readFileAsText(files, 'META-INF/container.xml')
      if (!containerXml) return EMPTY_EPUB_EXTRAS

      const opfPath = this.extractOpfPath(containerXml)
      if (!opfPath) return EMPTY_EPUB_EXTRAS

      const opfXml = this.readFileAsText(files, opfPath)
      if (!opfXml) return EMPTY_EPUB_EXTRAS

      const description = this.extractXmlTextByLocalName(opfXml, 'description')
      const language = this.extractLanguage(opfXml, opfPath, files)
      const toc = this.parseToc(opfXml, opfPath, files)
      const readingPreview = this.extractReadingPreview(opfXml, opfPath, files)

      return {
        description,
        language,
        toc,
        previewText: readingPreview.previewText,
        styleDiagnostics: readingPreview.styleDiagnostics,
      }
    } catch {
      return EMPTY_EPUB_EXTRAS
    }
  }

  // Monta o preview a partir da ordem real de leitura, com fallback para HTMLs do manifest.
  private static extractReadingPreview(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): Pick<EpubExtras, 'previewText' | 'styleDiagnostics'> {
    const manifestItems = this.extractManifestItems(opfXml)
    const manifestById = new Map(
      manifestItems
        .filter((item) => item.id)
        .map((item) => [item.id!.toLowerCase(), item]),
    )
    const spineCandidates = this.getSpineDocuments(opfXml, opfPath, manifestById)
      .map((spineDocument) => manifestItems.find((item) => this.resolveZipPath(opfPath, item.href) === spineDocument.path) ?? null)
      .filter((item): item is ManifestItem => Boolean(item))
    const fallbackCandidates = manifestItems.filter((item) => (
      this.isHtmlResource(item.href, item.mediaType)
      && !item.properties.includes('nav')
      && !this.looksLikeCoverPath(item.href)
    ))
    const candidateMap = new Map<string, ManifestItem>()

    for (const item of [...spineCandidates, ...fallbackCandidates]) {
      candidateMap.set(this.resolveZipPath(opfPath, item.href), item)
    }

    const diagnostics = new Map<EpubStyleIssue, EpubStyleDiagnostic>()
    let firstPreviewText: string | null = null

    for (const [path] of candidateMap) {
      const html = this.readFileAsText(files, path)
      if (!html) continue

      for (const diagnostic of this.detectStyleDiagnostics(html)) {
        diagnostics.set(diagnostic.issue, diagnostic)
      }

      if (!firstPreviewText) {
        const previewText = this.extractPreviewTextFromHtml(html)
        if (previewText) firstPreviewText = previewText
      }
    }

    return {
      previewText: firstPreviewText,
      styleDiagnostics: [...diagnostics.values()],
    }
  }

  private static extractSpineItemIds(opfXml: string): string[] {
    const spineXml = opfXml.match(/<spine\b[\s\S]*?<\/spine>/i)?.[0]
      ?? opfXml.match(/<spine\b[^>]*\/>/i)?.[0]
      ?? ''

    return Array.from(spineXml.matchAll(/<itemref\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => this.parseXmlAttributes(rawAttrs))
      .filter((attrs) => attrs.linear?.toLowerCase() !== 'no')
      .map((attrs) => attrs.idref)
      .filter((id): id is string => Boolean(id))
  }

  private static extractPreviewTextFromHtml(html: string): string | null {
    const doc = this.parseDocument(html, 'text/html')

    if (!doc) {
      const bodyHtml = html.match(/<body\b[\s\S]*?>([\s\S]*?)<\/body>/i)?.[1] ?? html
      const text = this.normalizePreviewCandidate(this.cleanText(
        bodyHtml
          .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
          .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
          .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>'),
      ))

      return this.isPreviewTextCandidate(text) ? this.truncatePreviewText(text) : null
    }

    const root = doc.body ?? doc
    root.querySelectorAll('script, style, nav, svg, img, figure, table, aside').forEach((node) => {
      node.remove()
    })

    const chunks = Array.from(root.querySelectorAll('p, blockquote, li, h1, h2, h3'))
      .map((node) => this.normalizePreviewCandidate(this.cleanText(node.textContent)))
      .filter((value) => this.isPreviewTextCandidate(value))
    const combined = this.cleanText(chunks.join(' '))
    if (combined) return this.truncatePreviewText(combined)

    const fallback = this.normalizePreviewCandidate(this.cleanText(root.textContent))
    return this.isPreviewTextCandidate(fallback) ? this.truncatePreviewText(fallback) : null
  }

  private static normalizePreviewCandidate(value: string): string {
    return this.cleanText(value)
      .replace(/^page\s+\d+\s+/i, '')
      .replace(/^the text on this page is estimated to be only\s+[\d.]+%\s+accurate\s+/i, '')
  }

  private static isPreviewTextCandidate(value: string): boolean {
    return value.length > 24
      && !/^(chapter|capitulo)\s+[\divxlcdm]+$/i.test(value)
      && !/^(cover|copyright|all rights reserved|sumario|contents|table of contents|indice)\b/i.test(value)
      && !/\b(oceanofpdf|end user license agreement|internet archive|automated character recognition|produced in epub format)\b/i.test(value)
      && !/^dados de copyright\b/i.test(value)
  }

  private static truncatePreviewText(text: string): string {
    const normalized = this.cleanText(text)
    if (normalized.length <= 220) return normalized

    const slice = normalized.slice(0, 220)
    const sentenceMatch = slice.match(/^(.{120,}?[.!?])\s/)
    if (sentenceMatch) return sentenceMatch[1]

    const lastSpace = slice.lastIndexOf(' ')
    const end = lastSpace >= 120 ? lastSpace : 220
    return `${slice.slice(0, end).trim()}...`
  }

  private static detectStyleDiagnostics(html: string): EpubStyleDiagnostic[] {
    const checks: EpubStyleDiagnostic[] = []

    if (/(^|[;{\s"'])color\s*:\s*(?:#000(?:000)?\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i.test(html)) {
      checks.push({ issue: 'hardcoded-text-color', label: 'Cor de texto fixa' })
    }

    if (/background(?:-color)?\s*:\s*(?:#fff(?:fff)?\b|white\b|#000(?:000)?\b|black\b|rgb\()/i.test(html)) {
      checks.push({ issue: 'hardcoded-background-color', label: 'Fundo fixo no EPUB' })
    }

    if (/font-size\s*:\s*(?:[6-9](?:\.\d+)?px|1[0-2](?:\.\d+)?px|0\.[5-9](?:\d+)?(?:em|rem)|[5-8]\d%)/i.test(html)) {
      checks.push({ issue: 'small-font-size', label: 'Fonte pequena no EPUB' })
    }

    if (/line-height\s*:\s*(?:1(?:\.0+)?|1\.[0-2]\b|[8-9]\d%|10\d%|11\d%|12\d%)/i.test(html)) {
      checks.push({ issue: 'tight-line-height', label: 'Espacamento apertado' })
    }

    return checks
  }

  // Localiza o arquivo de TOC e parseia os capítulos.
  // Prefere EPUB3 nav.xhtml; fallback para EPUB2 toc.ncx.
  private static parseToc(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): TocItem[] {
    const manifestItems = this.extractManifestItems(opfXml)
    const manifestById = new Map(
      manifestItems
        .filter((item) => item.id)
        .map((item) => [item.id!.toLowerCase(), item]),
    )
    const spineDocuments = this.getSpineDocuments(opfXml, opfPath, manifestById)
    let rawToc: TocItem[] = []

    // EPUB3: item com properties="nav"
    const navHref = manifestItems.find((item) => item.properties.includes('nav'))?.href

    if (navHref) {
      const navPath = this.resolveZipPath(opfPath, navHref)
      const navXml = this.readFileAsText(files, navPath)
      if (navXml) {
        rawToc = this.parseTocFromNav(navXml, navPath)
      }
    }

    // EPUB2 fallback: toc.ncx referenciado no <spine toc="id">
    let ncxHref: string | null = null
    const spineAttrs = opfXml.match(/<spine\b([\s\S]*?)(?:>|\/>)/i)?.[1]
    const ncxId = spineAttrs ? this.parseXmlAttributes(spineAttrs).toc : undefined
    if (ncxId) {
      ncxHref = manifestItems.find((item) => item.id === ncxId)?.href
        ?? manifestItems.find((item) => item.id?.toLowerCase() === ncxId.toLowerCase())?.href
        ?? null
    }
    // Última tentativa: qualquer .ncx no manifest
    if (!ncxHref) {
      ncxHref = manifestItems.find((item) => /\.ncx(?:[#?].*)?$/i.test(item.href))?.href ?? null
    }

    if (rawToc.length === 0 && ncxHref) {
      const ncxPath = this.resolveZipPath(opfPath, ncxHref)
      const ncxXml = this.readFileAsText(files, ncxPath)
      if (ncxXml) {
        rawToc = this.parseTocFromNcx(ncxXml, ncxPath)
      }
    }

    const sanitized = this.sanitizeToc(rawToc, spineDocuments, files)
    return sanitized.length > 0 ? sanitized : this.buildSyntheticToc(spineDocuments, files)
  }

  // Parseia nav.xhtml (EPUB3): extrai entradas do <nav epub:type="toc"> com profundidade.
  private static parseTocFromNav(html: string, navPath: string): TocItem[] {
    const doc = this.parseDocument(html, 'text/html')
    if (!doc) return []

    const nav = Array.from(doc.getElementsByTagName('nav')).find((node) => {
      const type = [
        node.getAttribute('epub:type'),
        node.getAttribute('type'),
        node.getAttributeNS('http://www.idpf.org/2007/ops', 'type'),
      ].filter(Boolean).join(' ').toLowerCase()
      return type.split(/\s+/).includes('toc') || node.id.toLowerCase() === 'toc'
    })
    if (!nav) return []

    const rootOl = this.getDirectChildByLocalName(nav, 'ol')
    return rootOl ? this.parseNavOl(rootOl, navPath) : []
  }

  private static parseNavOl(ol: Element, navPath: string): TocItem[] {
    return this.getDirectChildrenByLocalName(ol, 'li')
      .map((li) => this.parseNavLi(li, navPath))
      .filter((item): item is TocItem => Boolean(item))
  }

  private static parseNavLi(li: Element, navPath: string): TocItem | null {
    const labelEl = this.getDirectChildByLocalName(li, 'a')
      ?? this.getDirectChildByLocalName(li, 'span')
    const childOl = this.getDirectChildByLocalName(li, 'ol')
    const subitems = childOl ? this.parseNavOl(childOl, navPath) : []
    const rawHref = labelEl?.localName.toLowerCase() === 'a'
      ? labelEl.getAttribute('href')
      : null
    const href = rawHref
      ? this.resolveNavigationHref(navPath, rawHref)
      : this.getFirstTocHref(subitems)
    const label = this.cleanText(labelEl?.textContent)
      || subitems[0]?.label
      || href

    if (!label || !href) return subitems.length > 0 ? subitems[0] : null

    return {
      label,
      href,
      ...(subitems.length > 0 ? { subitems } : {}),
    }
  }

  // Parseia toc.ncx (EPUB2) e produz a mesma estrutura em arvore do nav.xhtml.
  private static parseTocFromNcx(ncxXml: string, ncxPath: string): TocItem[] {
    const doc = this.parseDocument(ncxXml, 'application/xml')
    if (!doc) return []

    const navMap = this.getFirstElementByLocalName(doc, 'navMap')
    if (!navMap) return []

    return this.getDirectChildrenByLocalName(navMap, 'navPoint')
      .map((navPoint) => this.parseNcxNavPoint(navPoint, ncxPath))
      .filter((item): item is TocItem => Boolean(item))
  }

  private static parseNcxNavPoint(navPoint: Element, ncxPath: string): TocItem | null {
    const navLabel = this.getDirectChildByLocalName(navPoint, 'navLabel')
    const textEl = navLabel ? this.getFirstElementByLocalName(navLabel, 'text') : null
    const content = this.getDirectChildByLocalName(navPoint, 'content')
    const subitems = this.getDirectChildrenByLocalName(navPoint, 'navPoint')
      .map((child) => this.parseNcxNavPoint(child, ncxPath))
      .filter((item): item is TocItem => Boolean(item))
    const rawHref = content?.getAttribute('src')
    const href = rawHref
      ? this.resolveNavigationHref(ncxPath, rawHref)
      : this.getFirstTocHref(subitems)
    const label = this.cleanText(textEl?.textContent)
      || subitems[0]?.label
      || href

    if (!label || !href) return subitems.length > 0 ? subitems[0] : null

    return {
      label,
      href,
      ...(subitems.length > 0 ? { subitems } : {}),
    }
  }

  private static sanitizeToc(
    toc: TocItem[],
    spineDocuments: SpineDocument[],
    files: Record<string, Uint8Array>,
  ): TocItem[] {
    if (spineDocuments.length === 0) return toc

    const flattened = this.flattenToc(toc)
      .map((item, order) => {
        const resolution = this.resolveTocHrefToSpine(spineDocuments, item.href)
        if (!resolution) return null

        const href = this.sanitizeTocHref(item.href, resolution, files)
        return {
          label: item.label || this.labelFromHref(resolution.path),
          href,
          index: resolution.index,
          order,
        }
      })
      .filter((item): item is TocItem & { index: number; order: number } => Boolean(item))

    const sorted = flattened.sort((left, right) => left.index - right.index || left.order - right.order)
    const deduped = new Map<string, TocItem & { index: number; order: number }>()

    for (const item of sorted) {
      const key = `${item.label}\n${item.href}`
      if (!deduped.has(key)) deduped.set(key, item)
    }

    return [...deduped.values()].map(({ label, href }) => ({ label, href }))
  }

  private static flattenToc(items: TocItem[]): TocItem[] {
    return items.flatMap((item) => [
      item,
      ...this.flattenToc(Array.isArray(item.subitems) ? item.subitems : []),
    ])
  }

  private static sanitizeTocHref(
    href: string,
    resolution: TocResolution,
    files: Record<string, Uint8Array>,
  ): string {
    const fragment = this.splitHref(href).fragment
    if (!fragment) return resolution.path

    const html = this.readFileAsText(files, resolution.path)
    return html && this.hasFragmentTarget(html, fragment)
      ? `${resolution.path}#${fragment}`
      : resolution.path
  }

  private static resolveTocHrefToSpine(
    spineDocuments: SpineDocument[],
    href: string,
  ): TocResolution | null {
    const { documentHref } = this.splitHref(href)
    const normalizedTarget = this.normalizeZipPath(documentHref).toLowerCase()
    if (!normalizedTarget || this.isExternalHref(normalizedTarget)) return null

    const exactIndex = spineDocuments.findIndex((document) =>
      this.normalizeZipPath(document.path).toLowerCase() === normalizedTarget,
    )
    if (exactIndex >= 0) {
      return { index: exactIndex, path: spineDocuments[exactIndex].path }
    }

    const suffixIndexes = spineDocuments
      .map((document, index) => {
        const normalizedDocument = this.normalizeZipPath(document.path).toLowerCase()
        return normalizedDocument.endsWith(`/${normalizedTarget}`)
          || normalizedTarget.endsWith(`/${normalizedDocument}`)
          ? index
          : null
      })
      .filter((index): index is number => index !== null)

    return suffixIndexes.length === 1
      ? { index: suffixIndexes[0], path: spineDocuments[suffixIndexes[0]].path }
      : null
  }

  private static splitHref(href: string): { documentHref: string; fragment: string | null } {
    const normalized = href.trim().replace(/\\/g, '/')
    const [pathWithQuery, fragment = ''] = normalized.split('#', 2)
    const [documentHref] = pathWithQuery.split('?')
    return {
      documentHref,
      fragment: fragment || null,
    }
  }

  private static hasFragmentTarget(html: string, fragment: string): boolean {
    const candidates = [...new Set([
      fragment,
      (() => {
        try {
          return decodeURIComponent(fragment)
        } catch {
          return fragment
        }
      })(),
    ])]

    for (const candidate of candidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b(?:id|name)\\s*=\\s*["']${escaped}["']`, 'i').test(html)) return true
    }

    return false
  }

  private static buildSyntheticToc(
    spineDocuments: SpineDocument[],
    files: Record<string, Uint8Array>,
  ): TocItem[] {
    return spineDocuments
      .map((spineDocument) => ({
        label: this.extractDocumentTitle(files, spineDocument.path) ?? spineDocument.label,
        href: spineDocument.path,
      }))
      .filter((item) => item.label && item.href)
  }

  private static extractDocumentTitle(
    files: Record<string, Uint8Array>,
    path: string,
  ): string | null {
    const html = this.readFileAsText(files, path)
    if (!html) return null

    const heading = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
      ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    const label = this.cleanText(heading?.replace(/<[^>]+>/g, ' '))
    return label || null
  }

  private static parseDocument(source: string, type: DOMParserSupportedType): Document | null {
    if (typeof DOMParser === 'undefined') return null
    const doc = new DOMParser().parseFromString(source, type)
    if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length > 0) return null
    return doc
  }

  private static cleanText(value?: string | null): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }

  private static getFirstTocHref(items: TocItem[]): string {
    for (const item of items) {
      const subitems = Array.isArray(item.subitems) ? item.subitems : []
      const childHref = this.getFirstTocHref(subitems)
      if (childHref) return childHref
      if (item.href) return item.href
    }
    return ''
  }

  private static getFirstElementByLocalName(root: ParentNode, localName: string): Element | null {
    const expected = localName.toLowerCase()
    return Array.from(root.querySelectorAll('*'))
      .find((el) => el.localName.toLowerCase() === expected) ?? null
  }

  private static getDirectChildByLocalName(parent: Element, localName: string): Element | null {
    return this.getDirectChildrenByLocalName(parent, localName)[0] ?? null
  }

  private static getDirectChildrenByLocalName(parent: Element, localName: string): Element[] {
    const expected = localName.toLowerCase()
    return Array.from(parent.children)
      .filter((child) => child.localName.toLowerCase() === expected)
  }

  // Converte Uint8Array de um arquivo do ZIP para string UTF-8
  private static readFileAsText(
    files: Record<string, Uint8Array>,
    path: string,
  ): string | null {
    const data = this.readFileBytes(files, path)
    if (!data) return null
    return new TextDecoder('utf-8').decode(data)
  }

  // Lê um arquivo do ZIP aceitando caminhos relativos, com barra inicial
  // e variações como ../ e caracteres percent-encoded.
  private static readFileBytes(
    files: Record<string, Uint8Array>,
    path: string,
  ): Uint8Array | null {
    for (const candidate of this.buildPathCandidates(path)) {
      const data = files[candidate]
      if (data) return data
    }
    return null
  }

  private static buildPathCandidates(path: string): string[] {
    const trimmed = path.trim()
    const normalized = this.normalizeZipPath(trimmed)

    return [...new Set([
      trimmed,
      trimmed.replace(/^\//, ''),
      normalized,
      normalized.replace(/^\//, ''),
    ].filter(Boolean))]
  }

  // Normaliza caminhos internos do EPUB:
  // - remove query/hash
  // - resolve ./ e ../
  // - decodifica segmentos percent-encoded
  private static normalizeZipPath(path: string): string {
    if (!path) return ''

    const cleaned = path
      .replace(/\\/g, '/')
      .replace(/[?#].*$/, '')
      .replace(/%2c/gi, ',')
      .replace(/%3a/gi, ':')

    const isExternal = /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(cleaned)
    if (isExternal) return cleaned

    const absolute = cleaned.startsWith('/')
    const resolved: string[] = []

    for (const rawPart of cleaned.split('/')) {
      if (!rawPart || rawPart === '.') continue
      if (rawPart === '..') {
        if (resolved.length > 0) resolved.pop()
        continue
      }

      try {
        resolved.push(decodeURIComponent(rawPart))
      } catch {
        resolved.push(rawPart)
      }
    }

    const joined = resolved.join('/')
    return absolute ? `/${joined}` : joined
  }

  // Resolve um href interno do EPUB em relação ao arquivo base (OPF/XHTML).
  // Isso evita erros comuns com ../, ./ e caminhos exportados pelo Calibre.
  private static resolveZipPath(basePath: string, href: string): string {
    const target = href.trim()
    if (!target) return ''

    const isExternal = /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(target)
    if (isExternal) return target

    try {
      const root = 'https://invalid.invalid/'
      const url = new URL(
        target.replace(/%2c/gi, ',').replace(/%3a/gi, ':'),
        `${root}${basePath.replace(/^\//, '')}`,
      )
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

  private static resolveNavigationHref(basePath: string, href: string): string {
    const target = href.trim()
    if (!target) return ''

    const isExternal = /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(target)
    if (isExternal) return target

    try {
      const root = 'https://invalid.invalid/'
      const url = new URL(
        target.replace(/%2c/gi, ',').replace(/%3a/gi, ':'),
        `${root}${basePath.replace(/^\//, '')}`,
      )
      url.search = ''
      return decodeURI(url.href.replace(root, '')).replace(/^\//, '')
    } catch {
      const [pathWithQuery, fragment] = target.split('#', 2)
      const [pathOnly] = pathWithQuery.split('?')
      const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/') + 1)
        : ''
      const normalizedPath = this.normalizeZipPath(`${baseDir}${pathOnly}`).replace(/^\//, '')
      return fragment ? `${normalizedPath}#${fragment}` : normalizedPath
    }
  }

  // Pega o caminho do OPF de dentro do container.xml
  // Exemplo: <rootfile full-path="OEBPS/content.opf" .../>
  private static extractOpfPath(containerXml: string): string | null {
    const match = containerXml.match(/full-path="([^"]+\.opf)"/)
    return match?.[1] ?? null
  }

  // Extrai o conteúdo de uma tag XML simples (sem atributos aninhados)
  private static extractXmlTextByLocalName(xml: string, localName: string): string | null {
    const expected = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = xml.match(new RegExp(`<([\\w.-]+:)?${expected}\\b[^>]*>([\\s\\S]*?)<\\/\\1?${expected}>`, 'i'))
    return match ? this.decodeXmlEntities(this.cleanText(match[2])) : null
  }

  private static decodeXmlEntities(value: string): string {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
  }

  private static extractLanguage(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): string {
    const opfLanguage = this.normalizeLanguageCandidate(
      this.extractXmlTextByLocalName(opfXml, 'language'),
    )
    if (opfLanguage) return opfLanguage

    const manifestById = this.getManifestById(opfXml)
    const spineDocuments = this.getSpineDocuments(opfXml, opfPath, manifestById)
    const sampledTexts: string[] = []

    for (const spineDocument of spineDocuments.slice(0, 12)) {
      const html = this.readFileAsText(files, spineDocument.path)
      if (!html) continue

      const htmlLanguage = this.extractHtmlLanguage(html)
      if (htmlLanguage) return htmlLanguage

      const preview = this.extractPreviewTextFromHtml(html)
      if (preview) sampledTexts.push(preview)
    }

    return this.inferLanguageFromText(sampledTexts.join(' ')) ?? 'en'
  }

  private static normalizeLanguageCandidate(value?: string | null): string | null {
    const candidate = value?.trim().replace(/_/g, '-')
    if (!candidate || /^und(?:etermined)?$/i.test(candidate)) return null

    try {
      return Intl.getCanonicalLocales(candidate)[0] ?? null
    } catch {
      const base = candidate.match(/^[a-z]{2,3}\b/i)?.[0]?.toLowerCase()
      return base ?? null
    }
  }

  private static extractHtmlLanguage(html: string): string | null {
    const match = html.match(/\b(?:xml:)?lang\s*=\s*["']([^"']+)["']/i)
    return this.normalizeLanguageCandidate(match?.[1])
  }

  private static inferLanguageFromText(text: string): string | null {
    const normalized = text.toLowerCase()
    if (!normalized) return null

    const scores = {
      pt: this.countMatches(normalized, /\b(que|para|com|uma|não|voce|você|direitos|sobre|prefácio|capítulo)\b/g),
      es: this.countMatches(normalized, /\b(que|para|con|una|los|las|del|derechos|capítulo|prólogo)\b/g),
      en: this.countMatches(normalized, /\b(the|and|with|that|this|chapter|preface|copyright|rights)\b/g),
    }
    const best = Object.entries(scores).sort((left, right) => right[1] - left[1])[0]
    return best && best[1] > 0 ? best[0] : null
  }

  private static countMatches(value: string, pattern: RegExp): number {
    return Array.from(value.matchAll(pattern)).length
  }

  // Retorna o MIME type correto a partir da extensão do arquivo.
  // A detecção por extensão é suficiente para EPUBs — o formato do arquivo
  // não muda, só precisamos do tipo correto para o Blob.
  private static mimeFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      png:  'image/png',
      gif:  'image/gif',
      webp: 'image/webp',
      svg:  'image/svg+xml',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
    }
    return map[ext] ?? 'image/jpeg'
  }

  private static parseXmlAttributes(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    const attrRe = /([\w:-]+)\s*=\s*(["'])(.*?)\2/gs

    let match: RegExpExecArray | null
    while ((match = attrRe.exec(raw)) !== null) {
      attrs[match[1].toLowerCase()] = match[3]
    }

    return attrs
  }

  private static extractManifestItems(opfXml: string): ManifestItem[] {
    return Array.from(opfXml.matchAll(/<item\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => {
        const attrs = this.parseXmlAttributes(rawAttrs)
        return {
          id: attrs.id ?? null,
          href: attrs.href ?? '',
          mediaType: attrs['media-type'] ?? null,
          properties: (attrs.properties ?? '')
            .split(/\s+/)
            .map((prop) => prop.trim().toLowerCase())
            .filter(Boolean),
        }
      })
      .filter((item) => Boolean(item.href))
  }

  private static getManifestById(opfXml: string): Map<string, ManifestItem> {
    return new Map(
      this.extractManifestItems(opfXml)
        .filter((item) => item.id)
        .map((item) => [item.id!.toLowerCase(), item]),
    )
  }

  private static getSpineDocuments(
    opfXml: string,
    opfPath: string,
    manifestById = this.getManifestById(opfXml),
  ): SpineDocument[] {
    return this.extractSpineItemIds(opfXml)
      .map((id) => manifestById.get(id.toLowerCase()) ?? null)
      .filter((item): item is ManifestItem => Boolean(item && this.isHtmlResource(item.href, item.mediaType)))
      .map((item) => {
        const path = this.resolveZipPath(opfPath, item.href)
        return {
          href: item.href,
          path,
          label: this.labelFromHref(path),
        }
      })
  }

  private static extractGuideReferences(opfXml: string): GuideReference[] {
    return Array.from(opfXml.matchAll(/<reference\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => {
        const attrs = this.parseXmlAttributes(rawAttrs)
        return {
          type: attrs.type ?? null,
          href: attrs.href ?? '',
        }
      })
      .filter((ref) => Boolean(ref.href))
  }

  private static findManifestItemByHref(
    manifestItems: ManifestItem[],
    opfPath: string,
    href: string,
  ): ManifestItem | null {
    const resolvedTarget = this.resolveZipPath(opfPath, href)
    return manifestItems.find((item) => (
      this.resolveZipPath(opfPath, item.href) === resolvedTarget
    )) ?? null
  }

  private static isHtmlResource(href: string, mediaType: string | null): boolean {
    const normalizedType = mediaType?.toLowerCase() ?? ''
    return normalizedType === 'application/xhtml+xml'
      || normalizedType === 'text/html'
      || /\.(x?html?|xhtm)$/i.test(href)
  }

  private static isCoverCandidate(item: ManifestItem): boolean {
    if (this.isHtmlResource(item.href, item.mediaType)) return true

    const normalizedType = item.mediaType?.toLowerCase() ?? ''
    return normalizedType.startsWith('image/')
      || /\.(png|gif|webp|jpe?g|svg)$/i.test(item.href)
  }

  private static looksLikeCoverPath(href: string): boolean {
    return /(^|[/._-])cover([/._-]|$)/i.test(href)
  }

  private static isExternalHref(href: string): boolean {
    return /^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(href)
  }

  private static labelFromHref(href: string): string {
    const fileName = this.normalizeZipPath(href)
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()

    return fileName || 'Capitulo'
  }

  // Extrai a capa como Blob. EPUBs variam muito — estratégia em cascata:
  //   1. properties="cover-image" no manifest
  //   2. <meta name="cover"> → item por id/path
  //   3. item com id="cover"
  //   4. href com padrão de nome que pareça capa
  //   5. <guide><reference type="cover">
  //   6. primeira imagem do manifest
  //   7. se o href escolhido for XHTML/HTML → extrai a imagem interna
  private static extractCover(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
    title: string,
    author: string,
  ): Blob | null {
    const manifestItems = this.extractManifestItems(opfXml)
    const guideReferences = this.extractGuideReferences(opfXml)
    const coverHrefs = [
      this.extractCoverFromProperties(opfXml, manifestItems),
      ...this.extractCoverHrefsFromMeta(opfXml, manifestItems),
      ...manifestItems
        .filter((item) => item.id?.toLowerCase() === 'cover' && this.isCoverCandidate(item))
        .map((item) => item.href),
      ...manifestItems
        .filter((item) => this.looksLikeCoverPath(item.href) && this.isCoverCandidate(item))
        .map((item) => item.href),
      ...guideReferences
        .filter((ref) => ref.type?.toLowerCase().includes('cover'))
        .map((ref) => ref.href),
      ...this.extractCoverHrefsFromSpine(opfXml, opfPath, files),
      ...manifestItems
        .filter((item) => item.mediaType?.toLowerCase().startsWith('image/'))
        .map((item) => item.href),
    ].filter((href): href is string => Boolean(href))

    for (const coverHref of [...new Set(coverHrefs)]) {
      const coverBlob = this.extractCoverBlobFromHref(manifestItems, opfPath, files, coverHref)
      if (coverBlob) return coverBlob
    }

    return this.createFallbackCover(title, author)
  }

  private static extractCoverBlobFromHref(
    manifestItems: ManifestItem[],
    opfPath: string,
    files: Record<string, Uint8Array>,
    coverHref: string,
  ): Blob | null {
    const coverItem = this.findManifestItemByHref(manifestItems, opfPath, coverHref)
    const coverPath = this.resolveZipPath(opfPath, coverHref)

    // Alguns EPUBs (ex: O'Reilly) declaram o item de capa como um arquivo HTML
    // (.xhtml/.html) que contém um <img> apontando para a imagem real.
    // Nesses casos precisamos abrir o HTML e extrair o src do primeiro <img>.
    const isHtml = this.isHtmlResource(coverHref, coverItem?.mediaType ?? null)
    if (isHtml) {
      const html = this.readFileAsText(files, coverPath)
      return html ? this.extractImageFromHtml(html, coverPath, files) : null
    }

    const coverData = this.readFileBytes(files, coverPath)
    if (!coverData) return null

    return new Blob([coverData.slice(0)], {
      type: coverItem?.mediaType ?? this.mimeFromPath(coverPath),
    })
  }

  // Estratégia 1: <item properties="cover-image" href="..."/>
  // Nota: [\s\S]*? em vez de [^>]* para suportar atributos em múltiplas linhas.
  // Muitos editores de EPUB (ex: calibre, ferramentas O'Reilly) geram o OPF
  // com cada atributo numa linha separada, e [^>] não casa com \n.
  private static extractCoverFromProperties(
    opfXml: string,
    manifestItems: ManifestItem[] = this.extractManifestItems(opfXml),
  ): string | null {
    return manifestItems.find((item) => item.properties.includes('cover-image'))?.href ?? null
  }

  // Estratégia 2: <meta name="cover" content="..."/>
  // O content pode ser:
  //   a) um ID de manifest: content="cover-image" → busca <item id="cover-image" href="..."/>
  //   b) um path direto:    content="Images/cover.png" → usa como href diretamente
  //   (O'Reilly usa a variante (b), a maioria dos EPUBs usa (a))
  private static extractCoverFromMeta(
    opfXml: string,
    manifestItems: ManifestItem[] = this.extractManifestItems(opfXml),
  ): string | null {
    const content = Array.from(opfXml.matchAll(/<meta\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => this.parseXmlAttributes(rawAttrs))
      .find((attrs) => attrs.name?.toLowerCase() === 'cover')
      ?.content

    if (!content) return null

    // Se o content parece um path de arquivo (tem extensão), usa diretamente
    if (/\.[a-z0-9]{2,5}(?:[#?].*)?$/i.test(content)) return content

    // Caso contrário, trata como ID de manifest e busca o href correspondente
    return manifestItems.find((item) => item.id === content)?.href
      ?? manifestItems.find((item) => item.id?.toLowerCase() === content.toLowerCase())?.href
      ?? null
  }

  private static extractCoverHrefsFromMeta(
    opfXml: string,
    manifestItems: ManifestItem[] = this.extractManifestItems(opfXml),
  ): string[] {
    const content = Array.from(opfXml.matchAll(/<meta\b([\s\S]*?)\/?>/gi))
      .map(([, rawAttrs]) => this.parseXmlAttributes(rawAttrs))
      .find((attrs) => attrs.name?.toLowerCase() === 'cover')
      ?.content

    if (!content) return []

    const manifestHref = manifestItems.find((item) => item.id === content)?.href
      ?? manifestItems.find((item) => item.id?.toLowerCase() === content.toLowerCase())?.href
      ?? null

    return [
      manifestHref,
      /\.[a-z0-9]{2,5}(?:[#?].*)?$/i.test(content) ? content : null,
    ].filter((href): href is string => Boolean(href))
  }

  private static extractCoverHrefsFromSpine(
    opfXml: string,
    opfPath: string,
    files: Record<string, Uint8Array>,
  ): string[] {
    const spineDocuments = this.getSpineDocuments(opfXml, opfPath)
    const hrefs: string[] = []

    for (const spineDocument of spineDocuments.slice(0, 5)) {
      const html = this.readFileAsText(files, spineDocument.path)
      if (!html) continue

      const looksLikeCoverPage = this.looksLikeCoverPath(spineDocument.path)
        || /<meta\b[^>]*(?:name=["']calibre:cover["'][^>]*content=["']true["']|content=["']true["'][^>]*name=["']calibre:cover["'])/i.test(html)
        || /<title\b[^>]*>\s*(?:cover|capa|cubierta)\s*<\/title>/i.test(html)

      if (looksLikeCoverPage) {
        const href = this.extractFirstImageHrefFromHtml(html)
        if (href) hrefs.push(this.resolveZipPath(spineDocument.path, href))
      }
    }

    return hrefs
  }

  private static extractFirstImageHrefFromHtml(html: string): string | null {
    return html.match(/<img[\s\S]*?src=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<image[\s\S]*?href=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<image[\s\S]*?xlink:href=["']([^"']+)["']/i)?.[1]
      ?? null
  }

  private static createFallbackCover(title: string, author: string): Blob {
    const safeTitle = this.escapeXml(title || 'NeoReader')
    const safeAuthor = this.escapeXml(author || 'Autor desconhecido')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#1f2937"/><rect x="42" y="42" width="516" height="816" fill="none" stroke="#f9fafb" stroke-width="6"/><text x="300" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#f9fafb">${safeTitle}</text><text x="300" y="460" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#d1d5db">${safeAuthor}</text></svg>`
    return new Blob([svg], { type: 'image/svg+xml' })
  }

  private static escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  // Abre um arquivo HTML de capa e extrai o src do primeiro <img> (ou href do
  // primeiro <image> de SVG). Necessário quando a capa é declarada como XHTML
  // em vez de diretamente como arquivo de imagem.
  private static extractImageFromHtml(
    html: string,
    htmlPath: string,
    files: Record<string, Uint8Array>,
  ): Blob | null {
    const match = html.match(/<img[\s\S]*?src=["']([^"']+)["']/i)
              ?? html.match(/<image[\s\S]*?href=["']([^"']+)["']/i)
              ?? html.match(/<image[\s\S]*?xlink:href=["']([^"']+)["']/i)  // SVG antigo usa xlink:href

    if (!match) {
      const inlineSvg = html.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0]
      return inlineSvg ? new Blob([inlineSvg], { type: 'image/svg+xml' }) : null
    }

    const imgPath = this.resolveZipPath(htmlPath, match[1])
    const data = this.readFileBytes(files, imgPath)
    if (!data) return null

    return new Blob([data.slice(0)], { type: this.mimeFromPath(imgPath) })
  }
}
