import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WelcomeScreen } from '@/screens/WelcomeScreen'

describe('WelcomeScreen', () => {
  it('avanca pelo carousel de 7 slides e conclui no ultimo', () => {
    const onComplete = vi.fn()
    render(<WelcomeScreen onComplete={onComplete} />)
    const next = () => fireEvent.click(screen.getByRole('button', { name: 'Proximo' }))

    screen.getByRole('heading', { name: '50.000 livros' })

    next()
    screen.getByRole('heading', { name: 'Ouca em qualquer idioma' })

    next()
    screen.getByRole('heading', { name: 'Leia sem limites' })
    // FR-006 / US5: sync de bookmarks/progresso citando o provedor nominalmente
    screen.getByText(/Google Drive/i)

    next()
    screen.getByRole('heading', { name: 'Leia com vozes' })
    // FR-003/FR-009 / US2: aviso explicito de chave propria (BYOK)
    screen.getByText(/conecte sua chave/i)

    next()
    screen.getByRole('heading', { name: 'Traducao premium' })
    // FR-004/FR-009 / US3: mesmo aviso de chave propria (BYOK)
    screen.getByText(/conecte sua chave/i)

    next()
    screen.getByRole('heading', { name: 'Conecte outras bibliotecas' })
    // FR-005 / US4: OPDS nao exige nem menciona chave de API
    expect(screen.queryByText(/chave/i)).toBeNull()

    next()
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
