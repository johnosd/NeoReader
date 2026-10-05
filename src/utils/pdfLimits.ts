import type { Book } from '@/types/book'

// FR-016: acima disto o PDF abre com aviso de possível lentidão (a garantia vale até 1000 páginas / 200 MB).
export const PDF_LARGE_PAGE_COUNT = 1000
export const PDF_LARGE_FILE_BYTES = 200 * 1024 * 1024

export function isLargePdf(book: Pick<Book, 'pageCount' | 'fileSize'>): boolean {
  return (book.pageCount ?? 0) > PDF_LARGE_PAGE_COUNT || (book.fileSize ?? 0) > PDF_LARGE_FILE_BYTES
}
