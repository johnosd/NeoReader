export type PdfImportErrorCode = 'PDF_PASSWORD_PROTECTED' | 'PDF_INVALID'

export const PDF_IMPORT_ERROR_MESSAGES: Record<PdfImportErrorCode, string> = {
  PDF_PASSWORD_PROTECTED: 'Este PDF é protegido por senha e não pode ser importado.',
  PDF_INVALID: 'Este arquivo não é um PDF válido ou está corrompido.',
}

/** Erro de import já classificado (FR-015): a UI mostra a mensagem, sem criar livro na biblioteca. */
export class PdfImportError extends Error {
  readonly code: PdfImportErrorCode

  constructor(code: PdfImportErrorCode) {
    super(PDF_IMPORT_ERROR_MESSAGES[code])
    this.name = 'PdfImportError'
    this.code = code
  }
}

export function isPdfImportErrorCode(value: unknown): value is PdfImportErrorCode {
  return value === 'PDF_PASSWORD_PROTECTED' || value === 'PDF_INVALID'
}
