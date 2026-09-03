/**
 * jsdom não faz layout de verdade — `offsetHeight`/`offsetWidth` sempre
 * retornam 0 pra qualquer elemento. O `measureElement` do
 * @tanstack/react-virtual (medição dinâmica de altura por item, usada na
 * Biblioteca virtualizada) lê essas propriedades pra corrigir o
 * `estimateSize`; com tudo em 0, o cálculo da janela visível entra num loop
 * instável (cada item medido como 0px "revela" mais itens no range, até
 * esgotar a lista). Escopado por teste (retorna uma função de restore) em
 * vez de um patch global em `setup.ts`, pra não arriscar mudar o
 * comportamento de outros arquivos de teste que dependem do zero padrão do
 * jsdom pra `offsetHeight`/`offsetWidth`.
 */
export function mockElementDimensions(width: number, height: number): () => void {
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width })

  return () => {
    if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor)
    if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', widthDescriptor)
  }
}
