// Divisão do PDF em "trechos" (DI-009): a mesma unidade serve de seção no modo
// texto (um trecho = uma seção do livro sintético) e de "seção" do TTS na página fiel.

export interface PdfChunk {
  index: number
  startPage: number // 0-based
  endPage: number // inclusivo
  label: string
}

/** Item de nível 1 do outline já resolvido para índice de página. */
export interface PdfOutlineEntry {
  title: string
  pageIndex: number
}

// Tamanho dos blocos quando não há sumário, e das subdivisões de capítulo gigante.
export const PDF_CHUNK_PAGES = 20
// Acima disso o capítulo é subdividido: um trecho enorme custaria memória/tempo no modo texto.
export const PDF_CHUNK_MAX_PAGES = 40

const defaultPagesLabel = (first: number, last: number) => `Páginas ${first}–${last}`

function splitIntoBlocks(startPage: number, endPage: number): Array<[number, number]> {
  const blocks: Array<[number, number]> = []
  for (let page = startPage; page <= endPage; page += PDF_CHUNK_PAGES) {
    blocks.push([page, Math.min(page + PDF_CHUNK_PAGES - 1, endPage)])
  }
  return blocks
}

export function buildPdfChunks(
  pageCount: number,
  outline: readonly PdfOutlineEntry[] | null | undefined,
  // Os rótulos "Páginas X–Y" vão para a UI; quem chama pode passar a versão i18n (números 1-based).
  pagesLabel: (firstPage: number, lastPage: number) => string = defaultPagesLabel,
): PdfChunk[] {
  if (!Number.isInteger(pageCount) || pageCount <= 0) return []

  // Descarta destinos fora do documento, ordena por página (o outline pode vir fora de
  // ordem) e, havendo vários itens na mesma página, mantém o primeiro (sort estável).
  const starts: PdfOutlineEntry[] = []
  const sorted = (outline ?? [])
    .filter((entry) => Number.isInteger(entry.pageIndex) && entry.pageIndex >= 0 && entry.pageIndex < pageCount)
    .sort((a, b) => a.pageIndex - b.pageIndex)
  for (const entry of sorted) {
    if (starts[starts.length - 1]?.pageIndex !== entry.pageIndex) starts.push(entry)
  }

  type Section = { startPage: number; endPage: number; title: string | null }
  const sections: Section[] = []

  if (starts.length === 0) {
    sections.push({ startPage: 0, endPage: pageCount - 1, title: null })
  } else {
    // Páginas antes do primeiro capítulo (capa, folha de rosto) viram um trecho sem título.
    if (starts[0].pageIndex > 0) sections.push({ startPage: 0, endPage: starts[0].pageIndex - 1, title: null })
    starts.forEach((entry, i) => {
      const endPage = i + 1 < starts.length ? starts[i + 1].pageIndex - 1 : pageCount - 1
      sections.push({ startPage: entry.pageIndex, endPage, title: entry.title.trim() || null })
    })
  }

  const chunks: PdfChunk[] = []
  const push = (startPage: number, endPage: number, label: string) => {
    chunks.push({ index: chunks.length, startPage, endPage, label })
  }

  for (const section of sections) {
    const length = section.endPage - section.startPage + 1
    const isOutlineChapter = section.title !== null

    // Sem sumário (title null) o trecho é "páginas X–Y" e blocos de 20 sempre; com sumário,
    // só subdivide capítulo que passa de PDF_CHUNK_MAX_PAGES.
    const mustSplit = isOutlineChapter ? length > PDF_CHUNK_MAX_PAGES : length > PDF_CHUNK_PAGES
    if (!mustSplit) {
      push(section.startPage, section.endPage, section.title ?? pagesLabel(section.startPage + 1, section.endPage + 1))
      continue
    }

    const blocks = splitIntoBlocks(section.startPage, section.endPage)
    blocks.forEach(([from, to], i) => {
      push(from, to, isOutlineChapter ? `${section.title} (${i + 1}/${blocks.length})` : pagesLabel(from + 1, to + 1))
    })
  }

  return chunks
}

/** Trecho que contém a página, ou null se estiver fora de todos. */
export function findChunkForPage(chunks: readonly PdfChunk[], pageIndex: number): PdfChunk | null {
  return chunks.find((chunk) => pageIndex >= chunk.startPage && pageIndex <= chunk.endPage) ?? null
}
