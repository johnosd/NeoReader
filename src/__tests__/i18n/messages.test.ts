import { describe, expect, it } from 'vitest'
import { messages, ptBRMessages, translateMessage } from '@/i18n'

describe('i18n messages', () => {
  it('mantem os catalogos com o mesmo conjunto de chaves', () => {
    const baseKeys = Object.keys(ptBRMessages).sort()

    for (const catalog of Object.values(messages)) {
      expect(Object.keys(catalog).sort()).toEqual(baseKeys)
    }
  })

  it('traduz chaves e preserva template sem parametros ausentes', () => {
    expect(translateMessage('en', 'settings.appLanguage.title')).toBe('App language')
    expect(
      translateMessage('pt-BR', 'settings.appLanguage.sectionDescription', { value: 'x' }),
    ).toBe('Idioma usado nos menus e mensagens do app.')
  })
})
