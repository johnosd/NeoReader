import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LoginScreen } from '@/screens/LoginScreen'

describe('LoginScreen', () => {
  it('inicia login com Google', async () => {
    const onSignInWithGoogle = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen configured onSignInWithGoogle={onSignInWithGoogle} />)

    fireEvent.click(screen.getByRole('button', { name: /Continuar com Google/ }))

    await waitFor(() => expect(onSignInWithGoogle).toHaveBeenCalledTimes(1))
  })

  it('desabilita login quando Firebase nao esta configurado', () => {
    const onSignInWithGoogle = vi.fn()
    render(
      <LoginScreen
        configured={false}
        error="Firebase Auth nao configurado."
        onSignInWithGoogle={onSignInWithGoogle}
      />,
    )

    const button = screen.getByRole('button', { name: /Continuar com Google/ })
    expect(button).toHaveProperty('disabled', true)
    screen.getByText('Firebase Auth nao configurado.')

    fireEvent.click(button)
    expect(onSignInWithGoogle).not.toHaveBeenCalled()
  })

  it('exibe erro quando o Google Sign-In falha antes do redirect', async () => {
    const onSignInWithGoogle = vi.fn().mockRejectedValue(new Error('Popup bloqueado.'))
    render(<LoginScreen configured onSignInWithGoogle={onSignInWithGoogle} />)

    fireEvent.click(screen.getByRole('button', { name: /Continuar com Google/ }))

    await screen.findByText('Popup bloqueado.')
  })
})
