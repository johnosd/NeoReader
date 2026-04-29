import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { EpubService, type EpubStyleDiagnostic, type EpubStyleIssue } from '@/services/EpubService'
import { normalizeLanguageTag } from '@/utils/language'
import {
  areTocHrefDocumentSuffixesEqual,
  flattenTocItems,
  getDirectNavigationHref,
  getTocSubitems,
  hasTocChildren,
  normalizeTocHref,
} from '@/utils/toc'

interface ManifestItem {
  id: string
  href: string
  mediaType: string
}

interface EpubPackageInspection {
  files: Record<string, Uint8Array>
  opfPath: string
  manifestItems: ManifestItem[]
  spineDocuments: string[]
  stubDocumentCache: Map<string, boolean>
}

interface ViewerHrefResolution {
  index: number
  matchType: 'exact' | 'suffix'
}

const DEBUG_BOOKS_DIR = join(process.cwd(), 'debug-books')
const FRAGMENT_SAMPLE_SIZE = 80
const RESOURCE_DOCUMENT_SAMPLE_SIZE = 12
const RESOURCE_PER_DOCUMENT_LIMIT = 80
const FULL_FRAGMENT_CHECK = process.env.NEOREADER_DEBUG_EPUB_FULL_FRAGMENTS === '1'
const STYLE_ISSUE_LABELS: Record<EpubStyleIssue, string> = {
  'hardcoded-text-color': 'Cor de texto fixa',
  'hardcoded-background-color': 'Fundo fixo no EPUB',
  'small-font-size': 'Fonte pequena no EPUB',
  'tight-line-height': 'Espacamento apertado',
}
const shouldRunDebugEpubCorpus = process.env.NEOREADER_RUN_DEBUG_EPUBS === '1'
  || process.argv.some((arg) => arg.replace(/\\/g, '/').includes('realEpubCorpus.test.ts'))
