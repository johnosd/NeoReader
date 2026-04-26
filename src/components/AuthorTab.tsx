import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import { EmptyState, Skeleton } from './ui'
import { getAuthorData } from '../services/AuthorService'
import type { AuthorData } from '../types/author'
import type { Book } from '../types/book'

interface AuthorTabProps {
  book: Book
  youtubeApiKey: string
  onOpenSettings: () => void
}

export function AuthorTab({ book, youtubeApiKey, onOpenSettings }: AuthorTabProps) {
  const [loading, setLoading] = useState(true)
  const [authorData, setAuthorData] = useState<AuthorData | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void getAuthorData(book.author, youtubeApiKey || undefined).then((data) => {
      if (cancelled) return
      setAuthorData(data)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [book.author, youtubeApiKey])

  if (loading) return <AuthorSkeleton hasYoutubeKey={Boolean(youtubeApiKey)} />

  if (!authorData) {
    return (
      <EmptyState
        icon={<User size={32} />}
        title="Autor nao encontrado"
        description={`Nao encontramos informacoes sobre ${book.author}.`}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <AuthorBio data={authorData} />
      {authorData.videos.length > 0 && <VideoCarousel videos={authorData.videos} />}
      {!youtubeApiKey && <YoutubePrompt onOpenSettings={onOpenSettings} />}
      {authorData.otherBooks.length > 0 && <OtherBooksRow books={authorData.otherBooks} />}
    </div>
  )
}

// ─── Bio do autor ─────────────────────────────────────────────────────────────

function AuthorBio({ data }: { data: AuthorData }) {
  const [bioExpanded, setBioExpanded] = useState(false)
  const [photoError, setPhotoError] = useState(false)

  const showExpandButton = (data.bio?.length ?? 0) > 180

  return (
    <div className="rounded-md bg-bg-surface border border-border p-4">
      <div className="flex items-start gap-4">
        {data.photoUrl && !photoError ? (
          <img
            src={data.photoUrl}
            alt={data.name}
            onError={() => setPhotoError(true)}
            className="h-20 w-20 flex-shrink-0 rounded-full object-cover bg-white/5"
          />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-text-muted">
            <User size={32} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-text-primary leading-tight">{data.name}</h2>

          {data.bio && (
            <p className={`mt-2 text-sm leading-relaxed text-text-secondary ${bioExpanded ? '' : 'line-clamp-4'}`}>
              {data.bio}
            </p>
          )}

          {showExpandButton && (
            <button
              onClick={() => setBioExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-purple-light active:opacity-70"
            >
              {bioExpanded ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Carrossel de vídeos (populado na Fase 3, já renderiza se houver dados) ───

function VideoCarousel({ videos }: { videos: AuthorData['videos'] }) {
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        Videos
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {videos.map((video) => (
          <button
            key={video.id}
            onClick={() => window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank')}
            className="flex-shrink-0 w-48 text-left active:opacity-70 transition-opacity"
          >
            <div className="relative w-full rounded-md overflow-hidden bg-white/5" style={{ aspectRatio: '16/9' }}>
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
              {video.title}
            </p>
            <p className="mt-0.5 text-[10px] text-text-muted truncate">{video.channelName}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Banner para configurar YouTube key ───────────────────────────────────────

function YoutubePrompt({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="rounded-md border border-border bg-bg-surface p-4 flex flex-col gap-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Configure sua YouTube API key nas Configuracoes para ver entrevistas, TED Talks e
        palestras deste autor.
      </p>
      <button
        onClick={onOpenSettings}
        className="self-start rounded-md bg-purple-primary/20 px-3 py-1.5 text-xs font-semibold text-purple-light active:bg-purple-primary/30 transition-colors"
      >
        Ir para Configuracoes
      </button>
    </div>
  )
}

// ─── Outros livros do autor ────────────────────────────────────────────────────

function OtherBooksRow({ books }: { books: AuthorData['otherBooks'] }) {
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        Outros Livros
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {books.map((book, index) => (
          <div key={index} className="flex-shrink-0 w-24">
            <div className="w-full rounded-md overflow-hidden bg-white/5" style={{ aspectRatio: '2/3' }}>
              {book.coverId ? (
                <img
                  src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                  alt={book.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2">
                  <p className="text-[9px] text-text-muted text-center leading-tight line-clamp-4">
                    {book.title}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-1 text-[10px] text-text-secondary leading-tight line-clamp-2">{book.title}</p>
            {book.year && <p className="mt-0.5 text-[9px] text-text-muted">{book.year}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function AuthorSkeleton({ hasYoutubeKey }: { hasYoutubeKey: boolean }) {
  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Bio skeleton */}
      <div className="rounded-md bg-bg-surface border border-border p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-20 w-20 flex-shrink-0 rounded-full" />
          <div className="flex-1 flex flex-col gap-2 pt-1">
            <Skeleton variant="text" className="w-40" />
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-5/6" />
            <Skeleton variant="text" className="w-4/6" />
          </div>
        </div>
      </div>

      {/* Videos skeleton — só quando key está configurada */}
      {hasYoutubeKey && (
        <div>
          <Skeleton variant="text" className="w-16 mb-3" />
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 w-48">
                <Skeleton className="w-full aspect-video rounded-md" />
                <Skeleton variant="text" className="mt-2 w-full" />
                <Skeleton variant="text" className="mt-1 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outros livros skeleton */}
      <div>
        <Skeleton variant="text" className="w-24 mb-3" />
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="card" className="w-24 flex-shrink-0" />
          ))}
        </div>
      </div>
    </div>
  )
}
