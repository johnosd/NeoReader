import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCapacitorBackButton } from '@/hooks/useCapacitorAppListener'

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: mocks.addListener,
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useCapacitorAppListener', () => {
  beforeEach(() => {
    mocks.addListener.mockReset()
  })

  it('mantem um unico listener e chama o handler mais recente', async () => {
    const remove = vi.fn(async () => undefined)
    mocks.addListener.mockResolvedValue({ remove })
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    const { rerender, unmount } = renderHook(
      ({ handler }) => useCapacitorBackButton(handler),
      { initialProps: { handler: firstHandler } },
    )

    expect(mocks.addListener).toHaveBeenCalledTimes(1)
    const backHandler = mocks.addListener.mock.calls[0][1] as (event: { canGoBack: boolean }) => void

    rerender({ handler: secondHandler })

    act(() => {
      backHandler({ canGoBack: false })
    })

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledWith({ canGoBack: false })
    expect(mocks.addListener).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => {
      await Promise.resolve()
    })

    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('ignora eventos apos unmount mesmo quando o handle ainda nao resolveu', async () => {
    const pendingHandle = deferred<{ remove: () => Promise<void> }>()
    const remove = vi.fn(async () => undefined)
    mocks.addListener.mockReturnValue(pendingHandle.promise)
    const handler = vi.fn()

    const { unmount } = renderHook(() => useCapacitorBackButton(handler))

    const backHandler = mocks.addListener.mock.calls[0][1] as (event: { canGoBack: boolean }) => void
    unmount()

    act(() => {
      backHandler({ canGoBack: false })
    })

    expect(handler).not.toHaveBeenCalled()

    pendingHandle.resolve({ remove })
    await act(async () => {
      await pendingHandle.promise
      await Promise.resolve()
    })

    expect(remove).toHaveBeenCalledTimes(1)
  })
})
