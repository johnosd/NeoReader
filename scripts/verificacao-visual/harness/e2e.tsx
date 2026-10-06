// Harness de verificação no navegador (só dev server — não entra no build nem no APK).
// Monta o BookImportService e o ReaderScreen REAIS sem a casca do app (o app exige login Google), e expõe
// funções em `window` para o Playwright importar livros, abrir o leitor e ler o IndexedDB.
// Uso: scripts/verificacao-visual/pdf-pagina-fiel.check.js.
import { createRoot, type Root } from 'react-dom/client'
import '@/index.css'
import { I18nProvider } from '@/i18n'
import { ReaderScreen } from '@/screens/ReaderScreen'
import { BookImportService } from '@/services/BookImportService'
import { db } from '@/db/database'
import { getBookCover } from '@/db/bookCovers'

declare global {
  interface Window {
    __import: (url: string, name: string) => Promise<unknown>
    __open: (id: number, startHref?: string) => Promise<void>
    __books: () => Promise<unknown>
    __progress: (id: number) => Promise<unknown>
    __cover: (id: number) => Promise<unknown>
  }
}

let root: Root | null = null

// O tipo do File não importa: o BookImportService decide EPUB/PDF pelo conteúdo (DI-011).
window.__import = async (url, name) => {
  const blob = await (await fetch(url)).blob()
  const file = new File([blob], name, { type: 'application/pdf' })
  try {
    const id = await BookImportService.importEpub(file)
    return { ok: true, id }
  } catch (e) {
    const err = e as Error & { code?: string }
    return { ok: false, message: err.message, code: err.code, name: err.name }
  }
}

window.__books = async () =>
  (await db.books.toArray()).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    format: b.format,
    pdfTextLayer: b.pdfTextLayer,
    pageCount: b.pageCount,
    detectedLanguage: b.detectedLanguage,
    storageMode: b.storageMode,
    fileName: b.fileName,
    fileSize: b.fileSize,
  }))

window.__progress = async (id) => db.progress.where('bookId').equals(id).first()

window.__cover = async (id) => {
  const cover = await getBookCover(id)
  return cover ? { type: cover.blob.type, size: cover.blob.size, source: (await db.bookCovers.get(id))?.source } : null
}

window.__open = async (id, startHref) => {
  const book = await db.books.get(id)
  root?.unmount()
  root = createRoot(document.getElementById('root')!)
  root.render(
    <I18nProvider>
      <ReaderScreen book={book!} startHref={startHref ?? null} onBack={() => undefined} onOpenVocabulary={() => undefined} />
    </I18nProvider>,
  )
}
