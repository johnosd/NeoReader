import { create } from 'zustand'

// Estado compartilhado entre siblings do Reader:
// EpubViewer (escreve) ↔ ReaderChrome (lê percentage) ↔ TocSheet (lê toc)
// Estado puramente local (chromeVisible, fontSize, etc.) fica em useState no ReaderScreen.

interface ReaderState {
  cfi: string
  percentage: number
  toc: TocItem[]
  tocLabel: string   // nome do capítulo atual (do evento relocate)
  setCfi: (cfi: string, percentage: number, tocLabel: string | undefined) => void
  setToc: (toc: TocItem[]) => void
  reset: () => void // chamado no unmount do ReaderScreen para limpar estado residual
}

export const useReaderStore = create<ReaderState>((set) => ({
  cfi: '',
  percentage: 0,
  toc: [],
  tocLabel: '',
  setCfi: (cfi, percentage, tocLabel) => set({ cfi, percentage, tocLabel: tocLabel ?? '' }),
  setToc: (toc) => set({ toc }),
  reset: () => set({ cfi: '', percentage: 0, toc: [], tocLabel: '' }),
}))
