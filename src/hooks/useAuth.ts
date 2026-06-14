import { useCallback, useEffect, useState } from 'react'
import {
  consumeGoogleRedirectResult,
  isFirebaseAuthConfigured,
  observeFirebaseAuth,
  signInWithGoogleRedirect,
  signOut as signOutFromFirebase,
} from '../services/FirebaseAuthService'
import type { AuthState } from '../types/auth'
import { useI18n, type TranslateFn } from '../i18n'

function getAuthErrorMessage(error: unknown, t: TranslateFn) {
  if (error instanceof Error) return error.message
  return t('auth.error.generic')
}

export function useAuth() {
  const { t } = useI18n()
  const configured = isFirebaseAuthConfigured()
  const [state, setState] = useState<AuthState>(() => (
    configured
      ? { status: 'loading', user: null, configured: true }
      : {
          status: 'signed-out',
          user: null,
          configured: false,
          error: t('auth.error.firebaseConfig'),
        }
  ))

  useEffect(() => {
    if (!configured) return undefined

    const unsubscribe = observeFirebaseAuth((user) => {
      setState(user
        ? { status: 'signed-in', user, configured: true }
        : { status: 'signed-out', user: null, configured: true })
    })

    void consumeGoogleRedirectResult().catch((error) => {
      setState({
        status: 'signed-out',
        user: null,
        configured: true,
        error: getAuthErrorMessage(error, t),
      })
    })

    return unsubscribe
  }, [configured, t])

  const signInWithGoogle = useCallback(async () => {
    const user = await signInWithGoogleRedirect()
    if (user) {
      setState({ status: 'signed-in', user, configured: true })
    }
  }, [])

  const signOut = useCallback(async () => {
    await signOutFromFirebase()
    setState({ status: 'signed-out', user: null, configured })
  }, [configured])

  return {
    state,
    signInWithGoogle,
    signOut,
  }
}
