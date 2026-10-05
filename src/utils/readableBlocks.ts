/**
 * Um bloco é "só contêiner" quando contém outros blocos legíveis e todo o
 * texto dele pertence a esses filhos — ex: `<li><p>texto</p></li>` ou
 * `<blockquote><p>texto</p></blockquote>`. Como `querySelectorAll('p, li, ...')`
 * casa pai E filho, manter os dois faz o TTS ler o mesmo texto duas vezes.
 *
 * Blocos com texto próprio (ex: `<li>Pai<ul><li>Filho</li></ul></li>`) NÃO são
 * só contêiner: descartá-los perderia o "Pai".
 */
export function isContainerOnlyBlock(el: Element, blockSelector: string): boolean {
  if (!el.querySelector(blockSelector)) return false

  // 4 = NodeFilter.SHOW_TEXT (constante numérica para funcionar com o
  // documento do iframe do EPUB, que tem seu próprio realm JS).
  const walker = el.ownerDocument.createTreeWalker(el, 4)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue
    // closest() devolve o bloco mais interno que envolve este texto: se for o
    // próprio `el`, o texto é dele e não de um filho.
    if (node.parentElement?.closest(blockSelector) === el) return false
  }
  return true
}

export function removeContainerOnlyBlocks<T extends Element>(blocks: T[], blockSelector: string): T[] {
  return blocks.filter((el) => !isContainerOnlyBlock(el, blockSelector))
}
