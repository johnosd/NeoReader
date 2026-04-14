import { X } from 'lucide-react'

interface TranslationPanelProps {
  source: string
  result: string | null    // null = traduzindo ainda
  onSave: () => void
  onSpeak: () => void
  onClose: () => void
}

export function TranslationPanel({ source, result, onSave, onSpeak, onClose }: TranslationPanelProps) {
  return (
    <>
      {/* Backdrop semi-transparente — toque fora fecha o painel */}
      <div className="absolute inset-0 z-20" onPointerUp={onClose} />

      {/* Painel fixo na base da tela — sempre visível independente da paginação do EPUB */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 rounded-t-2xl px-4 pt-4 pb-8"
        style={{ background: '#1c182b', borderTop: '1px solid rgba(157,78,221,0.2)' }}
      >
        {/* Handle + botão fechar */}
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-1 rounded-full mx-auto" style={{ background: '#3a3a4a' }} />
          <button
            onPointerUp={(e) => { e.stopPropagation(); onClose() }}
            className="absolute right-4 top-4 p-1 rounded-full active:opacity-60"
            style={{ color: '#a5a5a5' }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Texto original selecionado */}
        <p className="text-xs mb-2 italic line-clamp-2" style={{ color: '#a5a5a5' }}>
          "{source}"
        </p>

        {/* Tradução ou spinner */}
        {result === null ? (
          <div className="flex items-center gap-2 py-2" style={{ color: '#a5a5a5' }}>
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#9d4edd', borderTopColor: 'transparent' }} />
            <span className="text-sm">Traduzindo…</span>
          </div>
        ) : (
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#c77dff' }}>
            {result}
          </p>
        )}

        {/* Botões de ação */}
        <div className="flex gap-2">
          <button
            onPointerUp={(e) => { e.stopPropagation(); onSpeak() }}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium active:opacity-70 transition-opacity"
            style={{ background: '#2d2942', color: '#fff' }}
          >
            🔊 Ouvir
          </button>
          <button
            onPointerUp={(e) => { e.stopPropagation(); onSave() }}
            disabled={result === null}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium active:opacity-70 transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7b2cbf 0%, #3c096c 100%)', color: '#fff' }}
          >
            ⭐ Salvar
          </button>
        </div>
      </div>
    </>
  )
}
