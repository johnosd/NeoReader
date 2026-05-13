import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { ArrowUpDown, BookOpen, Check, FileText, FolderOpen, MoreVertical, Plus, Search, Star, Tag, Trash2, X } from 'lucide-react'
import { AdBannerSlot } from '../components/AdBannerSlot'
import { BottomNav } from '../components/BottomNav'
import { QuickBookActionsSheet } from '../components/QuickBookActionsSheet'
import { BottomSheet, Button, Checkbox, EmptyState, Input, Skeleton, Spinner, Toast } from '../components/ui'
import { setBookTags, toggleFavorite } from '../db/books'
import { createTag, deleteTag } from '../db/tags'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useLibraryCatalog, type LibraryBook, type LibraryFilter, type LibrarySort } from '../hooks/useLibraryCatalog'
import { BookImportService, type FolderImportOptions, type ImportPreviewItem, type ImportProgress, type ImportSummary } from '../services/BookImportService'
import { consumePendingNativeFileSelection, consumePendingNativeFolderSelection, selectNativeEpubFile, selectNativeEpubFolder, type NativeFolderFile } from '../services/NativeLibraryImportService'
import type { Book, BookTag } from '../types/book'

interface LibraryScreenProps {
  onOpenBook: (book: Book) => void
  onOpenHome: () => void
  onOpenDiscover: () => void
  onOpenProfile: () => void
}

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'reading', label: 'Lendo' },
  { id: 'unread', label: 'Não iniciados' },
  { id: 'finished', label: 'Finalizados' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'untagged', label: 'Sem tag' },
]

const SORT_OPTIONS: Array<{ id: LibrarySort; label: string }> = [
  { id: 'recent', label: 'Recentes' },
  { id: 'title', label: 'Título A-Z' },
  { id: 'author', label: 'Autor A-Z' },
  { id: 'importedAt', label: 'Data de importação' },
  { id: 'format', label: 'Formato' },
  { id: 'fileName', label: 'Nome do arquivo' },
]

const EPUB_FILE_PATTERN = /\.epub$/i

