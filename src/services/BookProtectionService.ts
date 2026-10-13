import { Capacitor } from '@capacitor/core'
import { clearBookProtection, getBookProtection, saveBookProtection } from '../db/bookProtection'
import { clearAllBooksProtected } from '../db/books'
import { db } from '../db/database'
import { BOOK_PROTECTION_ID, type BookProtectionRecord } from '../types/bookProtection'
import { DeviceCredentialService } from './DeviceCredentialService'
import { hashPin, isValidPinFormat, verifyPin } from '../utils/pinCrypto'
import {
  ATTEMPTS_PER_ROUND,
  INITIAL_LOCKOUT_STATE,
  getRemainingLockMs,
  registerFailure,
  registerSuccess,
  type LockoutState,
} from '../utils/pinLockout'

export type PinVerifyResult =
  | { ok: true }
  // `lockedUntil` > agora = em espera (a tentativa nem foi verificada ou foi o 5º erro).
  | { ok: false; attemptsLeft: number; lockedUntil: number }

export type OwnershipResult =
  | 'confirmed'
  | 'cancelled'
  // Android sem bloqueio de tela: não há como confirmar, a UI pede confirmação explícita.
  | 'no-device-lock'
  | 'different-account'
  | 'offline'
  | 'failed'

export interface LockoutStatus {
  remainingMs: number
  lockedUntil: number
}

function lockoutOf(record: BookProtectionRecord): LockoutState {
  return { failedAttempts: record.failedAttempts, lockRound: record.lockRound, lockedUntil: record.lockedUntil }
}

// Regras do PIN de proteção de livros (feature 024): hash, espera por erros e
// desativação. Nunca recebe nem devolve o PIN em texto além do argumento, e não
// registra nada em log (FR-012).
export class BookProtectionService {
  static async hasPin(): Promise<boolean> {
    return (await getBookProtection()) !== undefined
  }

  static async getLockoutStatus(now = Date.now()): Promise<LockoutStatus> {
    const record = await getBookProtection()
    if (!record) return { remainingMs: 0, lockedUntil: 0 }
    return { remainingMs: getRemainingLockMs(lockoutOf(record), now), lockedUntil: record.lockedUntil }
  }

  // Cria o PIN (ou substitui, se já existir) e zera a espera.
  static async createPin(pin: string): Promise<void> {
    await this.writePin(pin)
  }

  // "Alterar PIN" e "Esqueci o PIN": mesma gravação, mantém `createdAt` original.
  static async replacePin(pin: string): Promise<void> {
    await this.writePin(pin)
  }

  private static async writePin(pin: string): Promise<void> {
    if (!isValidPinFormat(pin)) throw new Error('PIN inválido: use de 4 a 6 dígitos.')
    const existing = await getBookProtection()
    const now = new Date()
    const hashed = await hashPin(pin)
    await saveBookProtection({
      id: BOOK_PROTECTION_ID,
      ...hashed,
      ...INITIAL_LOCKOUT_STATE,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  static async verify(pin: string, now = Date.now()): Promise<PinVerifyResult> {
    const record = await getBookProtection()
    // Sem registro não há o que verificar (ex.: banco restaurado só em parte). Liberar
    // é o menor dano: o contrário trancaria o usuário fora dos próprios livros.
    if (!record) return { ok: true }

    const state = lockoutOf(record)
    // Durante a espera a tentativa não é nem verificada (SC-004).
    if (getRemainingLockMs(state, now) > 0) {
      return { ok: false, attemptsLeft: 0, lockedUntil: record.lockedUntil }
    }

    if (await verifyPin(pin, record)) {
      await saveBookProtection({ ...record, ...registerSuccess(), updatedAt: new Date() })
      return { ok: true }
    }

    const next = registerFailure(state, now)
    await saveBookProtection({ ...record, ...next, updatedAt: new Date() })
    return {
      ok: false,
      attemptsLeft: next.lockedUntil > now ? 0 : ATTEMPTS_PER_ROUND - next.failedAttempts,
      lockedUntil: next.lockedUntil,
    }
  }

  // "Esqueci o PIN": prova de que quem pede é o dono do aparelho. Android: credencial de
  // bloqueio de tela. Web: senha da conta Google. Nunca troca a sessão do Firebase.
  // Os textos da tela do sistema vêm da UI (o serviço não conhece i18n).
  static async confirmOwnership(labels: { title: string; description: string }): Promise<OwnershipResult> {
    if (Capacitor.isNativePlatform()) {
      const outcome = await DeviceCredentialService.confirm(labels)
      return outcome === 'unsupported' ? 'no-device-lock' : outcome
    }
    // Import dinâmico: FirebaseAuthService registra plugins nativos no carregamento e este
    // serviço entra no bundle de várias telas (via useBookLock); só a web usa este caminho.
    const { reauthenticateGoogleOnWeb } = await import('./FirebaseAuthService')
    return reauthenticateGoogleOnWeb()
  }

  // "Desativar proteção": apaga o PIN e desprotege todos os livros, ou nada.
  static async disable(): Promise<void> {
    await db.transaction('rw', db.books, db.bookProtection, async () => {
      await clearAllBooksProtected()
      await clearBookProtection()
    })
  }
}
