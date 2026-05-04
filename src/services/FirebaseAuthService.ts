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

class FirebaseAuthConfigError extends Error {
  constructor() {
    super(`Firebase Auth nao configurado. Preencha ${REQUIRED_CONFIG_KEYS.join(', ')} no .env.`)
    this.name = 'FirebaseAuthConfigError'
  }
}

let authInstance: Auth | null | undefined
let persistenceReady: Promise<void> | null = null

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

export function observeFirebaseAuth(callback: (user: AuthUser | null) => void): Unsubscribe {
  if (isNativeRuntime()) {
    let active = true

    void FirebaseAuthentication.getCurrentUser().then((result) => {
      if (!active) return
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
  await getRedirectResult(auth)
}

export async function signInWithGoogleRedirect(): Promise<AuthUser | null> {
  if (isNativeRuntime()) {
    const result = await FirebaseAuthentication.signInWithGoogle()
    if (result.user) return toNativeAuthUser(result.user)

    const currentUser = await FirebaseAuthentication.getCurrentUser()
    return currentUser.user ? toNativeAuthUser(currentUser.user) : null
  }

  const auth = ensureConfiguredAuth()
  await ensureLocalPersistence(auth)

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  if (shouldUsePopupSignIn()) {
    const result = await signInWithPopup(auth, provider)
    return result.user ? toAuthUser(result.user) : null
  }

  await signInWithRedirect(auth, provider)
  return null
}

export async function signOut() {
  if (isNativeRuntime()) {
    await FirebaseAuthentication.signOut()
    return
  }

  const auth = ensureConfiguredAuth()
  await firebaseSignOut(auth)
}
