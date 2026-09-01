import { useState } from 'react'
import { Check, ChevronRight, Download, Folder, RotateCcw } from 'lucide-react'
import { Spinner } from './ui'
import { useI18n } from '../i18n'
import type { OpdsDownloadState, OpdsFeedEntry } from '../types/opds'

interface OpdsEntryCardProps {
  entry: OpdsFeedEntry
  state: OpdsDownloadState
  onDownload: (entry: OpdsFeedEntry) => void
  onOpenDownloaded: (entry: OpdsFeedEntry) => void
  onOpenFolder?: (entry: OpdsFeedEntry) => void
}

// Entry de navegação (pasta/seção do catálogo) — sempre passa o filtro
// EPUB-only (FR-013), então tem visual próprio, sem estado de download.
// Sem capa de propósito: catálogos reais que testamos (Gutenberg) mandam um
// link de imagem na entry de navegação, mas é um ícone genérico idêntico pra
// toda entry do feed, não uma capa por item — mostrar isso deixa a UI pior,
// não melhor (tentado e revertido, ver R-008 em plan.md).
function OpdsFolderCard({ entry, onOpenFolder }: { entry: OpdsFeedEntry; onOpenFolder?: (entry: OpdsFeedEntry) => void }) {
  return (
    <div
      onClick={() => onOpenFolder?.(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && onOpenFolder?.(entry)}
      className="w-full flex flex-col gap-[6px] cursor-pointer active:scale-[0.96] transition-transform duration-150"
    >
      <div
        className="w-full flex items-center justify-center"
        style={{
          aspectRatio: '2/3',
          borderRadius: 6,
          background: '#1e0e2d',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <Folder size={28} color="rgba(203,213,225,0.5)" />
      </div>
      <p className="text-[12px] font-semibold leading-tight truncate px-[2px]" style={{ color: '#f1f5f9' }}>
        {entry.title}
      </p>
    </div>
  )
}

// Linha de lista pra página que é só pastas (ex: resultado de busca do
// Gutenberg, onde cada entry é um livro diferente, sem capa nenhuma — ver
// OpdsFolderCard acima). Grid de cards vazios lado a lado ficava ruim
// visualmente; lista compacta é mais honesta sobre não ter imagem nenhuma
// pra mostrar (feedback do usuário após ver a tela real no device).
export function OpdsFolderListRow({ entry, onOpenFolder }: { entry: OpdsFeedEntry; onOpenFolder?: (entry: OpdsFeedEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenFolder?.(entry)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left active:bg-white/5 transition-colors"
    >
      <div
        className="shrink-0 flex items-center justify-center rounded-md"
        style={{ width: 44, height: 44, background: '#1e0e2d', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Folder size={20} color="rgba(203,213,225,0.5)" />
      </div>
      <span className="flex-1 min-w-0 text-[14px] font-semibold truncate" style={{ color: '#f1f5f9' }}>
        {entry.title}
      </span>
      <ChevronRight size={18} color="rgba(148,163,184,0.6)" className="shrink-0" />
    </button>
  )
}

export function OpdsEntryCard({ entry, state, onDownload, onOpenDownloaded, onOpenFolder }: OpdsEntryCardProps) {
  const { t } = useI18n()
  const [coverFailed, setCoverFailed] = useState(false)

  if (entry.kind === 'navigation') {
    return <OpdsFolderCard entry={entry} onOpenFolder={onOpenFolder} />
  }

  const isDownloading = state.status === 'downloading'
  const isDownloaded = state.status === 'success'
  const isError = state.status === 'error'
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
        {entry.coverUrl && !coverFailed ? (
          <img
            src={entry.coverUrl}
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
            <Spinner size={28} label={t('discover.opds.downloading')} />
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
        {entry.author && (
          <p className="text-[10px] mt-[2px] truncate" style={{ color: 'rgba(100,116,139,0.9)' }}>
            {entry.author}
          </p>
        )}
        {isDownloaded && (
          <p className="text-[10px] mt-[2px] font-semibold" style={{ color: '#4ade80' }}>
            {t('discover.opds.downloaded')}
          </p>
        )}
        {isError && (
          <p className="text-[10px] mt-[2px] font-semibold" style={{ color: '#f87171' }}>
            {/* Mostra o motivo real quando disponível (ex: "Este livro ja
                esta na biblioteca." de BookImportService) — antes caía
                sempre no texto genérico, escondendo por que o download
                falhou de verdade. */}
            {state.offline ? t('discover.opds.offline') : state.errorMessage || t('discover.opds.error')}
          </p>
        )}
      </div>
    </div>
  )
}
