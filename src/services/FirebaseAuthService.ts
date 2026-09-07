import { FirebaseAuthentication, type User as NativeFirebaseUser } from '@capacitor-firebase/authentication'
import { Capacitor } from '@capacitor/core'
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth'
import type { AuthUser } from '../types/auth'
import { logWarn } from './DiagnosticsLogger'

const REQUIRED_CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const
export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

class FirebaseAuthConfigError extends Error {
  constructor() {
    super(`Firebase Auth nao configurado. Preencha ${REQUIRED_CONFIG_KEYS.join(', ')} no .env.`)
    this.name = 'FirebaseAuthConfigError'
  }
}

let authInstance: Auth | null | undefined
let persistenceReady: Promise<void> | null = null

// Token Drive salvo no localStorage para sobreviver cold starts (expira em ~55min).
// Tokens Google OAuth duram 1h; guardamos com margem de 5min para evitar usar token prestes a expirar.
const DRIVE_TOKEN_KEY = 'neoreader:drive-access-token'
const DRIVE_TOKEN_EXPIRY_KEY = 'neoreader:drive-token-expiry'
const DRIVE_TOKEN_TTL_MS = 55 * 60 * 1000

// Renovar o token do Drive SEMPRE abre UI no Android (ver refreshDriveToken).
// Chamadas que não partem de uma ação explícita do usuário passam por este
// cooldown, para que nenhuma regressão futura volte a transformar sync de
// background numa enxurrada de telas de consentimento.
const DRIVE_REAUTH_COOLDOWN_KEY = 'neoreader:drive-reauth-cooldown-until'
const DRIVE_REAUTH_COOLDOWN_MS = 30 * 60 * 1000
const DRIVE_REAUTH_MAX_ATTEMPTS_PER_SESSION = 3

function loadPersistedDriveToken(): string | null {
  try {
    const token = localStorage.getItem(DRIVE_TOKEN_KEY)
    const expiry = parseInt(localStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) ?? '0', 10)
    return token && Date.now() < expiry ? token : null
  } catch {
    return null
  }
}

let googleDriveAccessToken: string | null = loadPersistedDriveToken()

function isNativeRuntime() {
  return Capacitor.isNativePlatform()
}

function shouldUsePopupSignIn() {
  if (typeof window === 'undefined') return false

  const devHostnames = new Set(['localhost', '127.0.0.1', '::1'])
  return import.meta.env.DEV || devHostnames.has(window.location.hostname)
}

function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function getFirebaseConfig(): FirebaseOptions | null {
  const apiKey = cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY)
  const authDomain = cleanEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)
  const projectId = cleanEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID)
  const appId = cleanEnvValue(import.meta.env.VITE_FIREBASE_APP_ID)

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: cleanEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    storageBucket: cleanEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  }
}

function getConfiguredAuth(): Auth | null {
  if (authInstance !== undefined) return authInstance

  const config = getFirebaseConfig()
  if (!config) {
    authInstance = null
    return authInstance
  }

  const app = getApps()[0] ?? initializeApp(config)
  authInstance = getAuth(app)
  return authInstance
}

function ensureConfiguredAuth(): Auth {
  const auth = getConfiguredAuth()
  if (!auth) throw new FirebaseAuthConfigError()
  return auth
}

function rememberGoogleDriveAccessToken(accessToken?: string | null) {
  const token = accessToken?.trim() || null
  googleDriveAccessToken = token
  try {
    if (token) {
      localStorage.setItem(DRIVE_TOKEN_KEY, token)
      localStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, String(Date.now() + DRIVE_TOKEN_TTL_MS))
    } else {
      localStorage.removeItem(DRIVE_TOKEN_KEY)
      localStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY)
    }
  } catch { /* localStorage indisponível */ }
}

export function getGoogleDriveAccessToken(): string | null {
  return googleDriveAccessToken
}

function readDriveReauthCooldownUntil(): number {
  try {
    return parseInt(localStorage.getItem(DRIVE_REAUTH_COOLDOWN_KEY) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function startDriveReauthCooldown() {
  try {
    localStorage.setItem(
      DRIVE_REAUTH_COOLDOWN_KEY,
      String(Date.now() + DRIVE_REAUTH_COOLDOWN_MS),
    )
  } catch { /* localStorage indisponível */ }
}

function clearDriveReauthCooldown() {
  try {
    localStorage.removeItem(DRIVE_REAUTH_COOLDOWN_KEY)
  } catch { /* localStorage indisponível */ }
}

async function ensureLocalPersistence(auth: Auth) {
  persistenceReady ??= setPersistence(auth, browserLocalPersistence)
  await persistenceReady
}

export function isFirebaseAuthConfigured() {
  return Boolean(getFirebaseConfig())
}

export function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  }
}

function toNativeAuthUser(user: NativeFirebaseUser): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoUrl,
  }
}

export type DriveTokenRefreshOutcome =
  | 'refreshed' // token novo em mãos
  | 'no-token' // provedor respondeu sem accessToken; mantivemos o token antigo
  | 'rate-limited' // bloqueado por cooldown ou teto de tentativas da sessão
  | 'failed' // usuário cancelou ou o provedor falhou

let inFlightDriveTokenRefresh: Promise<DriveTokenRefreshOutcome> | null = null
let driveReauthAttemptsThisSession = 0

