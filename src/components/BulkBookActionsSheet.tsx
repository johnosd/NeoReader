import { useState, type ReactNode } from 'react'
import { BookOpen, FolderInput, Star, Trash2 } from 'lucide-react'
import { deleteBooks, setBooksFavorite, setBooksReadingStatus } from '../db/books'
import { createCollection, setBooksCollection } from '../db/collections'
import type { LibraryBook } from '../hooks/useLibraryCatalog'
import { useI18n, type MessageKey, type TranslateFn } from '../i18n'
import type { BookCollection, ReadingStatus } from '../types/book'
import { BottomSheet, Button, Spinner } from './ui'

// Resultado que a tela mostra no toast depois de uma ação em lote (FR-012, FR-013).
export interface BulkActionResult {
  tone: 'success' | 'warning' | 'error'
  message: string
}

interface BulkBookActionsSheetProps {
  open: boolean
  // Livros selecionados no momento em que a folha abre.
  books: LibraryBook[]
  collections: BookCollection[]
  onClose: () => void
  onDone: (result: BulkActionResult) => void
}

// Só um painel expandido por vez; `null` = só a lista de ações.
type Panel = 'collection' | 'status' | 'delete' | null

const STATUS_OPTIONS: Array<{ id: ReadingStatus; labelKey: MessageKey }> = [
  { id: 'unread', labelKey: 'bulkActions.status.unread' },
  { id: 'reading', labelKey: 'bulkActions.status.reading' },
  { id: 'finished', labelKey: 'bulkActions.status.finished' },
]

