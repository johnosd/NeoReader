import { useEffect } from 'react'
import { App as CapApp, type BackButtonListener, type StateChangeListener } from '@capacitor/app'
import { useSyncRef } from './useSyncRef'

export function useCapacitorAppListener(eventName: 'backButton', handler: BackButtonListener): void
export function useCapacitorAppListener(eventName: 'appStateChange', handler: StateChangeListener): void
export function useCapacitorAppListener(
  eventName: 'backButton' | 'appStateChange',
  handler: BackButtonListener | StateChangeListener,
): void {
  const handlerRef = useSyncRef(handler)

  useEffect(() => {
    let disposed = false
    const listenerPromise = eventName === 'backButton'
      ? CapApp.addListener('backButton', (event) => {
          if (!disposed) (handlerRef.current as BackButtonListener)(event)
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
  }, [eventName, handlerRef])
}

export function useCapacitorBackButton(handler: BackButtonListener): void {
  useCapacitorAppListener('backButton', handler)
}

export function useCapacitorAppStateChange(handler: StateChangeListener): void {
  useCapacitorAppListener('appStateChange', handler)
}
