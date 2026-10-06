import type { EpubMetadata } from '../EpubService'
import type { NativePreparedEpub } from '../NativeLibraryImportService'
import type { BookCoverSource, BookFormat, PdfTextLayer } from '@/types/book'
import type { BookInfoProvider, ResolvedBookInfo } from '@/types/bookInfo'

export interface ParsedBookMetadata extends EpubMetadata {
  pdf?: {
    pageCount: number
    pdfTextLayer: PdfTextLayer
    detectedLanguage: string | null
  }
}

export interface PreparedBookImport {
  metadata: ParsedBookMetadata
  bookInfoBlob?: Blob
  bookInfoContext: Partial<ResolvedBookInfo>
}

export interface BookFormatImporter {
  format: BookFormat
  defaultFileName: string
  coverSource: BookCoverSource
  parseMetadata(file: File): Promise<ParsedBookMetadata>
  prepareNative(prepared: NativePreparedEpub): Promise<PreparedBookImport>
  bookInfoProviders(): BookInfoProvider[] | undefined
  onCoverReextracted?(bookId: number): void
}
