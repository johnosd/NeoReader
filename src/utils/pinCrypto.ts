// Formato e hash do PIN de proteção de livros (feature 024).
//
// PBKDF2-SHA-256 via WebCrypto: não exige dependência nova (crypto.subtle já é
// usado no import para o hash do arquivo). ATENÇÃO ao limite: o PIN tem no máximo
// ~1,1 milhão de combinações, então quem extrair o banco consegue varrer o espaço
// offline mesmo com PBKDF2. A proteção é contra uso casual do app, não contra
// análise forense — não "consertar" isso só subindo as iterações.

const PIN_PATTERN = /^\d{4,6}$/
export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6
export const PIN_HASH_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BITS = 256

export interface PinHash {
  pinHash: string
  salt: string
  iterations: number
}

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS)
  return toBase64(new Uint8Array(bits))
}

// Compara em tempo constante (não para no primeiro byte diferente).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hashPin(pin: string, iterations = PIN_HASH_ITERATIONS): Promise<PinHash> {
  if (!isValidPinFormat(pin)) throw new Error('PIN inválido: use de 4 a 6 dígitos.')
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { pinHash: await derive(pin, salt, iterations), salt: toBase64(salt), iterations }
}

export async function verifyPin(pin: string, record: PinHash): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false
  const candidate = await derive(pin, fromBase64(record.salt), record.iterations)
  return timingSafeEqual(candidate, record.pinHash)
}
