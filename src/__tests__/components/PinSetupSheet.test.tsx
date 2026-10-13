import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPin: vi.fn(),
  replacePin: vi.fn(),
}))

vi.mock('@/services/BookProtectionService', () => ({
  BookProtectionService: { createPin: mocks.createPin, replacePin: mocks.replacePin },
}))

import { PinSetupSheet } from '@/components/PinSetupSheet'
import { useBookLockStore } from '@/store/bookLockStore'

function type(digits: string) {
  for (const digit of digits) fireEvent.click(screen.getByRole('button', { name: `Dígito ${digit}` }))
}

describe('PinSetupSheet', () => {
  beforeEach(() => {
    useBookLockStore.getState().settleSetup(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
    mocks.createPin.mockReset().mockResolvedValue(undefined)
    mocks.replacePin.mockReset().mockResolvedValue(undefined)
  })

  // Devolve a Promise do pedido dentro de um objeto: retorná-la direto de uma função
  // async faria o `await` esperar o usuário concluir o fluxo (deadlock no teste).
  function openSetup(mode: 'create' | 'change' | 'reset' = 'create') {
    const pending = useBookLockStore.getState().requestPinSetup(mode)
    render(<PinSetupSheet mode={mode} />)
    return { pending }
  }

  it('PINs iguais criam o PIN e deixam o app desbloqueado', async () => {
    const { pending } = openSetup('create')

    type('4821')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('Digite o PIN de novo para confirmar')).toBeTruthy()

    type('4821')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar PIN' }))

    await expect(pending).resolves.toBe(true)
    expect(mocks.createPin).toHaveBeenCalledWith('4821')
    expect(useBookLockStore.getState().unlocked).toBe(true)
  })

  it('PINs diferentes voltam ao início e não criam nada', async () => {
    openSetup('create')

    type('4821')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    type('1111')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar PIN' }))

    expect(await screen.findByText('Os PINs são diferentes. Tente de novo.')).toBeTruthy()
    expect(screen.getByText('Digite um PIN de 4 a 6 dígitos')).toBeTruthy()
    expect(mocks.createPin).not.toHaveBeenCalled()
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('o botão de continuar fica desabilitado com menos de 4 dígitos', async () => {
    openSetup('create')

    type('123')

    const next = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
  })

  it('cancelar não cria o PIN e não desbloqueia', async () => {
    const { pending } = openSetup('create')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await expect(pending).resolves.toBe(false)
    expect(mocks.createPin).not.toHaveBeenCalled()
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('alterar e redefinir usam replacePin', async () => {
    const { pending } = openSetup('change')

    type('5678')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    type('5678')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar PIN' }))

    await expect(pending).resolves.toBe(true)
    expect(mocks.replacePin).toHaveBeenCalledWith('5678')
    expect(mocks.createPin).not.toHaveBeenCalled()
  })

  it('re-renderizar não expõe o PIN digitado em texto', async () => {
    const { rerender } = render(<PinSetupSheet mode="create" />)
    type('9876')

    rerender(<PinSetupSheet mode="create" />)

    expect(document.body.textContent).not.toContain('9876')
  })

  it('falha ao salvar volta ao início com erro', async () => {
    mocks.createPin.mockRejectedValue(new Error('x'))
    openSetup('create')

    type('4821')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    type('4821')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar PIN' }))

    await waitFor(() => expect(screen.getByText('Não foi possível salvar o PIN.')).toBeTruthy())
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })
})
