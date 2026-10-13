// Registro único (singleton) do PIN de proteção de livros — feature 024.
// Vive no mesmo banco Dexie da conta (um banco por uid), então o PIN
// acompanha os livros que ele protege. Nunca guarda o PIN em texto: só o hash.
export const BOOK_PROTECTION_ID = 1

export interface BookProtectionRecord {
  id: typeof BOOK_PROTECTION_ID
  pinHash: string          // PBKDF2-SHA-256, base64
  salt: string             // 16 bytes aleatórios, base64
  iterations: number       // iterações usadas neste hash (permite subir o custo depois)
  failedAttempts: number   // erros seguidos na rodada atual (0..4)
  lockRound: number        // esperas já disparadas desde o último acerto
  lockedUntil: number      // epoch ms em que novas tentativas voltam a valer; 0 = sem espera
  createdAt: Date
  updatedAt: Date
}