export function BulkBookActionsSheet({ open, books, collections, onClose, onDone }: BulkBookActionsSheetProps) {
  const { t } = useI18n()
  const [panel, setPanel] = useState<Panel>(null)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)

  // O BottomSheet fica montado quando fechado (preserva o estado dos filhos), então os painéis
  // abertos precisam ser zerados à mão. Isto é o padrão "ajustar estado durante o render" do
  // React: setState aqui re-renderiza na hora e evita o render extra de um useEffect.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setPanel(null)
      setNewCollectionName('')
      setError(null)
    }
  }

  // Ids capturados na renderização do clique: `books` encolhe sozinho conforme os livros somem do
  // DB durante a exclusão, mas o laço precisa trabalhar sobre a seleção original.
  const ids = books.map((book) => book.id).filter((id): id is number => id !== undefined)
  const count = ids.length
  // D-08: com todos já favoritos a ação vira "remover"; em qualquer outro caso (inclusive seleção
  // mista) ela favorita todos, aplicando um valor explícito.
  const allFavorite = count > 0 && books.every((book) => book.isFavorite)

  function togglePanel(next: Exclude<Panel, null>) {
    setPanel((current) => (current === next ? null : next))
  }

  function handleClose() {
    // Não deixa fechar no meio da ação: o resultado se perderia.
    if (loading) return
    onClose()
  }

  async function runAction(task: () => Promise<BulkActionResult>) {
    if (loading || count === 0) return
    setLoading(true)
    setError(null)
    try {
      onDone(await task())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('quickActions.error'))
    } finally {
      setLoading(false)
    }
  }

  function handleDelete() {
    return runAction(async () => {
      const { succeeded, failed } = await deleteBooks(ids)
      return buildDeleteResult(succeeded, failed, t)
    })
  }

  function handleFavorite() {
    const value = !allFavorite
    return runAction(async () => {
      await setBooksFavorite(ids, value)
      return { tone: 'success', message: pluralize(count, value ? 'bulkActions.favorite.added' : 'bulkActions.favorite.removed', t) }
    })
  }

  function handleStatus(status: ReadingStatus, labelKey: MessageKey) {
    return runAction(async () => {
      await setBooksReadingStatus(ids, status)
      return { tone: 'success', message: pluralize(count, 'bulkActions.status.done', t, { status: t(labelKey) }) }
    })
  }

  // `collection` null = "Sem coleção" (tira todos da coleção atual).
  function handleMove(collection: BookCollection | null) {
    return runAction(async () => {
      await setBooksCollection(ids, collection?.id ?? null)
      return buildMoveResult(count, collection?.name ?? null, t)
    })
  }

  function handleCreateAndMove() {
    const name = newCollectionName.trim()
    if (!name) return Promise.resolve()
    return runAction(async () => {
      // O índice de nome da tabela é único: um nome que já existe (sem diferenciar maiúsculas)
      // reaproveita a coleção em vez de estourar ConstraintError.
      const existing = collections.find((col) => col.name.trim().toLowerCase() === name.toLowerCase())
      const collectionId = existing?.id ?? await createCollection(name)
      await setBooksCollection(ids, collectionId)
      return buildMoveResult(count, existing?.name ?? name, t)
    })
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={t('bulkActions.title')}>
      <p className="-mt-2 mb-4 text-xs text-text-muted">
        {count === 1 ? t('library.selection.count.one') : t('library.selection.count.many', { count })}
      </p>

      <div className="flex flex-col gap-2">
        <ActionRow
          icon={<Star size={18} />}
          title={t(allFavorite ? 'bulkActions.favorite.remove' : 'bulkActions.favorite.add')}
          description={t(allFavorite ? 'bulkActions.favorite.removeDescription' : 'bulkActions.favorite.addDescription')}
          onClick={() => void handleFavorite()}
          disabled={loading || count === 0}
        />

        <ActionRow
          icon={<BookOpen size={18} />}
          title={t('bulkActions.status.title')}
          description={t('bulkActions.status.description')}
          onClick={() => togglePanel('status')}
          disabled={loading || count === 0}
        />
        {panel === 'status' && (
          <div className="flex flex-col rounded-md border border-border bg-white/5 p-3">
            {STATUS_OPTIONS.map((option) => (
              <PanelOption
                key={option.id}
                label={t(option.labelKey)}
                disabled={loading}
                onClick={() => void handleStatus(option.id, option.labelKey)}
              />
            ))}
          </div>
        )}

        <ActionRow
          icon={<FolderInput size={18} />}
          title={t('bulkActions.collection.title')}
          description={t('bulkActions.collection.description')}
          onClick={() => togglePanel('collection')}
          disabled={loading || count === 0}
        />
        {panel === 'collection' && (
          <div className="rounded-md border border-border bg-white/5 p-3">
            <div className="flex flex-col">
              <PanelOption label={t('bulkActions.collection.none')} disabled={loading} onClick={() => void handleMove(null)} muted />
              {collections.filter((col) => col.id !== undefined).map((col) => (
                <PanelOption key={col.id} label={col.name} disabled={loading} onClick={() => void handleMove(col)} />
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder={t('bulkActions.collection.newPlaceholder')}
                disabled={loading}
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-purple-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void handleCreateAndMove()}
                disabled={loading || !newCollectionName.trim()}
                className="h-10 rounded-md bg-purple-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t('bulkActions.collection.create')}
              </button>
            </div>
          </div>
        )}

        {panel !== 'delete' ? (
          <ActionRow
            icon={<Trash2 size={18} />}
            title={t('bulkActions.delete.title')}
            description={t('bulkActions.delete.description')}
            onClick={() => setPanel('delete')}
            disabled={loading || count === 0}
            danger
          />
        ) : (
          <div className="rounded-md border border-error/30 bg-error/15 px-4 py-3">
            <p className="text-sm font-semibold text-error">
              {count === 1 ? t('bulkActions.delete.confirm.one') : t('bulkActions.delete.confirm.many', { count })}
            </p>
            <p className="mt-1 text-xs text-error/75">{t('bulkActions.delete.warning')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPanel(null)} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={loading}>
                {loading ? t('quickActions.deleting') : t('bulkActions.delete.button')}
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-2">
            <Spinner size={18} label={t('quickActions.processing')} />
          </div>
        )}
        {error && <p className="px-2 pt-1 text-center text-sm text-error">{error}</p>}
      </div>
    </BottomSheet>
  )
}

// Escolhe a chave `<base>.one` / `<base>.many` (padrão de pluralização do projeto, igual a
// library.bookCount.*). O cast é só pro TS: as chaves são montadas por sufixo e existem nos 3 idiomas.
function pluralize(count: number, base: string, t: TranslateFn, extra: Record<string, string | number> = {}): string {
  const key = `${base}.${count === 1 ? 'one' : 'many'}` as MessageKey
  return t(key, { count, ...extra })
}

// Falha parcial: o que deu certo fica aplicado e o aviso diz quantos falharam (FR-013).
function buildDeleteResult(succeeded: number, failed: number, t: TranslateFn): BulkActionResult {
  if (failed === 0) {
    return { tone: 'success', message: pluralize(succeeded, 'bulkActions.delete.done', t) }
  }
  return {
    tone: succeeded === 0 ? 'error' : 'warning',
    message: t('bulkActions.delete.partialFailure', { failed, total: succeeded + failed }),
  }
}

// `collectionName` null = livros tirados da coleção ("Sem coleção").
function buildMoveResult(count: number, collectionName: string | null, t: TranslateFn): BulkActionResult {
  if (collectionName === null) {
    return { tone: 'success', message: pluralize(count, 'bulkActions.collection.removed', t) }
  }
  return { tone: 'success', message: pluralize(count, 'bulkActions.collection.moved', t, { name: collectionName }) }
}

function PanelOption({ label, onClick, disabled, muted }: {
  label: string
  onClick: () => void
  disabled: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-md px-3 py-3 text-left text-sm active:bg-white/10 disabled:opacity-40
        ${muted ? 'text-text-muted' : 'text-text-primary'}`}
    >
      {label}
    </button>
  )
}

interface ActionRowProps {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

// Mesmo visual do ActionRow da QuickBookActionsSheet. Fica duplicado (não exportado de lá) para
// não mexer num arquivo fora do escopo.
function ActionRow({ icon, title, description, onClick, disabled, danger }: ActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md bg-bg-hover px-4 py-4 text-left text-sm
        transition-transform duration-150 active:scale-[0.98] disabled:opacity-40
        ${danger ? 'text-error' : 'text-text-primary'}`}
    >
      <span className={`shrink-0 ${danger ? 'text-error' : 'text-purple-light'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
      </span>
    </button>
  )
}
