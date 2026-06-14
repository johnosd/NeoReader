import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WelcomeScreen } from '@/screens/WelcomeScreen'

describe('WelcomeScreen', () => {
  it('avanca pelo carousel e conclui no ultimo slide', () => {
    const onComplete = vi.fn()
    render(<WelcomeScreen onComplete={onComplete} />)

    screen.getByRole('heading', { name: '50.000 livros' })

    fireEvent.click(screen.getByRole('button', { name: 'Proximo' }))
    screen.getByRole('heading', { name: 'Leia sem limites' })

    fireEvent.click(screen.getByRole('button', { name: 'Proximo' }))
    screen.getByRole('heading', { name: 'Leia com vozes' })

    fireEvent.click(screen.getByRole('button', { name: 'Proximo' }))
    screen.getByRole('heading', { name: 'Acompanhe seu progresso' })

    fireEvent.click(screen.getByRole('button', { name: /Comecar agora/ }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('permite pular direto para o login', () => {
    const onComplete = vi.fn()
    render(<WelcomeScreen onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
