import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Star, ChevronRight, Globe, Calendar, HardDrive, Sparkles, BookOpen, Bookmark, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { Badge, Button, EmptyState, ListItem, Spinner } from '../components/ui'
import { db } from '../db/database'
import { toggleFavorite } from '../db/books'
import { softDeleteBookmark } from '../db/bookmarks'
import { updateBookSettings } from '../db/bookSettings'
import { getSettings } from '../db/settings'
import { EpubService, type EpubExtras } from '../services/EpubService'
import type { Book } from '../types/book'
import type { FontSize } from '../types/settings'

interface BookDetailsScreenProps {
  book: Book
  onBack: () => void
  onRead: (book: Book, startHref?: string) => void
}

type Tab = 'chapters' | 'bookmarks' | 'settings' | 'details'

const TABS: { id: Tab; label: string }[] = [
  { id: 'chapters',  label: 'Capítulos'    },
  { id: 'bookmarks', label: 'Marcações'    },
  { id: 'settings',  label: 'Configurações'},
  { id: 'details',   label: 'Detalhes'    },
]

const FONT_SIZES: { value: FontSize; label: string; className: string }[] = [
  { value: 'sm', label: 'A', className: 'text-sm'  },
  { value: 'md', label: 'A', className: 'text-base' },
  { value: 'lg', label: 'A', className: 'text-lg'  },
  { value: 'xl', label: 'A', className: 'text-xl'  },
]

const FONT_PREVIEW_PX: Record<FontSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'Inglês', 'en-US': 'Inglês', 'en-GB': 'Inglês',
  pt: 'Português', 'pt-BR': 'Português (BR)', 'pt-PT': 'Português (PT)',
  es: 'Espanhol', fr: 'Francês', de: 'Alemão',
  it: 'Italiano', ja: 'Japonês', zh: 'Chinês',
}

