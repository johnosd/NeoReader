import { beforeEach, describe, expect, it } from 'vitest'
import { useBookLockStore } from '@/store/bookLockStore'

function reset() {
  // Resolve qualquer prompt pendente de um teste anterior para não vazar Promise.
  useBookLockStore.getState().settlePrompt(false)
  useBookLockStore.setState({ unlocked: false, prompt: null })
}

describe('bookLockStore', () => {
  beforeEach(reset)

  it('começa bloqueado', () => {
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('requestUnlock com o app desbloqueado resolve true sem abrir prompt', async () => {
    useBookLockStore.getState().unlock()
    await expect(useBookLockStore.getState().requestUnlock()).resolves.toBe(true)
    expect(useBookLockStore.getState().prompt).toBeNull()
  })

  it('com force abre o prompt mesmo desbloqueado e só vale com PIN correto', async () => {
    useBookLockStore.getState().unlock()
    const pending = useBookLockStore.getState().requestUnlock({ force: true })
    expect(useBookLockStore.getState().prompt).not.toBeNull()

    useBookLockStore.getState().settlePrompt(false)
    await expect(pending).resolves.toBe(false)
    // Cancelar o prompt forçado não bloqueia quem já estava desbloqueado.
    expect(useBookLockStore.getState().unlocked).toBe(true)
  })

  it('duas chamadas simultâneas compartilham a mesma Promise e um único prompt', async () => {
    const a = useBookLockStore.getState().requestUnlock()
    const b = useBookLockStore.getState().requestUnlock()
    expect(a).toBe(b)

    useBookLockStore.getState().settlePrompt(true)
    await expect(Promise.all([a, b])).resolves.toEqual([true, true])
    expect(useBookLockStore.getState().unlocked).toBe(true)
    expect(useBookLockStore.getState().prompt).toBeNull()
  })

  it('settlePrompt(false) resolve false e mantém bloqueado', async () => {
    const pending = useBookLockStore.getState().requestUnlock()
    useBookLockStore.getState().settlePrompt(false)
    await expect(pending).resolves.toBe(false)
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('lock() não resolve nem derruba um prompt aberto', async () => {
    const pending = useBookLockStore.getState().requestUnlock()
    useBookLockStore.getState().lock()
    expect(useBookLockStore.getState().prompt).not.toBeNull()

    useBookLockStore.getState().settlePrompt(true)
    await expect(pending).resolves.toBe(true)
  })

  it('depois de resolvido, uma nova requisição abre um novo prompt', async () => {
    const first = useBookLockStore.getState().requestUnlock()
    useBookLockStore.getState().settlePrompt(false)
    await first

    const second = useBookLockStore.getState().requestUnlock()
    expect(second).not.toBe(first)
    expect(useBookLockStore.getState().prompt).not.toBeNull()
  })
})
