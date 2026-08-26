export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export type CefrLevel = (typeof CEFR_LEVELS)[number]
export type CefrOrdinal = 1 | 2 | 3 | 4 | 5 | 6

export type WordLensLevels = Readonly<Record<string, CefrOrdinal>>
export type WordLensLemmas = Readonly<Record<string, string>>

export interface WordLensDictionarySense {
  partOfSpeech: string
  definition: string
  examples: readonly string[]
  synonyms: readonly string[]
}

export interface WordLensDictionaryEntry {
  partsOfSpeech: readonly string[]
  senses: readonly WordLensDictionarySense[]
}

export type WordLensDictionaryPartition = Readonly<Record<string, WordLensDictionaryEntry>>

export interface WordLensData {
  levels: WordLensLevels
  lemmas: WordLensLemmas
  packVersion?: string
  dictionaryPath?: string
  dictionaryPartitions?: readonly string[]
}

export interface WordLensManifest {
  schemaVersion: number
  packVersion: string
  levelsPath: string
  lemmasPath: string
  dictionaryPath?: string
  dictionaryPartitions?: string[]
}
