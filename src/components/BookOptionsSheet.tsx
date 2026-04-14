import { useRef, useState } from 'react'
import { ImagePlus, RefreshCw, Trash2, X } from 'lucide-react'
import { EpubService } from '../services/EpubService'
import { updateBookCover, deleteBook } from '../db/books'
import type { Book } from '../types/book'

interface BookOptionsSheetProps {
  book: Book | null   // null = fechado
  onClose: () => void
}

export function BookOptionsSheet({ book, onClose }: BookOptionsSheetProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const translateY = book ? 'translate-y-0' : 'translate-y-full'

  function handleClose() {
    setConfirmDelete(false)
    onClose()
  }

  async function handleDelete() {
    if (!book?.id) return
    setLoading(true)
    try {
      await deleteBook(book.id)
      handleClose() // useLiveQuery atualiza a biblioteca automaticamente
    } catch {
      setError('Erro ao deletar livro.')
      setLoading(false)
    }
  }

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
          onPointerUp={handleClose}
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
          <button onClick={handleClose} className="p-1 text-[#a0a0a0] active:opacity-60">
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

          {/* Deletar livro — dois toques: primeiro pede confirmação */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className="flex items-center gap-3 w-full px-4 py-4 rounded-xl bg-[#2a2a2a]
                text-red-400 text-sm active:opacity-60 disabled:opacity-40"
            >
              <Trash2 size={18} className="shrink-0" />
              <div className="text-left">
                <p className="font-medium">Deletar livro</p>
                <p className="text-[#a0a0a0] text-xs mt-0.5">Remove o livro e todo o progresso salvo</p>
              </div>
            </button>
          ) : (
            <div className="rounded-xl bg-red-950/60 border border-red-800/50 px-4 py-3 flex flex-col gap-2">
              <p className="text-red-300 text-sm font-medium">Confirmar exclusão?</p>
              <p className="text-red-400/70 text-xs">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-lg bg-[#2a2a2a] text-[#a0a0a0] text-sm active:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold
                    active:opacity-60 disabled:opacity-40"
                >
                  {loading ? 'Deletando…' : 'Deletar'}
                </button>
              </div>
            </div>
          )}

          {/* Feedback de loading/erro */}
          {loading && !confirmDelete && (
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
