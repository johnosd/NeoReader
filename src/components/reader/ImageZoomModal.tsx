import { X } from 'lucide-react'

interface ImageZoomModalProps {
  src: string | null
  onClose: () => void
}

// Modal full-screen para zoom de imagem. Usa touch-action: pinch-zoom para zoom nativo
// no Android WebView — funciona porque o viewport não tem user-scalable=no.
export function ImageZoomModal({ src, onClose }: ImageZoomModalProps) {
  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-12 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/25"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>

      {/* Área de scroll + pinch-zoom nativo */}
      <div
        className="h-full w-full overflow-auto"
        style={{ touchAction: 'pan-x pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt=""
          className="mx-auto block"
          style={{
            maxWidth: '100%',
            minHeight: '100dvh',
            objectFit: 'contain',
            touchAction: 'pinch-zoom',
          }}
        />
      </div>
    </div>
  )
}
