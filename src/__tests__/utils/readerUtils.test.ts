import { describe, it, expect } from 'vitest'
import { getSentenceAt, escapeHtml } from '@/utils/readerUtils'

describe('getSentenceAt', () => {
  it('retorna o texto inteiro quando não há delimitadores de frase', () => {
    expect(getSentenceAt('Hello world', 5)).toBe('Hello world')
  })

  it('retorna o texto inteiro quando há apenas uma frase', () => {
    expect(getSentenceAt('Only one sentence.', 5)).toBe('Only one sentence.')
  })

  it('retorna a primeira frase para offset no início', () => {
    const text = 'First sentence. Second sentence. Third one.'
    expect(getSentenceAt(text, 0)).toBe('First sentence.')
  })

  it('retorna a segunda frase para offset no meio dela', () => {
    const text = 'First sentence. Second sentence. Third one.'
    // "First sentence. " tem 17 chars, offset 20 cai em "Second sentence."
    expect(getSentenceAt(text, 20)).toBe('Second sentence.')
  })

  it('retorna a última frase para offset no final', () => {
    const text = 'First sentence. Second sentence. Third one.'
    expect(getSentenceAt(text, 40)).toBe('Third one.')
  })

  it('retorna a última frase para offset além do fim', () => {
    const text = 'First. Second.'
    expect(getSentenceAt(text, 9999)).toBe('Second.')
  })

  it('lida com pontuação de exclamação e interrogação', () => {
    const text = 'What? Really! Indeed.'
    expect(getSentenceAt(text, 0)).toBe('What?')
    expect(getSentenceAt(text, 7)).toBe('Really!')
  })
})

describe('escapeHtml', () => {
  it('escapa & < > " e apostrofo', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
    expect(escapeHtml('"quote"')).toBe('&quot;quote&quot;')
    expect(escapeHtml("it's")).toBe('it&#039;s')
  })

  it('não altera texto sem caracteres especiais', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})
