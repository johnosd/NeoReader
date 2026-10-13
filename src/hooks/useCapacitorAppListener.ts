import { useEffect } from 'react'
import { App as CapApp, type BackButtonListener, type StateChangeListener } from '@capacitor/app'
import { isBookLockOverlayOpen } from '../store/bookLockStore'
import { useSyncRef } from './useSyncRef'

interface BackButtonOptions {
  // O próprio prompt de PIN precisa ouvir o voltar mesmo estando aberto (feature 024).
  ignoreLockPromptGuard?: boolean
}

export function useCapacitorAppListener(eventName: 'backButton', handler: BackButtonListener, options?: BackButtonOptions): void
export function useCapacitorAppListener(eventName: 'appStateChange', handler: StateChangeListener): void
export function useCapacitorAppListener(
  eventName: 'backButton' | 'appStateChange',
  handler: BackButtonListener | StateChangeListener,
  options?: BackButtonOptions,
): void {
  const handlerRef = useSyncRef(handler)
  const ignoreLockPromptGuard = options?.ignoreLockPromptGuard ?? false

  useEffect(() => {
    let disposed = false
    const listenerPromise = eventName === 'backButton'
      ? CapApp.addListener('backButton', (event) => {
          if (disposed) return
          // No Capacitor TODOS os listeners de `backButton` disparam no mesmo evento.
          // Com o prompt de PIN aberto sobre uma tela, o voltar deve só fechar o prompt:
          // sem esta guarda a tela por baixo também navegaria (ex.: Biblioteca → Home).
          // O prompt fecha adiando para o próximo macrotask (PinVerifySheet), para que
          // os demais listeners deste mesmo evento ainda o vejam aberto.
          if (!ignoreLockPromptGuard && isBookLockOverlayOpen()) return
          ;(handlerRef.current as BackButtonListener)(event)
        })
      : CapApp.addListener('appStateChange', (state) => {
          if (!disposed) (handlerRef.current as StateChangeListener)(state)
        })

    return () => {
      disposed = true
      void listenerPromise
        .then((listener) => listener.remove())
        .catch(() => undefined)
    }
  }, [eventName, handlerRef, ignoreLockPromptGuard])
}

export function useCapacitorBackButton(handler: BackButtonListener, options?: BackButtonOptions): void {
  useCapacitorAppListener('backButton', handler, options)
}

export function useCapacitorAppStateChange(handler: StateChangeListener): void {
  useCapacitorAppListener('appStateChange', handler)
}
