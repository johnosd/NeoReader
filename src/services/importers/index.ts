import type { BookFormat } from '@/types/book'
import type { BookFormatImporter, ParsedBookMetadata } from './BookFormatImporter'
import { epubBookImporter } from './EpubBookImporter'
import { pdfBookImporter } from './PdfBookImporter'

export type { ParsedBookMetadata } from './BookFormatImporter'
export { cleanupPreparedLocalFile } from './preparedFile'

export function importerForFormat(format?: BookFormat): BookFormatImporter {
  return format === 'PDF' ? pdfBookImporter : epubBookImporter
}

export function importerForMetadata(metadata: ParsedBookMetadata): BookFormatImporter {
  return importerForFormat(metadata.pdf ? 'PDF' : 'EPUB')
}
