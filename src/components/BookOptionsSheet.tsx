import { useRef, useState } from 'react'
import { ImagePlus, RefreshCw, X } from 'lucide-react'
import { EpubService } from '../services/EpubService'
import { updateBookCover } from '../db/books'
import type { Book } from '../types/book'

interface BookOptionsSheetProps {
  book: Book | null   // null = fechado
  onClose: () => void
}

export function BookOptionsSheet({ book, onClose }: BookOptionsSheetProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const translateY = book ? 'translate-y-0' : 'translate-y-full'

  // Reextrai a capa do arquivo EPUB já armazenado
  async function handleRecriarCapa() {
    if (!book?.id) return
    setLoading(true)
    setError(null)
    try {
      // Converte o Blob salvo para File — EpubService.parseMetadata espera File
      const file = new File([book.fileBlob], `${book.title}.epub`, {
        type: 'application/epub+zip',
      })
      const metadata = await EpubService.parseMetadata(file)
      if (!metadata.coverBlob) {
        setError('Nenhuma capa encontrada neste EPUB.')
        return
      }
      await updateBookCover(book.id, metadata.coverBlob)
      onClose()
    } catch {
      setError('Erro ao recriar capa. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Usa a imagem selecionada pelo usuário como nova capa
  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !book?.id) return
    setLoading(true)
    setError(null)
    try {
      // Salva o arquivo diretamente como Blob — sem redimensionamento no MVP
      await updateBookCover(book.id, file)
      onClose()
    } catch {
      setError('Erro ao salvar imagem.')
    } finally {
      setLoading(false)
      // Limpa o input para permitir selecionar o mesmo arquivo novamente
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <>
      {/* Input oculto para seleção de imagem */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageChange}
      />

      {/* Backdrop */}
      {book && (
        <div
          className="fixed inset-0 z-30 bg-black/60"
          onPointerUp={onClose}
        />
      )}

      {/* Sheet deslizante */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-[#1a1a1a] rounded-t-2xl
          transition-transform duration-300 ${translateY}`}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="w-10 h-1 rounded-full bg-[#3a3a3a] mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <h2 className="text-white font-semibold text-base mt-2">Opções do livro</h2>
          <button onClick={onClose} className="p-1 text-[#a0a0a0] active:opacity-60">
            <X size={20} />
          </button>
        </div>

        {book && (
          <p className="px-4 pb-3 text-[#a0a0a0] text-xs truncate">{book.title}</p>
        )}

        <div className="px-4 pb-8 flex flex-col gap-2">
          {/* Recriar capa do EPUB */}
          <button
            onClick={handleRecriarCapa}
            disabled={loading}
            className="flex items-center gap-3 w-full px-4 py-4 rounded-xl bg-[#2a2a2a]
              text-white text-sm active:opacity-60 disabled:opacity-40"
          >
            <RefreshCw size={18} className="text-[#6366f1] shrink-0" />
            <div className="text-left">
              <p className="font-medium">Recriar capa</p>
              <p className="text-[#a0a0a0] text-xs mt-0.5">Reextrai a imagem original do arquivo EPUB</p>
            </div>
          </button>

          {/* Escolher imagem externa */}
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-3 w-full px-4 py-4 rounded-xl bg-[#2a2a2a]
              text-white text-sm active:opacity-60 disabled:opacity-40"
          >
            <ImagePlus size={18} className="text-[#6366f1] shrink-0" />
            <div className="text-left">
              <p className="font-medium">Escolher imagem</p>
              <p className="text-[#a0a0a0] text-xs mt-0.5">Seleciona uma imagem do dispositivo como capa</p>
            </div>
          </button>

          {/* Feedback de loading/erro */}
          {loading && (
            <div className="flex items-center justify-center py-2 gap-2 text-[#a0a0a0] text-sm">
              <div className="w-4 h-4 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
              Processando…
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm text-center px-2">{error}</p>
          )}
        </div>
      </div>
    </>
  )
}
