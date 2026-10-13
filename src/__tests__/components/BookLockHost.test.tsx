import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stateListeners: [] as Array<(state: { isActive: boolean }) => void>,
  ttsStop: vi.fn(),
  ttsUpdateState: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, callback: (state: { isActive: boolean }) => void) => {
      if (name === 'appStateChange') mocks.stateListeners.push(callback)
      return { remove: vi.fn(async () => undefined) }
    }),
  },
}))

vi.mock('@/services/TtsPlaybackSessionService', () => ({
  TtsPlaybackSessionService: { stop: mocks.ttsStop, updatePlaybackState: mocks.ttsUpdateState },
}))

vi.mock('@/services/BookProtectionService', () => ({
  BookProtectionService: {
    hasPin: vi.fn(async () => true),
    getLockoutStatus: vi.fn(async () => ({ remainingMs: 0, lockedUntil: 0 })),
    verify: vi.fn(),
    createPin: vi.fn(),
    replacePin: vi.fn(),
  },
}))

import { BookLockHost } from '@/components/BookLockHost'
import { useBookLockStore } from '@/store/bookLockStore'

function emit(isActive: boolean) {
  act(() => { for (const listener of [...mocks.stateListeners]) listener({ isActive }) })
}

describe('BookLockHost', () => {
  beforeEach(() => {
    mocks.stateListeners.length = 0
    mocks.ttsStop.mockClear()
    mocks.ttsUpdateState.mockClear()
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.getState().settleSetup(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
  })

  async function mountHost() {
    render(<BookLockHost />)
    await waitFor(() => expect(mocks.stateListeners.length).toBeGreaterThan(0))
  }

  it('ir para segundo plano re-bloqueia', async () => {
    useBookLockStore.getState().unlock()
    await mountHost()

    emit(false)

    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('voltar para primeiro plano não bloqueia nem desbloqueia', async () => {
    useBookLockStore.getState().unlock()
    await mountHost()

    emit(true)

    expect(useBookLockStore.getState().unlocked).toBe(true)
  })

  it('o re-bloqueio NÃO interrompe o TTS (FR-010)', async () => {
    useBookLockStore.getState().unlock()
    await mountHost()

    emit(false)

    expect(mocks.ttsStop).not.toHaveBeenCalled()
    expect(mocks.ttsUpdateState).not.toHaveBeenCalled()
  })

  it('renderiza o prompt quando o store pede o PIN', async () => {
    await mountHost()

    void useBookLockStore.getState().requestUnlock()

    expect(await screen.findByText('Digite o PIN')).toBeTruthy()
  })

  it('o re-bloqueio não derruba um prompt aberto (recuperação em curso)', async () => {
    await mountHost()
    void useBookLockStore.getState().requestUnlock()
    expect(await screen.findByText('Digite o PIN')).toBeTruthy()

    emit(false)

    expect(screen.getByText('Digite o PIN')).toBeTruthy()
    expect(useBookLockStore.getState().prompt).not.toBeNull()
  })

  it('renderiza a criação de PIN quando o store pede', async () => {
    await mountHost()

    void useBookLockStore.getState().requestPinSetup('create')

    expect(await screen.findByText('Criar PIN')).toBeTruthy()
  })
})
