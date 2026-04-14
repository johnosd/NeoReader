import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { EpubService } from '../services/EpubService'
import { addBook } from '../db/books'

export function AddBookButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)

    try {
      const metadata = await EpubService.parseMetadata(file)
      await addBook({
        title: metadata.title,
        author: metadata.author,
        coverBlob: metadata.coverBlob,
        fileBlob: file,  // salva o arquivo completo para abrir no leitor depois
        addedAt: new Date(),
        lastOpenedAt: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar o arquivo'
      setError(message)
    } finally {
      setImporting(false)
      // Reseta o input para permitir selecionar o mesmo arquivo novamente
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      {/* Input oculto — o clique é disparado programaticamente pelo botão */}
      <input
        ref={inputRef}
        type="file"
        accept=".epub"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* FAB — Floating Action Button no canto inferior direito */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#6366f1] flex items-center justify-center shadow-lg active:scale-95 transition-transform duration-150 disabled:opacity-60"
        aria-label="Adicionar livro"
      >
        {importing ? (
          // Spinner simples enquanto importa
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus className="text-white" size={28} />
        )}
      </button>

      {/* Toast de erro — aparece na base da tela */}
      {error && (
        <div className="fixed bottom-24 left-4 right-4 bg-red-900/90 text-white text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
    </>
  )
}
