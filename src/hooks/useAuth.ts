import { useCallback, useEffect, useState } from 'react'
import {
  consumeGoogleRedirectResult,
  isFirebaseAuthConfigured,
  observeFirebaseAuth,
  signInWithGoogleRedirect,
  signOut as signOutFromFirebase,
} from '../services/FirebaseAuthService'
import type { AuthState } from '../types/auth'

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Nao foi possivel concluir a autenticacao. Tente novamente.'
}

export function useAuth() {
  const configured = isFirebaseAuthConfigured()
  const [state, setState] = useState<AuthState>(() => (
    configured
      ? { status: 'loading', user: null, configured: true }
      : {
          status: 'signed-out',
          user: null,
          configured: false,
          error: 'Firebase Auth nao configurado. Preencha as variaveis VITE_FIREBASE_* no .env.',
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
        error: getAuthErrorMessage(error),
      })
    })

    return unsubscribe
  }, [configured])

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
