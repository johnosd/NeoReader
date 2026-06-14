import { describe, expect, it } from 'vitest'
import {
  normalizeAppLocalePreference,
  resolveAppLocale,
} from '@/i18n'

describe('i18n locale helpers', () => {
  it('normaliza preferencias invalidas para automatico', () => {
    expect(normalizeAppLocalePreference('pt-BR')).toBe('pt-BR')
    expect(normalizeAppLocalePreference('en')).toBe('en')
    expect(normalizeAppLocalePreference('es')).toBe('es')
    expect(normalizeAppLocalePreference('fr')).toBe('auto')
    expect(normalizeAppLocalePreference(null)).toBe('auto')
  })

  it('resolve auto a partir do idioma do dispositivo', () => {
    expect(resolveAppLocale('auto', 'pt-BR')).toBe('pt-BR')
    expect(resolveAppLocale('auto', 'pt-PT')).toBe('pt-BR')
    expect(resolveAppLocale('auto', 'es-MX')).toBe('es')
    expect(resolveAppLocale('auto', 'en-US')).toBe('en')
    expect(resolveAppLocale('auto', 'fr-FR')).toBe('en')
  })

  it('prioriza preferencia explicita sobre idioma do dispositivo', () => {
    expect(resolveAppLocale('es', 'pt-BR')).toBe('es')
    expect(resolveAppLocale('pt-BR', 'en-US')).toBe('pt-BR')
  })
})
