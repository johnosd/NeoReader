// Máquina de estados da espera por PIN errado (feature 024, D-08). Funções puras:
// o relógio entra por parâmetro, então dá para testar sem timers falsos.

export const ATTEMPTS_PER_ROUND = 5
export const BASE_LOCK_MS = 30_000
// Teto: sem ele a espera cresceria sem limite prático depois de poucas rodadas.
export const MAX_LOCK_MS = 3_600_000

export interface LockoutState {
  failedAttempts: number // erros seguidos na rodada atual
  lockRound: number      // esperas já disparadas desde o último acerto
  lockedUntil: number    // epoch ms; 0 = sem espera
}

export const INITIAL_LOCKOUT_STATE: LockoutState = { failedAttempts: 0, lockRound: 0, lockedUntil: 0 }

export function getRemainingLockMs(state: LockoutState, now: number): number {
  return Math.max(0, state.lockedUntil - now)
}

// Durante a espera a tentativa nem é verificada (quem chama checa antes), então
// aqui o estado só é preservado.
export function registerFailure(state: LockoutState, now: number): LockoutState {
  if (getRemainingLockMs(state, now) > 0) return state

  const failedAttempts = state.failedAttempts + 1
  if (failedAttempts < ATTEMPTS_PER_ROUND) return { ...state, failedAttempts }

  // 30 s, 60 s, 120 s... (2 ** lockRound sobe sem estourar: Infinity também cai no teto).
  const duration = Math.min(BASE_LOCK_MS * 2 ** state.lockRound, MAX_LOCK_MS)
  return { failedAttempts: 0, lockRound: state.lockRound + 1, lockedUntil: now + duration }
}

export function registerSuccess(): LockoutState {
  return { ...INITIAL_LOCKOUT_STATE }
}
