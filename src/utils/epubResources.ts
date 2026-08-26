interface EpubManifestResource {
  href: string
  mediaType: string
  [key: string]: unknown
}

interface EpubResourceBook {
  entries?: Map<string, unknown>
  resources?: {
    manifest?: EpubManifestResource[]
  }
}

export function registerUnmanifestedEpubStylesheets(book: EpubResourceBook): number {
  const entries = book.entries
  const manifest = book.resources?.manifest
  if (!entries || !manifest) return 0

  const registeredHrefs = new Set(manifest.map((item) => item.href))
  let registeredCount = 0

  for (const href of entries.keys()) {
    if (!/\.css$/i.test(href) || registeredHrefs.has(href)) continue

    manifest.push({ href, mediaType: 'text/css' })
    registeredHrefs.add(href)
    registeredCount += 1
  }

  return registeredCount
}
