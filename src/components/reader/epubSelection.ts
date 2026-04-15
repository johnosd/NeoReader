export interface ActiveTranslationSelection {
  para: Element
  paraIdx: number
  sourceText: string
  translatedText: string
  requestId: number
}

// Divide um parágrafo em frases e agrupa as muito curtas (<minLen chars) com a próxima.
// Retorna array de { sentence, offset } onde offset é o índice de char no texto original.
export function splitParagraphIntoChunks(
  text: string,
  minLen = 40,
): Array<{ sentence: string; offset: number }> {
  const matches = [...text.matchAll(/[^.!?]*[.!?]+\s*/g)]
  const parts: Array<{ sentence: string; offset: number }> = matches.map((m) => ({
    sentence: m[0],
    offset: m.index ?? 0,
  }))

  const lastEnd = matches.length > 0
    ? (matches[matches.length - 1].index ?? 0) + matches[matches.length - 1][0].length
    : 0
  const tail = text.slice(lastEnd).trim()
  if (tail) parts.push({ sentence: tail, offset: lastEnd })

  if (parts.length === 0) return [{ sentence: text.trim(), offset: 0 }]

  const merged: Array<{ sentence: string; offset: number }> = []
  let acc = ''
  let accOffset = 0

  for (const { sentence, offset } of parts) {
    if (!acc) {
      acc = sentence
      accOffset = offset
    } else {
      acc += sentence
    }

    if (acc.trim().length >= minLen) {
      merged.push({ sentence: acc.trim(), offset: accOffset })
      acc = ''
    }
  }

  if (acc.trim()) merged.push({ sentence: acc.trim(), offset: accOffset })

  return merged
}

// Escapa caracteres HTML para inserção segura via innerHTML.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Retorna a frase do texto que contém o offset de caractere dado.
function getSentenceAt(text: string, charOffset: number): string {
  const parts = text.match(/[^.!?]*[.!?]+\s*/g)
  if (!parts || parts.length <= 1) return text.trim()

  let pos = 0
  for (const part of parts) {
    pos += part.length
    if (charOffset < pos) return part.trim()
  }

  return parts[parts.length - 1].trim()
}

// Envolve apenas a frase clicada num span; se cruzar tags internas, cai no fallback do parágrafo inteiro.
export function highlightSentenceInParagraph(para: Element, sentence: string): void {
  const doc = para.ownerDocument!
  const fullText = para.textContent ?? ''
  const sentenceStart = fullText.indexOf(sentence)

  if (sentenceStart < 0) {
    para.classList.add('nr-hl')
    return
  }

  const range = doc.createRange()
  let charCount = 0
  let startSet = false
  const walker = doc.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null

  while ((node = walker.nextNode()) !== null) {
    const len = node.textContent?.length ?? 0
    if (!startSet && charCount + len > sentenceStart) {
      range.setStart(node, sentenceStart - charCount)
      startSet = true
    }
    if (startSet && charCount + len >= sentenceStart + sentence.length) {
      range.setEnd(node, sentenceStart + sentence.length - charCount)
      break
    }
    charCount += len
  }

  if (!startSet) {
    para.classList.add('nr-hl')
    return
  }

  try {
    const span = doc.createElement('span')
    span.className = 'nr-hl-sentence'
    range.surroundContents(span)
  } catch {
    para.classList.add('nr-hl')
  }
}

// Usa caretRangeFromPoint para estimar em qual frase o usuário tocou.
export function getSentenceFromClick(ev: MouseEvent, para: Element): string {
  const fullText = para.textContent?.trim() ?? ''
  const range = (ev.target as Element).ownerDocument?.caretRangeFromPoint?.(ev.clientX, ev.clientY)
  if (!range) return fullText

  let charOffset = range.startOffset
  const walker = para.ownerDocument!.createTreeWalker(para, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode()) !== null) {
    if (node === range.startContainer) break
    charOffset += node.textContent?.length ?? 0
  }

  return getSentenceAt(fullText, charOffset)
}

// Limpa toda a seleção ativa de tradução: bloco inline, highlight de parágrafo e span da frase.
export function clearTranslationSelection(selection: ActiveTranslationSelection | null): void {
  if (!selection) return

  const { para } = selection
  para.ownerDocument?.getElementById('nr-translation-block')?.remove()
  para.removeAttribute('data-nr-active')
  para.classList.remove('nr-hl')

  const sentSpan = para.querySelector('.nr-hl-sentence')
  if (!sentSpan) return

  const parent = sentSpan.parentNode!
  while (sentSpan.firstChild) parent.insertBefore(sentSpan.firstChild, sentSpan)
  sentSpan.remove()
}
