import { describe, expect, it } from 'vitest'
import { messages, ptBRMessages, translateMessage } from '@/i18n'

describe('i18n messages', () => {
  it('mantem os catalogos com o mesmo conjunto de chaves', () => {
    const baseKeys = Object.keys(ptBRMessages).sort()

    for (const catalog of Object.values(messages)) {
      expect(Object.keys(catalog).sort()).toEqual(baseKeys)
    }
  })

  // Pluralização do projeto é por par de chaves `.one`/`.many` (ex: library.bookCount.*). Guarda
  // contra o erro típico: o singular herdar `{count}` (vira "1 livros") ou o plural esquecê-lo.
  it('pares .one/.many de seleção e ações em lote: singular sem {count}, plural com {count}', () => {
    const pairedBases = Object.keys(ptBRMessages)
      .filter((key) => /^(bulkActions|library\.selection|bookLock\.pad\.status)\./.test(key) && key.endsWith('.one'))
      .map((key) => key.slice(0, -'.one'.length))
    expect(pairedBases.length).toBeGreaterThan(0)

    for (const [locale, catalog] of Object.entries(messages)) {
      for (const base of pairedBases) {
        const one = (catalog as Record<string, string>)[`${base}.one`]
        const many = (catalog as Record<string, string>)[`${base}.many`]
        expect(many, `${locale}: ${base}.many ausente`).toBeTruthy()
        expect(one, `${locale}: ${base}.one não deveria ter {count}`).not.toContain('{count}')
        expect(many, `${locale}: ${base}.many deveria ter {count}`).toContain('{count}')
      }
    }
  })

  it('traduz chaves e preserva template sem parametros ausentes', () => {
    expect(translateMessage('en', 'settings.appLanguage.title')).toBe('App language')
    expect(
      translateMessage('pt-BR', 'settings.appLanguage.sectionDescription', { value: 'x' }),
    ).toBe('Idioma usado nos menus e mensagens do app.')
  })
})
