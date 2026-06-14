import { useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Plus } from 'lucide-react'
import { Toast } from './ui'
import { useIsImportActive } from '../hooks/useImportActivity'
import { BookImportService } from '../services/BookImportService'
import { IMPORT_IN_PROGRESS_MESSAGE } from '../services/ImportCoordinator'
import { logImportDiagnostic } from '../services/ImportDiagnostics'
import { selectNativeEpubFile } from '../services/NativeLibraryImportService'
import { useI18n } from '../i18n'

// NOTA: atualmente o FAB fica dentro do BottomNav; este componente é mantido
// como alternativa autônoma (FAB solto no canto) caso seja reutilizado.
export function AddBookButton() {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const importActive = useIsImportActive()
  const importBusy = importing || importActive

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (BookImportService.isImportInProgress()) {
      setError(IMPORT_IN_PROGRESS_MESSAGE)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    logImportDiagnostic('ui', 'add-book-web-file-import-start', { fileName: file.name, fileSize: file.size })
    setImporting(true)
    setError(null)
    try {
      await BookImportService.importEpub(file)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('home.importError')
      setError(message)
    } finally {
      setImporting(false)
      logImportDiagnostic('ui', 'add-book-web-file-import-finished', { fileName: file.name })
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleAddBook() {
    if (BookImportService.isImportInProgress()) {
      setError(IMPORT_IN_PROGRESS_MESSAGE)
      return
    }

    if (!Capacitor.isNativePlatform()) {
      inputRef.current?.click()
      return
    }

    setImporting(true)
    logImportDiagnostic('ui', 'add-book-native-file-import-start')
    setError(null)
    try {
      const nativeFile = await selectNativeEpubFile()
      if (nativeFile) await BookImportService.importNativeEpub(nativeFile)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : t('home.importError')
      setError(message)
    } finally {
      setImporting(false)
      logImportDiagnostic('ui', 'add-book-native-file-import-finished')
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
        onClick={handleAddBook}
        disabled={importBusy}
        aria-label={t('common.addBook')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center
          shadow-purple-glow active:scale-95 transition-transform duration-150 disabled:opacity-60 text-white"
        style={{
          background: 'linear-gradient(135deg, var(--color-purple-primary) 0%, var(--color-purple-dark) 100%)',
        }}
      >
        {importBusy ? (
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus size={28} />
        )}
      </button>

      {error && <Toast tone="error" onDismiss={() => setError(null)}>{error}</Toast>}
    </>
  )
}