// Solicita novo token Drive ao Google. ATENÇÃO: isto SEMPRE abre UI no
// Android — folha de seleção de conta + tela de consentimento OAuth. Não
// existe caminho silencioso: o plugin monta a autorização com
// `requestOfflineAccess(clientId, /* forceCodeForRefreshToken */ true)`
// hardcoded, e o Google documenta que, com esse flag, toda autorização
// depois da primeira exige consentimento do usuário de novo.
// Por isso esta função só deve ser chamada a partir de uma ação explícita do
// usuário (`userInitiated: true`) — nunca de sync em background.
export async function refreshDriveToken(
  options: { userInitiated: boolean },
): Promise<DriveTokenRefreshOutcome> {
  // Coalesce chamadas concorrentes (ex: bookmark, progresso e vocabulário
  // falhando quase ao mesmo tempo) numa única tentativa de renovação, em vez
  // de disparar 3 chamadas simultâneas ao Google.
  if (inFlightDriveTokenRefresh) return inFlightDriveTokenRefresh

  if (!options.userInitiated) {
    if (Date.now() < readDriveReauthCooldownUntil()) return 'rate-limited'
    if (driveReauthAttemptsThisSession >= DRIVE_REAUTH_MAX_ATTEMPTS_PER_SESSION) {
      return 'rate-limited'
    }
  }

  inFlightDriveTokenRefresh = (async () => {
    driveReauthAttemptsThisSession += 1
    try {
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: [GOOGLE_DRIVE_APPDATA_SCOPE],
        // Credential Manager é inutilizável aqui: além de forçar
        // re-consentimento, ele resolve com accessToken nulo quando o escopo
        // já está concedido. O caminho legado pede o auth code sem
        // forceCodeForRefreshToken e devolve accessToken de verdade.
        useCredentialManager: false,
      })
      const accessToken = result.credential?.accessToken?.trim()
      if (!accessToken) {
        // Nunca apagar um token válido por causa de uma resposta sem token —
        // apagar é o que transformava isso num loop de novas solicitações.
        startDriveReauthCooldown()
        logWarn('drive.token.refresh.no-token', { status: 'failure' })
        return 'no-token'
      }
      rememberGoogleDriveAccessToken(accessToken)
      driveReauthAttemptsThisSession = 0
      clearDriveReauthCooldown()
      return 'refreshed'
    } catch (error) {
      // Cancelamento do usuário cai aqui. Registrar em vez de engolir, e
      // segurar tentativas automáticas por um tempo.
      startDriveReauthCooldown()
      logWarn('drive.token.refresh.failure', { status: 'failure', error })
      return 'failed'
    } finally {
      inFlightDriveTokenRefresh = null
    }
  })()

  return inFlightDriveTokenRefresh
}

export function observeFirebaseAuth(callback: (user: AuthUser | null) => void): Unsubscribe {
  if (isNativeRuntime()) {
    let active = true

    void FirebaseAuthentication.getCurrentUser().then((result) => {
      if (!active) return
      if (result.user) {
        // Drive token nao persiste — usuario precisa re-autenticar manualmente via Settings.
      }
      callback(result.user ? toNativeAuthUser(result.user) : null)
    }).catch(() => {
      if (!active) return
      callback(null)
    })

    let removeNativeListener: (() => void) | null = null
    void FirebaseAuthentication.addListener('authStateChange', (event) => {
      callback(event.user ? toNativeAuthUser(event.user) : null)
    }).then((handle) => {
      removeNativeListener = () => { void handle.remove() }
      if (!active) removeNativeListener()
    })

    return () => {
      active = false
      removeNativeListener?.()
    }
  }

  const auth = getConfiguredAuth()
  if (!auth) {
    callback(null)
    return () => {}
  }

  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAuthUser(user) : null)
  })
}

export async function consumeGoogleRedirectResult() {
  if (isNativeRuntime()) return

  const auth = getConfiguredAuth()
  if (!auth) return

  await ensureLocalPersistence(auth)
  const result = await getRedirectResult(auth)
  if (result) {
    rememberGoogleDriveAccessToken(
      GoogleAuthProvider.credentialFromResult(result)?.accessToken,
    )
  }
}

export async function signInWithGoogleRedirect(): Promise<AuthUser | null> {
  if (isNativeRuntime()) {
    const result = await FirebaseAuthentication.signInWithGoogle({
      scopes: [GOOGLE_DRIVE_APPDATA_SCOPE],
      // Mesmo motivo de refreshDriveToken: só o caminho legado devolve um
      // accessToken utilizável para o Drive.
      useCredentialManager: false,
    })
    // Só grava se veio token — não apagar o que já estava salvo.
    const accessToken = result.credential?.accessToken?.trim()
    if (accessToken) rememberGoogleDriveAccessToken(accessToken)
    if (result.user) return toNativeAuthUser(result.user)

    const currentUser = await FirebaseAuthentication.getCurrentUser()
    return currentUser.user ? toNativeAuthUser(currentUser.user) : null
  }

  const auth = ensureConfiguredAuth()
  await ensureLocalPersistence(auth)

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  provider.addScope(GOOGLE_DRIVE_APPDATA_SCOPE)

  if (shouldUsePopupSignIn()) {
    const result = await signInWithPopup(auth, provider)
    rememberGoogleDriveAccessToken(
      GoogleAuthProvider.credentialFromResult(result)?.accessToken,
    )
    return result.user ? toAuthUser(result.user) : null
  }

  await signInWithRedirect(auth, provider)
  return null
}

export async function signOut() {
  rememberGoogleDriveAccessToken(null)

  if (isNativeRuntime()) {
    await FirebaseAuthentication.signOut()
    return
  }

  const auth = ensureConfiguredAuth()
  await firebaseSignOut(auth)
}
