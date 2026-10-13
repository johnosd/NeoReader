import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hasPin: vi.fn(),
  disable: vi.fn(),
}))

vi.mock('@/services/BookProtectionService', () => ({
  BookProtectionService: { hasPin: mocks.hasPin, disable: mocks.disable },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}))

import { SettingsBookProtectionScreen } from '@/screens/SettingsBookProtectionScreen'
import { useBookLockStore } from '@/store/bookLockStore'

describe('SettingsBookProtectionScreen (feature 024)', () => {
  beforeEach(() => {
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.getState().settleSetup(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
    mocks.hasPin.mockReset().mockResolvedValue(true)
    mocks.disable.mockReset().mockResolvedValue(undefined)
  })

  it('sem PIN explica como começar e não mostra alterar nem desativar', async () => {
    mocks.hasPin.mockResolvedValue(false)
    render(<SettingsBookProtectionScreen onBack={vi.fn()} />)

    expect(await screen.findByText(/Nenhum PIN criado ainda/)).toBeTruthy()
    expect(screen.queryByText('Alterar PIN')).toBeNull()
    expect(screen.queryByText('Desativar proteção')).toBeNull()
  })

  it('alterar PIN pede o PIN atual MESMO com o app já desbloqueado', async () => {
    useBookLockStore.getState().unlock()
    render(<SettingsBookProtectionScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Alterar PIN'))

    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    expect(useBookLockStore.getState().setup).toBeNull()

    useBookLockStore.getState().settlePrompt(true)
    await waitFor(() => expect(useBookLockStore.getState().setup?.mode).toBe('change'))

    useBookLockStore.getState().settleSetup(true)
    expect(await screen.findByText('PIN alterado')).toBeTruthy()
  })

  it('alterar PIN com PIN atual cancelado não abre a criação', async () => {
    render(<SettingsBookProtectionScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Alterar PIN'))
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    useBookLockStore.getState().settlePrompt(false)

    await waitFor(() => expect(useBookLockStore.getState().prompt).toBeNull())
    expect(useBookLockStore.getState().setup).toBeNull()
  })

  it('desativar: pede o PIN atual, pede confirmação e só então desativa', async () => {
    useBookLockStore.getState().unlock()
    render(<SettingsBookProtectionScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Desativar proteção'))
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    expect(mocks.disable).not.toHaveBeenCalled()

    useBookLockStore.getState().settlePrompt(true)
    expect(await screen.findByText('Desativar proteção?')).toBeTruthy()
    expect(mocks.disable).not.toHaveBeenCalled()

    mocks.hasPin.mockResolvedValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(mocks.disable).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Proteção desativada')).toBeTruthy()
  })

  it('cancelar a confirmação não desativa nada', async () => {
    useBookLockStore.getState().unlock()
    render(<SettingsBookProtectionScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Desativar proteção'))
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    useBookLockStore.getState().settlePrompt(true)
    await screen.findByText('Desativar proteção?')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mocks.disable).not.toHaveBeenCalled()
    expect(screen.queryByText('Desativar proteção?')).toBeNull()
  })
})
