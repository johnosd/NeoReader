// Marcas dentro dos itens da camada de texto do pdf.js (karaokê do TTS, highlights). Cada item é um <span> que
// pode já ter spans de Word Lens/vocabulário dentro; as funções aqui só envolvem/desembrulham pedaços de texto,
// sem mudar o texto do item — a camada continua alinhada com a imagem e os offsets do texto bruto continuam
// valendo.

/**
 * Envolve os caracteres [start, end) do texto do item numa marca criada por `createMark`. Percorre os nós de
 * texto (o item pode ter spans dentro) e envolve só o pedaço de cada nó; devolve as marcas criadas.
 */
export function wrapItemRange(
  doc: Document,
  itemIndex: number,
  start: number,
  end: number,
  createMark: () => HTMLElement,
): HTMLElement[] {
  const span = doc.querySelector<HTMLElement>(`.textLayer span[data-nr-item="${itemIndex}"]`)
  if (!span || end <= start) return []
  const walker = doc.createTreeWalker(span, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text)

  const marks: HTMLElement[] = []
  let position = 0
  for (const node of textNodes) {
    const length = node.data.length
    const from = Math.max(start, position) - position
    const to = Math.min(end, position + length) - position
    position += length
    if (to <= from) continue
    // splitText: [antes][trecho][depois] — a marca envolve só o pedaço do meio.
    const middle = from > 0 ? node.splitText(from) : node
    if (to - from < middle.data.length) middle.splitText(to - from)
    const mark = createMark()
    middle.replaceWith(mark)
    mark.append(middle)
    marks.push(mark)
  }
  return marks
}

/** Desembrulha as marcas que casam com `selector`, devolvendo o texto (e o que houver dentro) ao lugar. */
export function unwrapMarks(doc: Document, selector: string): void {
  doc.querySelectorAll(selector).forEach((mark) => {
    const parent = mark.parentNode
    mark.replaceWith(...Array.from(mark.childNodes))
    parent?.normalize()
  })
}
