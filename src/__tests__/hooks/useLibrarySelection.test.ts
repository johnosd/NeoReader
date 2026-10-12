import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLibrarySelection } from '@/hooks/useLibrarySelection'

const BOOKS = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('useLibrarySelection', () => {
  it('começa fora do modo de seleção', () => {
    const { result } = renderHook(() => useLibrarySelection(BOOKS))
    expect(result.current.isSelecting).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggle num livro não marcado entra no modo já marcando o livro', () => {
    const { result } = renderHook(() => useLibrarySelection(BOOKS))
    act(() => { result.current.toggle(2) })
    expect(result.current.isSelecting).toBe(true)
    expect([...result.current.selectedIds]).toEqual([2])
  })

  it('toggle marca e desmarca', () => {
    const { result } = renderHook(() => useLibrarySelection(BOOKS))
    act(() => { result.current.toggle(1) })
    act(() => { result.current.toggle(3) })
    expect([...result.current.selectedIds].sort()).toEqual([1, 3])
    act(() => { result.current.toggle(1) })
    expect([...result.current.selectedIds]).toEqual([3])
  })

  it('desmarcar o último encerra o modo de seleção', () => {
    const { result } = renderHook(() => useLibrarySelection(BOOKS))
    act(() => { result.current.toggle(1) })
    act(() => { result.current.toggle(1) })
    expect(result.current.isSelecting).toBe(false)
  })

  it('clear descarta a seleção inteira', () => {
    const { result } = renderHook(() => useLibrarySelection(BOOKS))
    act(() => { result.current.toggle(1) })
    act(() => { result.current.toggle(2) })
    act(() => { result.current.clear() })
    expect(result.current.isSelecting).toBe(false)
  })

  it('livros que saem da biblioteca saem da seleção', () => {
    const { result, rerender } = renderHook(({ books }) => useLibrarySelection(books), {
      initialProps: { books: BOOKS },
    })
    act(() => { result.current.toggle(1) })
    act(() => { result.current.toggle(2) })

    rerender({ books: [{ id: 2 }, { id: 3 }] })
    expect([...result.current.selectedIds]).toEqual([2])

    rerender({ books: [{ id: 3 }] })
    expect(result.current.isSelecting).toBe(false)
  })

  it('mantém a mesma referência quando nada foi podado', () => {
    const { result, rerender } = renderHook(({ books }) => useLibrarySelection(books), {
      initialProps: { books: BOOKS },
    })
    act(() => { result.current.toggle(1) })
    const before = result.current.selectedIds
    rerender({ books: [...BOOKS, { id: 4 }] })
    expect(result.current.selectedIds).toBe(before)
  })
})
