import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const firebaseUser = {
    uid: 'web-user-1',
    displayName: 'Web User',
    email: 'web@example.com',
    photoURL: 'https://example.com/avatar.png',
  }

  return {
    firebaseUser,
    auth: { app: 'auth' },
    app: { name: 'neoreader' },
    nativeUser: {
      uid: 'native-user-1',
      displayName: 'Native User',
      email: 'native@example.com',
      photoUrl: 'https://example.com/native.png',
    },
    isNativePlatform: vi.fn(() => false),
    getApps: vi.fn(() => []),
    initializeApp: vi.fn(() => ({ name: 'neoreader' })),
    getAuth: vi.fn(() => ({ app: 'auth' })),
    getRedirectResult: vi.fn(() => Promise.resolve(null)),
    onAuthStateChanged: vi.fn(),
    setPersistence: vi.fn(() => Promise.resolve()),
    signInWithPopup: vi.fn(() => Promise.resolve({ user: firebaseUser })),
    signInWithRedirect: vi.fn(() => Promise.resolve()),
    firebaseSignOut: vi.fn(() => Promise.resolve()),
    nativeSignInWithGoogle: vi.fn(),
    nativeGetCurrentUser: vi.fn(),
    nativeSignOut: vi.fn(() => Promise.resolve()),
    nativeAddListener: vi.fn(),
    addScope: vi.fn(),
    credentialFromResult: vi.fn(() => ({ accessToken: 'web-drive-token' })),
    setCustomParameters: vi.fn(),
  }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
}))

vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: mocks.nativeSignInWithGoogle,
    getCurrentUser: mocks.nativeGetCurrentUser,
    signOut: mocks.nativeSignOut,
    addListener: mocks.nativeAddListener,
  },
}))

vi.mock('firebase/app', () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}))

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'browserLocalPersistence',
  getAuth: mocks.getAuth,
  getRedirectResult: mocks.getRedirectResult,
  GoogleAuthProvider: Object.assign(
    vi.fn(function GoogleAuthProvider(this: {
      addScope: typeof mocks.addScope
      setCustomParameters: typeof mocks.setCustomParameters
    }) {
      this.addScope = mocks.addScope
      this.setCustomParameters = mocks.setCustomParameters
    }),
    { credentialFromResult: mocks.credentialFromResult },
  ),
  onAuthStateChanged: mocks.onAuthStateChanged,
  setPersistence: mocks.setPersistence,
  signInWithPopup: mocks.signInWithPopup,
  signInWithRedirect: mocks.signInWithRedirect,
  signOut: mocks.firebaseSignOut,
}))

async function importService() {
  vi.resetModules()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'api-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'neoreader.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'neoreader')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id')

  return import('@/services/FirebaseAuthService')
}

describe('FirebaseAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isNativePlatform.mockReturnValue(false)
    mocks.getApps.mockReturnValue([])
    mocks.initializeApp.mockReturnValue(mocks.app)
    mocks.getAuth.mockReturnValue(mocks.auth)
    mocks.setPersistence.mockResolvedValue(undefined)
    mocks.signInWithPopup.mockResolvedValue({ user: mocks.firebaseUser })
    mocks.signInWithRedirect.mockResolvedValue(undefined)
    mocks.nativeSignInWithGoogle.mockResolvedValue({
      user: mocks.nativeUser,
      credential: { accessToken: 'native-drive-token' },
    })
    mocks.nativeGetCurrentUser.mockResolvedValue({ user: mocks.nativeUser })
    mocks.credentialFromResult.mockReturnValue({ accessToken: 'web-drive-token' })
    vi.unstubAllEnvs()
  })

  it('usa popup no web dev e retorna o usuario autenticado', async () => {
    const {
      GOOGLE_DRIVE_APPDATA_SCOPE,
      getGoogleDriveAccessToken,
      signInWithGoogleRedirect,
    } = await importService()

    await expect(signInWithGoogleRedirect()).resolves.toEqual({
      uid: 'web-user-1',
      displayName: 'Web User',
      email: 'web@example.com',
      photoURL: 'https://example.com/avatar.png',
    })

    expect(mocks.setPersistence).toHaveBeenCalledWith(mocks.auth, 'browserLocalPersistence')
    expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(mocks.addScope).toHaveBeenCalledWith(GOOGLE_DRIVE_APPDATA_SCOPE)
    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1)
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
    expect(getGoogleDriveAccessToken()).toBe('web-drive-token')
  })

  it('mantem o login nativo no Android', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    const {
      GOOGLE_DRIVE_APPDATA_SCOPE,
      getGoogleDriveAccessToken,
      signInWithGoogleRedirect,
    } = await importService()

    await expect(signInWithGoogleRedirect()).resolves.toEqual({
      uid: 'native-user-1',
      displayName: 'Native User',
      email: 'native@example.com',
      photoURL: 'https://example.com/native.png',
    })

    expect(mocks.nativeSignInWithGoogle).toHaveBeenCalledWith({
      scopes: [GOOGLE_DRIVE_APPDATA_SCOPE],
    })
    expect(mocks.signInWithPopup).not.toHaveBeenCalled()
    expect(mocks.signInWithRedirect).not.toHaveBeenCalled()
    expect(getGoogleDriveAccessToken()).toBe('native-drive-token')
  })
})
