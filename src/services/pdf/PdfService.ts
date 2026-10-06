import { createPdfBook } from './PdfBookFactory'
import { PdfImportError } from './PdfImportError'
import { pdfMetadataAuthor, pdfMetadataLanguage, pdfMetadataTitle } from './pdfMetadata'
import { PdfTextExtractor } from './PdfTextExtractor'
import type { PdfTextLayer } from '@/types/book'
import { detectTextLanguage } from '@/utils/textLanguage'

// Páginas amostradas no import para decidir a camada de texto e o idioma. Espalhadas pelo livro:
// capa/sumário (início) não representam o miolo, e ler tudo custaria muito num PDF de 1000 páginas.
const SAMPLE_PAGE_COUNT = 8
// Página com menos caracteres visíveis que isso não conta como "página de texto" (número de página,
// legenda solta, marca d'água de scanner).
const MIN_TEXTUAL_CHARS = 40
// Texto de PDF com fonte sem ToUnicode parece existir mas sai como lixo (R-009): exige maioria de
// letras/dígitos e quase nenhum caractere de uso privado/substituição/controle.
const MIN_LETTER_DIGIT_RATIO = 0.6
const MAX_JUNK_RATIO = 0.05
// 'full' = quase todas as páginas amostradas têm texto; 'partial' = algumas; 'none' = nenhuma.
const FULL_TEXT_PAGE_SHARE = 0.8

// Reexportado: o erro vive em PdfImportError.ts para o serviço nativo usá-lo sem puxar o pdf.js.
export { PdfImportError, type PdfImportErrorCode } from './PdfImportError'

export interface PdfMetadata {
  title: string
  author: string
  coverBlob: Blob | null
  pageCount: number
  pdfTextLayer: PdfTextLayer
  // Idioma dos metadados do PDF ou detectado pelo texto amostrado; null = indefinido (DI-012).
  detectedLanguage: string | null
}

/** Texto extraído de uma página parece texto de verdade (e não lixo de fonte sem ToUnicode)? */
export function isUsablePageText(rawText: string): boolean {
  const visible = rawText.replace(/\s/g, '')
  if (visible.length < MIN_TEXTUAL_CHARS) return false
  const letterDigits = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0
  const junk = visible.match(/[�\p{Co}\p{Cc}]/gu)?.length ?? 0
  return letterDigits / visible.length >= MIN_LETTER_DIGIT_RATIO && junk / visible.length <= MAX_JUNK_RATIO
}

/** Índices (0-based) de até `count` páginas espalhadas do começo ao fim do documento. */
export function samplePageIndexes(pageCount: number, count = SAMPLE_PAGE_COUNT): number[] {
  if (pageCount <= count) return Array.from({ length: pageCount }, (_, i) => i)
  const picked = new Set<number>()
  for (let i = 0; i < count; i++) picked.add(Math.round((i * (pageCount - 1)) / (count - 1)))
  return [...picked]
}

function classifyOpenError(error: unknown): PdfImportError {
  const name = error instanceof Error ? error.name : ''
  return new PdfImportError(name === 'PasswordException' ? 'PDF_PASSWORD_PROTECTED' : 'PDF_INVALID')
}

export class PdfService {
  /**
   * Lê o essencial de um PDF no import: título/autor, capa da página 1, nº de páginas, camada de texto
   * e idioma. Abre o documento, amostra algumas páginas e destrói tudo antes de devolver.
   * `fileName` entra só como título de reserva quando o PDF não traz metadados.
   */
  static async parseMetadata(file: Blob, fileName = ''): Promise<PdfMetadata> {
    let handle: Awaited<ReturnType<typeof createPdfBook>>
    try {
      handle = await createPdfBook(file)
    } catch (error) {
      throw classifyOpenError(error)
    }

    const { book, pdf } = handle
    try {
      const extractor = new PdfTextExtractor(pdf)

      // Camada de texto + texto para detectar idioma, sobre as mesmas páginas amostradas (sem leitura extra, DI-012).
      const sampledTexts: string[] = []
      for (const pageIndex of samplePageIndexes(pdf.numPages)) {
        // Uma página ilegível não derruba o import: conta como "sem texto".
        const text = await extractor.getRawText(pageIndex).catch(() => '')
        sampledTexts.push(text)
      }
      const usable = sampledTexts.filter(isUsablePageText)
      const share = sampledTexts.length ? usable.length / sampledTexts.length : 0
      const pdfTextLayer: PdfTextLayer = usable.length === 0 ? 'none' : share >= FULL_TEXT_PAGE_SHARE ? 'full' : 'partial'

      const detectedLanguage =
        pdfMetadataLanguage(book.metadata.language) ?? (usable.length ? detectTextLanguage(usable.join('\n')) : null)

      const coverBlob = await book.getCover().catch(() => null)

      return {
        title: pdfMetadataTitle(book.metadata.title) ?? (fileName.replace(/\.pdf$/i, '').trim() || 'Sem título'),
        author: pdfMetadataAuthor(book.metadata.author) ?? 'Autor desconhecido',
        coverBlob,
        pageCount: pdf.numPages,
        pdfTextLayer,
        detectedLanguage,
      }
    } finally {
      book.destroy()
    }
  }
}
