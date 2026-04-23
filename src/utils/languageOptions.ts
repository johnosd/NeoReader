export const TRANSLATION_LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'Inglês' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'es', label: 'Espanhol' },
  { code: 'fr', label: 'Francês' },
  { code: 'de', label: 'Alemão' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: 'Japonês' },
]

export const BOOK_LANGUAGE_OPTIONS: Array<{ code: string | null; label: string }> = [
  { code: null, label: 'Detectar automaticamente' },
  ...TRANSLATION_LANGUAGE_OPTIONS,
]

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'Inglês', 'en-US': 'Inglês', 'en-GB': 'Inglês',
  pt: 'Português', 'pt-BR': 'Português (BR)', 'pt-PT': 'Português (PT)',
  es: 'Espanhol', fr: 'Francês', de: 'Alemão',
  it: 'Italiano', ja: 'Japonês', zh: 'Chinês',
}

export function getLanguageLabel(code?: string | null) {
  if (!code) return null
  return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES[code.split('-')[0]] ?? code
}
