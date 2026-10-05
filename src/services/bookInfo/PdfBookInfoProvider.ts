import type { BookIdentifier, BookInfoProvider, BookInfoValue, ResolvedBookInfo } from '../../types/bookInfo'
import { findIsbns } from '../../utils/isbn'
import { createPdfBook } from '../pdf/PdfBookFactory'
import { pdfMetadataLanguage, pdfMetadataText } from '../pdf/pdfMetadata'
import { PdfTextExtractor } from '../pdf/PdfTextExtractor'

const EMPTY_LOOKUP_HINTS = { title: null, author: null, identifiers: [] }

// ISBN costuma estar na página de copyright (início) ou na ficha catalográfica/contracapa (fim) — DI-013.
const ISBN_SCAN_FIRST_PAGES = 10
const ISBN_SCAN_LAST_PAGES = 3

/**
 * Ficha local de um PDF (`source: 'pdf-metadata'`), no lugar do EpubBookInfoProvider quando o livro é PDF.
 * Dá título/autor/idioma/páginas dos metadados e, principalmente, o ISBN achado no texto — que destrava o
 * Open Library (só busca por ISBN). Google Books, Open Library e YouTube seguem como no EPUB.
 */
export class PdfBookInfoProvider implements BookInfoProvider {
  readonly source = 'pdf-metadata' as const

  async collect(fileBlob: Blob | null): Promise<Partial<ResolvedBookInfo>> {
    if (!fileBlob) return { lookupHints: EMPTY_LOOKUP_HINTS }

    let handle: Awaited<ReturnType<typeof createPdfBook>>
    try {
      handle = await createPdfBook(fileBlob)
    } catch {
      // PDF ilegível: a ficha segue só com título/autor do registro do livro (vindos do contexto).
      return { lookupHints: EMPTY_LOOKUP_HINTS }
    }

    const { book, pdf } = handle
    try {
      const title = pdfMetadataText(book.metadata.title, ' ')
      const author = pdfMetadataText(book.metadata.author)
      const language = pdfMetadataLanguage(book.metadata.language)
      const synopsis = pdfMetadataText(book.metadata.description, ' ')
      const publisher = pdfMetadataText(book.metadata.publisher)

      const identifiers = await this.findIdentifiers(new PdfTextExtractor(pdf))
      const isbn13 = identifiers.find((identifier) => identifier.kind === 'ISBN_13')
      const isbn10 = identifiers.find((identifier) => identifier.kind === 'ISBN_10')

      return {
        pageCount: this.value(pdf.numPages, 'high'),
        publisher: publisher ? this.value(publisher, 'medium') : null,
        language: language ? this.value(language, 'high') : null,
        synopsis: synopsis ? this.value(synopsis, 'medium') : null,
        // ISBN lido do texto vale menos que o declarado nos metadados de um EPUB: 'medium'.
        isbn13: isbn13 ? this.value(isbn13, 'medium') : null,
        isbn10: isbn10 ? this.value(isbn10, 'medium') : null,
        universalIdentifier: identifiers[0] ? this.value(identifiers[0], 'medium') : null,
        lookupHints: { title, author, identifiers },
      }
    } finally {
      book.destroy()
    }
  }

  private async findIdentifiers(extractor: PdfTextExtractor): Promise<BookIdentifier[]> {
    const pageCount = extractor.pageCount
    const indexes = new Set<number>()
    for (let i = 0; i < Math.min(ISBN_SCAN_FIRST_PAGES, pageCount); i++) indexes.add(i)
    for (let i = Math.max(0, pageCount - ISBN_SCAN_LAST_PAGES); i < pageCount; i++) indexes.add(i)

    const identifiers: BookIdentifier[] = []
    for (const pageIndex of [...indexes].sort((a, b) => a - b)) {
      // Página que falha ao ler não impede a busca nas outras.
      const text = await extractor.getRawText(pageIndex).catch(() => '')
      for (const isbn of findIsbns(text)) {
        if (identifiers.some((identifier) => identifier.value === isbn)) continue
        identifiers.push({ kind: isbn.length === 13 ? 'ISBN_13' : 'ISBN_10', value: isbn, raw: isbn })
      }
    }
    return identifiers
  }

  private value<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }
}