export function BookDetailsScreen({ book, onBack, onRead }: BookDetailsScreenProps) {
  const [activeTab, setActiveTab]       = useState<Tab>('chapters')
  const [descExpanded, setDescExpanded] = useState(false)
  const [extras, setExtras]             = useState<EpubExtras | null>(null)
  const [extrasLoading, setExtrasLoading] = useState(true)
  const [defaultFontSize, setDefaultFontSize] = useState<FontSize>('md')

  // Dados reativos do IndexedDB
  const liveBook      = useLiveQuery(() => db.books.get(book.id!), [book.id]) ?? book
  const progress      = useLiveQuery(() => db.progress.where('bookId').equals(book.id!).first(), [book.id])
  const bookmarks     = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).and((bookmark) => !bookmark.deletedAt).sortBy('createdAt'),
    [book.id],
  ) ?? []
  const vocabCount    = useLiveQuery(() => db.vocabulary.where('bookId').equals(book.id!).count(), [book.id]) ?? 0
  const bookSettingsRow = useLiveQuery(() => db.bookSettings.where('bookId').equals(book.id!).first(), [book.id])

  const fontSize: FontSize = bookSettingsRow?.fontSize ?? defaultFontSize

  useEffect(() => {
    getSettings().then(s => setDefaultFontSize(s.defaultFontSize))
  }, [])

  useEffect(() => {
    setExtrasLoading(true)
    EpubService.parseExtras(book.fileBlob).then(result => {
      setExtras(result)
      setExtrasLoading(false)
    })
  }, [book.fileBlob])

  useEffect(() => {
    const p = CapApp.addListener('backButton', onBack)
    return () => { void p.then(l => l.remove()) }
  }, [onBack])

  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!liveBook.coverBlob) {
      setCoverUrl(null)
      return
    }

    const nextCoverUrl = URL.createObjectURL(liveBook.coverBlob)
    setCoverUrl(nextCoverUrl)

    return () => {
      URL.revokeObjectURL(nextCoverUrl)
    }
  }, [liveBook.coverBlob])

  const pct        = progress?.percentage ?? 0
  const hasProgress = pct > 0
  const langLabel  = extras?.language ? (LANGUAGE_NAMES[extras.language] ?? extras.language) : null

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-16">

      {/* Header */}
      <header className="px-4 pt-10 pb-4 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 text-sm text-text-muted truncate text-center">{liveBook.title}</p>
        <button
          onClick={() => book.id !== undefined && void toggleFavorite(book.id)}
          className="p-2 -mr-1 rounded-md active:scale-90 transition-transform"
          aria-label={liveBook.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
        >
          <Star
            size={20}
            className={liveBook.isFavorite ? 'text-purple-light fill-purple-light' : 'text-text-secondary'}
          />
        </button>
      </header>

      <main className="flex flex-col gap-6">

        {/* Capa + título + autor */}
        <div className="px-4 flex flex-col items-center gap-4 pt-2">
          <div className="w-40 aspect-[2/3] rounded-md shadow-card overflow-hidden bg-bg-surface flex items-center justify-center shrink-0">
            {coverUrl
              ? <img src={coverUrl} alt={liveBook.title} className="w-full h-full object-cover" />
              : <BookOpen size={40} className="text-text-muted" />
            }
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-serif font-bold text-text-primary leading-snug">
              {liveBook.title}
            </h1>
            {liveBook.author && (
              <p className="text-sm text-text-muted mt-1">{liveBook.author}</p>
            )}
          </div>
        </div>

        {/* Ações principais */}
        <div className="px-4 flex flex-col gap-3">
          <Button variant="primary" tone="purple" fullWidth onClick={() => onRead(liveBook)}>
            {hasProgress ? `Continuar leitura · ${pct}%` : 'Começar a ler'}
          </Button>
          <Button
            variant="outline" tone="purple" fullWidth disabled
            leftIcon={<Sparkles size={16} />}
            rightIcon={<Badge tone="neutral">em breve</Badge>}
          >
            Falar com o livro
          </Button>
        </div>

        {/* Sobre o livro */}
        <div className="px-4">
          <Section title="Sobre o livro">
            {extras?.description && (
              <div className="mb-4">
                <p className={`text-sm text-text-secondary leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>
                  {extras.description}
                </p>
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  className="text-xs text-purple-light mt-1 active:opacity-60"
                >
                  {descExpanded ? 'Mostrar menos' : 'Leia mais'}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-bg-base rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-text-muted tabular-nums shrink-0">{pct}%</span>
            </div>
            <div className="flex gap-4 mt-3">
              <Stat value={bookmarks.length} label="marcadores" />
              <Stat value={vocabCount} label="vocabulário" />
            </div>
          </Section>
        </div>

        {/* ── Abas ─────────────────────────────────────────────────────────── */}
        <div>
          {/* Tab bar com scroll horizontal */}
          <div className="overflow-x-auto px-4 border-b border-border" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-1 min-w-max">
              {TABS.map(tab => {
                const active = activeTab === tab.id
                // Badge de contagem na aba Marcações
                const count = tab.id === 'bookmarks' && bookmarks.length > 0
                  ? bookmarks.length
                  : null
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150
                      ${active ? 'text-purple-light' : 'text-text-muted active:text-text-secondary'}`}
                  >
                    {tab.label}
                    {count !== null && (
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-pill
                        ${active ? 'bg-purple-primary/20 text-purple-light' : 'bg-bg-surface text-text-muted'}`}>
                        {count}
                      </span>
                    )}
                    {/* Indicador ativo — linha na base */}
                    {active && (
                      <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-purple-light" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conteúdo da aba ativa */}
          <div className="px-4 pt-4">

            {/* ── Capítulos (apenas primeiro nível) ── */}
            {activeTab === 'chapters' && (() => {
              // Garante apenas o primeiro nível: ignora subitems aninhados.
              const topChapters = extras?.toc ?? []
              return extrasLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size={20} tone="purple" label="Carregando capítulos" />
                </div>
              ) : topChapters.length > 0 ? (
                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {topChapters.map((chapter, i) => (
                    <ListItem
                      key={`${chapter.href}-${i}`}
                      title={chapter.label}
                      trailing={<ChevronRight size={16} />}
                      onClick={() => onRead(liveBook, chapter.href)}
                      divider={i < topChapters.length - 1}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<BookOpen size={32} />}
                  title="Índice não disponível"
                  description="Este EPUB não contém um índice de capítulos."
                />
              )
            })()}

            {/* ── Marcações ── */}
            {activeTab === 'bookmarks' && (
              bookmarks.length > 0 ? (
                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {bookmarks.map((bm, i) => (
                    <ListItem
                      key={bm.id}
                      leading={<Bookmark size={16} className="text-purple-light" />}
                      title={bm.label}
                      meta={`${bm.percentage}%`}
                      onClick={() => onRead(liveBook, bm.cfi)}
                      divider={i < bookmarks.length - 1}
                      trailing={
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (bm.id !== undefined) void softDeleteBookmark(bm.id)
                          }}
                          className="p-2 -m-2 text-text-muted active:text-error transition-colors"
                          aria-label="Remover marcação"
                        >
                          <X size={15} />
                        </button>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Bookmark size={32} />}
                  title="Nenhuma marcação"
                  description="Selecione um parágrafo durante a leitura e use Marcar para salvar posições."
                />
              )
            )}

            {/* ── Configurações ── */}
            {activeTab === 'settings' && (
              <div className="rounded-md p-4 bg-bg-surface border border-border flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    Tamanho de fonte
                  </p>
                  <div className="flex gap-2">
                    {FONT_SIZES.map(({ value, label, className }) => {
                      const active = fontSize === value
                      return (
                        <button
                          key={value}
                          onClick={() => void updateBookSettings(book.id!, { fontSize: value })}
                          className={`flex-1 py-3 rounded-md font-semibold transition-all duration-150 active:scale-95 border ${className} ${
                            active
                              ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                              : 'bg-bg-base border-border text-text-muted'
                          }`}
                          aria-pressed={active}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p
                    className="mt-4 text-center leading-relaxed text-text-secondary"
                    style={{ fontSize: FONT_PREVIEW_PX[fontSize] }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
              </div>
            )}

            {/* ── Detalhes ── */}
            {activeTab === 'details' && (
              <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                {langLabel && (
                  <ListItem leading={<Globe size={18} />} title="Idioma" meta={langLabel} divider />
                )}
                <ListItem
                  leading={<Calendar size={18} />}
                  title="Adicionado"
                  meta={formatDate(liveBook.addedAt)}
                  divider={!!liveBook.lastOpenedAt}
                />
                {liveBook.lastOpenedAt && (
                  <ListItem
                    leading={<Calendar size={18} />}
                    title="Último acesso"
                    meta={formatDate(liveBook.lastOpenedAt)}
                    divider
                  />
                )}
                <ListItem
                  leading={<HardDrive size={18} />}
                  title="Tamanho"
                  meta={formatFileSize(liveBook.fileBlob.size)}
                  divider={false}
                />
              </div>
            )}

          </div>
        </div>

      </main>
    </div>
  )
}

// ─── Componentes auxiliares locais ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
        {title}
      </h2>
      <div className="rounded-md p-4 bg-bg-surface border border-border">
        {children}
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-sm font-bold text-text-primary tabular-nums">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
