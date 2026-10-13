import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// Captura os callbacks registrados por `CapApp.addListener('backButton', ...)`.
const listeners = vi.hoisted(() => ({ backButton: [] as Array<(event: { canGoBack: boolean }) => void> }))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, callback: (event: { canGoBack: boolean }) => void) => {
      if (name === 'backButton') listeners.backButton.push(callback)
      return { remove: vi.fn(async () => undefined) }
    }),
  },
}))

import { useCapacitorBackButton } from '@/hooks/useCapacitorAppListener'
import { useBookLockStore } from '@/store/bookLockStore'

function fireBack() {
  for (const callback of [...listeners.backButton]) callback({ canGoBack: false })
}

describe('useCapacitorAppListener — guarda do prompt de PIN', () => {
  beforeEach(() => {
    listeners.backButton.length = 0
    useBookLockStore.setState({ unlocked: false, prompt: null })
  })

  afterEach(() => {
    useBookLockStore.getState().settlePrompt(false)
  })

  it('sem prompt aberto, o handler da tela é chamado', async () => {
    const handler = vi.fn()
    renderHook(() => useCapacitorBackButton(handler))
    await vi.waitFor(() => expect(listeners.backButton.length).toBe(1))

    fireBack()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('com o prompt aberto, o handler da tela NÃO é chamado, mas o do prompt é', async () => {
    const screenHandler = vi.fn()
    const promptHandler = vi.fn()
    renderHook(() => useCapacitorBackButton(screenHandler))
    renderHook(() => useCapacitorBackButton(promptHandler, { ignoreLockPromptGuard: true }))
    await vi.waitFor(() => expect(listeners.backButton.length).toBe(2))

    void useBookLockStore.getState().requestUnlock()
    fireBack()

    expect(screenHandler).not.toHaveBeenCalled()
    expect(promptHandler).toHaveBeenCalledTimes(1)
  })

  it('fechar o prompt adiando para o próximo macrotask mantém as telas ignorando o mesmo evento', async () => {
    vi.useFakeTimers()
    try {
      const screenHandler = vi.fn()
      renderHook(() => useCapacitorBackButton(screenHandler))
      // Registro assíncrono do listener: libera as microtasks antes de disparar.
      await vi.advanceTimersByTimeAsync(0)

      void useBookLockStore.getState().requestUnlock()
      // Simula o handler do prompt: agenda o fechamento para depois do evento.
      listeners.backButton.push(() => {
        setTimeout(() => useBookLockStore.getState().settlePrompt(false), 0)
      })
      fireBack()
      expect(screenHandler).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(0)
      expect(useBookLockStore.getState().prompt).toBeNull()

      // Já fechado: o próximo voltar volta a chegar na tela.
      fireBack()
      expect(screenHandler).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
