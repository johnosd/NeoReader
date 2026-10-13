import { describe, expect, it } from 'vitest'
import {
  ATTEMPTS_PER_ROUND,
  BASE_LOCK_MS,
  INITIAL_LOCKOUT_STATE,
  MAX_LOCK_MS,
  getRemainingLockMs,
  registerFailure,
  registerSuccess,
  type LockoutState,
} from '@/utils/pinLockout'

const NOW = 1_000_000

function failTimes(state: LockoutState, times: number, now = NOW): LockoutState {
  let current = state
  for (let i = 0; i < times; i++) current = registerFailure(current, now)
  return current
}

describe('pinLockout', () => {
  it('4 erros seguidos não travam', () => {
    const state = failTimes(INITIAL_LOCKOUT_STATE, ATTEMPTS_PER_ROUND - 1)
    expect(state.failedAttempts).toBe(4)
    expect(getRemainingLockMs(state, NOW)).toBe(0)
  })

  it('o 5º erro trava por 30 s e zera a contagem da rodada', () => {
    const state = failTimes(INITIAL_LOCKOUT_STATE, ATTEMPTS_PER_ROUND)
    expect(state.failedAttempts).toBe(0)
    expect(state.lockRound).toBe(1)
    expect(getRemainingLockMs(state, NOW)).toBe(BASE_LOCK_MS)
  })

  it('a espera dobra a cada nova rodada: 30 s, 60 s, 120 s', () => {
    let state = failTimes(INITIAL_LOCKOUT_STATE, ATTEMPTS_PER_ROUND, NOW)
    const afterFirst = NOW + BASE_LOCK_MS
    state = failTimes(state, ATTEMPTS_PER_ROUND, afterFirst)
    expect(getRemainingLockMs(state, afterFirst)).toBe(BASE_LOCK_MS * 2)

    const afterSecond = afterFirst + BASE_LOCK_MS * 2
    state = failTimes(state, ATTEMPTS_PER_ROUND, afterSecond)
    expect(getRemainingLockMs(state, afterSecond)).toBe(BASE_LOCK_MS * 4)
  })

  it('respeita o teto de 1 hora', () => {
    let state: LockoutState = { failedAttempts: 0, lockRound: 50, lockedUntil: 0 }
    state = failTimes(state, ATTEMPTS_PER_ROUND, NOW)
    expect(getRemainingLockMs(state, NOW)).toBe(MAX_LOCK_MS)
  })

  it('tentativa durante a espera não altera o estado', () => {
    const locked = failTimes(INITIAL_LOCKOUT_STATE, ATTEMPTS_PER_ROUND, NOW)
    const during = registerFailure(locked, NOW + 1_000)
    expect(during).toBe(locked)
  })

  it('acerto zera tudo', () => {
    const locked = failTimes(INITIAL_LOCKOUT_STATE, ATTEMPTS_PER_ROUND, NOW)
    expect(registerSuccess()).toEqual(INITIAL_LOCKOUT_STATE)
    expect(locked.lockRound).toBe(1)
  })

  it('getRemainingLockMs nunca é negativo', () => {
    const state: LockoutState = { failedAttempts: 0, lockRound: 1, lockedUntil: NOW }
    expect(getRemainingLockMs(state, NOW + 999_999)).toBe(0)
  })
})
