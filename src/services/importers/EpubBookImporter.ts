import { EpubService } from '../EpubService'
import type { NativePreparedEpub } from '../NativeLibraryImportService'
import type { BookIdentifier, ResolvedBookInfo } from '@/types/bookInfo'
import type { BookFormatImporter } from './BookFormatImporter'
import { preparedCoverToBlob } from './preparedFile'

function identifierValue(identifiers: BookIdentifier[], kind: 'ISBN_10' | 'ISBN_13') {
  const identifier = identifiers.find((candidate) => candidate.kind === kind)
  return identifier
    ? { value: identifier, source: 'epub-metadata' as const, confidence: 'high' as const }
    : null
}

function bookInfoContext(prepared: NativePreparedEpub): Partial<ResolvedBookInfo> {
  const identifiers = prepared.metadata.identifiers ?? []
  return {
    ...(prepared.metadata.language ? {
      language: { value: prepared.metadata.language, source: 'epub-metadata', confidence: 'high' },
    } : {}),
    ...(prepared.metadata.description ? {
      synopsis: { value: prepared.metadata.description, source: 'epub-metadata', confidence: 'high' },
    } : {}),
    lookupHints: {
      title: prepared.metadata.title,
      author: prepared.metadata.author,
      identifiers,
    },
    isbn10: identifierValue(identifiers, 'ISBN_10'),
    isbn13: identifierValue(identifiers, 'ISBN_13'),
    universalIdentifier: identifiers[0]
      ? {
        value: identifiers[0],
        source: 'epub-metadata',
        confidence: identifiers[0].kind === 'OTHER' ? 'medium' : 'high',
      }
      : null,
  }
}

export const epubBookImporter: BookFormatImporter = {
  format: 'EPUB',
  defaultFileName: 'book.epub',
  coverSource: 'epub-extracted',
  parseMetadata: (file) => EpubService.parseMetadata(file),
  prepareNative: async (prepared) => ({
    metadata: {
      title: prepared.metadata.title || prepared.name.replace(/\.epub$/i, ''),
      author: prepared.metadata.author || 'Autor desconhecido',
      coverBlob: preparedCoverToBlob(prepared),
    },
    bookInfoContext: bookInfoContext(prepared),
  }),
  bookInfoProviders: () => undefined,
  onCoverReextracted: (bookId) => EpubService.invalidateExtrasCache(bookId),
}
