import { useEffect, useRef, useState } from 'react'
import { Star, StarOff } from 'lucide-react'
import { translate, extractNextNParagraphs } from '../../services/TranslationService'
import { addVocabItem } from '../../db/vocabulary'

interface TranslationBubbleProps {
  open: boolean
  sourceText: string
  siblingElements: Element[]    // parágrafos após o tapped, para o botão +10
  bookId: number
  bookTitle: string
  onClose: () => void
}

export function TranslationBubble({
  open,
  sourceText,
  siblingElements,
  bookId,
  bookTitle,
  onClose,
}: TranslationBubbleProps) {
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // displayText: texto exibido (pode crescer com +10 parágrafos)
  const [displayText, setDisplayText] = useState(sourceText)
  // cursor conta quantas expansões de +10 já foram feitas
  const expansionCursor = useRef(0)

  // Quando a bolha abre com um novo parágrafo, reinicia estado e traduz
  useEffect(() => {
    if (!open || !sourceText) return
    setTranslatedText(null)
    setError(null)
    setSaved(false)
    setDisplayText(sourceText)
    expansionCursor.current = 0

    setLoading(true)
    translate(sourceText)
      .then(setTranslatedText)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, sourceText])

  async function handleExpand() {
    const start = expansionCursor.current * 10
    const extra = extractNextNParagraphs(siblingElements.slice(start), 10)
    if (!extra) return

    const combined = [displayText, extra].join(' ')
    setDisplayText(combined)
    expansionCursor.current += 1

    setLoading(true)
    setError(null)
    try {
      const result = await translate(combined)
      setTranslatedText(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!translatedText) return
    await addVocabItem({
      bookId,
      bookTitle,
      sourceText: displayText,
      translatedText,
      sourceLang: 'en',
      targetLang: 'pt-BR',
      createdAt: new Date(),
    })
    setSaved(true)
  }

  // Verifica se ainda há parágrafos para expandir
  const canExpand = siblingElements
    .slice(expansionCursor.current * 10 + 1)
    .some((el) => el.isConnected && el.textContent?.trim())

  const translateY = open ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-[29]" onClick={onClose} />
      )}

      <div
        className={`absolute inset-x-0 bottom-0 z-30 max-h-[70vh] bg-[#1a1a1a]
          rounded-t-2xl transition-transform duration-300 ${translateY} flex flex-col`}
      >
        {/* Handle visual */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#2a2a2a]" />
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-4">
          {/* Texto original */}
          <p className="text-[#a0a0a0] text-xs font-semibold uppercase tracking-wide mb-2">
            Original
          </p>
          <p className="text-white text-sm leading-relaxed line-clamp-4">
            {displayText}
          </p>

          <div className="my-4 border-t border-[#2a2a2a]" />

          {/* Tradução */}
          <p className="text-[#a0a0a0] text-xs font-semibold uppercase tracking-wide mb-2">
            Tradução
          </p>

          {loading && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-[#a0a0a0] text-sm">Traduzindo...</span>
            </div>
          )}

          {!loading && error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {!loading && translatedText && (
            <p className="text-white text-sm leading-relaxed">{translatedText}</p>
          )}
        </div>

        {/* Botões de ação */}
        <div className="flex items-center justify-between px-5 py-4 pb-8 border-t border-[#2a2a2a] shrink-0">
          <button
            onClick={handleExpand}
            disabled={!canExpand || loading}
            className="text-[#6366f1] text-sm font-medium disabled:opacity-40 active:opacity-60"
          >
            +10 parágrafos
          </button>

          <button
            onClick={handleSave}
            disabled={!translatedText || loading || saved}
            className="flex items-center gap-1.5 text-sm font-medium
              disabled:opacity-40 active:opacity-60
              text-[#6366f1]"
          >
            {saved
              ? <><Star size={16} className="fill-[#6366f1]" /> Salvo</>
              : <><StarOff size={16} /> Salvar</>
            }
          </button>
        </div>
      </div>
    </>
  )
}
