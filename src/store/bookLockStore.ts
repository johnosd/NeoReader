import { create } from 'zustand'

// Estado de bloqueio dos livros protegidos (feature 024).
//
// `unlocked` vive SÓ em memória (D-02): o app sempre inicia bloqueado e o
// re-bloqueio ao sair acontece sozinho com o processo/página. Nunca persistir.

export type PinSetupMode = 'create' | 'change' | 'reset'

interface Resolver {
  resolve: (ok: boolean) => void
}

interface PinSetupRequest extends Resolver {
  mode: PinSetupMode
}

interface RequestUnlockOptions {
  // Pede o PIN mesmo já desbloqueado (Alterar PIN, Desativar proteção — FR-014).
  force?: boolean
}

interface BookLockState {
  unlocked: boolean
  // Prompt "digite o PIN" (verificar) e prompt "defina o PIN" (criar/alterar/redefinir).
  // Os dois são renderizados uma única vez por BookLockHost (D-11).
  prompt: Resolver | null
  setup: PinSetupRequest | null
  lock: () => void
  unlock: () => void
  requestUnlock: (options?: RequestUnlockOptions) => Promise<boolean>
  settlePrompt: (ok: boolean) => void
  requestPinSetup: (mode: PinSetupMode) => Promise<boolean>
  settleSetup: (ok: boolean) => void
}

// As Promises dos prompts abertos ficam fora do estado do Zustand (não são
// serializáveis e não devem disparar render). Chamadas concorrentes recebem a
// MESMA Promise, para existir um único teclado na tela.
let pendingPrompt: Promise<boolean> | null = null
let pendingSetup: Promise<boolean> | null = null

export const useBookLockStore = create<BookLockState>((set, get) => ({
  unlocked: false,
  prompt: null,
  setup: null,

  // NÃO toca nos prompts abertos: o seletor de credencial do "Esqueci o PIN" pode
  // pausar o app, e o re-bloqueio resultante não pode derrubar o fluxo em curso.
  // Os prompts só abrem com o app já bloqueado (ou forçados), então não há o que fechar.
  lock: () => set({ unlocked: false }),

  unlock: () => set({ unlocked: true }),

  requestUnlock: (options) => {
    if (!options?.force && get().unlocked) return Promise.resolve(true)
    if (pendingPrompt) return pendingPrompt

    pendingPrompt = new Promise<boolean>((resolve) => {
      set({ prompt: { resolve } })
    })
    return pendingPrompt
  },

  settlePrompt: (ok) => {
    const { prompt } = get()
    if (!prompt) return
    pendingPrompt = null
    set((state) => ({ prompt: null, unlocked: ok ? true : state.unlocked }))
    prompt.resolve(ok)
  },

  requestPinSetup: (mode) => {
    if (pendingSetup) return pendingSetup

    pendingSetup = new Promise<boolean>((resolve) => {
      set({ setup: { mode, resolve } })
    })
    return pendingSetup
  },

  settleSetup: (ok) => {
    const { setup } = get()
    if (!setup) return
    pendingSetup = null
    set({ setup: null })
    setup.resolve(ok)
  },
}))

// Usado pela guarda do botão voltar: qualquer prompt de PIN aberto "possui" o voltar.
export function isBookLockOverlayOpen(): boolean {
  const { prompt, setup } = useBookLockStore.getState()
  return prompt !== null || setup !== null
}
