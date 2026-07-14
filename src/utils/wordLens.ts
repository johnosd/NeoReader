import type {
  CefrLevel,
  CefrOrdinal,
  WordLensData,
} from '@/types/wordLens'

const LEVEL_TO_ORDINAL: Readonly<Record<CefrLevel, CefrOrdinal>> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
}

const ORDINAL_TO_LEVEL: Readonly<Record<CefrOrdinal, CefrLevel>> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
}

const WORD_PATTERN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu

export interface WordLensToken {
  text: string
  normalized: string
  start: number
  end: number
}

export interface WordLensMatch extends WordLensToken {
  lemma: string
  level: CefrLevel
  ordinal: CefrOrdinal
}

export function cefrLevelToOrdinal(level: CefrLevel): CefrOrdinal {
  return LEVEL_TO_ORDINAL[level]
}

export function cefrOrdinalToLevel(ordinal: CefrOrdinal): CefrLevel {
  return ORDINAL_TO_LEVEL[ordinal]
}

export function normalizeWordLensToken(value: string): string {
  return value.replaceAll('’', "'").toLocaleLowerCase('en')
}

export function tokenizeWordLensText(text: string): WordLensToken[] {
  return Array.from(text.matchAll(WORD_PATTERN), (match) => {
    const start = match.index
    const token = match[0]
    return {
      text: token,
      normalized: normalizeWordLensToken(token),
      start,
      end: start + token.length,
    }
  })
}

export function classifyWordLensText(
  text: string,
  userLevel: CefrLevel,
  data: WordLensData,
): WordLensMatch[] {
  return classifyWordLensTokens(tokenizeWordLensText(text), userLevel, data)
}

export function classifyWordLensTokens(
  tokens: WordLensToken[],
  userLevel: CefrLevel,
  data: WordLensData,
): WordLensMatch[] {
  const userOrdinal = cefrLevelToOrdinal(userLevel)
  if (userOrdinal === 6 || tokens.length === 0) return []

  const matches: WordLensMatch[] = []
  for (const token of tokens) {
    const lemma = data.lemmas[token.normalized] ?? token.normalized
    const ordinal = data.levels[token.normalized] ?? data.levels[lemma]
    if (ordinal === undefined || ordinal <= userOrdinal) continue

    matches.push({
      ...token,
      lemma,
      ordinal,
      level: cefrOrdinalToLevel(ordinal),
    })
  }

  return matches
}
