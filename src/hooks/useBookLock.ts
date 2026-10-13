import { useCallback } from 'react'
import { setBookProtected } from '../db/books'
import { BookProtectionService } from '../services/BookProtectionService'
import { useBookLockStore } from '../store/bookLockStore'

interface ProtectableBook {
  isProtected?: boolean
}

// Superfície do bloqueio para telas e componentes (feature 024).
export function useBookLock() {
  const unlocked = useBookLockStore((state) => state.unlocked)

  // Livro comum passa direto; protegido e bloqueado abre o prompt de PIN. Quem chama
  // só continua a ação se vier `true` (cancelar não muda nada).
  const guard = useCallback(async (book: ProtectableBook): Promise<boolean> => {
    if (book.isProtected !== true) return true
    return useBookLockStore.getState().requestUnlock()
  }, [])

  // "Bloqueado" para efeito de exibição: protegido e sem PIN digitado. Enquanto for
  // true o cartão/linha mostra só capa, título e cadeado (FR-006).
  const isConcealed = useCallback(
    (book: ProtectableBook) => book.isProtected === true && !unlocked,
    [unlocked],
  )

  const lockNow = useCallback(() => useBookLockStore.getState().lock(), [])

  // Proteger NÃO pede o PIN (só adiciona restrição, FR-005). Sem PIN criado, conduz à
  // criação antes; se o usuário cancelar, o livro continua sem proteção (FR-003).
  const protectBook = useCallback(async (bookId: number): Promise<boolean> => {
    if (!(await BookProtectionService.hasPin())) {
      const created = await useBookLockStore.getState().requestPinSetup('create')
      if (!created) return false
    }
    await setBookProtected(bookId, true)
    return true
  }, [])

  // Remover a proteção exige PIN (ou já estar desbloqueado — FR-005).
  const unprotectBook = useCallback(async (bookId: number): Promise<boolean> => {
    if (!(await useBookLockStore.getState().requestUnlock())) return false
    await setBookProtected(bookId, false)
    return true
  }, [])

  return { unlocked, guard, isConcealed, lockNow, protectBook, unprotectBook }
}
