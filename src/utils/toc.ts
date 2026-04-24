export interface FlattenedTocItem {
  item: TocItem
  depth: number
  path: string
}

interface TocPathCandidate extends FlattenedTocItem {
  label: string
}

function getTocChildren(item: TocItem): TocItem[] {
  return Array.isArray(item.subitems) ? item.subitems : []
}

function normalizePathSegments(path: string): string {
  const resolved: string[] = []

  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }

  return resolved.join('/')
}

export function getDirectNavigationHref(item: TocItem): string {
  for (const child of getTocChildren(item)) {
    const target = getDirectNavigationHref(child)
    if (target) return target
  }
  return item.href
}

export function flattenTocItems(
  items: TocItem[],
  depth = 0,
  parentPath = '',
): FlattenedTocItem[] {
  return items.flatMap((item, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`
    return [
      { item, depth, path },
      ...flattenTocItems(getTocChildren(item), depth + 1, path),
    ]
  })
}

export function flattenVisibleTocItems(
  items: TocItem[],
  expandedPaths: ReadonlySet<string>,
  depth = 0,
  parentPath = '',
): FlattenedTocItem[] {
  return items.flatMap((item, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`
    const children = getTocChildren(item)
    return [
      { item, depth, path },
      ...(expandedPaths.has(path)
        ? flattenVisibleTocItems(children, expandedPaths, depth + 1, path)
        : []),
    ]
  })
}

export function getTocAncestorPaths(path?: string | null): string[] {
  if (!path) return []
  const parts = path.split('.')
  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('.'))
}

export function normalizeTocHref(href?: string | null): string {
  if (!href) return ''
  const normalizedSeparators = href.trim().replace(/\\/g, '/')
  const [pathWithQuery, fragment = ''] = normalizedSeparators.split('#', 2)
  const [pathOnly] = pathWithQuery.split('?')
  const normalizedPath = normalizePathSegments(pathOnly.replace(/^\/+/, '').replace(/\/+/g, '/'))

  try {
    const decodedPath = decodeURI(normalizedPath)
    return fragment ? `${decodedPath}#${fragment}` : decodedPath
  } catch {
    return fragment ? `${normalizedPath}#${fragment}` : normalizedPath
  }
}

function normalizeTocLabel(label?: string | null): string {
  return label?.replace(/\s+/g, ' ').trim().toLocaleLowerCase() ?? ''
}

function getTocHrefDocument(href?: string | null): string {
  return normalizeTocHref(href).split('#')[0].toLocaleLowerCase()
}

export function areTocHrefsEqual(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeTocHref(left).toLocaleLowerCase()
  const normalizedRight = normalizeTocHref(right).toLocaleLowerCase()
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function areTocHrefDocumentsEqual(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = getTocHrefDocument(left)
  const normalizedRight = getTocHrefDocument(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function areTocHrefDocumentSuffixesEqual(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = getTocHrefDocument(left)
  const normalizedRight = getTocHrefDocument(right)
  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    (
      normalizedLeft === normalizedRight ||
      normalizedLeft.endsWith(`/${normalizedRight}`) ||
      normalizedRight.endsWith(`/${normalizedLeft}`)
    ),
  )
}

function collectTocPathCandidates(
  items: TocItem[],
  parentPath = '',
  depth = 0,
): TocPathCandidate[] {
  return items.flatMap((item, index) => {
    const path = parentPath ? `${parentPath}.${index}` : `${index}`
    return [
      {
        item,
        depth,
        path,
        label: normalizeTocLabel(item.label),
      },
      ...collectTocPathCandidates(getTocChildren(item), path, depth + 1),
    ]
  })
}

function scoreTocCandidate(
  candidate: TocPathCandidate,
  currentHref?: string | null,
  currentLabel?: string | null,
): number {
  const label = normalizeTocLabel(currentLabel)
  const hasLabelMatch = Boolean(label && candidate.label === label)
  const hasExactHrefMatch = Boolean(currentHref && areTocHrefsEqual(candidate.item.href, currentHref))
  const hasExactDocumentMatch = Boolean(currentHref && areTocHrefDocumentsEqual(candidate.item.href, currentHref))
  const hasSuffixDocumentMatch = Boolean(currentHref && areTocHrefDocumentSuffixesEqual(candidate.item.href, currentHref))

  if (hasExactHrefMatch && hasLabelMatch) return 120
  if (hasExactHrefMatch) return 110
  if (hasExactDocumentMatch && hasLabelMatch) return 100
  if (hasSuffixDocumentMatch && hasLabelMatch) return 95
  if (hasLabelMatch) return 80
  if (hasExactDocumentMatch) return 70
  if (hasSuffixDocumentMatch) return 60

  return 0
}

export function findCurrentTocPath(
  items: TocItem[],
  currentHref?: string | null,
  currentLabel?: string | null,
): string | null {
  let best: { path: string; depth: number; score: number } | null = null

  for (const candidate of collectTocPathCandidates(items)) {
    const score = scoreTocCandidate(candidate, currentHref, currentLabel)
    if (score === 0) continue

    if (!best || score > best.score || (score === best.score && candidate.depth > best.depth)) {
      best = { path: candidate.path, depth: candidate.depth, score }
    }
  }

  return best?.path ?? null
}

export function hasTocChildren(item: TocItem): boolean {
  return getTocChildren(item).length > 0
}

export function getTocSubitems(item: TocItem): TocItem[] {
  return getTocChildren(item)
}
