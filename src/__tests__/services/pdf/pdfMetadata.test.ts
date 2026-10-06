import { describe, expect, it } from 'vitest'

import { pdfMetadataAuthor, pdfMetadataTitle } from '@/services/pdf/pdfMetadata'

describe('pdfMetadataTitle (R-026)', () => {
  it('mantém títulos reais, inclusive com acento e array', () => {
    expect(pdfMetadataTitle('O milagre da manhã')).toBe('O milagre da manhã')
    expect(pdfMetadataTitle('Web Scraping com Python')).toBe('Web Scraping com Python')
    expect(pdfMetadataTitle(['Vida', 'Organizada'])).toBe('Vida Organizada')
  })

  it('recusa título deixado pelo programa que exportou', () => {
    expect(pdfMetadataTitle('(Microsoft Word - Fl\\341via Muniz - Noturnos _Rev_)')).toBeNull()
    expect(pdfMetadataTitle('Microsoft Word - capitulo1.doc')).toBeNull()
    expect(pdfMetadataTitle('Microsoft PowerPoint - aula 3')).toBeNull()
    expect(pdfMetadataTitle('livro final revisado.docx')).toBeNull()
    expect(pdfMetadataTitle('main.tex')).toBeNull()
    expect(pdfMetadataTitle('Fl\\341via')).toBeNull() // escape octal cru
  })

  it('recusa placeholders e títulos sem letras', () => {
    expect(pdfMetadataTitle('Untitled')).toBeNull()
    expect(pdfMetadataTitle('Sem título')).toBeNull()
    expect(pdfMetadataTitle('Documento1')).toBeNull()
    expect(pdfMetadataTitle('1')).toBeNull()
    expect(pdfMetadataTitle('---')).toBeNull()
    expect(pdfMetadataTitle('   ')).toBeNull()
    expect(pdfMetadataTitle(42)).toBeNull()
  })
})

describe('pdfMetadataAuthor (R-026)', () => {
  it('mantém autores reais (array vira lista)', () => {
    expect(pdfMetadataAuthor('Hal Elrod')).toBe('Hal Elrod')
    expect(pdfMetadataAuthor(['Mitchell, Ryan'])).toBe('Mitchell, Ryan')
  })

  it('recusa autor de 1 letra, conta do sistema e escape cru', () => {
    expect(pdfMetadataAuthor('A')).toBeNull()
    expect(pdfMetadataAuthor('Administrator')).toBeNull()
    expect(pdfMetadataAuthor('user')).toBeNull()
    expect(pdfMetadataAuthor('Fl\\341via')).toBeNull()
    expect(pdfMetadataAuthor(undefined)).toBeNull()
  })
})
