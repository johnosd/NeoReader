import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Check, DatabaseZap, ImagePlus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { db } from '../db/database'
import { deleteBook, setBookTags, updateReadingStatus } from '../db/books'
import { createTag } from '../db/tags'
import { BookImportService } from '../services/BookImportService'
import { BookInfoRefreshService } from '../services/bookInfo'
import { BottomSheet, Button, Checkbox, Spinner } from './ui'
import type { Book, BookTag } from '../types/book'
import { useI18n } from '../i18n'

interface QuickBookActionsSheetProps {
  book: Book | null
  onClose: () => void
}

export function QuickBookActionsSheet({ book, onClose }: QuickBookActionsSheetProps) {
  const { t } = useI18n()
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), []) ?? []
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    if (loading) return
    resetAndClose()
  }

  function resetAndClose() {
    setError(null)
    setConfirmDelete(false)
    setTagsOpen(false)
    setNewTagName('')
    onClose()
  }

  async function runAction(task: () => Promise<void>, options: { closeOnSuccess?: boolean } = { closeOnSuccess: true }) {
    if (!book?.id || loading) return
    setLoading(true)
    setError(null)
    try {
      await task()
      if (options.closeOnSuccess) resetAndClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('quickActions.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRefreshBookInfo() {
    await runAction(async () => {
      await BookInfoRefreshService.refreshBookInfo(book!)
    })
  }

  async function handleReextractCover() {
    await runAction(async () => {
      const hasCover = await BookImportService.reextractCover(book!)
      if (!hasCover) throw new Error(t('quickActions.noCover'))
    })
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !book?.id) return

    await runAction(() => BookImportService.updateManualCover(book.id!, file))
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  async function handleDelete() {
    await runAction(() => deleteBook(book!.id!))
  }

  async function toggleTag(tag: BookTag) {
    if (tag.id === undefined || !book?.id) return
    const nextTags = new Set(book.tags ?? [])
    if (nextTags.has(tag.id)) nextTags.delete(tag.id)
    else nextTags.add(tag.id)

    await runAction(() => setBookTags(book.id!, [...nextTags]), { closeOnSuccess: false })
  }

  async function handleCreateTag() {
    if (!newTagName.trim() || !book?.id) return

    await runAction(async () => {
      const tagId = await createTag(newTagName)
      const nextTags = new Set(book.tags ?? [])
      nextTags.add(tagId)
      await setBookTags(book.id!, [...nextTags])
      setNewTagName('')
    }, { closeOnSuccess: false })
  }

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageChange}
      />

      <BottomSheet open={book !== null} onClose={handleClose} title={t('quickActions.title')}>
        {book && (
          <p className="-mt-2 mb-4 truncate text-xs text-text-muted">{book.title}</p>
        )}

        <div className="flex flex-col gap-2">
          <ActionRow
            icon={<DatabaseZap size={18} />}
            title={t('quickActions.refreshBookInfo.title')}
            description={t('quickActions.refreshBookInfo.description')}
            onClick={() => void handleRefreshBookInfo()}
            disabled={loading}
          />
          <ActionRow
            icon={<RefreshCw size={18} />}
            title={t('quickActions.reextractCover.title')}
            description={t('quickActions.reextractCover.description')}
            onClick={() => void handleReextractCover()}
            disabled={loading}
          />
          <ActionRow
            icon={<ImagePlus size={18} />}
            title={t('quickActions.chooseCover.title')}
            description={t('quickActions.chooseCover.description')}
            onClick={() => imageInputRef.current?.click()}
            disabled={loading}
          />
          <ActionRow
            icon={<BookOpen size={18} />}
            title={t('quickActions.markReading.title')}
            description={t('quickActions.markReading.description')}
            onClick={() => void runAction(() => updateReadingStatus(book!.id!, 'reading'))}
            disabled={loading}
          />
          <ActionRow
            icon={<Check size={18} />}
            title={t('quickActions.markFinished.title')}
            description={t('quickActions.markFinished.description')}
            onClick={() => void runAction(() => updateReadingStatus(book!.id!, 'finished'))}
            disabled={loading}
          />
          <ActionRow
            icon={<Tags size={18} />}
            title={t('quickActions.tags.title')}
            description={t('quickActions.tags.description')}
            onClick={() => setTagsOpen((value) => !value)}
            disabled={loading}
          />

          {tagsOpen && (
            <TagEditor
              book={book}
              tags={tags}
              newTagName={newTagName}
              disabled={loading}
              onNewTagNameChange={setNewTagName}
              onToggleTag={(tag) => void toggleTag(tag)}
              onCreateTag={() => void handleCreateTag()}
            />
          )}

          {!confirmDelete ? (
            <ActionRow
              icon={<Trash2 size={18} />}
              title={t('quickActions.delete.title')}
              description={t('quickActions.delete.description')}
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              danger
            />
          ) : (
            <div className="rounded-md border border-error/30 bg-error/15 px-4 py-3">
              <p className="text-sm font-semibold text-error">{t('quickActions.confirmDelete.title')}</p>
              <p className="mt-1 text-xs text-error/75">{t('quickActions.confirmDelete.description')}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={loading}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={loading}>
                  {loading ? t('quickActions.deleting') : t('quickActions.deleteButton')}
                </Button>
              </div>
            </div>
          )}

          {loading && !confirmDelete && (
            <div className="flex justify-center py-2">
              <Spinner size={18} label={t('quickActions.processing')} />
            </div>
          )}
          {error && (
            <p className="px-2 pt-1 text-center text-sm text-error">{error}</p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

function TagEditor({
  book,
  tags,
  newTagName,
  disabled,
  onNewTagNameChange,
  onToggleTag,
  onCreateTag,
}: {
  book: Book | null
  tags: BookTag[]
  newTagName: string
  disabled: boolean
  onNewTagNameChange: (value: string) => void
  onToggleTag: (tag: BookTag) => void
  onCreateTag: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-md border border-border bg-white/5 p-3">
      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="text-xs text-text-muted">{t('quickActions.noTags')}</p>
        ) : (
          tags.map((tag) => (
            <Checkbox
              key={tag.id ?? tag.name}
              checked={tag.id !== undefined && (book?.tags ?? []).includes(tag.id)}
              disabled={disabled || tag.id === undefined}
              onChange={() => onToggleTag(tag)}
              label={tag.name}
            />
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
        <input
          value={newTagName}
          onChange={(e) => onNewTagNameChange(e.target.value)}
          placeholder={t('quickActions.newTagPlaceholder')}
          disabled={disabled}
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-purple-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onCreateTag}
          disabled={disabled || !newTagName.trim()}
          className="h-10 rounded-md bg-purple-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('quickActions.createTag')}
        </button>
      </div>
    </div>
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
