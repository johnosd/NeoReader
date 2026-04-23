import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Toast } from './ui'
import { BookImportService } from '../services/BookImportService'

// NOTA: atualmente o FAB fica dentro do BottomNav; este componente é mantido
// como alternativa autônoma (FAB solto no canto) caso seja reutilizado.
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
      await BookImportService.importEpub(file)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar o arquivo'
      setError(message)
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        aria-label="Adicionar livro"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center
          shadow-purple-glow active:scale-95 transition-transform duration-150 disabled:opacity-60 text-white"
        style={{
          background: 'linear-gradient(135deg, var(--color-purple-primary) 0%, var(--color-purple-dark) 100%)',
        }}
      >
        {importing ? (
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus size={28} />
        )}
      </button>

      {error && <Toast tone="error" onDismiss={() => setError(null)}>{error}</Toast>}
    </>
  )
}
