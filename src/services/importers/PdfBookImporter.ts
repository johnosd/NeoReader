import { BookFileResolver } from '../BookFileResolver'
import { BookInfoService } from '../bookInfo'
import { PdfService } from '../pdf/PdfService'
import type { BookFormatImporter, ParsedBookMetadata } from './BookFormatImporter'
import { cleanupPreparedLocalFile, preparedCoverToBlob } from './preparedFile'

export const pdfBookImporter: BookFormatImporter = {
  format: 'PDF',
  defaultFileName: 'book.pdf',
  coverSource: 'pdf-rendered',
  parseMetadata: async (file) => {
    const pdf = await PdfService.parseMetadata(file, file.name)
    return {
      title: pdf.title,
      author: pdf.author,
      coverBlob: pdf.coverBlob,
      pdf: { pageCount: pdf.pageCount, pdfTextLayer: pdf.pdfTextLayer, detectedLanguage: pdf.detectedLanguage },
    }
  },
  prepareNative: async (prepared) => {
    let blob: Blob
    try {
      blob = await BookFileResolver.fetchLocalFile(prepared.localUri)
    } catch (error) {
      await cleanupPreparedLocalFile(prepared)
      throw error
    }
    let metadata: ParsedBookMetadata
    try {
      const nativeCover = preparedCoverToBlob(prepared)
      const pdf = await PdfService.parseMetadata(blob, prepared.name, { skipCover: Boolean(nativeCover) })
      metadata = {
        title: pdf.title,
        author: pdf.author,
        // A capa nativa evita renderizar novamente no WebView durante o import em lote.
        coverBlob: nativeCover ?? pdf.coverBlob,
        pdf: { pageCount: pdf.pageCount, pdfTextLayer: pdf.pdfTextLayer, detectedLanguage: pdf.detectedLanguage },
      }
    } catch (error) {
      await cleanupPreparedLocalFile(prepared)
      throw error
    }
    return {
      metadata,
      bookInfoBlob: blob,
      bookInfoContext: {
        lookupHints: { title: metadata.title, author: metadata.author, identifiers: [] },
      },
    }
  },
  bookInfoProviders: () => BookInfoService.defaultProviders('PDF'),
}
