import { useState } from 'react'
import { Check, Download, RotateCcw } from 'lucide-react'
import { Spinner } from './ui'
import { useI18n } from '../i18n'
import { buildStandardEbooksUrls, type PublicDomainCatalogEntry } from '../services/PublicDomainCatalogService'
import type { PublicDomainDownloadState } from '../services/PublicDomainDownloadCoordinator'

interface PublicDomainBookCardProps {
  entry: PublicDomainCatalogEntry
  state: PublicDomainDownloadState
  onDownload: (entry: PublicDomainCatalogEntry) => void
  onOpenDownloaded: (entry: PublicDomainCatalogEntry) => void
}

export function PublicDomainBookCard({ entry, state, onDownload, onOpenDownloaded }: PublicDomainBookCardProps) {
  const { t } = useI18n()
  const [coverFailed, setCoverFailed] = useState(false)
  const { coverUrl } = buildStandardEbooksUrls(entry.authorSlug, entry.titleSlug)
  const isDownloading = state.status === 'downloading'
  const isDownloaded = state.status === 'success'
  const isError = state.status === 'error'
  // So o download em si nao pode ser retocado enquanto roda (evita disparo
  // duplo) — idle (baixa), erro (retry) e sucesso (abre o livro) continuam
  // tocaveis, so mudam o que o toque faz.
  const tappable = !isDownloading

  function handleTap() {
    if (!tappable) return
    if (isDownloaded) {
      onOpenDownloaded(entry)
      return
    }
    onDownload(entry)
  }

  return (
    <div
      onClick={handleTap}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={(event) => tappable && event.key === 'Enter' && handleTap()}
      className={`w-full flex flex-col gap-[6px] transition-transform duration-150 ${tappable ? 'cursor-pointer active:scale-[0.96]' : ''}`}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '2/3',
          borderRadius: 6,
          background: '#1e0e2d',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        {!coverFailed ? (
          <img
            src={coverUrl}
            alt={entry.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2 text-center">
            <span className="text-white/30 text-[11px] font-semibold leading-tight">{entry.title}</span>
          </div>
        )}

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(7,3,12,0.75) 0%, transparent 40%)' }}
        />

        {isDownloading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(7,3,12,0.55)' }}>
            <Spinner size={28} label={t('discover.publicDomain.downloading')} />
          </div>
        )}

        {!isDownloading && (
          <div
            className="absolute bottom-[6px] left-[6px] flex items-center justify-center rounded-[4px] px-[5px] py-[2px]"
            style={{
              background: isError ? 'rgba(190,30,45,0.92)' : isDownloaded ? 'rgba(34,150,90,0.92)' : 'rgba(123,44,191,0.92)',
              minWidth: 22,
            }}
          >
            {isDownloaded ? <Check size={12} color="#fff" /> : isError ? <RotateCcw size={12} color="#fff" /> : <Download size={12} color="#fff" />}
          </div>
        )}
      </div>

      <div className="min-w-0 px-[2px]">
        <p className="text-[12px] font-semibold leading-tight truncate" style={{ color: '#f1f5f9' }}>
          {entry.title}
        </p>
        <p className="text-[10px] mt-[2px] truncate" style={{ color: 'rgba(100,116,139,0.9)' }}>
          {entry.author}
        </p>
        {isDownloaded && (
          <p className="text-[10px] mt-[2px] font-semibold" style={{ color: '#4ade80' }}>
            {t('discover.publicDomain.downloaded')}
          </p>
        )}
        {isError && (
          <p className="text-[10px] mt-[2px] font-semibold" style={{ color: '#f87171' }}>
            {t('discover.publicDomain.retry')}
          </p>
        )}
      </div>
    </div>
  )
}
