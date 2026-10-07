import { describe, expect, it } from 'vitest'
import { usableAuthorHint } from '@/utils/placeholderAuthor'

describe('usableAuthorHint', () => {
  it('descarta o texto de reserva gravado quando o livro não tem autor', () => {
    expect(usableAuthorHint('Autor desconhecido')).toBeNull()
    expect(usableAuthorHint('  unknown AUTHOR ')).toBeNull()
    expect(usableAuthorHint('Autor desconocido')).toBeNull()
  })

  it('mantém autores reais (aparados) e trata vazio como ausente', () => {
    expect(usableAuthorHint(' Machado de Assis ')).toBe('Machado de Assis')
    expect(usableAuthorHint('')).toBeNull()
    expect(usableAuthorHint(null)).toBeNull()
    expect(usableAuthorHint(undefined)).toBeNull()
  })
})
