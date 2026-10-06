import { useEffect, useState } from 'react'
import { useSyncRef } from './useSyncRef'
import { BookFileResolver } from '@/services/BookFileResolver'
import { createPdfBook, outlineEntriesFromToc, type PdfBook } from '@/services/pdf/PdfBookFactory'
import type { PdfDocumentProxy } from '@/services/pdf/pdfjs'
import { PdfTextExtractor } from '@/services/pdf/PdfTextExtractor'
import type { Book } from '@/types/book'
import { buildPdfChunks, type PdfChunk } from '@/utils/pdfChunks'

export interface PdfReaderSession {
  pdfBook: PdfBook
  pdf: PdfDocumentProxy
  chunks: PdfChunk[]
  extractor: PdfTextExtractor
  pageCount: number
}

export type PdfReaderSessionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; session: PdfReaderSession }
  | { status: 'error'; error: Error }

/**
 * Abre o PDF do livro para o leitor: resolve o arquivo, cria o book do pdf.js (um único PDFDocumentProxy,
 * DI-008), calcula os trechos (DI-009) e prepara o extrator de texto. Destrói tudo ao sair do leitor ou
 * trocar de livro — mesma disciplina de memória da feature 009. Com `enabled = false` (livro EPUB) não faz nada.
 */
export function usePdfReaderSession(
  book: Book,
  enabled: boolean,
  // Chamado quando abrir o PDF falha (além de virar status 'error'): o leitor encerra o "carregando" por aqui.
  onError?: (error: Error) => void,
): PdfReaderSessionState {
  const [state, setState] = useState<PdfReaderSessionState>({ status: 'idle' })
  const onErrorRef = useSyncRef(onError)

  // Dependências são só os campos que mudam o arquivo: o objeto `book` é recriado a cada leitura do Dexie.
  const { id, storageMode, uri, fileBlob } = book
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let opened: PdfReaderSession | null = null

    const release = (session: PdfReaderSession) => {
      session.extractor.clear()
      session.pdfBook.destroy()
    }

    setState({ status: 'loading' })
    void (async () => {
      try {
        const source = await BookFileResolver.resolvePdfReaderSource(book)
        const { book: pdfBook, pdf } = await createPdfBook(source)
        const session: PdfReaderSession = {
          pdfBook,
          pdf,
          chunks: buildPdfChunks(pdf.numPages, outlineEntriesFromToc(pdfBook.toc)),
          extractor: new PdfTextExtractor(pdf),
          pageCount: pdf.numPages,
        }
        // Saiu da tela (ou trocou de livro) enquanto abria: não vaza o documento.
        if (cancelled) {
          release(session)
          return
        }
        opened = session
        setState({ status: 'ready', session })
      } catch (error) {
        if (cancelled) return
        const failure = error instanceof Error ? error : new Error(String(error))
        setState({ status: 'error', error: failure })
        onErrorRef.current?.(failure)
      }
    })()

    return () => {
      cancelled = true
      if (opened) release(opened)
      setState({ status: 'idle' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `book` inteiro é recriado a cada render; só estes campos importam
  }, [enabled, id, storageMode, uri, fileBlob, onErrorRef])

  return state
}
