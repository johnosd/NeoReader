import type { BookFormat } from '@/types/book'

// Capacidades da superfície montada no leitor. O modo texto do PDF poderá usar
// o EpubViewer com tipografia sem alterar o comportamento da superfície EPUB.
export interface ReaderCapabilities {
  viewer: 'epub' | 'pdf-page'
  usesPdfSession: boolean
  showsPdfNotices: boolean
  supportsTypography: boolean
  supportsReadingModeToggle: boolean
  translationPresentation: 'inline' | 'bubble'
  closesChromeAfterNavigation: boolean
  hasPdfTocCopy: boolean
}

const EPUB_CAPABILITIES: ReaderCapabilities = {
  viewer: 'epub',
  usesPdfSession: false,
  showsPdfNotices: false,
  supportsTypography: true,
  supportsReadingModeToggle: false,
  translationPresentation: 'inline',
  closesChromeAfterNavigation: false,
  hasPdfTocCopy: false,
}

const PDF_PAGE_CAPABILITIES: ReaderCapabilities = {
  viewer: 'pdf-page',
  usesPdfSession: true,
  showsPdfNotices: true,
  supportsTypography: false,
  supportsReadingModeToggle: true,
  translationPresentation: 'bubble',
  closesChromeAfterNavigation: true,
  hasPdfTocCopy: true,
}

const PDF_TEXT_CAPABILITIES: ReaderCapabilities = {
  ...PDF_PAGE_CAPABILITIES,
  viewer: 'epub',
  supportsTypography: true,
  translationPresentation: 'inline',
  closesChromeAfterNavigation: false,
}

export function readerCapabilitiesForFormat(format?: BookFormat, pdfMode: 'page' | 'text' = 'page'): ReaderCapabilities {
  if (format !== 'PDF') return EPUB_CAPABILITIES
  return pdfMode === 'text' ? PDF_TEXT_CAPABILITIES : PDF_PAGE_CAPABILITIES
}
