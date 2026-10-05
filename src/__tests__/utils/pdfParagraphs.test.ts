import { describe, expect, it } from 'vitest'

import { reconstructPdfParagraphs, type PdfBlock, type PdfPageInput, type PdfTextItemInput } from '@/utils/pdfParagraphs'
import { buildRawPageText } from '@/utils/pdfLocator'
import { loadPdfFixture } from '../testUtils/pdfFixtures'

// ---------------------------------------------------------------------------
// Construtores de página sintética (geometria controlada, sem pdf.js)
// ---------------------------------------------------------------------------

const BODY = 10
const LINE_H = 12 // espaçamento entrelinhas do corpo

interface LineSpec {
  text: string
  x?: number
  y: number
  size?: number
  width?: number // largura da linha (para simular texto justificado/linha curta)
}

// Largura média de um caractere ~ 0,5em.
function item(spec: LineSpec): PdfTextItemInput {
  const size = spec.size ?? BODY
  return {
    str: spec.text,
    transform: [size, 0, 0, size, spec.x ?? 50, spec.y],
    width: spec.width ?? spec.text.length * size * 0.5,
    height: size,
    hasEOL: true,
    fontName: 'f1',
  }
}

const page = (pageIndex: number, lines: LineSpec[], extra: PdfTextItemInput[] = []): PdfPageInput => ({
  pageIndex,
  viewport: { width: 595, height: 842 },
  items: [...lines.map(item), ...extra],
})

// Linhas "justificadas": todas vão de x=50 até x=500, exceto a última do parágrafo.
function justifiedParagraph(texts: string[], startY: number, opts: { indent?: boolean; lastWidth?: number } = {}): LineSpec[] {
  return texts.map((text, i) => {
    const isLast = i === texts.length - 1
    const indent = opts.indent && i === 0 ? 20 : 0
    return {
      text,
      x: 50 + indent,
      y: startY - i * LINE_H,
      width: isLast ? (opts.lastWidth ?? 150) : 450 - indent,
    }
  })
}

const texts = (blocks: PdfBlock[]) => blocks.map((b) => b.text)

