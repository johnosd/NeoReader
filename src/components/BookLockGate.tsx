import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Lock } from 'lucide-react'
import { db } from '../db/database'
import { useBookLockStore } from '../store/bookLockStore'
import { useSyncRef } from '../hooks/useSyncRef'
import { useI18n } from '../i18n'

interface BookLockGateProps {
  bookId?: number
  // Chamado quando o usuário cancela o PIN: a rota faz pop e volta à tela anterior.
  onDenied: () => void
  children: ReactNode
}

// Garantia de bloqueio por rota (feature 024, D-05): envolve as rotas `book-details`
// e `reader`, por onde TODA abertura de livro passa. Nada de PIN dentro de
// ReaderScreen/EpubViewer.
export function BookLockGate({ bookId, onDenied, children }: BookLockGateProps) {
  const { t } = useI18n()
  const unlocked = useBookLockStore((state) => state.unlocked)
  const [revealed, setRevealed] = useState(false)
  const onDeniedRef = useSyncRef(onDenied)

  // Registro VIVO por id, nunca o snapshot `Book` que a rota carrega: proteger o livro
  // depois de aberto a rota continuaria com o snapshot antigo (R-004).
  // useLiveQuery devolve `undefined` enquanto carrega; usamos `null` para "não existe".
  const record = useLiveQuery(
    async () => (bookId === undefined ? null : ((await db.books.get(bookId)) ?? null)),
    [bookId],
  )

  const isLoading = bookId !== undefined && record === undefined
  const isProtected = record?.isProtected === true
  const covered = isProtected && !unlocked

  // Uma vez desbloqueado nesta montagem, o conteúdo pode montar; depois disso um
  // re-bloqueio só cobre (não desmonta), para o TTS continuar tocando (D-06, FR-010).
  // setState durante a renderização é o padrão do React para estado derivado de props/estado
  // (não passa por efeito, então não causa uma renderização extra em cascata).
  if (isProtected && unlocked && !revealed) setRevealed(true)

  useEffect(() => {
    if (!covered) return
    let current = true
    void useBookLockStore.getState().requestUnlock().then((ok) => {
      if (current && !ok) onDeniedRef.current()
    })
    return () => { current = false }
  }, [covered, onDeniedRef])

  if (isLoading) return <div className="fixed inset-0 bg-bg-base" />

  const mountChildren = !isProtected || unlocked || revealed

  return (
    <>
      {/* Wrapper SEMPRE presente (display: contents não afeta o layout): trocar de
          fragmento para <div> remontaria o leitor e interromperia o TTS. `inert` +
          aria-hidden tiram o conteúdo coberto do foco e do leitor de tela. */}
      <div className="contents" inert={covered} aria-hidden={covered || undefined}>
        {mountChildren ? children : null}
      </div>
      {covered && (
        <div className="fixed inset-0 z-[2050] flex flex-col items-center justify-center gap-3 bg-bg-base text-text-primary">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-primary/20 text-purple-light">
            <Lock size={26} aria-hidden="true" />
          </span>
          <p className="text-lg font-extrabold">{t('bookLock.gate.title')}</p>
          <p className="text-sm text-text-muted">{t('bookLock.gate.description')}</p>
        </div>
      )}
    </>
  )
}
