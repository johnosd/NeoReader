import { describe, expect, it } from 'vitest'
import { isContainerOnlyBlock, removeContainerOnlyBlocks } from '@/utils/readableBlocks'

const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6'

function blocksFrom(html: string): Element[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return Array.from(doc.querySelectorAll(BLOCK))
}

function texts(blocks: Element[]): string[] {
  return blocks.map((el) => el.textContent!.trim())
}

describe('removeContainerOnlyBlocks', () => {
  it('mantém só o <p> em <li><p>texto</p></li> (bug do TTS lendo listas em dobro)', () => {
    const blocks = blocksFrom('<ul><li><p>Item um</p></li><li><p>Item dois</p></li></ul>')
    const result = removeContainerOnlyBlocks(blocks, BLOCK)
    expect(result.map((el) => el.tagName)).toEqual(['P', 'P'])
    expect(texts(result)).toEqual(['Item um', 'Item dois'])
  })

  it('mantém só os <p> dentro de <blockquote>', () => {
    const blocks = blocksFrom('<blockquote><p>Citação A</p><p>Citação B</p></blockquote>')
    expect(texts(removeContainerOnlyBlocks(blocks, BLOCK))).toEqual(['Citação A', 'Citação B'])
  })

  it('mantém <li> simples sem filhos de bloco', () => {
    const blocks = blocksFrom('<ul><li>Simples</li></ul><p>Depois</p>')
    expect(texts(removeContainerOnlyBlocks(blocks, BLOCK))).toEqual(['Simples', 'Depois'])
  })

  it('mantém <li> com texto próprio em lista aninhada para não perder texto', () => {
    const blocks = blocksFrom('<ul><li>Pai<ul><li>Filho</li></ul></li></ul>')
    const result = removeContainerOnlyBlocks(blocks, BLOCK)
    expect(result.map((el) => el.tagName)).toEqual(['LI', 'LI'])
  })

  it('ignora espaços em branco entre os filhos ao decidir', () => {
    const [li] = blocksFrom('<ul><li>\n  <p>Texto</p>\n  </li></ul>')
    expect(isContainerOnlyBlock(li, BLOCK)).toBe(true)
  })
})
