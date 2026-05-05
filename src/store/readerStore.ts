import { create } from 'zustand'

// Estado compartilhado entre siblings do Reader:
// EpubViewer (escreve) ↔ ReaderChrome (lê percentage) ↔ TocSheet (lê toc)
// Estado puramente local (chromeVisible, fontSize, etc.) fica em useState no ReaderScreen.

interface ReaderState {
  cfi: string
  percentage: number
  chapterPercentage: number | null
  toc: TocItem[]
  tocLabel: string   // nome do capítulo atual (do evento relocate)
  setCfi: (cfi: string, percentage: number, tocLabel: string | undefined, chapterPercentage?: number) => void
  setToc: (toc: TocItem[]) => void
  reset: () => void // chamado no unmount do ReaderScreen para limpar estado residual
}

export const useReaderStore = create<ReaderState>((set) => ({
  cfi: '',
  percentage: 0,
  chapterPercentage: null,
  toc: [],
  tocLabel: '',
  setCfi: (cfi, percentage, tocLabel, chapterPercentage) => set({
    cfi,
    percentage,
    tocLabel: tocLabel ?? '',
    chapterPercentage: chapterPercentage ?? null,
  }),
  setToc: (toc) => set({ toc }),
  reset: () => set({ cfi: '', percentage: 0, chapterPercentage: null, toc: [], tocLabel: '' }),
}))
