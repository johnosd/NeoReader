import type { BookIdentifier, BookInfoProvider, BookInfoValue, ResolvedBookInfo } from '../../types/bookInfo'
import { findIsbnsWithContext, type IsbnContext } from '../../utils/isbn'
import { createPdfBook } from '../pdf/PdfBookFactory'
import { pdfMetadataAuthor, pdfMetadataLanguage, pdfMetadataText, pdfMetadataTitle } from '../pdf/pdfMetadata'
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
      // Título/autor-lixo (R-026) viram null: o enriquecimento busca pelo título/autor do registro do livro.
      const title = pdfMetadataTitle(book.metadata.title)
      const author = pdfMetadataAuthor(book.metadata.author)
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

  // Escolhe os ISBNs DESTA edição (R-025). A página de copyright de uma tradução traz antes o ISBN do original
  // e o da edição anterior, e as últimas páginas costumam anunciar outros livros da editora — pegar o primeiro
  // da ordem gravava a identidade de outra edição (e o Open Library achava a obra errada). Camadas, a primeira
  // não vazia vence, sem misturar: limpo das primeiras páginas > limpo das últimas > histórico de edição.
  // ISBN de "outra obra" (original da tradução) nunca entra: melhor sem ISBN que com o de outro livro.
  private async findIdentifiers(extractor: PdfTextExtractor): Promise<BookIdentifier[]> {
    const pageCount = extractor.pageCount
    const firstPages = Math.min(ISBN_SCAN_FIRST_PAGES, pageCount)
    const indexes = new Set<number>()
    for (let i = 0; i < firstPages; i++) indexes.add(i)
    for (let i = Math.max(0, pageCount - ISBN_SCAN_LAST_PAGES); i < pageCount; i++) indexes.add(i)

    const candidates: Array<{ isbn: string; context: IsbnContext; fromFirstPages: boolean }> = []
    for (const pageIndex of [...indexes].sort((a, b) => a - b)) {
      // Página que falha ao ler não impede a busca nas outras.
      const text = await extractor.getRawText(pageIndex).catch(() => '')
      for (const { isbn, context } of findIsbnsWithContext(text)) {
        if (candidates.some((candidate) => candidate.isbn === isbn)) continue
        candidates.push({ isbn, context, fromFirstPages: pageIndex < firstPages })
      }
    }

    const tiers = [
      candidates.filter((c) => c.context === 'clean' && c.fromFirstPages),
      candidates.filter((c) => c.context === 'clean' && !c.fromFirstPages),
      candidates.filter((c) => c.context === 'edition-history'),
    ]
    const chosen = tiers.find((tier) => tier.length > 0) ?? []
    return chosen.map(({ isbn }): BookIdentifier => ({ kind: isbn.length === 13 ? 'ISBN_13' : 'ISBN_10', value: isbn, raw: isbn }))
  }

  private value<T>(value: T, confidence: BookInfoValue<T>['confidence']): BookInfoValue<T> {
    return { value, source: this.source, confidence }
  }
}
