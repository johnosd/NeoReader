import { describe, expect, it } from 'vitest'
import { hashPin, isValidPinFormat, verifyPin } from '@/utils/pinCrypto'

describe('pinCrypto', () => {
  it.each(['1234', '12345', '123456', '0000'])('aceita o formato %s', (pin) => {
    expect(isValidPinFormat(pin)).toBe(true)
  })

  it.each(['', '123', '1234567', 'abcd', '12 34', '12a4', '１２３４'])('rejeita o formato "%s"', (pin) => {
    expect(isValidPinFormat(pin)).toBe(false)
  })

  it('hash e verificação fazem ida e volta', async () => {
    const record = await hashPin('4821')
    expect(record.iterations).toBeGreaterThan(0)
    expect(record.pinHash).not.toContain('4821')
    expect(await verifyPin('4821', record)).toBe(true)
  })

  it('PIN errado falha', async () => {
    const record = await hashPin('4821')
    expect(await verifyPin('4822', record)).toBe(false)
    expect(await verifyPin('abcd', record)).toBe(false)
  })

  it('o mesmo PIN com salts diferentes gera hashes diferentes', async () => {
    const a = await hashPin('4821')
    const b = await hashPin('4821')
    expect(a.salt).not.toBe(b.salt)
    expect(a.pinHash).not.toBe(b.pinHash)
  })

  it('recusa hashear um PIN com formato inválido', async () => {
    await expect(hashPin('12')).rejects.toThrow()
  })
})