export function LibraryScreen({ onOpenBook, onOpenHome, onOpenDiscover, onOpenProfile }: LibraryScreenProps) {
  const {
    isLoading,
    books,
    filteredBooks,
    tags,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
    sort,
    setSort,
  } = useLibraryCatalog()
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [sortSheetOpen, setSortSheetOpen] = useState(false)
  const [optionsBook, setOptionsBook] = useState<LibraryBook | null>(null)
  const [tagEditorBook, setTagEditorBook] = useState<LibraryBook | null>(null)
  const [importFlow, setImportFlow] = useState<ImportFlowState>({ step: 'closed' })
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [importing, setImporting] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openNativeFolderResult = useCallback((result: { folderName: string; folderUri: string; files: NativeFolderFile[] }) => {
    setImportFlow({
      step: 'options',
      files: [],
      nativeFiles: result.files,
      folderName: result.folderName,
      folderUri: result.folderUri,
      includeSubfolders: true,
      autoImportEnabled: false,
      applyFolderTag: true,
      tagName: result.folderName,
    })
  }, [])

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    let active = true
    void consumePendingNativeFolderSelection().then((result) => {
      if (!active || !result) return
      setActionSheetOpen(false)
      setImportError(null)
      openNativeFolderResult(result)
    }).catch(() => undefined)
    return () => { active = false }
  }, [openNativeFolderResult])

  useEffect(() => {
    let active = true
    void consumePendingNativeFileSelection().then(async (nativeFile) => {
      if (!active || !nativeFile) return
      setImporting(true)
      setImportError(null)
      try {
        await BookImportService.importNativeEpub(nativeFile)
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Erro ao importar arquivo.')
      } finally {
        if (active) setImporting(false)
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useCapacitorBackButton(() => {
    if (tagEditorBook) { setTagEditorBook(null); return }
    if (optionsBook) { setOptionsBook(null); return }
    if (sortSheetOpen) { setSortSheetOpen(false); return }
    if (actionSheetOpen) { setActionSheetOpen(false); return }
    if (importFlow.step !== 'closed') { setImportFlow({ step: 'closed' }); return }
    onOpenHome()
  })

  const subtitle = formatBookCount(books.length)
  const isSearchEmpty = !isLoading && books.length > 0 && search.trim() && filteredBooks.length === 0
  const isFilterEmpty = !isLoading && books.length > 0 && !search.trim() && activeFilter !== 'all' && filteredBooks.length === 0
  const liveTagEditorBook = useMemo(() => {
    if (!tagEditorBook?.id) return tagEditorBook
    return books.find((book) => book.id === tagEditorBook.id) ?? tagEditorBook
  }, [books, tagEditorBook])

  async function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (selectedFiles.length === 0) return

    const folderName = getFolderName(selectedFiles)
    const files = filterEpubFiles(selectedFiles)
    setActionSheetOpen(false)
    setImportError(null)

    if (files.length === 0) {
      setImportError('Nenhum EPUB encontrado nesta pasta.')
      return
    }

    setImportFlow({
      step: 'options',
      files,
      folderName,
      folderUri: folderName,
      includeSubfolders: true,
      autoImportEnabled: false,
      applyFolderTag: true,
      tagName: folderName,
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = filterEpubFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
    if (files.length === 0) {
      setImportError('Nenhum EPUB selecionado.')
      return
    }

    setActionSheetOpen(false)
    setImportError(null)
    await buildPreview({
      step: 'options',
      files,
      folderName: 'Arquivos selecionados',
      folderUri: 'manual-files',
      includeSubfolders: false,
      autoImportEnabled: false,
      applyFolderTag: false,
      tagName: '',
    })
  }

  async function chooseFolder() {
    setImporting(true)
    setImportError(null)
    try {
      const result = await selectNativeEpubFolder()
      if (!result) {
        setImporting(false)
        folderInputRef.current?.click()
        return
      }

      openNativeFolderResult(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setImportError(error instanceof Error ? error.message : 'Erro ao selecionar pasta.')
    } finally {
      setImporting(false)
    }
  }

  async function importFilesAction() {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click()
      return
    }

    setActionSheetOpen(false)
    setImporting(true)
    setImportError(null)
    try {
      const nativeFile = await selectNativeEpubFile()
      if (nativeFile) await BookImportService.importNativeEpub(nativeFile)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setImportError(error instanceof Error ? error.message : 'Erro ao importar arquivo.')
    } finally {
      setImporting(false)
    }
  }

  async function buildPreview(options: ImportOptionsState) {
    setImporting(true)
    try {
      const nativeFiles = resolveNativeImportFiles(options)
      const files = nativeFiles ? [] : await resolveImportFiles(options)
      const itemCount = nativeFiles?.length ?? files.length
      if (itemCount === 0) {
        setImportFlow({ ...options, files, nativeFiles: nativeFiles ?? undefined })
        setImportError('Nenhum EPUB encontrado nesta pasta.')
        return
      }
      const preview = nativeFiles
        ? await BookImportService.buildNativeImportPreview(nativeFiles)
        : await BookImportService.buildImportPreview(files)
      setImportFlow({ ...options, files, nativeFiles: nativeFiles ?? undefined, step: 'preview', preview, selectedTagIds: [] })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao escanear arquivos.')
    } finally {
      setImporting(false)
    }
  }

  async function resolveImportFiles(options: ImportOptionsState): Promise<File[]> {
    const files = options.includeSubfolders
      ? options.files
      : options.files.filter((file) => !isInSubfolder(file))
    return filterEpubFiles(files)
  }

  function resolveNativeImportFiles(options: ImportOptionsState): NativeFolderFile[] | null {
    if (!options.nativeFiles) return null
    return options.includeSubfolders
      ? options.nativeFiles
      : options.nativeFiles.filter((file) => !isNativeInSubfolder(file))
  }

  async function confirmImport() {
    if (importFlow.step !== 'preview') return
    setImporting(true)
    setImportProgress(null)
    setImportError(null)
    try {
      let tagIds = [...importFlow.selectedTagIds]
      if (importFlow.applyFolderTag && importFlow.tagName.trim()) {
        const folderTagId = await createTag(importFlow.tagName)
        tagIds = [...new Set([...tagIds, folderTagId])]
      }

      const sourceFolder: FolderImportOptions = {
        folderName: importFlow.folderName,
        folderUri: importFlow.folderUri,
        includeSubfolders: importFlow.includeSubfolders,
        autoImportEnabled: importFlow.autoImportEnabled,
      }

      const summary = await BookImportService.importSelectedBooks({
        items: importFlow.preview,
        tagIds,
        sourceFolder,
        onProgress: setImportProgress,
      })
      setImportSummary(summary)
      setImportFlow({ step: 'closed' })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao importar livros.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base pb-[90px] text-text-primary">
      <input ref={folderInputRef} type="file" multiple accept=".epub,application/epub+zip" className="hidden" onChange={handleFolderChange} />
      <input ref={fileInputRef} type="file" multiple accept=".epub,application/epub+zip" className="hidden" onChange={handleFileChange} />

      {importError && <Toast tone="error" onDismiss={() => setImportError(null)}>{importError}</Toast>}
      {importSummary && (
        <Toast tone={importSummary.errors > 0 ? 'warning' : 'success'} onDismiss={() => setImportSummary(null)}>
          {formatImportSummary(importSummary)}
        </Toast>
      )}

      <header className="px-5 pt-10 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionSheetOpen(true)}
            aria-label="Importar livros"
            className="flex h-11 w-11 items-center justify-center rounded-md bg-purple-primary text-white shadow-purple-glow transition-transform active:scale-95"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar livro, autor ou tag"
            leftIcon={<Search size={18} />}
            rightSlot={search ? (
              <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="p-2 text-text-muted active:text-text-primary">
                <X size={16} />
              </button>
            ) : undefined}
          />
        </div>

        <div className="mt-4 -mx-5 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 px-5 pb-1">
            {FILTERS.map((filter) => (
              <FilterChip
                key={filter.id}
                active={activeFilter === filter.id}
                label={filter.label}
                onClick={() => setActiveFilter(filter.id)}
              />
            ))}
            {tags.filter((tag): tag is BookTag & { id: number } => tag.id !== undefined).map((tag) => (
              <FilterChip
                key={tag.id}
                active={activeFilter === `tag:${tag.id}`}
                label={tag.name}
                onClick={() => setActiveFilter(`tag:${tag.id}`)}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
          <p className="text-xs text-text-muted">{filteredBooks.length} exibidos</p>
          <button
            type="button"
            onClick={() => setSortSheetOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white/5 px-3 text-sm font-semibold text-text-primary active:bg-white/10"
          >
            <ArrowUpDown size={15} />
            Ordenar
          </button>
        </div>
      </header>

      <main>
        {isLoading && <LibrarySkeleton />}

        {!isLoading && books.length === 0 && (
          <EmptyState
            icon={<BookOpen size={48} />}
            title="Sua biblioteca está vazia"
            description="Importe uma pasta com seus PDFs e EPUBs para começar."
            action={(
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Button onClick={() => setImportFlow({ step: 'intro' })} leftIcon={<FolderOpen size={18} />}>Importar pasta</Button>
                <Button variant="secondary" onClick={() => void importFilesAction()} leftIcon={<FileText size={18} />}>Importar arquivos</Button>
              </div>
            )}
          />
        )}

        {isSearchEmpty && (
          <EmptyState
            icon={<Search size={44} />}
            title="Nenhum livro encontrado"
            description="Tente buscar por título, autor, tag ou formato."
            action={<Button size="sm" variant="secondary" onClick={() => setSearch('')}>Limpar busca</Button>}
          />
        )}

        {isFilterEmpty && (
          <EmptyState
            icon={<Tag size={44} />}
            title="Nenhum livro nesta categoria"
            description="Adicione tags aos seus livros ou escolha outro filtro."
          />
        )}

        {!isLoading && filteredBooks.length > 0 && (
          <div className="divide-y divide-white/[0.05]">
            {filteredBooks.map((book) => (
              <LibraryBookRow
                key={book.id}
                book={book}
                onOpenBook={onOpenBook}
                onOpenOptions={setOptionsBook}
                onOpenTags={setTagEditorBook}
              />
            ))}
          </div>
        )}
      </main>

      <AdBannerSlot marginAboveBottomDp={64} />

      <BottomNav
        activeTab="biblioteca"
        onTabChange={(tab) => {
          if (tab === 'home') onOpenHome()
          if (tab === 'discover') onOpenDiscover()
          if (tab === 'profile') onOpenProfile()
        }}
      />

      <ImportActionSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        onImportFolder={() => {
          setActionSheetOpen(false)
          setImportFlow({ step: 'intro' })
        }}
        onImportFiles={() => void importFilesAction()}
      />
      <SortSheet open={sortSheetOpen} sort={sort} onClose={() => setSortSheetOpen(false)} onChange={setSort} />
      <QuickBookActionsSheet book={optionsBook} onClose={() => setOptionsBook(null)} />
      <LibraryTagSheet
        book={liveTagEditorBook}
        tags={tags}
        books={books}
        onClose={() => setTagEditorBook(null)}
        onTagDeleted={(tagId) => {
          if (activeFilter === `tag:${tagId}`) setActiveFilter('all')
        }}
      />
      <ImportFlowSheet
        state={importFlow}
        tags={tags}
        importing={importing}
        progress={importProgress}
        onClose={() => setImportFlow({ step: 'closed' })}
        onChooseFolder={() => void chooseFolder()}
        onOptionsChange={setImportFlow}
        onBuildPreview={buildPreview}
        onConfirmImport={confirmImport}
      />
    </div>
  )
}

type ImportFlowState =
  | { step: 'closed' }
  | { step: 'intro' }
  | ImportOptionsState
  | ImportPreviewState

interface ImportOptionsState {
  step: 'options'
  files: File[]
  nativeFiles?: NativeFolderFile[]
  folderName: string
  folderUri: string
  includeSubfolders: boolean
  autoImportEnabled: boolean
  applyFolderTag: boolean
  tagName: string
}

interface ImportPreviewState extends Omit<ImportOptionsState, 'step'> {
  step: 'preview'
  preview: ImportPreviewItem[]
  selectedTagIds: number[]
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-9 shrink-0 rounded-pill border px-3 text-sm font-semibold transition-colors',
        active ? 'border-purple-primary bg-purple-primary text-white' : 'border-border bg-white/5 text-text-secondary active:bg-white/10',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function LibraryBookRow({ book, onOpenBook, onOpenOptions, onOpenTags }: {
  book: LibraryBook
  onOpenBook: (book: Book) => void
  onOpenOptions: (book: LibraryBook) => void
  onOpenTags: (book: LibraryBook) => void
}) {
  const coverUrl = useBookCoverUrl(book.id)
  const author = book.author?.trim() || 'Autor desconhecido'
  const isFavorite = Boolean(book.isFavorite)

  async function handleToggleFavorite() {
    if (book.id === undefined) return
    await toggleFavorite(book.id)
  }

  return (
    <article className="flex gap-3 px-5 py-3">
      <button
        type="button"
        onClick={() => onOpenBook(book)}
        className="h-[92px] w-[62px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-bg-surface-2 active:opacity-80"
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/30">
            <BookOpen size={24} />
          </div>
        )}
      </button>
      <div className="min-w-0 flex-1 pt-0.5">
        <button
          type="button"
          onClick={() => onOpenBook(book)}
          className="block w-full text-left active:opacity-80"
        >
          <h2 className="truncate text-[15px] font-bold text-text-primary">{book.title}</h2>
          <p className="mt-1 truncate text-sm text-text-secondary">{author}</p>
          <p className="mt-2 text-xs font-semibold text-text-muted">
            {book.percentage}% lido • {book.format ?? 'EPUB'}
          </p>
          {book.lastOpenedAt && (
            <p className="mt-1 text-[11px] text-text-muted">Aberto em {formatDate(book.lastOpenedAt)}</p>
          )}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {book.tagRecords.length > 0 ? book.tagRecords.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onOpenTags(book)}
              aria-label={`Editar tags de ${book.title}`}
              className="rounded-sm bg-purple-primary/15 px-2 py-1 text-[10px] font-semibold text-purple-light active:bg-purple-primary/25"
            >
              #{tag.name}
            </button>
          )) : (
            <button
              type="button"
              onClick={() => onOpenTags(book)}
              aria-label={`Adicionar tag em ${book.title}`}
              className="rounded-sm bg-white/5 px-2 py-1 text-[10px] font-semibold text-text-muted active:bg-white/10"
            >
              Sem tag
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleToggleFavorite()}
            disabled={book.id === undefined}
            aria-label={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
            aria-pressed={isFavorite}
            className={[
              'inline-flex h-6 w-6 items-center justify-center rounded-sm border transition-colors active:scale-95 disabled:opacity-40',
              isFavorite
                ? 'border-purple-light/60 bg-purple-primary/20 text-purple-light'
                : 'border-white/10 bg-white/5 text-text-muted active:text-purple-light',
            ].join(' ')}
          >
            <Star size={13} strokeWidth={2.4} className={isFavorite ? 'fill-purple-light' : ''} />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenOptions(book)}
        aria-label="Opções do livro"
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted active:bg-white/10"
      >
        <MoreVertical size={18} />
      </button>
    </article>
  )
}

function LibraryTagSheet({ book, tags, books, onClose, onTagDeleted }: {
  book: LibraryBook | null
  tags: BookTag[]
  books: LibraryBook[]
  onClose: () => void
  onTagDeleted: (tagId: number) => void
}) {
  const [newTagName, setNewTagName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteTag, setPendingDeleteTag] = useState<BookTag | null>(null)

  useEffect(() => {
    if (!book) return
    setNewTagName('')
    setError(null)
    setPendingDeleteTag(null)
  }, [book])

  async function runTagAction(task: () => Promise<void>) {
    if (!book?.id || saving) return
    setSaving(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar tags.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleTag(tag: BookTag, checked: boolean) {
    if (tag.id === undefined || !book?.id) return
    await runTagAction(async () => {
      const nextTags = new Set(book.tags ?? [])
      if (checked) nextTags.add(tag.id!)
      else nextTags.delete(tag.id!)
      await setBookTags(book.id!, [...nextTags])
    })
  }

  async function handleCreateTag() {
    const tagName = newTagName.trim()
    if (!tagName || !book?.id) return

    await runTagAction(async () => {
      const tagId = await createTag(tagName)
      const nextTags = new Set(book.tags ?? [])
      nextTags.add(tagId)
      await setBookTags(book.id!, [...nextTags])
      setNewTagName('')
    })
  }

  async function handleDeleteTag() {
    if (pendingDeleteTag?.id === undefined) return
    const tagId = pendingDeleteTag.id

    await runTagAction(async () => {
      await deleteTag(tagId)
      onTagDeleted(tagId)
      setPendingDeleteTag(null)
    })
  }

  function getTagUsageCount(tag: BookTag): number {
    if (tag.id === undefined) return 0
    return books.filter((libraryBook) => (libraryBook.tags ?? []).includes(tag.id!)).length
  }

  return (
    <BottomSheet open={book !== null} onClose={saving ? () => {} : onClose} title="Editar tags">
      {book && (
        <div className="space-y-4">
          <p className="-mt-2 truncate text-xs text-text-muted">{book.title}</p>

          <div className="rounded-md border border-border bg-white/5 p-3">
            <div className="space-y-2">
              {tags.length > 0 ? tags.map((tag) => (
                <div
                  key={tag.id ?? tag.name}
                  className="flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <Checkbox
                      checked={tag.id !== undefined && (book.tags ?? []).includes(tag.id)}
                      disabled={saving || tag.id === undefined}
                      onChange={(checked) => void handleToggleTag(tag, checked)}
                      label={tag.name}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteTag(tag)}
                    disabled={saving || tag.id === undefined}
                    aria-label={`Deletar tag ${tag.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors active:bg-error/15 active:text-error disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )) : (
                <p className="text-xs text-text-muted">Nenhuma tag criada ainda.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateTag()
              }}
              placeholder="Nova tag"
              disabled={saving}
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-purple-primary disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleCreateTag()}
              disabled={saving || !newTagName.trim()}
              className="h-10 rounded-md bg-purple-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Criar
            </button>
          </div>

          {saving && (
            <div className="flex justify-center py-1">
              <Spinner size={18} label="Salvando" />
            </div>
          )}
          {error && <p className="text-center text-sm text-error">{error}</p>}

          {pendingDeleteTag && (
            <div className="rounded-md border border-error/30 bg-error/15 px-4 py-3">
              <p className="text-sm font-semibold text-error">Apagar tag "{pendingDeleteTag.name}"?</p>
              <p className="mt-1 text-xs text-error/75">
                {formatTagDeleteMessage(getTagUsageCount(pendingDeleteTag))}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPendingDeleteTag(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button variant="danger" size="sm" onClick={() => void handleDeleteTag()} disabled={saving}>
                  {saving ? 'Apagando...' : 'Apagar tag'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

function ImportActionSheet({ open, onClose, onImportFolder, onImportFiles }: {
  open: boolean
  onClose: () => void
  onImportFolder: () => void
  onImportFiles: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Importar livros">
      <div className="space-y-2">
        <ActionRow icon={<FolderOpen size={18} />} title="Importar pasta" description="Escolha uma pasta específica com EPUBs." onClick={onImportFolder} />
        <ActionRow icon={<FileText size={18} />} title="Importar arquivos" description="Selecione EPUBs individuais." onClick={onImportFiles} />
      </div>
    </BottomSheet>
  )
}

function SortSheet({ open, sort, onClose, onChange }: {
  open: boolean
  sort: LibrarySort
  onClose: () => void
  onChange: (sort: LibrarySort) => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Ordenar">
      <div className="-mx-4">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => { onChange(option.id); onClose() }}
            className="flex w-full items-center justify-between border-b border-white/5 px-4 py-4 text-left text-sm font-semibold text-text-primary active:bg-white/5"
          >
            {option.label}
            {sort === option.id && <Check size={18} className="text-purple-light" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}


function ImportFlowSheet({
  state,
  tags,
  importing,
  progress,
  onClose,
  onChooseFolder,
  onOptionsChange,
  onBuildPreview,
  onConfirmImport,
}: {
  state: ImportFlowState
  tags: BookTag[]
  importing: boolean
  progress: ImportProgress | null
  onClose: () => void
  onChooseFolder: () => void
  onOptionsChange: (state: ImportFlowState) => void
  onBuildPreview: (state: ImportOptionsState) => Promise<void>
  onConfirmImport: () => Promise<void>
}) {
  const open = state.step !== 'closed'
  const title = state.step === 'intro' ? 'Importar pasta' : state.step === 'options' ? 'Configurar importação' : 'Preview da importação'

  return (
    <BottomSheet open={open} onClose={importing ? () => {} : onClose} title={title}>
      {state.step === 'intro' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-text-secondary">
            Escolha uma pasta com seus livros. O NeoReader acessará apenas a pasta selecionada.
          </p>
          {importing && (
            <div className="flex items-center gap-3 rounded-md border border-purple-primary/25 bg-purple-primary/10 px-4 py-3 text-sm text-text-secondary" role="status" aria-live="polite">
              <Spinner size={18} label="Lendo pasta" />
              <span>Processando a pasta selecionada...</span>
            </div>
          )}
          <Button disabled={importing} onClick={onChooseFolder} leftIcon={<FolderOpen size={18} />}>
            {importing ? 'Lendo pasta...' : 'Escolher pasta'}
          </Button>
        </div>
      )}

      {state.step === 'options' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{getImportFileCount(state)} arquivos encontrados em {state.folderName}.</p>
          <Checkbox checked={state.includeSubfolders} onChange={(value) => onOptionsChange({ ...state, includeSubfolders: value })} label="Incluir subpastas" />
          <Checkbox checked={state.autoImportEnabled} onChange={(value) => onOptionsChange({ ...state, autoImportEnabled: value })} label="Detectar novos livros automaticamente" />
          <Checkbox checked={state.applyFolderTag} onChange={(value) => onOptionsChange({ ...state, applyFolderTag: value })} label="Aplicar tag automática com nome da pasta" />
          {state.applyFolderTag && (
            <Input value={state.tagName} onChange={(e) => onOptionsChange({ ...state, tagName: e.target.value })} label="Tag sugerida" />
          )}
          {importing && (
            <div className="flex items-center gap-3 rounded-md border border-purple-primary/25 bg-purple-primary/10 px-4 py-3 text-sm text-text-secondary" role="status" aria-live="polite">
              <Spinner size={18} label="Lendo arquivos" />
              <span>Lendo arquivos e preparando o preview...</span>
            </div>
          )}
          <Button disabled={importing} onClick={() => void onBuildPreview(state)}>
            {importing ? 'Preparando preview...' : 'Continuar'}
          </Button>
        </div>
      )}

      {state.step === 'preview' && (
        <div className="space-y-4">
          <ImportPreviewStats preview={state.preview} />
          <div className="max-h-[34vh] overflow-y-auto rounded-md border border-border">
            {state.preview.map((item) => (
              <ImportPreviewRow
                key={item.id}
                item={item}
                onChange={(selected) => {
                  onOptionsChange({
                    ...state,
                    preview: state.preview.map((current) => current.id === item.id ? { ...current, selected } : current),
                  })
                }}
              />
            ))}
          </div>
          {importing && <ImportProgressPanel progress={progress} />}
          <div className="rounded-md border border-border bg-white/5 p-3">
            <p className="mb-2 text-sm font-bold">Tags adicionais</p>
            <div className="space-y-2">
              {tags.map((tag) => tag.id !== undefined && (
                <Checkbox
                  key={tag.id}
                  checked={state.selectedTagIds.includes(tag.id)}
                  onChange={(checked) => {
                    const next = checked
                      ? [...state.selectedTagIds, tag.id!]
                      : state.selectedTagIds.filter((id) => id !== tag.id)
                    onOptionsChange({ ...state, selectedTagIds: next })
                  }}
                  label={tag.name}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={importing} onClick={onClose}>Cancelar</Button>
            <Button disabled={importing || state.preview.every((item) => !item.selected)} onClick={() => void onConfirmImport()}>
              {importing ? 'Importando...' : 'Importar selecionados'}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

function ImportPreviewStats({ preview }: { preview: ImportPreviewItem[] }) {
  const stats = useMemo(() => ({
    total: preview.length,
    newItems: preview.filter((item) => item.supported && !item.duplicate).length,
    duplicates: preview.filter((item) => item.duplicate).length,
    unsupported: preview.filter((item) => !item.supported).length,
  }), [preview])

  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      <Stat value={stats.total} label="arquivos" />
      <Stat value={stats.newItems} label="novos" />
      <Stat value={stats.duplicates} label="já importados" />
      <Stat value={stats.unsupported} label="não suportados" />
    </div>
  )
}

function ImportPreviewRow({ item, onChange }: { item: ImportPreviewItem; onChange: (selected: boolean) => void }) {
  const disabled = !item.supported || item.duplicate
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-3 py-3 last:border-b-0">
      <Checkbox checked={item.selected} onChange={onChange} disabled={disabled} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{item.fileName}</p>
        <p className="text-xs text-text-muted">{item.format} • {formatFileSize(item.fileSize)}{item.reason ? ` • ${item.reason}` : ''}</p>
      </div>
    </div>
  )
}

function ImportProgressPanel({ progress }: { progress: ImportProgress | null }) {
  const total = progress?.total ?? 0
  const current = progress?.current ?? 0
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0
  const label = progress?.phase === 'finishing'
    ? 'Finalizando importação'
    : progress?.fileName
      ? `Importando ${progress.fileName}`
      : 'Preparando importação'

  return (
    <div className="rounded-md border border-purple-primary/25 bg-purple-primary/10 p-4" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary">{label}</p>
          <p className="mt-1 text-xs text-text-muted">
            {total > 0 ? `${current} de ${total} arquivos processados` : 'Calculando arquivos selecionados'}
          </p>
        </div>
        <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-[3px] border-white/10 border-t-purple-light" />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-pill bg-white/10">
        <div
          className="h-full rounded-pill bg-purple-light transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <ProgressStat value={progress?.imported ?? 0} label="importados" />
        <ProgressStat value={progress?.duplicate ?? 0} label="duplicados" />
        <ProgressStat value={progress?.unsupported ?? 0} label="ignorados" />
        <ProgressStat value={progress?.errors ?? 0} label="erros" />
      </div>
    </div>
  )
}

function ProgressStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-text-primary">{value}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  )
}

function ActionRow({ icon, title, description, onClick, danger }: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md bg-bg-hover px-4 py-4 text-left text-sm transition-transform active:scale-[0.98] ${danger ? 'text-error' : 'text-text-primary'}`}
    >
      <span className={danger ? 'text-error' : 'text-purple-light'}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
      </span>
    </button>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md bg-white/5 px-2 py-2">
      <p className="text-base font-bold text-text-primary">{value}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  )
}

function LibrarySkeleton() {
  return (
    <div className="px-5">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex gap-3 border-b border-white/[0.05] py-3">
          <Skeleton className="h-[92px] w-[62px] rounded-md" />
          <div className="flex-1 pt-1">
            <Skeleton variant="text" className="h-4 w-3/4" />
            <Skeleton variant="text" className="mt-2 h-3 w-1/2" />
            <Skeleton variant="text" className="mt-4 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function formatBookCount(count: number): string {
  if (count === 0) return '0 livros'
  if (count === 1) return '1 livro'
  return `${count} livros`
}

function formatImportSummary(summary: ImportSummary): string {
  if (summary.errors > 0) {
    return `Importação concluída com avisos: ${summary.imported} importados, ${summary.duplicate} duplicados, ${summary.unsupported} não suportados, ${summary.errors} erros.`
  }
  if (summary.duplicate > 0) {
    return `${summary.imported} livros importados. ${summary.duplicate} livros já estavam na biblioteca e foram ignorados.`
  }
  return `${summary.imported} livros importados.`
}

function formatTagDeleteMessage(usageCount: number): string {
  if (usageCount === 0) return 'Esta tag sera apagada da biblioteca.'
  if (usageCount === 1) return 'Esta tag sera removida de 1 livro e apagada da biblioteca.'
  return `Esta tag sera removida de ${usageCount} livros e apagada da biblioteca.`
}

function getFolderName(files: File[]): string {
  const relativePath = files.find((file) => file.webkitRelativePath)?.webkitRelativePath
  return relativePath?.split('/').filter(Boolean)[0] ?? 'Pasta selecionada'
}

function isInSubfolder(file: File): boolean {
  const parts = file.webkitRelativePath.split('/').filter(Boolean)
  return parts.length > 2
}

function isNativeInSubfolder(file: NativeFolderFile): boolean {
  const parts = (file.path ?? '').split('/').filter(Boolean)
  return parts.length > 2
}

function getImportFileCount(state: ImportOptionsState): number {
  if (state.nativeFiles) {
    return state.includeSubfolders
      ? state.nativeFiles.length
      : state.nativeFiles.filter((file) => !isNativeInSubfolder(file)).length
  }

  const files = state.includeSubfolders
    ? state.files
    : state.files.filter((file) => !isInSubfolder(file))
  return filterEpubFiles(files).length
}

function filterEpubFiles(files: File[]): File[] {
  return files.filter((file) => EPUB_FILE_PATTERN.test(file.name))
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
