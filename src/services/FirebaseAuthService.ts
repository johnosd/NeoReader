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

// Solicita novo token Drive ao Google. Mostra seletor de conta no Android —
// chamar apenas em resposta a ação explícita do usuário (ex: botão em Settings).
// Não chamar no startup para evitar seletor de conta inesperado ao abrir o app.
export async function refreshDriveToken(): Promise<void> {
  try {
    const result = await FirebaseAuthentication.signInWithGoogle({
      scopes: [GOOGLE_DRIVE_APPDATA_SCOPE],
    })
    rememberGoogleDriveAccessToken(result.credential?.accessToken)
  } catch {
    // Usuário cancelou ou falha silenciosa.
  }
}

export function observeFirebaseAuth(callback: (user: AuthUser | null) => void): Unsubscribe {
  if (isNativeRuntime()) {
    let active = true

    void FirebaseAuthentication.getCurrentUser().then((result) => {
      if (!active) return
      if (result.user) {
        // Sessao restaurada sem login interativo — Drive token nao existe em memoria.
        // Reautentica em background para reobter o token sem bloquear o fluxo de auth.
        void silentlyRefreshDriveToken()
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
    })
    rememberGoogleDriveAccessToken(result.credential?.accessToken)
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
