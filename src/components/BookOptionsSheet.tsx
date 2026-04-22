import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react'
import { BottomSheet, Button, Spinner } from './ui'
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

  function handleClose() {
    setLoading(false)
    setConfirmDelete(false)
    setError(null)
    onClose()
  }

  async function handleDelete() {
    if (!book?.id) return
    setLoading(true)
    try {
      await deleteBook(book.id)
      handleClose()
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

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !book?.id) return
    setLoading(true)
    setError(null)
    try {
      await updateBookCover(book.id, file)
      onClose()
    } catch {
      setError('Erro ao salvar imagem.')
    } finally {
      setLoading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageChange}
      />

      <BottomSheet open={book !== null} onClose={handleClose} title="Opções do livro">
        {book && (
          <p className="text-text-muted text-xs truncate mb-4 -mt-2">{book.title}</p>
        )}

        <div className="flex flex-col gap-2">
          <OptionRow
            icon={<RefreshCw size={18} />}
            title="Recriar capa"
            description="Reextrai a imagem original do arquivo EPUB"
            onClick={handleRecriarCapa}
            disabled={loading}
          />
          <OptionRow
            icon={<ImagePlus size={18} />}
            title="Escolher imagem"
            description="Seleciona uma imagem do dispositivo como capa"
            onClick={() => imageInputRef.current?.click()}
            disabled={loading}
          />

          {!confirmDelete ? (
            <OptionRow
              icon={<Trash2 size={18} />}
              title="Deletar livro"
              description="Remove o livro e todo o progresso salvo"
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              danger
            />
          ) : (
            <div className="rounded-md bg-error/15 border border-error/30 px-4 py-3 flex flex-col gap-2">
              <p className="text-error text-sm font-semibold">Confirmar exclusão?</p>
              <p className="text-error/70 text-xs">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>
                  {loading ? 'Deletando…' : 'Deletar'}
                </Button>
              </div>
            </div>
          )}

          {loading && !confirmDelete && (
            <div className="flex justify-center py-2">
              <Spinner size={18} label="Processando" />
            </div>
          )}
          {error && (
            <p className="text-error text-sm text-center px-2 mt-2">{error}</p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

interface OptionRowProps {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

function OptionRow({ icon, title, description, onClick, disabled, danger }: OptionRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 w-full px-4 py-4 rounded-md bg-bg-hover text-left
        text-sm active:scale-[0.98] transition-transform duration-150 disabled:opacity-40
        ${danger ? 'text-error' : 'text-text-primary'}`}
    >
      <span className={`shrink-0 ${danger ? 'text-error' : 'text-purple-light'}`}>{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-text-muted text-xs mt-0.5">{description}</p>
      </div>
    </button>
  )
}
