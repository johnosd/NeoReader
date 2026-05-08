import { db } from '../db/database'
import { readNativeFolderFile, type NativeFolderFile } from './NativeLibraryImportService'
import type { Book } from '../types/book'

export class BookFileResolver {
  static async resolveFile(book: Book): Promise<Blob> {
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

  static async resolveEpubFile(book: Book): Promise<File> {
    const blob = await this.resolveFile(book)
    if (blob instanceof File) return blob
    return new File([blob], book.fileName ?? `${book.title}.epub`, {
      type: 'application/epub+zip',
    })
  }

  private static toNativeFile(book: Book): NativeFolderFile {
    return {
      name: book.fileName ?? `${book.title}.epub`,
      uri: book.uri!,
      path: book.filePath ?? book.fileName ?? `${book.title}.epub`,
      size: book.fileSize ?? book.fileBlob?.size ?? 0,
    }
  }
}
