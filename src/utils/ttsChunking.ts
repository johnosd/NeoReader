export interface TtsSentenceChunk {
  sentence: string
  offset: number
}

interface SentenceBounds {
  start: number
  end: number
}

const FALLBACK_SENTENCE_RE = /[^.!?。！？…]+(?:[.!?。！？…]+["'”’»)]?\s*|$)/g

function getSentenceSegmenter(locale?: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null

  try {
    return new Intl.Segmenter(locale || undefined, { granularity: 'sentence' })
  } catch {
    return new Intl.Segmenter(undefined, { granularity: 'sentence' })
  }
}

function trimBounds(text: string, start: number, end: number): SentenceBounds {
  let nextStart = start
  let nextEnd = end

  while (nextStart < nextEnd && /\s/.test(text[nextStart] ?? '')) nextStart += 1
  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1] ?? '')) nextEnd -= 1

  return { start: nextStart, end: nextEnd }
}

function getSentenceBounds(text: string, locale?: string): SentenceBounds[] {
  const segmenter = getSentenceSegmenter(locale)

  if (segmenter) {
    return [...segmenter.segment(text)]
      .map(segment => trimBounds(text, segment.index, segment.index + segment.segment.length))
      .filter(({ start, end }) => end > start)
  }

  return [...text.matchAll(FALLBACK_SENTENCE_RE)]
    .map(match => {
      const start = match.index ?? 0
      return trimBounds(text, start, start + match[0].length)
    })
    .filter(({ start, end }) => end > start)
}

function chunkFromBounds(text: string, start: number, end: number): TtsSentenceChunk | null {
  const trimmed = trimBounds(text, start, end)
  if (trimmed.end <= trimmed.start) return null

  return {
    sentence: text.slice(trimmed.start, trimmed.end),
    offset: trimmed.start,
  }
}

function findBreakBefore(text: string, limit: number, minEnd: number): number {
  for (let idx = limit; idx > minEnd; idx -= 1) {
    const char = text[idx - 1]
    if (!char) continue
    if (/\s|[,;:)]/.test(char)) return idx
  }
  return limit
}

function pushBoundedChunk(
  chunks: TtsSentenceChunk[],
  text: string,
  start: number,
  end: number,
  minLen: number,
  maxLen: number,
): void {
  let cursor = trimBounds(text, start, end).start
  const trimmedEnd = trimBounds(text, start, end).end
  if (trimmedEnd <= cursor) return

  while (trimmedEnd - cursor > maxLen) {
    const minEnd = Math.min(trimmedEnd, cursor + Math.max(1, minLen))
    const limit = Math.min(trimmedEnd, cursor + maxLen)
    const nextEnd = findBreakBefore(text, limit, minEnd)
    const chunk = chunkFromBounds(text, cursor, nextEnd)
    if (chunk) chunks.push(chunk)
    cursor = trimBounds(text, nextEnd, trimmedEnd).start
  }

  const chunk = chunkFromBounds(text, cursor, trimmedEnd)
  if (chunk) chunks.push(chunk)
}

export function splitParagraphIntoTtsChunks(
  text: string,
  minLen = 40,
  locale?: string,
  maxLen = 1200,
): TtsSentenceChunk[] {
  const paragraph = text.trim()
  if (!paragraph) return []
  const boundedMaxLen = Math.max(minLen, maxLen)

  const bounds = getSentenceBounds(text, locale)
  if (bounds.length === 0) {
    const chunks: TtsSentenceChunk[] = []
    pushBoundedChunk(chunks, text, 0, text.length, minLen, boundedMaxLen)
    return chunks
  }

  const chunks: TtsSentenceChunk[] = []
  let groupStart: number | null = null
  let groupEnd = 0

  for (const part of bounds) {
    if (groupStart == null) groupStart = part.start
    groupEnd = part.end

    const candidate = chunkFromBounds(text, groupStart, groupEnd)
    if (candidate && candidate.sentence.length >= minLen) {
      pushBoundedChunk(chunks, text, groupStart, groupEnd, minLen, boundedMaxLen)
      groupStart = null
      groupEnd = 0
    }
  }

  if (groupStart != null) {
    pushBoundedChunk(chunks, text, groupStart, groupEnd, minLen, boundedMaxLen)
  }

  return chunks
}