const epubPaths = existsSync(DEBUG_BOOKS_DIR)
  ? readdirSync(DEBUG_BOOKS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.epub'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(DEBUG_BOOKS_DIR, name))
  : []

function makeEpubFile(filePath: string): File {
  const data = readFileSync(filePath)
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  return new File([bytes], basename(filePath), { type: 'application/epub+zip' })
}

function readZipBytes(files: Record<string, Uint8Array>, path: string): Uint8Array | null {
  const candidates = [...new Set([
    path,
    path.replace(/^\//, ''),
    normalizeZipPath(path),
    normalizeZipPath(path).replace(/^\//, ''),
  ].filter(Boolean))]

  for (const candidate of candidates) {
    const data = files[candidate]
    if (data) return data
  }

  return null
}

function readZipText(files: Record<string, Uint8Array>, path: string): string | null {
  const data = readZipBytes(files, path)
  return data ? new TextDecoder('utf-8').decode(data) : null
}

function normalizeZipPath(path: string): string {
  const cleaned = path
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '')
    .replace(/%2c/gi, ',')
    .replace(/%3a/gi, ':')

  const resolved: string[] = []
  for (const part of cleaned.split('/')) {
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

function resolveZipPath(basePath: string, href: string): string {
  try {
    const root = 'https://invalid.invalid/'
    const url = new URL(
      href.replace(/%2c/gi, ',').replace(/%3a/gi, ':'),
      `${root}${basePath.replace(/^\//, '')}`,
    )
    url.search = ''
    url.hash = ''
    return decodeURI(url.href.replace(root, '')).replace(/^\//, '')
  } catch {
    const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : ''
    return normalizeZipPath(`${baseDir}${href}`)
  }
}

function parseXmlAttributes(rawAttributes: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrPattern = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g

  for (const match of rawAttributes.matchAll(attrPattern)) {
    const name = match[1] ?? match[3]
    const value = match[2] ?? match[4] ?? ''
    if (name) attrs[name.toLowerCase()] = value
  }

  return attrs
}

function extractManifestItems(opfXml: string): ManifestItem[] {
  return Array.from(opfXml.matchAll(/<item\b([\s\S]*?)(?:\/>|>)/gi))
    .map(([, rawAttrs]) => {
      const attrs = parseXmlAttributes(rawAttrs)
      return {
        id: attrs.id ?? '',
        href: attrs.href ?? '',
        mediaType: attrs['media-type'] ?? '',
      }
    })
    .filter((item) => item.id && item.href)
}

function extractSpineIds(opfXml: string): string[] {
  const spineXml = opfXml.match(/<spine\b[\s\S]*?<\/spine>/i)?.[0] ?? ''

  return Array.from(spineXml.matchAll(/<itemref\b([\s\S]*?)(?:\/>|>)/gi))
    .map(([, rawAttrs]) => parseXmlAttributes(rawAttrs))
    .map((attrs) => attrs.idref)
    .filter((id): id is string => Boolean(id))
}

function inspectEpubPackage(filePath: string): EpubPackageInspection {
  const files = unzipSync(new Uint8Array(readFileSync(filePath)))
  const containerXml = readZipText(files, 'META-INF/container.xml')
  expect(containerXml, `${basename(filePath)} deve conter META-INF/container.xml`).toBeTruthy()

  const opfPath = containerXml?.match(/full-path="([^"]+\.opf)"/i)?.[1]
  expect(opfPath, `${basename(filePath)} deve declarar o OPF no container`).toBeTruthy()

  const opfXml = readZipText(files, opfPath!)
  expect(opfXml, `${basename(filePath)} deve conter o OPF ${opfPath}`).toBeTruthy()

  const manifestById = new Map(
    extractManifestItems(opfXml!)
      .map((item) => [item.id.toLowerCase(), item]),
  )
  const spineDocuments = extractSpineIds(opfXml!)
    .map((id) => manifestById.get(id.toLowerCase()))
    .filter((item): item is ManifestItem => Boolean(item))
    .map((item) => resolveZipPath(opfPath!, item.href))

  return {
    files,
    opfPath: opfPath!,
    manifestItems: [...manifestById.values()],
    spineDocuments,
    stubDocumentCache: new Map(),
  }
}

function isInternalHref(href: string): boolean {
  return !/^(?!blob:)[a-z][a-z0-9+.-]*:/i.test(href)
}

function splitHref(href: string): { documentHref: string; fragment: string | null } {
  const normalized = normalizeTocHref(href)
  const [documentHref, fragment] = normalized.split('#', 2)
  return { documentHref, fragment: fragment || null }
}

function findMatchingSpineDocument(spineDocuments: string[], documentHref: string): string | null {
  return spineDocuments.find((spineDocument) =>
    areTocHrefDocumentSuffixesEqual(spineDocument, documentHref),
  ) ?? null
}

function resolveHrefLikeEpubViewer(spineDocuments: string[], href: string): ViewerHrefResolution | null {
  const { documentHref } = splitHref(href)
  const expectedDocument = documentHref.toLocaleLowerCase()
  if (!expectedDocument) return null

  const exactIndex = spineDocuments.findIndex((spineDocument) =>
    splitHref(spineDocument).documentHref.toLocaleLowerCase() === expectedDocument,
  )
  if (exactIndex >= 0) return { index: exactIndex, matchType: 'exact' }

  const suffixIndexes = [...new Set(
    spineDocuments
      .map((spineDocument, index) => (
        areTocHrefDocumentSuffixesEqual(spineDocument, href) ? index : null
      ))
      .filter((index): index is number => index !== null),
  )]

  return suffixIndexes.length === 1
    ? { index: suffixIndexes[0], matchType: 'suffix' }
    : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtml(value: string): string {
  return normalizeText(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  )
}

function getHtmlDocumentPaths(inspection: EpubPackageInspection): string[] {
  const manifestHtmlPaths = inspection.manifestItems
    .filter((item) => (
      item.mediaType.toLowerCase() === 'application/xhtml+xml'
      || item.mediaType.toLowerCase() === 'text/html'
      || /\.(x?html?|xhtm)(?:[#?].*)?$/i.test(item.href)
    ))
    .map((item) => resolveZipPath(inspection.opfPath, item.href))

  return [...new Set([...inspection.spineDocuments, ...manifestHtmlPaths])]
}

function getReadableTextByDocument(inspection: EpubPackageInspection, paths: string[]): Array<{
  path: string
  text: string
}> {
  return paths
    .map((path) => {
      const html = readZipText(inspection.files, path)
      return html ? { path, text: stripHtml(html) } : null
    })
    .filter((entry): entry is { path: string; text: string } => Boolean(entry))
}

function detectStyleIssuesInSource(source: string): Set<EpubStyleIssue> {
  const issues = new Set<EpubStyleIssue>()

  if (/(^|[;{\s"'])color\s*:\s*(?:#000(?:000)?\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i.test(source)) {
    issues.add('hardcoded-text-color')
  }

  if (/background(?:-color)?\s*:\s*(?:#fff(?:fff)?\b|white\b|#000(?:000)?\b|black\b|rgb\()/i.test(source)) {
    issues.add('hardcoded-background-color')
  }

  if (/font-size\s*:\s*(?:[6-9](?:\.\d+)?px|1[0-2](?:\.\d+)?px|0\.[5-9](?:\d+)?(?:em|rem)|[5-8]\d%)/i.test(source)) {
    issues.add('small-font-size')
  }

  if (/line-height\s*:\s*(?:1(?:\.0+)?|1\.[0-2]\b|[8-9]\d%|10\d%|11\d%|12\d%)/i.test(source)) {
    issues.add('tight-line-height')
  }

  return issues
}

function collectStyleIssuesInDocuments(
  inspection: EpubPackageInspection,
  documentPaths: string[],
): Set<EpubStyleIssue> {
  const issues = new Set<EpubStyleIssue>()

  for (const path of documentPaths) {
    const html = readZipText(inspection.files, path)
    if (!html) continue

    for (const issue of detectStyleIssuesInSource(html)) {
      issues.add(issue)
    }
  }

  return issues
}

function isChapterStubHtml(html: string): boolean {
  const blockTexts = Array.from(html.matchAll(/<(?:p|li|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|li|blockquote)>/gi))
    .map(([, content]) => stripHtml(content))
    .filter(Boolean)
  const headingCount = Array.from(html.matchAll(/<h[1-6]\b/gi)).length
  const bodyBlockCount = blockTexts.length
  const longestBlockLength = blockTexts.reduce((max, text) => Math.max(max, text.length), 0)
  const bodyHtml = html.match(/<body\b[\s\S]*?>([\s\S]*?)<\/body>/i)?.[1] ?? html
  const textLength = stripHtml(bodyHtml).length
  const hasChapterMarker =
    /\bdata-type\s*=\s*["'][^"']*\bchapter\b/i.test(html) ||
    /\bepub:type\s*=\s*["'][^"']*\bchapter\b/i.test(html)
  const hasPartMarker =
    /\bdata-type\s*=\s*["'][^"']*\bpart\b/i.test(html) ||
    /\bepub:type\s*=\s*["'][^"']*\bpart\b/i.test(html) ||
    /\bdata-pdf-bookmark\s*=\s*["']Part /i.test(html)

  if (hasPartMarker) return true
  if (hasChapterMarker) return false
  return headingCount > 0 && bodyBlockCount <= 1 && longestBlockLength <= 40 && textLength > 0 && textLength <= 220
}

function isStubTarget(inspection: EpubPackageInspection, href: string): boolean {
  const resolution = resolveHrefLikeEpubViewer(inspection.spineDocuments, href)
  if (!resolution) return false

  const spineDocument = inspection.spineDocuments[resolution.index]
  const cached = inspection.stubDocumentCache.get(spineDocument)
  if (cached !== undefined) return cached

  const html = readZipText(inspection.files, spineDocument)
  const result = html ? isChapterStubHtml(html) : false
  inspection.stubDocumentCache.set(spineDocument, result)
  return result
}

function getFirstDescendantHref(item: TocItem): string {
  for (const child of getTocSubitems(item)) {
    const href = getFirstDescendantHref(child)
    if (href) return href
  }

  return item.href
}

function hasFragmentTarget(html: string, fragment: string): boolean {
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
    const escaped = escapeRegExp(candidate)
    if (new RegExp(`\\b(?:id|name)\\s*=\\s*["']${escaped}["']`, 'i').test(html)) return true
  }

  return false
}

function isPackageResourceHref(href: string): boolean {
  const trimmed = href.trim()
  return Boolean(trimmed)
    && !trimmed.startsWith('#')
    && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

function extractHtmlResourceHrefs(html: string): Array<{
  kind: 'stylesheet' | 'image'
  href: string
}> {
  const resources: Array<{ kind: 'stylesheet' | 'image'; href: string }> = []
  const tagPattern = /<(link|img|image)\b([\s\S]*?)(?:\/>|>)/gi

  for (const [, rawTag, rawAttrs] of html.matchAll(tagPattern)) {
    const attrs = parseXmlAttributes(rawAttrs)
    const tag = rawTag.toLowerCase()

    if (tag === 'link') {
      const rel = attrs.rel?.toLowerCase() ?? ''
      const href = attrs.href ?? ''
      if (href && (!rel || rel.split(/\s+/).includes('stylesheet'))) {
        resources.push({ kind: 'stylesheet', href })
      }
      continue
    }

    const href = attrs.src ?? attrs.href ?? attrs['xlink:href'] ?? ''
    if (href) resources.push({ kind: 'image', href })
  }

  return resources.filter((resource) => isPackageResourceHref(resource.href))
}

function formatMissingResources(missingResources: string[]): string {
  return missingResources
    .slice(0, 8)
    .join('\n')
}

function assertTocResolvesToSpine(
  fileName: string,
  toc: TocItem[],
  inspection: EpubPackageInspection,
): string[] {
  const flattened = flattenTocItems(toc)
  expect(flattened.length, `${fileName} deve ter itens navegaveis no indice`).toBeGreaterThan(0)

  const internalHrefs = flattened
    .map(({ item }) => getDirectNavigationHref(item))
    .filter((href) => href && isInternalHref(href))

  expect(internalHrefs.length, `${fileName} deve ter hrefs internos no indice`).toBeGreaterThan(0)

  for (const href of internalHrefs) {
    const { documentHref } = splitHref(href)
    const matchingSpineDocument = findMatchingSpineDocument(inspection.spineDocuments, documentHref)
    const viewerResolution = resolveHrefLikeEpubViewer(inspection.spineDocuments, href)

    expect(
      matchingSpineDocument,
      `${fileName}: href do indice nao resolve no spine: ${href}`,
    ).toBeTruthy()
    expect(
      viewerResolution,
      `${fileName}: EpubViewer.goTo nao resolveria o href do indice: ${href}`,
    ).toBeTruthy()
  }

  return internalHrefs
}

function assertTocOrderMatchesSpine(
  fileName: string,
  internalHrefs: string[],
  inspection: EpubPackageInspection,
): void {
  let previousIndex = -1

  for (const href of internalHrefs) {
    const resolution = resolveHrefLikeEpubViewer(inspection.spineDocuments, href)
    expect(resolution, `${fileName}: href sem resolucao de ordem: ${href}`).toBeTruthy()

    expect(
      resolution!.index,
      `${fileName}: ordem do indice volta no spine em ${href}`,
    ).toBeGreaterThanOrEqual(previousIndex)
    previousIndex = resolution!.index
  }
}

function assertGroupedTocItemsOpenUsefulTargets(
  fileName: string,
  toc: TocItem[],
  inspection: EpubPackageInspection,
): void {
  const groupedItems = flattenTocItems(toc)
    .map(({ item }) => item)
    .filter((item) => hasTocChildren(item))

  for (const item of groupedItems) {
    const directHref = getDirectNavigationHref(item)
    const expectedDescendantHref = getFirstDescendantHref(item)

    expect(
      directHref,
      `${fileName}: agrupador "${item.label}" nao abre no primeiro descendente navegavel`,
    ).toBe(expectedDescendantHref)

    const directResolution = isInternalHref(directHref)
      ? resolveHrefLikeEpubViewer(inspection.spineDocuments, directHref)
      : null
    expect(
      directResolution,
      `${fileName}: agrupador "${item.label}" aponta para href nao resolvivel: ${directHref}`,
    ).toBeTruthy()

    if (item.href && isInternalHref(item.href) && isStubTarget(inspection, item.href)) {
      expect(
        splitHref(directHref).documentHref,
        `${fileName}: agrupador stub "${item.label}" nao deve abrir a propria pagina stub`,
      ).not.toBe(splitHref(item.href).documentHref)
      expect(
        isStubTarget(inspection, directHref),
        `${fileName}: agrupador stub "${item.label}" deve abrir um capitulo util, nao outro stub`,
      ).toBe(false)
    }
  }
}

function assertPreviewLooksLikeReadingText(fileName: string, previewText: string | null): void {
  const preview = normalizeText(previewText ?? '')

  expect(preview.length, `${fileName} deve extrair preview de leitura`).toBeGreaterThan(24)
  expect(preview, `${fileName}: preview parece vir da capa`).not.toMatch(/^cover\b/i)
  expect(preview, `${fileName}: preview parece vir do sumario`).not.toMatch(/^(table of contents|contents|sumario|indice)\b/i)
  expect(preview, `${fileName}: preview parece vir do copyright`).not.toMatch(/^(copyright|all rights reserved)\b/i)
  expect(preview, `${fileName}: preview parece vir de propaganda/artefato`).not.toMatch(/\b(oceanofpdf|end user license agreement)\b/i)
}

function hasMeaningfulReadingText(html: string): boolean {
  const text = stripHtml(html)
    .replace(/^page\s+\d+\b/i, '')
    .trim()

  return text.length > 24
    && !/^(cover|copyright|all rights reserved|sumario|indice|contents|table of contents)\b/i.test(text)
}

function isImageOnlyReadingEpub(inspection: EpubPackageInspection): boolean {
  let sawImagePage = false

  for (const documentPath of inspection.spineDocuments.slice(0, RESOURCE_DOCUMENT_SAMPLE_SIZE)) {
    const html = readZipText(inspection.files, documentPath)
    if (!html) continue

    if (hasMeaningfulReadingText(html)) return false
    if (/<(?:img|image)\b/i.test(html)) sawImagePage = true
  }

  return sawImagePage
}

function assertPreviewMatchesEpubShape(
  fileName: string,
  previewText: string | null,
  inspection: EpubPackageInspection,
): void {
  if (previewText === null && isImageOnlyReadingEpub(inspection)) return

  assertPreviewLooksLikeReadingText(fileName, previewText)
}

function assertCoverLooksUsable(fileName: string, coverBlob: Blob | null): void {
  expect(coverBlob, `${fileName} deve extrair uma capa`).not.toBeNull()
  expect(coverBlob?.size ?? 0, `${fileName}: capa extraida esta vazia ou pequena demais`).toBeGreaterThan(128)
  expect(coverBlob?.type ?? '', `${fileName}: capa deve ter MIME type de imagem`).toMatch(/^image\//)
}

function assertLanguageLooksValid(fileName: string, language: string | null): void {
  const normalizedLanguage = normalizeLanguageTag(language, '')

  expect(normalizedLanguage, `${fileName} deve extrair idioma do OPF`).not.toBe('')
  expect(
    normalizedLanguage,
    `${fileName}: idioma extraido nao parece uma tag BCP 47 simples`,
  ).toMatch(/^[a-z]{2,3}(?:-[A-Z]{2}|-[A-Za-z0-9]+)*$/)
  expect(
    () => Intl.getCanonicalLocales(normalizedLanguage),
    `${fileName}: idioma extraido nao e aceito por Intl.getCanonicalLocales`,
  ).not.toThrow()
}

function findPreviewDocumentIndex(
  inspection: EpubPackageInspection,
  previewText: string | null,
): number | null {
  const preview = normalizeText(previewText ?? '')
  if (!preview) return null

  const documentTexts = getReadableTextByDocument(inspection, inspection.spineDocuments)
  const needles = [
    preview,
    preview.slice(0, 120),
    preview.slice(0, 80),
    preview.slice(0, 40),
  ].map(normalizeText).filter((value) => value.length >= 24)

  const entry = documentTexts.find(({ text }) => needles.some((needle) => text.includes(needle)))
  return entry ? inspection.spineDocuments.indexOf(entry.path) : null
}

function assertStyleDiagnosticsMatchSources(
  fileName: string,
  diagnostics: EpubStyleDiagnostic[],
  inspection: EpubPackageInspection,
  previewText: string | null,
): void {
  const diagnosticsByIssue = new Map(diagnostics.map((diagnostic) => [diagnostic.issue, diagnostic]))
  const allPackageHtmlIssues = collectStyleIssuesInDocuments(inspection, getHtmlDocumentPaths(inspection))

  expect(
    diagnosticsByIssue.size,
    `${fileName} nao deve duplicar diagnosticos de estilo`,
  ).toBe(diagnostics.length)

  for (const diagnostic of diagnostics) {
    expect(
      STYLE_ISSUE_LABELS,
      `${fileName}: diagnostico de estilo desconhecido: ${diagnostic.issue}`,
    ).toHaveProperty(diagnostic.issue)
    expect(diagnostic.label.trim(), `${fileName}: diagnostico de estilo sem label`).not.toBe('')
    expect(
      allPackageHtmlIssues.has(diagnostic.issue),
      `${fileName}: diagnostico "${diagnostic.issue}" foi reportado sem evidencia no HTML do EPUB`,
    ).toBe(true)
  }

  const previewIndex = findPreviewDocumentIndex(inspection, previewText)
  if (previewIndex === null) return

  const earlyReadingIssues = collectStyleIssuesInDocuments(
    inspection,
    inspection.spineDocuments.slice(0, previewIndex + 1),
  )

  for (const issue of earlyReadingIssues) {
    expect(
      diagnosticsByIssue.has(issue),
      `${fileName}: diagnostico "${issue}" aparece antes do preview mas nao foi reportado`,
    ).toBe(true)
  }
}

function assertReferencedResourcesExist(fileName: string, inspection: EpubPackageInspection): void {
  const sampledDocuments = inspection.spineDocuments.slice(0, RESOURCE_DOCUMENT_SAMPLE_SIZE)
  const missingResources: string[] = []
  let checkedResourceCount = 0

  for (const documentPath of sampledDocuments) {
    const html = readZipText(inspection.files, documentPath)
    if (!html) continue

    const resources = extractHtmlResourceHrefs(html).slice(0, RESOURCE_PER_DOCUMENT_LIMIT)
    for (const resource of resources) {
      const resolvedPath = resolveZipPath(documentPath, resource.href)
      checkedResourceCount += 1

      if (!readZipBytes(inspection.files, resolvedPath) && !/\.xpgt$/i.test(resolvedPath)) {
        missingResources.push(`${documentPath} -> ${resource.href} (${resolvedPath})`)
      }
    }
  }

  expect(
    checkedResourceCount,
    `${fileName}: nenhum CSS/imagem principal foi encontrado nos primeiros documentos do spine`,
  ).toBeGreaterThan(0)
  expect(
    missingResources,
    `${fileName}: recursos internos quebrados:\n${formatMissingResources(missingResources)}`,
  ).toEqual([])
}

function assertFragmentTargetsExist(
  fileName: string,
  internalHrefs: string[],
  inspection: EpubPackageInspection,
): void {
  const hrefsWithFragments = internalHrefs.filter((href) => splitHref(href).fragment)
  const hrefsToCheck = FULL_FRAGMENT_CHECK
    ? hrefsWithFragments
    : hrefsWithFragments.slice(0, FRAGMENT_SAMPLE_SIZE)

  for (const href of hrefsToCheck) {
    const { documentHref, fragment } = splitHref(href)
    const matchingSpineDocument = findMatchingSpineDocument(inspection.spineDocuments, documentHref)
    expect(matchingSpineDocument, `${fileName}: documento do fragment nao resolve: ${href}`).toBeTruthy()

    const html = readZipText(inspection.files, matchingSpineDocument!)
    expect(html, `${fileName}: arquivo do spine nao foi encontrado: ${matchingSpineDocument}`).toBeTruthy()
    expect(
      hasFragmentTarget(html!, fragment!),
      `${fileName}: fragmento do indice nao existe no documento: ${href}`,
    ).toBe(true)
  }
}

if (!shouldRunDebugEpubCorpus) {
  describe.skip('debug-books EPUB corpus', () => {
    it('rode npm run test:debug-epubs para validar os EPUBs locais', () => {})
  })
} else if (epubPaths.length === 0) {
  describe.skip('debug-books EPUB corpus', () => {
    it('coloque arquivos .epub em debug-books para rodar esta suite local', () => {})
  })
} else {
  describe('debug-books EPUB corpus', () => {
    it.each(epubPaths.map((filePath) => [basename(filePath), filePath]))(
      'valida funcionalidades principais em %s',
      async (fileName, filePath) => {
        const file = makeEpubFile(filePath)
        const inspection = inspectEpubPackage(filePath)

        expect(inspection.spineDocuments.length, `${fileName} deve ter spine linear`).toBeGreaterThan(0)

        const metadata = await EpubService.parseMetadata(file)
        expect(metadata.title.trim(), `${fileName} deve extrair titulo`).not.toBe('')
        expect(metadata.author.trim(), `${fileName} deve extrair autor`).not.toBe('')
        assertCoverLooksUsable(fileName, metadata.coverBlob)

        const extras = await EpubService.parseExtras(file)
        assertLanguageLooksValid(fileName, extras.language)
        expect(extras.toc.length, `${fileName} deve extrair indice`).toBeGreaterThan(0)
        assertPreviewMatchesEpubShape(fileName, extras.previewText, inspection)
        assertStyleDiagnosticsMatchSources(fileName, extras.styleDiagnostics, inspection, extras.previewText)
        assertReferencedResourcesExist(fileName, inspection)

        const internalHrefs = assertTocResolvesToSpine(fileName, extras.toc, inspection)
        assertTocOrderMatchesSpine(fileName, internalHrefs, inspection)
        assertGroupedTocItemsOpenUsefulTargets(fileName, extras.toc, inspection)
        assertFragmentTargetsExist(fileName, internalHrefs, inspection)
      },
      30_000,
    )
  })
}