// ---------------------------------------------------------------------------
// Linhas e parágrafos
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — linhas e parágrafos', () => {
  it('une itens da mesma baseline (inclusive sobrescrito) em uma linha só', () => {
    const base = Array.from({ length: 6 }, (_, i) => ({ text: `linha ${i} de texto corrido sem ponto final aqui`, y: 700 - i * LINE_H, width: 450 }))
    const p = page(0, base, [
      // sobrescrito colado ao fim da linha 0 (x=502): menor, 3pt acima da baseline e sem espaço antes (nota de rodapé)
      { str: '2', transform: [6, 0, 0, 6, 502, 703], width: 3, height: 6, hasEOL: false, fontName: 'f1' },
    ])
    const blocks = reconstructPdfParagraphs([p])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text.startsWith('linha 0 de texto corrido sem ponto final aqui2 linha 1')).toBe(true)
  })

  it('quebra parágrafo por recuo de primeira linha', () => {
    const lines = [
      ...justifiedParagraph(['Primeiro parágrafo começa aqui e segue', 'por mais uma linha inteira de texto', 'e termina curto.'], 700, { indent: true }),
      ...justifiedParagraph(['Segundo parágrafo também recuado e', 'continua em outra linha completa', 'até o fim.'], 700 - 3 * LINE_H, { indent: true }),
    ]
    const blocks = reconstructPdfParagraphs([page(0, lines)])
    expect(texts(blocks)).toEqual([
      'Primeiro parágrafo começa aqui e segue por mais uma linha inteira de texto e termina curto.',
      'Segundo parágrafo também recuado e continua em outra linha completa até o fim.',
    ])
  })

  it('quebra parágrafo por espaçamento maior entre linhas (sem recuo)', () => {
    const first = justifiedParagraph(['Primeiro bloco sem recuo algum linha um', 'linha dois do primeiro bloco inteira', 'fim do primeiro.'], 700)
    const second = justifiedParagraph(['Segundo bloco depois de um espaço extra', 'linha dois do segundo bloco inteira', 'fim do segundo.'], 700 - 3 * LINE_H - 8)
    const blocks = reconstructPdfParagraphs([page(0, [...first, ...second])])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text.startsWith('Primeiro bloco')).toBe(true)
    expect(blocks[1].text.startsWith('Segundo bloco')).toBe(true)
  })

  it('texto justificado: linha curta termina o parágrafo mesmo sem recuo nem espaçamento', () => {
    const lines = [
      ...justifiedParagraph(['Um parágrafo qualquer de texto inteiro um', 'segunda linha do parágrafo continua', 'fim aqui.'], 700),
      ...justifiedParagraph(['Outro parágrafo que começa logo abaixo um', 'segunda linha do outro parágrafo', 'fim também.'], 700 - 3 * LINE_H),
    ]
    expect(reconstructPdfParagraphs([page(0, lines)])).toHaveLength(2)
  })

  it('linha curta sem ponto final seguida de minúscula é frase interrompida, não fim de parágrafo', () => {
    const lines = justifiedParagraph(['Uma frase que atravessa um quadro e', 'fica curta aqui no meio', 'e depois continua em minúscula até acabar.'], 700, { lastWidth: 150 })
    // a 2ª linha é curta (sem ponto) e a 3ª começa em minúscula
    lines[1].width = 150
    lines[2].width = 150
    const filler = justifiedParagraph(['preenchimento para o espaçamento típico e a borda direita'], 700 - 3 * LINE_H, { lastWidth: 450 })
    const more = justifiedParagraph(['mais uma linha cheia de texto corrido aqui', 'e outra linha cheia de texto corrido aqui'], 700 - 4 * LINE_H, { lastWidth: 450 })
    const blocks = reconstructPdfParagraphs([page(0, [...lines, ...filler, ...more])])
    expect(blocks[0].text.startsWith('Uma frase que atravessa um quadro e fica curta aqui no meio e depois continua')).toBe(true)
  })

  it('título por fonte maior vira heading com nível relativo ao corpo', () => {
    const body = justifiedParagraph(['Corpo do texto numa linha cheia aqui', 'segunda linha cheia do corpo aqui', 'fim.'], 640)
    const p = page(0, [{ text: 'Capítulo Um', y: 700, size: 22 }, { text: 'Seção', y: 670, size: 13 }, ...body])
    const blocks = reconstructPdfParagraphs([p])
    expect(blocks.map((b) => [b.kind, b.level, b.text])).toEqual([
      ['heading', 1, 'Capítulo Um'],
      ['heading', 2, 'Seção'],
      ['paragraph', undefined, 'Corpo do texto numa linha cheia aqui segunda linha cheia do corpo aqui fim.'],
    ])
  })

  it('título em CAIXA ALTA do mesmo tamanho do corpo também é heading', () => {
    const body = justifiedParagraph(['Corpo do texto numa linha cheia aqui', 'segunda linha cheia do corpo aqui', 'fim.'], 660)
    const blocks = reconstructPdfParagraphs([page(0, [{ text: 'CAPÍTULO 2', y: 690 }, ...body])])
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'CAPÍTULO 2' })
    expect(blocks[1].kind).toBe('paragraph')
  })

  it('ignora texto rotacionado (marca d\'água lateral)', () => {
    const body = justifiedParagraph(['Corpo do texto numa linha cheia aqui', 'segunda linha cheia do corpo aqui', 'fim.'], 700)
    const rotated: PdfTextItemInput = { str: 'RASCUNHO CONFIDENCIAL', transform: [0, 10, -10, 0, 20, 300], width: 100, height: 10, hasEOL: true }
    const blocks = reconstructPdfParagraphs([page(0, body, [rotated])])
    expect(texts(blocks).join(' ')).not.toContain('RASCUNHO')
  })

  it('página sem itens ou só com itens vazios → nenhum bloco', () => {
    expect(reconstructPdfParagraphs([])).toEqual([])
    expect(reconstructPdfParagraphs([{ pageIndex: 0, viewport: { width: 595, height: 842 }, items: [] }])).toEqual([])
    expect(reconstructPdfParagraphs([page(0, [{ text: '   ', y: 500 }])])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Hifenização
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — dehifenização', () => {
  const run = (end: string, start: string) => {
    const lines = justifiedParagraph([`Texto cheio de palavras até a ${end}`, `${start} e segue o texto inteiro aqui`, 'fim.'], 700)
    return reconstructPdfParagraphs([page(0, lines)])[0].text
  }

  it('remove o hífen de quebra quando o resto da palavra começa em minúscula', () => {
    expect(run('responsa-', 'bilidade')).toContain('responsabilidade e segue')
  })

  it('mantém o hífen de composto quando a próxima linha começa em maiúscula', () => {
    expect(run('Anglo-', 'Saxônica')).toContain('Anglo-Saxônica e segue')
  })

  it('mantém o hífen de clítico português quebrado em fim de linha', () => {
    expect(run('sentia-', 'me bem')).toContain('sentia-me bem e segue')
  })

  it('trata soft hyphen e hífen unicode como hífen de quebra', () => {
    expect(run('respon­', 'sabilidade')).toContain('responsabilidade')
    expect(run('respon‐', 'sabilidade')).toContain('responsabilidade')
  })

  it('não mexe em hífen no meio da linha', () => {
    const lines = justifiedParagraph(['O guarda-chuva e o ex-presidente chegaram juntos', 'segunda linha cheia de texto corrido aqui', 'fim.'], 700)
    expect(reconstructPdfParagraphs([page(0, lines)])[0].text).toContain('guarda-chuva e o ex-presidente')
  })
})

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — duas colunas', () => {
  // Cada linha tem 2 itens por coluna: 12 linhas × 4 = 48 itens (acima do mínimo para achar o rio).
  const twoColumnItems = (): PdfTextItemInput[] => {
    const items: PdfTextItemInput[] = []
    for (let row = 0; row < 12; row++) {
      const y = 700 - row * LINE_H
      const last = row === 11
      const w = last ? 80 : 120
      items.push(item({ text: `ESQ${row} frase da`, x: 50, y, width: w }), item({ text: `coluna esquerda.`, x: 50 + w, y, width: last ? 60 : 110 }))
      items.push(item({ text: `DIR${row} frase da`, x: 320, y, width: w }), item({ text: `coluna direita.`, x: 320 + w, y, width: last ? 60 : 110 }))
    }
    return items
  }

  it('lê a coluna esquerda inteira antes da direita', () => {
    const blocks = reconstructPdfParagraphs([{ pageIndex: 0, viewport: { width: 595, height: 842 }, items: twoColumnItems() }])
    const all = texts(blocks).join(' ')
    expect(all.indexOf('ESQ0')).toBeGreaterThanOrEqual(0)
    expect(all.indexOf('ESQ11')).toBeLessThan(all.indexOf('DIR0'))
    // nenhuma linha mistura as duas colunas
    for (const t of texts(blocks)) expect(/ESQ/.test(t) && /DIR/.test(t)).toBe(false)
  })

  it('parágrafo continua do fim da coluna esquerda para o topo da direita', () => {
    const items = twoColumnItems().map((it) => ({ ...it, str: it.str.replace('coluna esquerda.', 'coluna esquerda que segue') }))
    const blocks = reconstructPdfParagraphs([{ pageIndex: 0, viewport: { width: 595, height: 842 }, items }])
    // última linha da esquerda não termina em ponto e a 1ª da direita começa em maiúscula/rótulo: não força união,
    // mas o título que atravessa as duas colunas continua separado
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('título que atravessa as colunas é uma linha de largura total, antes das duas colunas', () => {
    const items = [item({ text: 'Título Largo Atravessando Tudo', x: 150, y: 740, size: 20 }), ...twoColumnItems()]
    const blocks = reconstructPdfParagraphs([{ pageIndex: 0, viewport: { width: 595, height: 842 }, items }])
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Título Largo Atravessando Tudo' })
  })

  it('página com pouco texto herda o rio de coluna das vizinhas', () => {
    const sparse: PdfPageInput = {
      pageIndex: 1,
      viewport: { width: 595, height: 842 },
      items: [
        item({ text: 'ESQ-fim da última coluna esquerda.', x: 50, y: 700, width: 220 }),
        item({ text: 'DIR-primeira linha curta.', x: 320, y: 700, width: 150 }),
      ],
    }
    const full: PdfPageInput = { pageIndex: 0, viewport: { width: 595, height: 842 }, items: twoColumnItems() }
    const blocks = reconstructPdfParagraphs([full, sparse], { ownedFromPage: 1 })
    for (const t of texts(blocks)) expect(/ESQ/.test(t) && /DIR/.test(t)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cabeçalho / rodapé
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — cabeçalho e rodapé', () => {
  // Palavra própria por página: se só o dígito mudasse, a 1ª linha do corpo seria idêntica em todas as
  // páginas e (corretamente) tratada como cabeçalho repetido.
  const WORDS = ['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet']
  const body = (n: number) => justifiedParagraph([`Texto ${WORDS[n]} do corpo da página bem cheio aqui`, 'segunda linha cheia do corpo aqui mesmo', 'fim da página.'], 700)

  const pages = (header: (n: number) => LineSpec | null) =>
    Array.from({ length: 8 }, (_, n) => page(n, [...(header(n) ? [header(n)!] : []), ...body(n), { text: String(n + 10), y: 30, x: 290 }]))

  it('remove cabeçalho repetido e número de página', () => {
    const all = reconstructPdfParagraphs(pages(() => ({ text: 'A Biblioteca Silenciosa', y: 800, size: 8 })))
    const joined = texts(all).join(' ')
    expect(joined).not.toContain('Biblioteca Silenciosa')
    expect(joined).not.toMatch(/\b1[0-7]\b/)
    expect(all.length).toBe(8) // um parágrafo de corpo por página
  })

  it('remove cabeçalho alternado (livro numa página, capítulo na outra) e dígitos variáveis', () => {
    const all = reconstructPdfParagraphs(pages((n) => ({ text: n % 2 ? `Capítulo ${n}` : 'Título do Livro', y: 800, size: 8 })))
    const joined = texts(all).join(' ')
    expect(joined).not.toContain('Título do Livro')
    expect(joined).not.toMatch(/Capítulo \d/)
  })

  it('número de página isolado some mesmo numa janela de uma página só', () => {
    const blocks = reconstructPdfParagraphs([page(0, [...body(0), { text: '42', y: 30, x: 290 }])])
    expect(texts(blocks).join(' ')).not.toContain('42')
  })

  it('NÃO remove título de seção que só reaparece de vez em quando', () => {
    const sparse = Array.from({ length: 10 }, (_, n) => page(n, [...(n % 4 === 0 ? [{ text: 'Resumo', y: 800 }] : []), ...body(n)]))
    const joined = texts(reconstructPdfParagraphs(sparse)).join(' ')
    expect(joined).toContain('Resumo')
  })

  it('NÃO remove linha repetida com fonte de título', () => {
    const big = Array.from({ length: 8 }, (_, n) => page(n, [{ text: 'PARTE UM', y: 800, size: 20 }, ...body(n)]))
    expect(texts(reconstructPdfParagraphs(big)).join(' ')).toContain('PARTE UM')
  })
})

// ---------------------------------------------------------------------------
// Páginas, ranges e duplicatas
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — virada de página e ranges', () => {
  const pageWith = (n: number, lines: LineSpec[]) => page(n, lines)

  it('parágrafo que atravessa a página pertence à página onde começa e junta as duas partes', () => {
    const p0 = pageWith(0, justifiedParagraph(['Começo do parágrafo que não acaba na página', 'segunda linha cheia que também não acaba', 'terceira linha cheia que continua na outra'], 700, { lastWidth: 450 }))
    const p1 = pageWith(1, justifiedParagraph(['página seguinte e termina logo aqui.'], 700))
    const blocks = reconstructPdfParagraphs([p0, p1])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].pageIndex).toBe(0)
    expect(blocks[0].text.endsWith('continua na outra página seguinte e termina logo aqui.')).toBe(true)
    expect(blocks[0].ranges.map((r) => r.pageIndex)).toEqual([0, 1])
  })

  it('ownedFromPage/ownedToPage devolvem só blocos que começam na faixa (a outra página é só contexto)', () => {
    const p0 = pageWith(0, justifiedParagraph(['Começo do parágrafo que não acaba na página', 'segunda linha cheia que também não acaba', 'terceira linha cheia que continua na outra'], 700, { lastWidth: 450 }))
    const p1 = pageWith(1, justifiedParagraph(['página seguinte e termina logo aqui.'], 700))
    expect(reconstructPdfParagraphs([p0, p1], { ownedFromPage: 1 })).toEqual([])
    expect(reconstructPdfParagraphs([p0, p1], { ownedToPage: 0 })).toHaveLength(1)
  })

  it('nota de rodapé no fim da página não impede juntar a continuação na página seguinte', () => {
    const body0 = justifiedParagraph(['Começo do parágrafo que não acaba na página', 'segunda linha cheia que também não acaba', 'terceira linha cheia que continua na outra'], 700, { lastWidth: 450 })
    const note: LineSpec[] = [{ text: '1 Nota de rodapé pequena.', y: 80, size: 7, width: 150 }]
    const p1 = pageWith(1, justifiedParagraph(['página seguinte e termina logo aqui.'], 700))
    const blocks = reconstructPdfParagraphs([pageWith(0, [...body0, ...note]), p1])
    const merged = blocks.find((b) => b.text.startsWith('Começo do parágrafo'))!
    expect(merged.text.endsWith('termina logo aqui.')).toBe(true)
  })

  it('ranges apontam para o texto bruto certo de cada parágrafo', () => {
    const lines = [
      ...justifiedParagraph(['Alfa bravo charlie delta echo foxtrot golf', 'hotel india juliet kilo lima mike', 'november oscar.'], 700, { indent: true }),
      ...justifiedParagraph(['Papa quebec romeo sierra tango uniform', 'victor whiskey xray yankee zulu aqui', 'fim.'], 700 - 3 * LINE_H, { indent: true }),
    ]
    const p = page(0, lines)
    const raw = buildRawPageText(p.items)
    const blocks = reconstructPdfParagraphs([p])
    expect(blocks).toHaveLength(2)
    const slice = (b: PdfBlock) => b.ranges.map((r) => raw.slice(r.start, r.end)).join('\n')
    expect(slice(blocks[0])).toContain('Alfa bravo')
    expect(slice(blocks[0])).toContain('november oscar.')
    expect(slice(blocks[0])).not.toContain('Papa')
    expect(slice(blocks[1])).toContain('Papa quebec')
    expect(slice(blocks[1])).not.toContain('Alfa')
  })

  it('texto impresso várias vezes com deslocamento mínimo (negrito falso) aparece uma vez só', () => {
    const base = justifiedParagraph(['Linha em negrito falso impressa várias vezes', 'segunda linha cheia também repetida aqui', 'fim.'], 700)
    const copies = [0, 0.3, 0.2].flatMap((d) => base.map((l) => item({ ...l, x: (l.x ?? 50) + d, y: l.y + d })))
    const p: PdfPageInput = { pageIndex: 0, viewport: { width: 595, height: 842 }, items: copies }
    const blocks = reconstructPdfParagraphs([p])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Linha em negrito falso impressa várias vezes segunda linha cheia também repetida aqui fim.')
    // as cópias continuam cobertas pelos ranges (um intervalo contíguo por página)
    expect(blocks[0].ranges).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Figuras e tabelas
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — figuras', () => {
  it('vazio vertical grande no meio do fluxo vira bloco figure com a faixa da página', () => {
    const above = justifiedParagraph(['Texto antes da figura numa linha cheia', 'segunda linha cheia antes da figura', 'fim antes.'], 700)
    const below = justifiedParagraph(['Texto depois da figura numa linha cheia', 'segunda linha cheia depois da figura', 'fim depois.'], 700 - 3 * LINE_H - 140)
    const blocks = reconstructPdfParagraphs([page(0, [...above, ...below])])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'figure', 'paragraph'])
    const figure = blocks[1]
    expect(figure.text).toBe('')
    expect(figure.region!.pageIndex).toBe(0)
    expect(figure.region!.yTop).toBeGreaterThan(figure.region!.yBottom)
    // a faixa fica entre os dois parágrafos
    expect(figure.region!.yTop).toBeLessThanOrEqual(700 - 2 * LINE_H)
    expect(figure.region!.yBottom).toBeGreaterThanOrEqual(700 - 3 * LINE_H - 140)
  })

  it('linhas em "células" (≥3 colunas separadas por vãos largos) viram uma figure de tabela', () => {
    const cells = (y: number, a: string, b: string, c: string): PdfTextItemInput[] => [
      item({ text: a, x: 50, y, width: 60 }),
      item({ text: b, x: 200, y, width: 60 }),
      item({ text: c, x: 350, y, width: 60 }),
    ]
    const body = justifiedParagraph(['Texto antes da tabela numa linha cheia aqui', 'segunda linha cheia antes da tabela aqui', 'fim.'], 700)
    const table = [cells(640, 'Amostra', 'Valor', 'Erro'), cells(628, 'A1', '10,2', '0,1'), cells(616, 'A2', '11,7', '0,3'), cells(604, 'A3', '9,9', '0,2')].flat()
    const p: PdfPageInput = { pageIndex: 0, viewport: { width: 595, height: 842 }, items: [...body.map(item), ...table] }
    const blocks = reconstructPdfParagraphs([p])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'figure'])
    expect(blocks[1].ranges.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Fixtures reais do pdf.js (corpus sintético impresso pelo Chromium)
// ---------------------------------------------------------------------------

describe('reconstructPdfParagraphs — fixtures do pdf.js', () => {
  const TERMINAL = /[.!?]["'”]?$/

  // Mede SC-003 no corpus: parágrafo "limpo" = termina em pontuação final, não começa em
  // minúscula e não tem hífen de quebra residual. Páginas da borda da janela ficam fora porque
  // o parágrafo que as atravessa não tem como terminar dentro da fixture.
  const cleanRatio = (name: string, from: number, to: number) => {
    const fixture = loadPdfFixture(name)
    const blocks = reconstructPdfParagraphs(fixture.pages, { ownedFromPage: from, ownedToPage: to })
    const paragraphs = blocks.filter((b) => b.kind === 'paragraph')
    const clean = paragraphs.filter((b) => TERMINAL.test(b.text) && !/^\p{Ll}/u.test(b.text) && !/\p{L}- ?\p{L}/u.test(b.text))
    return { blocks, paragraphs, ratio: clean.length / paragraphs.length }
  }

  it('1col (1 coluna, com recuo e com espaçamento, cabeçalho e rodapé): estrutura dos capítulos', () => {
    const { blocks } = cleanRatio('1col', 2, 10)
    const headings = blocks.filter((b) => b.kind === 'heading').map((b) => b.text)
    expect(headings).toContain('Chapter 1: Beginnings')
    expect(headings).toContain('1.1 On method')
    expect(headings).toContain('Chapter 2: The Long Road')
    // o cabeçalho "The Quiet Archive" e os números de página não entram em bloco nenhum
    const all = texts(blocks).join(' ')
    expect(all).not.toContain('The Quiet Archive')
    expect(blocks.some((b) => /^\d+$/.test(b.text))).toBe(false)
  })

  // [fixture, 1ª página, última página, mínimo de parágrafos]. A 1ª e a última página da fixture ficam
  // fora: o parágrafo que as atravessa começa/termina fora da janela extraída.
  it.each([
    ['1col', 2, 10, 20],
    ['1col-pt', 3, 4, 6],
    ['1col-es', 3, 4, 6],
    ['2col', 0, 5, 30],
    ['misto', 2, 10, 12],
  ])('SC-003: ≥95%% dos parágrafos de %s saem limpos', (name, from, to, min) => {
    const { paragraphs, ratio } = cleanRatio(name as string, from as number, to as number)
    expect(paragraphs.length).toBeGreaterThanOrEqual(min as number)
    expect(ratio).toBeGreaterThanOrEqual(0.95)
  })

  it('2col: nenhum parágrafo mistura texto das duas colunas fora de ordem', () => {
    const { paragraphs } = cleanRatio('2col', 0, 5)
    // todo parágrafo termina em ponto e começa em maiúscula: sem linha da coluna vizinha no meio
    for (const p of paragraphs) expect(/^\p{Lu}/u.test(p.text) || /^\d/.test(p.text)).toBe(true)
  })

  it('tabelas: tabelas viram figure com região e os parágrafos continuam limpos', () => {
    const fixture = loadPdfFixture('tabelas')
    const blocks = reconstructPdfParagraphs(fixture.pages)
    const figures = blocks.filter((b) => b.kind === 'figure')
    expect(figures.length).toBeGreaterThanOrEqual(4)
    for (const f of figures) expect(f.region!.yTop).toBeGreaterThan(f.region!.yBottom)
  })

  it('escaneado: nenhuma camada de texto → nenhum bloco', () => {
    expect(reconstructPdfParagraphs(loadPdfFixture('escaneado').pages)).toEqual([])
  })

  it('misto: páginas escaneadas (índices 6–8) não geram bloco e as de texto continuam', () => {
    const blocks = reconstructPdfParagraphs(loadPdfFixture('misto').pages)
    expect(blocks.length).toBeGreaterThan(10)
    expect(blocks.some((b) => b.pageIndex >= 6 && b.pageIndex <= 8)).toBe(false)
    expect(blocks.some((b) => b.pageIndex < 6)).toBe(true)
    expect(blocks.some((b) => b.pageIndex > 8)).toBe(true)
  })

  it('ranges de cada bloco apontam para texto bruto que contém o começo do bloco', () => {
    const fixture = loadPdfFixture('1col')
    const raw = new Map(fixture.pages.map((p) => [p.pageIndex, buildRawPageText(p.items)]))
    const blocks = reconstructPdfParagraphs(fixture.pages, { ownedFromPage: 2, ownedToPage: 8 }).filter((b) => b.kind === 'paragraph')
    for (const block of blocks) {
      const first = block.ranges[0]
      const slice = raw.get(first.pageIndex)!.slice(first.start, first.end).replace(/\s+/g, '')
      // o texto bruto da primeira faixa começa igual ao bloco (ignorando espaços/quebras)
      expect(slice.startsWith(block.text.replace(/\s+/g, '').slice(0, 12))).toBe(true)
    }
  })
})
