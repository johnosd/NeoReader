// Toque na página fiel → palavra, frase e alvo de Word Lens (US3). Funções puras, sem DOM.
//
// O toque cai num item da camada de texto, isto é, num offset do TEXTO BRUTO da página. Tradução e Word Lens
// trabalham sobre o texto RECONSTRUÍDO do parágrafo (pdfParagraphs: sem quebra de linha, sem hífen de quebra),
// que é o mesmo que o modo texto mostra. A ponte entre os dois é: offset bruto → posição aproximada no texto
// do bloco (proporcional pelos intervalos) → a ocorrência da palavra tocada mais próxima dessa posição.

import type { CefrLevel, WordLensData } from '@/types/wordLens'
import type { PdfBlock } from '@/utils/pdfParagraphs'
import type { PdfPoint } from '@/utils/pdfLocator'
import { getSentenceAt } from '@/utils/readerUtils'
import { classifyWordLensText, normalizeWordLensToken } from '@/utils/wordLens'

const LETTER = /[\p{L}\p{M}'’]/u
// Hífen de quebra: "-" como último caractere de uma linha (antes do "\n" do texto bruto).
const LINE_BREAK_HYPHEN = /-\n$/

/** Palavra do texto bruto que contém `offset`, juntando "pala-\nvra" (hifenizada entre linhas). */
export function wordAtRawOffset(raw: string, offset: number): { word: string; start: number; end: number } | null {
  if (offset < 0 || offset > raw.length) return null
  let at = Math.min(offset, raw.length - 1)
  // Toque no espaço logo depois da palavra (ou no fim do item): olha um caractere para trás.
  if (!LETTER.test(raw[at] ?? '') && at > 0 && LETTER.test(raw[at - 1])) at -= 1
  if (!LETTER.test(raw[at] ?? '')) return null

  let start = at
  while (start > 0 && LETTER.test(raw[start - 1])) start--
  let end = at + 1
  while (end < raw.length && LETTER.test(raw[end])) end++

  let word = raw.slice(start, end)
  // Fim de linha com hífen: a palavra continua no começo da linha seguinte.
  if (LINE_BREAK_HYPHEN.test(raw.slice(end, end + 2))) {
    let tail = end + 2
    while (tail < raw.length && LETTER.test(raw[tail])) tail++
    word += raw.slice(end + 2, tail)
    end = tail
  } else if (start >= 2 && LINE_BREAK_HYPHEN.test(raw.slice(start - 2, start))) {
    // Tocou na segunda metade ("vra"): junta com a metade de cima.
    let head = start - 2
    while (head > 0 && LETTER.test(raw[head - 1])) head--
    word = raw.slice(head, start - 2) + word
    start = head
  }
  return { word: word.replace(/^['’]+|['’]+$/g, ''), start, end }
}

/** Posição aproximada do ponto no texto do bloco (proporcional pelos intervalos do texto bruto). */
export function approximateBlockOffset(block: PdfBlock, point: PdfPoint): number {
  const total = block.ranges.reduce((sum, r) => sum + (r.end - r.start), 0)
  if (total === 0) return 0
  let before = 0
  for (const range of block.ranges) {
    if (range.pageIndex === point.pageIndex && point.offset >= range.start && point.offset <= range.end) {
      return Math.round(((before + point.offset - range.start) / total) * block.text.length)
    }
    before += range.end - range.start
  }
  return 0
}

const isWordChar = (ch: string | undefined) => !!ch && LETTER.test(ch)

/** Ocorrência da palavra (inteira, sem diferenciar maiúsculas) mais próxima de `near`; -1 se não houver. */
export function findWordNear(text: string, word: string, near: number): number {
  if (!word) return -1
  const haystack = normalizeWordLensToken(text)
  const needle = normalizeWordLensToken(word)
  let best = -1
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    if (isWordChar(text[i - 1]) || isWordChar(text[i + needle.length])) continue
    if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i
  }
  return best
}

export interface PdfTapText {
  textOffset: number // posição do toque no texto do bloco
  sentence: string
  sentenceStart: number // início da frase no texto do bloco
  word: string | null
}

/** Frase e palavra tocadas no texto reconstruído do bloco. */
export function resolveTapInBlock(block: PdfBlock, point: PdfPoint, raw: string): PdfTapText {
  const approx = approximateBlockOffset(block, point)
  const word = wordAtRawOffset(raw, point.offset)?.word ?? null
  const found = word ? findWordNear(block.text, word, approx) : -1
  const textOffset = found >= 0 ? found : Math.min(approx, Math.max(0, block.text.length - 1))
  const sentence = getSentenceAt(block.text, textOffset)
  const sentenceStart = Math.max(0, block.text.indexOf(sentence, Math.max(0, textOffset - sentence.length)))
  return { textOffset, sentence, sentenceStart, word }
}

/** Próxima frase do bloco depois de `sentenceStart` (botão "próxima"), ou null no fim do bloco. */
export function nextSentenceInBlock(text: string, sentenceStart: number, sentence: string): { sentence: string; start: number } | null {
  let from = sentenceStart + sentence.length
  while (from < text.length && /\s/.test(text[from])) from++
  if (from >= text.length) return null
  const next = getSentenceAt(text, from)
  if (!next) return null
  return { sentence: next, start: Math.max(from, text.indexOf(next, from)) }
}

export interface PdfWordLensTarget {
  surface: string
  lemma: string
  level: CefrLevel
  offset: number // na FRASE (o mesmo referencial do EPUB: posição dentro do texto que vai para tradução)
}

/**
 * Alvo de Word Lens se a palavra tocada está acima do nível do leitor — mesma classificação do EPUB
 * (classifyWordLensText), aplicada ao texto reconstruído, então palavra hifenizada entre linhas também conta.
 */
export function wordLensTargetAt(
  tap: PdfTapText,
  blockText: string,
  userLevel: CefrLevel,
  data: WordLensData | null,
): PdfWordLensTarget | null {
  if (!data || !tap.word) return null
  const match = classifyWordLensText(blockText, userLevel, data)
    .find((m) => tap.textOffset >= m.start && tap.textOffset < m.end)
  if (!match) return null
  return { surface: match.text, lemma: match.lemma, level: match.level, offset: Math.max(0, match.start - tap.sentenceStart) }
}
