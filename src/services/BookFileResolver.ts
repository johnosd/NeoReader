import { Capacitor } from '@capacitor/core'
import { db } from '../db/database'
import { readNativeFolderFile, type NativeFolderFile } from './NativeLibraryImportService'
import type { Book } from '../types/book'

export class BookFileResolver {
  static async resolveFile(book: Book): Promise<Blob> {
    if (book.storageMode === 'local') {
      if (!book.uri) throw new Error('Arquivo do livro nao encontrado.')
      try {
        const response = await fetch(Capacitor.convertFileSrc(book.uri))
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.blob()
      } catch {
        if (book.id !== undefined) {
          await db.books.update(book.id, { missingFile: true })
        }
        throw new Error('Este livro foi movido, apagado ou perdeu a permissao de acesso.')
      }
    }

    if (book.storageMode !== 'external' && book.fileBlob) {
      return book.fileBlob
    }

    if (book.fileBlob && !book.uri) {
      return book.fileBlob
    }

    if (!book.uri) {
      throw new Error('Arquivo do livro nao encontrado.')
    }

    try {
      return await readNativeFolderFile(this.toNativeFile(book))
    } catch {
      if (book.id !== undefined) {
        await db.books.update(book.id, { missingFile: true })
      }
      throw new Error('Este livro foi movido, apagado ou perdeu a permissao de acesso.')
    }
  }

  // Lê um arquivo já copiado para o armazenamento do app (storageMode 'local') pela URL local do Capacitor.
  // Usado no import de PDF, onde o JS precisa abrir o arquivo recém-copiado pelo plugin Android.
  static async fetchLocalFile(uri: string): Promise<Blob> {
    const response = await fetch(Capacitor.convertFileSrc(uri))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.blob()
  }

  // O nome "Epub" é histórico: também resolve PDF (File com o MIME do formato do livro).
  static async resolveEpubFile(book: Book): Promise<File> {
    const blob = await this.resolveFile(book)
    if (blob instanceof File) return blob
    const isPdf = book.format === 'PDF'
    return new File([blob], book.fileName ?? `${book.title}.${isPdf ? 'pdf' : 'epub'}`, {
      type: isPdf ? 'application/pdf' : 'application/epub+zip',
    })
  }

  static async resolveReaderSource(book: Book): Promise<Blob | string> {
    if (book.storageMode === 'local') {
      if (!book.uri) throw new Error('Arquivo do livro nao encontrado.')
      const localUrl = Capacitor.convertFileSrc(book.uri)
      try {
        const response = await fetch(localUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      } catch {
        if (book.id !== undefined) {
          await db.books.update(book.id, { missingFile: true })
        }
        throw new Error('Este livro foi movido, apagado ou perdeu a permissao de acesso.')
      }
      return localUrl
    }

    return this.resolveFile(book)
  }

  private static toNativeFile(book: Book): NativeFolderFile {
    return {
      name: book.fileName ?? `${book.title}.${book.format === 'PDF' ? 'pdf' : 'epub'}`,
      uri: book.uri!,
      path: book.filePath ?? book.fileName ?? `${book.title}.${book.format === 'PDF' ? 'pdf' : 'epub'}`,
      size: book.fileSize ?? book.fileBlob?.size ?? 0,
    }
  }
}
