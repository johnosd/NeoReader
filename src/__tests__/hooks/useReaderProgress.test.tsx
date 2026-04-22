import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReaderProgress } from '@/hooks/useReaderProgress'
import { getProgress, upsertProgress } from '@/db/progress'

vi.mock('@/db/progress', () => ({
  getProgress: vi.fn(),
  upsertProgress: vi.fn(),
}))

describe('useReaderProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(getProgress).mockResolvedValue(undefined)
    vi.mocked(upsertProgress).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
