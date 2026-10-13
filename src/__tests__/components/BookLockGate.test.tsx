import { render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  // `undefined` = carregando, `null` = não existe (mesmo contrato do useLiveQuery do gate).
  record: undefined as Record<string, unknown> | null | undefined,
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.record,
}))
vi.mock('@/db/database', () => ({ db: { books: { get: vi.fn() } } }))

import { BookLockGate } from '@/components/BookLockGate'
import { useBookLockStore } from '@/store/bookLockStore'

function renderGate(props: { bookId?: number; onDenied?: () => void } = {}) {
  const onDenied = props.onDenied ?? vi.fn()
  const view = render(
    <BookLockGate bookId={'bookId' in props ? props.bookId : 7} onDenied={onDenied}>
      <div data-testid="child">conteúdo do livro</div>
    </BookLockGate>,
  )
  return { ...view, onDenied }
}

describe('BookLockGate', () => {
  beforeEach(() => {
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
    mocks.record = { id: 7, isProtected: true }
  })

  it('protegido e bloqueado: não monta os filhos e pede o PIN', async () => {
    renderGate()

    expect(screen.queryByTestId('child')).toBeNull()
    expect(screen.getByText('Livro protegido')).toBeTruthy()
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
  })

  it('cancelar o PIN chama onDenied', async () => {
    const { onDenied } = renderGate()
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())

    act(() => { useBookLockStore.getState().settlePrompt(false) })

    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('PIN correto monta os filhos', async () => {
    renderGate()
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())

    act(() => { useBookLockStore.getState().settlePrompt(true) })

    expect(await screen.findByTestId('child')).toBeTruthy()
    expect(screen.queryByText('Livro protegido')).toBeNull()
  })

  it('re-bloquear depois de revelado mantém os filhos montados, inertes e cobertos (FR-010)', async () => {
    useBookLockStore.getState().unlock()
    renderGate()
    const child = screen.getByTestId('child')

    act(() => { useBookLockStore.getState().lock() })

    // MESMO nó DOM: não desmontou/remontou (isso interromperia o TTS).
    expect(screen.getByTestId('child', { hidden: true })).toBe(child)
    expect(child.closest('[inert]')).not.toBeNull()
    expect(child.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('Livro protegido')).toBeTruthy()
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
  })

  it('desbloquear de novo descobre o conteúdo sem remontar', async () => {
    useBookLockStore.getState().unlock()
    renderGate()
    const child = screen.getByTestId('child')
    act(() => { useBookLockStore.getState().lock() })
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())

    act(() => { useBookLockStore.getState().settlePrompt(true) })

    await waitFor(() => expect(child.closest('[inert]')).toBeNull())
    expect(screen.getByTestId('child')).toBe(child)
  })

  it('usa o registro vivo, não o snapshot: proteger depois de aberto passa a cobrir (R-004)', async () => {
    mocks.record = { id: 7, isProtected: false }
    const { rerender } = renderGate()
    expect(screen.getByTestId('child')).toBeTruthy()
    expect(screen.queryByText('Livro protegido')).toBeNull()

    mocks.record = { id: 7, isProtected: true }
    rerender(
      <BookLockGate bookId={7} onDenied={vi.fn()}>
        <div data-testid="child">conteúdo do livro</div>
      </BookLockGate>,
    )

    expect(screen.getByText('Livro protegido')).toBeTruthy()
    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
  })

  it('livro não protegido passa direto, sem prompt', () => {
    mocks.record = { id: 7, isProtected: false }
    renderGate()

    expect(screen.getByTestId('child')).toBeTruthy()
    expect(useBookLockStore.getState().prompt).toBeNull()
  })

  it('livro sem id (ex.: pré-visualização de catálogo) passa direto', () => {
    mocks.record = null
    renderGate({ bookId: undefined })

    expect(screen.getByTestId('child')).toBeTruthy()
    expect(useBookLockStore.getState().prompt).toBeNull()
  })

  it('enquanto carrega o registro não monta os filhos nem pede PIN', () => {
    mocks.record = undefined
    renderGate()

    expect(screen.queryByTestId('child')).toBeNull()
    expect(useBookLockStore.getState().prompt).toBeNull()
  })
})
