import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { App as CapApp } from '@capacitor/app'
import { ArrowUpDown, BookOpen, Check, FileText, FolderOpen, MoreVertical, Plus, Search, Tag, X } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { QuickBookActionsSheet } from '../components/QuickBookActionsSheet'
import { BottomSheet, Button, Checkbox, EmptyState, Input, Skeleton, Spinner, Toast } from '../components/ui'
import { createTag } from '../db/tags'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { useLibraryCatalog, type LibraryBook, type LibraryFilter, type LibrarySort } from '../hooks/useLibraryCatalog'
import { BookImportService, type FolderImportOptions, type ImportPreviewItem, type ImportProgress, type ImportSummary } from '../services/BookImportService'
import { readNativeFolderFile, selectNativeEpubFolder, type NativeFolderFile } from '../services/NativeLibraryImportService'
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
  const [importFlow, setImportFlow] = useState<ImportFlowState>({ step: 'closed' })
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [importing, setImporting] = useState(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (optionsBook) { setOptionsBook(null); return }
      if (sortSheetOpen) { setSortSheetOpen(false); return }
      if (actionSheetOpen) { setActionSheetOpen(false); return }
      if (importFlow.step !== 'closed') { setImportFlow({ step: 'closed' }); return }
      onOpenHome()
    })
    return () => { void listenerPromise.then((listener) => listener.remove()) }
  }, [actionSheetOpen, importFlow.step, onOpenHome, optionsBook, sortSheetOpen])

  const subtitle = formatBookCount(books.length)
  const isSearchEmpty = !isLoading && books.length > 0 && search.trim() && filteredBooks.length === 0
  const isFilterEmpty = !isLoading && books.length > 0 && !search.trim() && activeFilter !== 'all' && filteredBooks.length === 0

  async function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const folderName = getFolderName(files)
    setActionSheetOpen(false)
    setImportError(null)
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
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

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
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao selecionar pasta.')
    } finally {
      setImporting(false)
    }
  }

  async function buildPreview(options: ImportOptionsState) {
    setImporting(true)
    try {
      const files = await resolveImportFiles(options)
      const preview = await BookImportService.buildImportPreview(files)
      setImportFlow({ ...options, files, step: 'preview', preview, selectedTagIds: [] })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erro ao escanear arquivos.')
    } finally {
      setImporting(false)
    }
  }

  async function resolveImportFiles(options: ImportOptionsState): Promise<File[]> {
    if (!options.nativeFiles) {
      return options.includeSubfolders
        ? options.files
        : options.files.filter((file) => !isInSubfolder(file))
    }

    const nativeFiles = options.includeSubfolders
      ? options.nativeFiles
      : options.nativeFiles.filter((file) => !isNativeInSubfolder(file))
    const files: File[] = []
    for (const nativeFile of nativeFiles) {
      files.push(await readNativeFolderFile(nativeFile))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return files
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
      <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderChange} />
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
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} leftIcon={<FileText size={18} />}>Importar arquivos</Button>
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
              />
            ))}
          </div>
        )}
      </main>

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
        onImportFiles={() => fileInputRef.current?.click()}
      />
      <SortSheet open={sortSheetOpen} sort={sort} onClose={() => setSortSheetOpen(false)} onChange={setSort} />
      <QuickBookActionsSheet book={optionsBook} onClose={() => setOptionsBook(null)} />
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

function LibraryBookRow({ book, onOpenBook, onOpenOptions }: {
  book: LibraryBook
  onOpenBook: (book: Book) => void
  onOpenOptions: (book: LibraryBook) => void
}) {
  const coverUrl = useBookCoverUrl(book.id)
  const author = book.author?.trim() || 'Autor desconhecido'

  return (
    <article className="flex gap-3 px-5 py-3">
      <button
        type="button"
        onClick={() => onOpenBook(book)}
        className="flex min-w-0 flex-1 gap-3 text-left active:opacity-80"
      >
        <div className="h-[92px] w-[62px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-bg-surface-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <BookOpen size={24} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-[15px] font-bold text-text-primary">{book.title}</h2>
          <p className="mt-1 truncate text-sm text-text-secondary">{author}</p>
          <p className="mt-2 text-xs font-semibold text-text-muted">
            {book.percentage}% lido • {book.format ?? 'EPUB'}
          </p>
          {book.lastOpenedAt && (
            <p className="mt-1 text-[11px] text-text-muted">Aberto em {formatDate(book.lastOpenedAt)}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {book.tagRecords.length > 0 ? book.tagRecords.map((tag) => (
              <span key={tag.id} className="rounded-sm bg-purple-primary/15 px-2 py-1 text-[10px] font-semibold text-purple-light">
                #{tag.name}
              </span>
            )) : (
              <span className="rounded-sm bg-white/5 px-2 py-1 text-[10px] font-semibold text-text-muted">Sem tag</span>
            )}
          </div>
        </div>
      </button>
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
  return state.nativeFiles?.length ?? state.files.length
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
