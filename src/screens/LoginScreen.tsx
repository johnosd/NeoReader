import { useState } from 'react'
import { AlertCircle, BookOpen } from 'lucide-react'
import { Spinner } from '../components/ui'

interface LoginScreenProps {
  configured: boolean
  error?: string
  onSignInWithGoogle: () => Promise<void>
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function LoginScreen({ configured, error, onSignInWithGoogle }: LoginScreenProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const visibleError = localError ?? error

  async function handleGoogleSignIn() {
    if (!configured || submitting) return

    setSubmitting(true)
    setLocalError(null)

    try {
      await onSignInWithGoogle()
    } catch (signInError) {
      setSubmitting(false)
      setLocalError(signInError instanceof Error
        ? signInError.message
        : 'Nao foi possivel iniciar o login com Google.')
    }
  }

  return (
    <main className="min-h-screen bg-bg-base text-text-primary relative overflow-hidden">
      <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-4/5 h-1/2 bg-purple-primary/20 blur-[50px] rounded-full pointer-events-none" />

      <section className="relative z-10 min-h-screen px-6 pt-14 flex flex-col">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-purple-primary to-purple-dark flex items-center justify-center">
            <BookOpen size={20} className="text-white" />
          </div>
          <span className="font-serif text-lg font-black text-white">
            Neo<span className="text-purple-light">Reader</span>
          </span>
        </div>

        <div className="mb-7">
          <h1 className="text-[26px] leading-tight font-extrabold text-text-primary mb-1.5">
            Bem-vindo de volta
          </h1>
          <p className="text-sm text-text-muted">
            Entre para continuar lendo
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={!configured || submitting}
          className="w-full h-[52px] rounded-[14px] bg-white/[0.06] border border-white/[0.12] text-text-primary text-[15px] font-semibold flex items-center justify-center gap-2.5 active:bg-white/10 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {submitting ? <Spinner size={18} /> : <GoogleLogo />}
          {submitting ? 'Abrindo Google...' : 'Continuar com Google'}
        </button>

        {visibleError && (
          <div className="mt-4 rounded-md border border-error/25 bg-error/10 p-3 flex gap-3 text-sm text-text-secondary">
            <AlertCircle size={18} className="text-error shrink-0 mt-0.5" />
            <p className="leading-relaxed">{visibleError}</p>
          </div>
        )}

        {!configured && (
          <p className="mt-4 text-xs leading-relaxed text-text-muted">
            Configure as variaveis VITE_FIREBASE_* no .env para habilitar o login.
          </p>
        )}
      </section>
    </main>
  )
}
