import { describe, expect, it } from 'vitest'

import { classifyIsbnLine, findIsbns, findIsbnsWithContext, isValidIsbn10, isValidIsbn13 } from '@/utils/isbn'

describe('classifyIsbnLine / findIsbnsWithContext (R-025)', () => {
  it('linha do original de uma tradução é outra obra', () => {
    expect(classifyIsbnLine('ISBN 9781491985571 © 2018 Ryan Mitchell. This translation is published and sold by permission'))
      .toBe('other-work')
    expect(classifyIsbnLine('ISBN 9781491985571 © 2018 Ryan Mitchell. Esta tradução é publicada e vendida com a permissão'))
      .toBe('other-work')
    expect(classifyIsbnLine('Título original: Web Scraping with Python — ISBN 978-1-4919-8557-1')).toBe('other-work')
  })

  it('histórico de edições', () => {
    expect(classifyIsbnLine('Agosto/2015 Primeira edição (ISBN: 978-85-7522-447-2)')).toBe('edition-history')
    expect(classifyIsbnLine('Previous edition ISBN 978-0-306-40615-7')).toBe('edition-history')
  })

  it('linha comum (inclusive com ©) é limpa', () => {
    expect(classifyIsbnLine('ISBN: 978-85-7522-734-3')).toBe('clean')
    expect(classifyIsbnLine('Copyright © 2026 NeoReader test corpus. ISBN 978-0-306-40615-7.')).toBe('clean')
  })

  it('classifica cada ISBN pela própria linha, sem repetir', () => {
    const text = [
      'ISBN 9781491985571 © 2018 Ryan Mitchell. This translation is published and sold by permission',
      'ISBN: 978-85-7522-734-3',
      'Agosto/2015 Primeira edição (ISBN: 978-85-7522-447-2)',
      'ISBN: 978-85-7522-734-3',
    ].join('\n')
    expect(findIsbnsWithContext(text)).toEqual([
      { isbn: '9781491985571', context: 'other-work' },
      { isbn: '9788575227343', context: 'clean' },
      { isbn: '9788575224472', context: 'edition-history' },
    ])
  })
})

describe('validação de dígito verificador', () => {
  it('ISBN-13', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true)
    expect(isValidIsbn13('9780306406158')).toBe(false)
    expect(isValidIsbn13('978030640615')).toBe(false) // 12 dígitos
    expect(isValidIsbn13('978030640615X')).toBe(false)
  })

  it('ISBN-10, inclusive com X', () => {
    expect(isValidIsbn10('0306406152')).toBe(true)
    expect(isValidIsbn10('080442957X')).toBe(true)
    expect(isValidIsbn10('0306406153')).toBe(false)
    expect(isValidIsbn10('030640615')).toBe(false)
  })
})

describe('findIsbns', () => {
  it('acha ISBN-13 com hífens e prefixo "ISBN"', () => {
    expect(findIsbns('Copyright © 2026. ISBN 978-0-306-40615-7. Todos os direitos reservados.')).toEqual(['9780306406157'])
  })

  it('acha ISBN-13 com espaços, com "ISBN-13:" e sem prefixo', () => {
    expect(findIsbns('ISBN-13: 978 0 306 40615 7')).toEqual(['9780306406157'])
    expect(findIsbns('Edição impressa 978-0-306-40615-7 (brochura)')).toEqual(['9780306406157'])
  })

  it('acha ISBN-10 só quando vem depois de "ISBN"', () => {
    expect(findIsbns('ISBN-10: 0-306-40615-2')).toEqual(['0306406152'])
    expect(findIsbns('ISBN 080442957x')).toEqual(['080442957X'])
    expect(findIsbns('Telefone 0306406152 para contato')).toEqual([])
  })

  it('rejeita dígito verificador inválido', () => {
    expect(findIsbns('ISBN 978-0-306-40615-8')).toEqual([])
    expect(findIsbns('ISBN 0-306-40615-3')).toEqual([])
  })

  it('13 dígitos válidos mas sem prefixo 978/979 não contam', () => {
    // 1234567890128 fecha o dígito verificador, mas não é um ISBN
    expect(isValidIsbn13('1234567890128')).toBe(true)
    expect(findIsbns('Protocolo 1234567890128')).toEqual([])
  })

  it('vários ISBNs → ordem de ocorrência, sem repetir', () => {
    const text = 'Brochura ISBN 978-0-306-40615-7. E-book ISBN 978-85-7522-123-5? Impresso ISBN 978-0-306-40615-7.'
    expect(isValidIsbn13('9788575221235')).toBe(true)
    expect(findIsbns(text)).toEqual(['9780306406157', '9788575221235'])
  })

  it('não engole números vizinhos', () => {
    expect(findIsbns('ISBN 978-0-306-40615-7 12345 páginas')).toEqual(['9780306406157'])
    expect(findIsbns('Página 12 ISBN 978-0-306-40615-7')).toEqual(['9780306406157'])
  })

  it('texto sem ISBN → lista vazia', () => {
    expect(findIsbns('')).toEqual([])
    expect(findIsbns('Capítulo 1: Começos. Página 23 de 400.')).toEqual([])
  })

  it('acha o ISBN na página de copyright do corpus sintético', () => {
    // O gerador do corpus (scripts/pdf-corpus) imprime "ISBN 978-0-306-40615-7" na página 2.
    expect(findIsbns('Copyright © 2026 NeoReader test corpus. ISBN 978-0-306-40615-7.')).toEqual(['9780306406157'])
  })
})
