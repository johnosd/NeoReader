import { useMemo } from 'react'
import { BookOpen, Play, Plus } from 'lucide-react'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface HeroBannerProps {
  book: BookWithProgress
  onPress: (book: Book) => void
  onOpenOptions?: (book: Book) => void
}

export function HeroBanner({ book, onPress, onOpenOptions }: HeroBannerProps) {
  const coverUrl = useMemo(() => (
    book.coverBlob ? URL.createObjectURL(book.coverBlob) : null
  ), [book.coverBlob])

  const actionLabel =
    book.readingStatus === 'finished' ? 'Reler'
    : book.readingStatus === 'reading' ? 'Retomar'
    : 'Abrir'

  const badgeLabel =
    book.readingStatus === 'finished' ? 'Concluído'
    : book.readingStatus === 'reading' ? 'Em leitura'
    : 'Destaque'

  const progressWidth = book.readingStatus === 'finished' ? 100 : (book.percentage ?? 0)

  return (
    <section className="relative w-full overflow-hidden" style={{ minHeight: '60vh' }}>
      {coverUrl ? (
        <>
          {/* Blurred ambient background */}
          <img
            src={coverUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
          />
          {/* Main artwork - fills top portion */}
          <img
            src={coverUrl}
            alt={book.title}
            className="absolute top-0 left-0 right-0 w-full object-cover object-top"
            style={{ height: '68%' }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #1e0e2d 0%, #07030c 70%)' }}
        >
          <BookOpen size={88} className="text-white/10" />
        </div>
      )}

      {/* Cinematic gradient overlay — opaque at bottom, fades up */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(7,3,12,0.92) 0%, rgba(7,3,12,0.60) 35%, rgba(7,3,12,0.85) 60%, rgba(7,3,12,0.98) 80%, rgba(7,3,12,1) 100%)',
        }}
      />

      {/* Content block — pinned to bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-8 z-10">

        {/* Genre-style row: author + separator + progress */}
        <div className="flex items-center gap-2 mb-3">
          {book.author ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/75">
              {book.author}
            </span>
          ) : null}
          {book.readingStatus === 'reading' && book.percentage > 0 && (
            <>
              <span className="text-white/30 text-xs">·</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-white/75">
                {book.percentage}% lido
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h2
          className="text-[2rem] leading-[1.06] font-serif font-black text-white mb-2"
          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}
        >
          {book.title}
        </h2>

        {/* Description */}
        <p className="text-[0.85rem] leading-5 text-white/65 mb-3" style={{ maxWidth: 320 }}>
          {getHeroDescription(book)}
        </p>

        {/* Status badge — below description */}
        <span
          className="inline-flex items-center rounded-[3px] px-2 py-[3px] mb-4 text-[9px] font-black uppercase tracking-[0.18em] text-white"
          style={{ background: 'linear-gradient(135deg, #7b2cbf 0%, #9d4edd 100%)' }}
        >
          {badgeLabel}
        </span>

        {/* Progress bar — only while reading */}
        {book.readingStatus === 'reading' && (
          <div className="mb-5 h-[3px] overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressWidth}%`,
                background: 'linear-gradient(90deg, #7b2cbf 0%, #9d4edd 100%)',
              }}
            />
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => onPress(book)}
            className="flex flex-1 items-center justify-center gap-[7px] rounded-full h-[50px] text-[0.9rem] font-bold text-white active:scale-[0.97] transition-transform duration-150"
            style={{
              background: '#7b2cbf',
              boxShadow: '0 6px 24px rgba(123,44,191,0.5)',
            }}
          >
            <Play size={15} fill="currentColor" />
            {actionLabel}
          </button>

          <button
            onClick={() => (onOpenOptions ? onOpenOptions(book) : onPress(book))}
            className="flex flex-1 items-center justify-center gap-[7px] rounded-full h-[50px] text-[0.9rem] font-semibold text-white bg-white/10 border border-white/20 backdrop-blur-sm active:scale-[0.97] transition-transform duration-150"
          >
            <Plus size={15} strokeWidth={2.5} />
            {onOpenOptions ? 'Opções' : 'Abrir'}
          </button>
        </div>
      </div>
    </section>
  )
}

function getHeroDescription(book: BookWithProgress): string {
  if (book.readingStatus === 'finished') {
    return 'Você terminou este livro. Volte ao início quando quiser revisitar a história ou seus trechos favoritos.'
  }
  if (book.readingStatus === 'reading') {
    return book.percentage > 0
      ? `Você já percorreu ${book.percentage}% da leitura. Retome da última página salva sem perder o ritmo.`
      : 'Este foi o último livro que você abriu. Entre novamente e deixe a leitura engrenar daqui.'
  }
  return 'Foi o último livro aberto na biblioteca. Entre nele de novo para transformar curiosidade em leitura.'
}
