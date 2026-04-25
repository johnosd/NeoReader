import { describe, expect, it } from 'vitest'
import { splitParagraphIntoTtsChunks } from '@/utils/ttsChunking'

describe('splitParagraphIntoTtsChunks', () => {
  it('preserves offsets after trimming surrounding whitespace', () => {
    expect(splitParagraphIntoTtsChunks('  First sentence. Second sentence.', 1, 'en')).toEqual([
      { sentence: 'First sentence.', offset: 2 },
      { sentence: 'Second sentence.', offset: 18 },
    ])
  })

  it('merges short sentence fragments with the next sentence', () => {
    expect(splitParagraphIntoTtsChunks('Dr. Smith arrived at 3 p.m. He stayed.', 20, 'en')).toEqual([
      { sentence: 'Dr. Smith arrived at 3 p.m.', offset: 0 },
      { sentence: 'He stayed.', offset: 28 },
    ])
  })

  it('supports CJK sentence punctuation', () => {
    expect(splitParagraphIntoTtsChunks('これは最初の文です。次の文です。', 1, 'ja')).toEqual([
      { sentence: 'これは最初の文です。', offset: 0 },
      { sentence: '次の文です。', offset: 10 },
    ])
  })

  it('keeps a paragraph without terminal punctuation as one chunk', () => {
    expect(splitParagraphIntoTtsChunks('No final punctuation here', 1, 'en')).toEqual([
      { sentence: 'No final punctuation here', offset: 0 },
    ])
  })

  it('splits very long sentence chunks at word boundaries', () => {
    const text = 'word01 word02 word03 word04 word05 word06 word07 word08'
    const chunks = splitParagraphIntoTtsChunks(text, 1, 'en', 24)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.sentence.length <= 24)).toBe(true)
    expect(chunks.map(chunk => chunk.sentence).join(' ')).toBe(text)
  })
})
