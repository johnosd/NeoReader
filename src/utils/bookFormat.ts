import type { BookFormat } from '@/types/book'

// A spec do PDF permite lixo antes de "%PDF-", mas só nos primeiros 1024 bytes
// (o mesmo limite que leitores como o pdf.js usam para achar o header).
const PDF_HEADER_SEARCH_BYTES = 1024
const PDF_MAGIC = '%PDF-'
// Assinatura de entrada local de um ZIP ("PK\x03\x04"); todo EPUB é um ZIP.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

// FileReader como fallback: o Blob do jsdom (testes) não tem arrayBuffer().
async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Descobre o formato pelo CONTEÚDO do arquivo (DI-011), não pela extensão.
 * Devolve null para qualquer coisa que não seja PDF nem ZIP.
 *
 * ZIP conta como EPUB sem olhar o `mimetype` interno de propósito: é o mesmo
 * critério frouxo que o fluxo EPUB sempre teve (quem valida de verdade é o
 * parser em EpubService) — endurecer aqui mudaria o comportamento do EPUB (DI-001).
 */
export async function detectBookFormat(blob: Blob): Promise<BookFormat | null> {
  const head = await readBytes(blob.slice(0, PDF_HEADER_SEARCH_BYTES))

  if (ZIP_MAGIC.every((byte, i) => head[i] === byte)) return 'EPUB'

  // Latin1 mapeia 1 byte → 1 char, então indexOf funciona mesmo com lixo binário antes do header.
  const asText = Array.from(head, (byte) => String.fromCharCode(byte)).join('')
  if (asText.includes(PDF_MAGIC)) return 'PDF'

  return null
}
