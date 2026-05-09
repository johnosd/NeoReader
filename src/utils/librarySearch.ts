export function normalizeLibraryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function includesNormalizedText(value: string, query: string): boolean {
  return normalizeLibraryText(value).includes(normalizeLibraryText(query))
}
