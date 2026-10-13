import { PinSetupSheet } from './PinSetupSheet'
import { PinVerifySheet } from './PinVerifySheet'
import { useCapacitorAppStateChange } from '../hooks/useCapacitorAppListener'
import { useBookLockStore } from '../store/bookLockStore'

// Monta UMA vez (App.tsx) os prompts de PIN e re-bloqueia ao sair do app (feature 024).
export function BookLockHost() {
  const prompt = useBookLockStore((state) => state.prompt)
  const setup = useBookLockStore((state) => state.setup)

  // Re-bloqueia na ida para segundo plano, não na volta: assim não há quadro de
  // conteúdo exposto ao retornar. NUNCA toca no TTS: o leitor segue montado e o
  // TtsPlaybackService nativo continua (FR-010, D-15). Tela apagando conta como sair.
  useCapacitorAppStateChange(({ isActive }) => {
    if (!isActive) useBookLockStore.getState().lock()
  })

  return (
    <>
      {prompt && <PinVerifySheet />}
      {setup && <PinSetupSheet mode={setup.mode} />}
    </>
  )
}
