export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export type CefrLevel = (typeof CEFR_LEVELS)[number]
export type CefrOrdinal = 1 | 2 | 3 | 4 | 5 | 6

export type WordLensLevels = Readonly<Record<string, CefrOrdinal>>
export type WordLensLemmas = Readonly<Record<string, string>>

export interface WordLensData {
  levels: WordLensLevels
  lemmas: WordLensLemmas
}

export interface WordLensManifest {
  schemaVersion: number
  packVersion: string
  levelsPath: string
  lemmasPath: string
}
