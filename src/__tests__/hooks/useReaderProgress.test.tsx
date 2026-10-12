import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReaderProgress } from '@/hooks/useReaderProgress'
import { getProgress, upsertProgress } from '@/db/progress'
import { restoreBookProgressBeforeOpen } from '@/services/ProgressDriveSyncService'

vi.mock('@/db/progress', () => ({
  getProgress: vi.fn(),
  upsertProgress: vi.fn(),
}))
vi.mock('@/services/ProgressDriveSyncService', () => ({
  restoreBookProgressBeforeOpen: vi.fn(),
}))

describe('useReaderProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getProgress).mockResolvedValue(undefined)
    vi.mocked(upsertProgress).mockResolvedValue(undefined)
    vi.mocked(restoreBookProgressBeforeOpen).mockReset()
    vi.mocked(restoreBookProgressBeforeOpen).mockResolvedValue({ restored: false })
    vi.mocked(getProgress).mockClear()
    vi.mocked(upsertProgress).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('carrega o progresso salvo completo para reutilizar o indice atual', async () => {
    const progress = {
      id: 1,
      bookId: 7,
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      percentage: 50,
      fraction: 0.5,
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    }
    vi.mocked(getProgress).mockResolvedValue(progress)

    const { result } = renderHook(() => useReaderProgress(7))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.savedCfi).toBe(progress.cfi)
    expect(result.current.savedProgress).toEqual(progress)
  })

  it('faz flush do último progresso pendente ao desmontar', async () => {
    const { result, unmount } = renderHook(() => useReaderProgress(7))

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.saveProgress({
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.25,
        sectionHref: 'chapter-1.xhtml',
        sectionLabel: 'Chapter 1',
      })
      result.current.saveProgress({
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.5,
        sectionHref: 'chapter-2.xhtml',
        sectionLabel: 'Chapter 2',
      })
    })

    expect(upsertProgress).not.toHaveBeenCalled()

    unmount()

    await act(async () => {
      await Promise.resolve()
    })

    expect(upsertProgress).toHaveBeenCalledTimes(1)
    expect(upsertProgress).toHaveBeenCalledWith(7, {
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      fraction: 0.5,
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    })
  })

  it('flushProgress persiste imediatamente e cancela o debounce pendente', async () => {
    const { result } = renderHook(() => useReaderProgress(9))

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.saveProgress({
        cfi: 'epubcfi(/6/8!/4/2/1:0)',
        fraction: 0.1,
        sectionHref: 'chapter-1.xhtml',
      })
    })

    await act(async () => {
      await result.current.flushProgress({
        cfi: 'epubcfi(/6/10!/4/2/1:0)',
        fraction: 0.4,
        sectionHref: 'chapter-2.xhtml',
        sectionLabel: 'Chapter 2',
      })
    })

    expect(upsertProgress).toHaveBeenCalledTimes(1)
    expect(upsertProgress).toHaveBeenCalledWith(9, {
      cfi: 'epubcfi(/6/10!/4/2/1:0)',
      fraction: 0.4,
      sectionHref: 'chapter-2.xhtml',
      sectionLabel: 'Chapter 2',
    })

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(upsertProgress).toHaveBeenCalledTimes(1)
  })

  // R02 (sdd/bugs/progresso-no-drive-nao-restaurado-pelo)
  it('restaura o progresso do Drive antes de ler a posição inicial local', async () => {
    const remote = {
      id: 3,
      bookId: 11,
      cfi: 'epubcfi(/6/20!/4/2/1:0)',
      percentage: 70,
      fraction: 0.7,
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    }
    let restoredLocally = false
    vi.mocked(restoreBookProgressBeforeOpen).mockImplementation(async () => {
      restoredLocally = true
      return { restored: true }
    })
    vi.mocked(getProgress).mockImplementation(async () => (restoredLocally ? remote : undefined))

    const { result } = renderHook(() => useReaderProgress(11))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(restoreBookProgressBeforeOpen).toHaveBeenCalledWith(11)
    expect(result.current.initialLoadDone).toBe(true)
    expect(result.current.savedCfi).toBe(remote.cfi)
  })

  it('falha da restauração não impede abrir com o progresso local', async () => {
    vi.mocked(restoreBookProgressBeforeOpen).mockRejectedValue(new Error('offline'))
    vi.mocked(getProgress).mockResolvedValue({
      id: 1, bookId: 12, cfi: 'epubcfi(/6/4!/4/2/1:0)', percentage: 10, updatedAt: new Date(),
    })

    const { result } = renderHook(() => useReaderProgress(12))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.savedCfi).toBe('epubcfi(/6/4!/4/2/1:0)')
  })

  it('livro sem progresso: abrir e fechar no início não grava reinício', async () => {
    const { result, unmount } = renderHook(() => useReaderProgress(13))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      result.current.saveProgress({ cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0, percentage: 0 })
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      await result.current.flushProgress({ cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0, percentage: 0 })
    })
    unmount()
    await act(async () => {
      await Promise.resolve()
    })

    expect(upsertProgress).not.toHaveBeenCalled()
  })

  it('livro sem progresso: grava assim que sai do início e depois aceita voltar ao começo', async () => {
    const { result } = renderHook(() => useReaderProgress(14))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.flushProgress({ cfi: 'epubcfi(/6/6!/4/2/1:0)', fraction: 0.05 })
    })
    await act(async () => {
      await result.current.flushProgress({ cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0 })
    })

    expect(upsertProgress).toHaveBeenCalledTimes(2)
    expect(upsertProgress).toHaveBeenLastCalledWith(14, { cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0 })
  })

  it('livro com progresso local salva normalmente a volta para o início', async () => {
    vi.mocked(getProgress).mockResolvedValue({
      id: 2, bookId: 15, cfi: 'epubcfi(/6/8!/4/2/1:0)', percentage: 30, fraction: 0.3, updatedAt: new Date(),
    })
    const { result } = renderHook(() => useReaderProgress(15))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.flushProgress({ cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0 })
    })

    expect(upsertProgress).toHaveBeenCalledWith(15, { cfi: 'epubcfi(/6/2!/4/2/1:0)', fraction: 0 })
  })
})
