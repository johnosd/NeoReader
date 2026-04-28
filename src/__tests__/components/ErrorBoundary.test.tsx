import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

// throwFlag controla se o componente lança ou não — pode ser alterado antes do reset
// para evitar que o ErrorBoundary re-capture o erro durante o re-render do filho.
const throwFlag = { current: true }

function ThrowOnRender() {
  if (throwFlag.current) throw new Error('Erro de teste')
  return <div data-testid="child">Conteúdo OK</div>
}

describe('ErrorBoundary', () => {
  it('renderiza filhos normalmente quando não há erro', () => {
    throwFlag.current = false
    render(<ErrorBoundary><ThrowOnRender /></ErrorBoundary>)
    screen.getByTestId('child')
    expect(screen.queryByText('Tentar novamente')).toBeNull()
  })

  it('exibe fallback padrão quando filho lança erro', () => {
    throwFlag.current = true
    render(<ErrorBoundary><ThrowOnRender /></ErrorBoundary>)
    expect(screen.queryByTestId('child')).toBeNull()
    screen.getByText('Algo deu errado nesta tela.')
    screen.getByRole('button', { name: 'Tentar novamente' })
  })

  it('exibe fallback customizado quando fornecido', () => {
    throwFlag.current = true
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Erro customizado</div>}>
        <ThrowOnRender />
      </ErrorBoundary>,
    )
    screen.getByTestId('custom-fallback')
    expect(screen.queryByText('Tentar novamente')).toBeNull()
  })

  it('"Tentar novamente" reseta o estado de erro e reexibe os filhos', () => {
    throwFlag.current = true
    render(<ErrorBoundary><ThrowOnRender /></ErrorBoundary>)
    screen.getByText('Algo deu errado nesta tela.')

    // Muda flag ANTES do click — quando ErrorBoundary re-renderiza o filho após reset,
    // ThrowOnRender não lança mais e o filho aparece normalmente.
    throwFlag.current = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    screen.getByTestId('child')
  })

  it('chama onReset quando "Tentar novamente" é clicado', () => {
    throwFlag.current = true
    const onReset = vi.fn()
    render(<ErrorBoundary onReset={onReset}><ThrowOnRender /></ErrorBoundary>)
    throwFlag.current = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('loga o erro via console.error ao capturar', () => {
    throwFlag.current = true
    render(<ErrorBoundary><ThrowOnRender /></ErrorBoundary>)
    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.anything(),
    )
  })
})
