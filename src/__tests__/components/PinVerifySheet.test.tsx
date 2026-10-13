import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hasPin: vi.fn(),
  getLockoutStatus: vi.fn(),
  verify: vi.fn(),
  confirmOwnership: vi.fn(),
}))

vi.mock('@/services/BookProtectionService', () => ({
  BookProtectionService: {
    hasPin: mocks.hasPin,
    getLockoutStatus: mocks.getLockoutStatus,
    verify: mocks.verify,
    confirmOwnership: mocks.confirmOwnership,
  },
}))

import { PinVerifySheet } from '@/components/PinVerifySheet'
import { useBookLockStore } from '@/store/bookLockStore'

function type(digits: string) {
  for (const digit of digits) fireEvent.click(screen.getByRole('button', { name: `Dígito ${digit}` }))
}

describe('PinVerifySheet', () => {
  beforeEach(() => {
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
    mocks.hasPin.mockReset().mockResolvedValue(true)
    mocks.getLockoutStatus.mockReset().mockResolvedValue({ remainingMs: 0, lockedUntil: 0 })
    mocks.verify.mockReset()
    mocks.confirmOwnership.mockReset()
  })

  function openPrompt() {
    const pending = useBookLockStore.getState().requestUnlock()
    render(<PinVerifySheet />)
    return pending
  }

  it('PIN correto resolve true e desbloqueia', async () => {
    mocks.verify.mockResolvedValue({ ok: true })
    const pending = openPrompt()

    type('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await expect(pending).resolves.toBe(true)
    expect(mocks.verify).toHaveBeenCalledWith('1234')
    expect(useBookLockStore.getState().unlocked).toBe(true)
  })

  it('PIN errado mostra o erro e limpa o campo', async () => {
    mocks.verify.mockResolvedValue({ ok: false, attemptsLeft: 4, lockedUntil: 0 })
    openPrompt()

    type('0000')
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    expect(await screen.findByText('PIN incorreto')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('0 dígitos digitados')
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('o 5º erro mostra a espera e trava o teclado', async () => {
    mocks.verify.mockResolvedValue({ ok: false, attemptsLeft: 0, lockedUntil: Date.now() + 30_000 })
    openPrompt()

    type('0000')
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    expect(await screen.findByText(/Tente de novo em 0:/)).toBeTruthy()
    const key = screen.getByRole('button', { name: 'Dígito 1' }) as HTMLButtonElement
    expect(key.disabled).toBe(true)
  })

  it('a espera persistida continua ao reabrir o prompt (fechar o app não zera)', async () => {
    mocks.getLockoutStatus.mockResolvedValue({ remainingMs: 20_000, lockedUntil: Date.now() + 20_000 })
    openPrompt()

    expect(await screen.findByText(/Tente de novo em 0:/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Desbloquear' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cancelar resolve false e mantém bloqueado', async () => {
    const pending = openPrompt()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await expect(pending).resolves.toBe(false)
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('sem PIN configurado libera sem pedir (não tranca o usuário)', async () => {
    mocks.hasPin.mockResolvedValue(false)
    const pending = openPrompt()

    await expect(pending).resolves.toBe(true)
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('o botão de desbloquear exige ao menos 4 dígitos', async () => {
    openPrompt()
    type('12')

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Desbloquear' }) as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // "Esqueci o PIN" (US2, FR-013). A credencial/conta nunca é digitada aqui: o serviço decide.
  describe('esqueci o PIN', () => {
    it('confirmado: abre a criação do PIN novo no modo reset e libera ao concluir', async () => {
      mocks.confirmOwnership.mockResolvedValue('confirmed')
      const pending = openPrompt()

      fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))

      await waitFor(() => expect(useBookLockStore.getState().setup?.mode).toBe('reset'))
      expect(mocks.confirmOwnership).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.any(String),
        description: expect.any(String),
      }))

      useBookLockStore.getState().settleSetup(true)

      await expect(pending).resolves.toBe(true)
    })

    it('confirmado mas o usuário cancela o PIN novo: o prompt continua aberto, sem liberar', async () => {
      mocks.confirmOwnership.mockResolvedValue('confirmed')
      openPrompt()

      fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))
      await waitFor(() => expect(useBookLockStore.getState().setup).not.toBeNull())
      useBookLockStore.getState().settleSetup(false)

      await waitFor(() => expect(useBookLockStore.getState().setup).toBeNull())
      expect(useBookLockStore.getState().prompt).not.toBeNull()
      expect(useBookLockStore.getState().unlocked).toBe(false)
    })

    it.each([
      ['cancelled', 'Confirmação cancelada. O PIN não foi alterado.'],
      ['different-account', 'Essa não é a conta conectada ao NeoReader. O PIN não foi alterado.'],
      ['offline', 'A confirmação da conta exige conexão com a internet. Tente de novo mais tarde.'],
      ['failed', 'Não foi possível confirmar. O PIN não foi alterado.'],
    ])('%s: mostra o aviso e não altera nada', async (result, message) => {
      mocks.confirmOwnership.mockResolvedValue(result)
      openPrompt()

      fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))

      expect(await screen.findByText(message)).toBeTruthy()
      expect(useBookLockStore.getState().setup).toBeNull()
      expect(useBookLockStore.getState().unlocked).toBe(false)
    })

    it('aparelho sem bloqueio de tela: exige confirmação explícita antes de redefinir', async () => {
      mocks.confirmOwnership.mockResolvedValue('no-device-lock')
      openPrompt()

      fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))

      expect(await screen.findByText('Aparelho sem bloqueio de tela')).toBeTruthy()
      expect(useBookLockStore.getState().setup).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Redefinir PIN' }))
      await waitFor(() => expect(useBookLockStore.getState().setup?.mode).toBe('reset'))
    })

    it('sem bloqueio de tela, cancelar a confirmação explícita não redefine', async () => {
      mocks.confirmOwnership.mockResolvedValue('no-device-lock')
      openPrompt()
      fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))
      await screen.findByText('Aparelho sem bloqueio de tela')

      // Dois "Cancelar" na tela (painel e rodapé): o do painel vem primeiro.
      fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0])

      await waitFor(() => expect(screen.queryByText('Aparelho sem bloqueio de tela')).toBeNull())
      expect(useBookLockStore.getState().setup).toBeNull()
    })
  })
})
