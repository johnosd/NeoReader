import { describe, expect, it } from 'vitest'

import { detectBookFormat } from '@/utils/bookFormat'

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))
const blobOf = (bytes: number[]) => new Blob([new Uint8Array(bytes)])

// ZIP real de EPUB: assinatura local "PK\x03\x04" + 26 bytes de header + nome "mimetype" + conteúdo (stored).
const epubBytes = () => [
  0x50, 0x4b, 0x03, 0x04, ...new Array(26).fill(0),
  ...ascii('mimetype'), ...ascii('application/epub+zip'),
]

describe('detectBookFormat', () => {
  it('reconhece EPUB pelo ZIP', async () => {
    expect(await detectBookFormat(blobOf(epubBytes()))).toBe('EPUB')
  })

  it('reconhece PDF pelo header %PDF-', async () => {
    expect(await detectBookFormat(blobOf(ascii('%PDF-1.7\n%âãÏÓ\n1 0 obj')))).toBe('PDF')
  })

  it('aceita lixo antes do header do PDF dentro dos primeiros 1024 bytes', async () => {
    const garbage = new Array(900).fill(0x0a)
    expect(await detectBookFormat(blobOf([...garbage, ...ascii('%PDF-1.4')]))).toBe('PDF')
  })

  it('não procura o header do PDF além dos primeiros 1024 bytes', async () => {
    const garbage = new Array(2000).fill(0x20)
    expect(await detectBookFormat(blobOf([...garbage, ...ascii('%PDF-1.4')]))).toBeNull()
  })

  it('devolve null para arquivo aleatório, texto e arquivo vazio', async () => {
    expect(await detectBookFormat(blobOf([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBeNull() // PNG
    expect(await detectBookFormat(blobOf(ascii('Isto é só texto.')))).toBeNull()
    expect(await detectBookFormat(blobOf([]))).toBeNull()
  })

  it('decide pelo conteúdo, não pelo nome do arquivo', async () => {
    const pdfNamedEpub = new File([new Uint8Array(ascii('%PDF-1.7'))], 'livro.epub')
    const epubNamedPdf = new File([new Uint8Array(epubBytes())], 'livro.pdf')
    expect(await detectBookFormat(pdfNamedEpub)).toBe('PDF')
    expect(await detectBookFormat(epubNamedPdf)).toBe('EPUB')
  })
})
