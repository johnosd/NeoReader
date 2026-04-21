import { Trash2, Star, Search, ArrowLeft } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { EmptyState, Input, Spinner } from '../components/ui'
import { db } from '../db/database'
import { deleteVocabItem } from '../db/vocabulary'

interface VocabularyScreenProps {
  onBack: () => void
}

export function VocabularyScreen({ onBack }: VocabularyScreenProps) {
  // Reativo: atualiza automaticamente quando um item é apagado
  const items = useLiveQuery(
    () => db.vocabulary.orderBy('createdAt').reverse().toArray(),
    [],
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', onBack)
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [onBack])

  // Filtro cliente — aceita match em texto original, tradução ou livro.
  const filtered = useMemo(() => {
    if (!items) return undefined
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.sourceText.toLowerCase().includes(q) ||
        i.translatedText.toLowerCase().includes(q) ||
        i.bookTitle.toLowerCase().includes(q),
    )
  }, [items, query])

  const hasItems = items && items.length > 0

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-12">
      <header className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">Biblioteca</p>
          <h1 className="text-2xl font-serif font-bold text-purple-light">Vocabulário</h1>
        </div>
      </header>

      {hasItems && (
        <div className="px-4 mb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar palavra, tradução ou livro..."
            leftIcon={<Search size={16} />}
          />
        </div>
      )}

      <main className="px-4">
        {items === undefined && (
          <div className="flex justify-center pt-16">
            <Spinner tone="purple" label="Carregando" />
          </div>
        )}

        {items?.length === 0 && (
          <EmptyState
            icon={<Star size={48} />}
            title="Nenhum item salvo"
            description="Toque em um parágrafo durante a leitura e salve com a estrela."
          />
        )}

        {hasItems && filtered && filtered.length === 0 && (
          <EmptyState
            icon={<Search size={48} />}
            title="Nada encontrado"
            description={`Nenhum item combina com "${query}".`}
          />
        )}

        {filtered && filtered.length > 0 && (
          <ul className="flex flex-col gap-3">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="bg-bg-surface rounded-md p-4 flex flex-col gap-3 border border-border"
              >
                {/* Overline — livro de origem */}
                <p className="text-purple-light text-[11px] font-bold uppercase tracking-wider truncate">
                  {item.bookTitle}
                </p>

                {/* Texto original em Playfair italic — destaca como citação */}
                <p className="text-text-secondary text-sm leading-relaxed font-serif italic line-clamp-3">
                  {item.sourceText}
                </p>

                <div className="border-t border-border" />

                {/* Tradução */}
                <p className="text-text-primary text-sm leading-relaxed">
                  {item.translatedText}
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={() => item.id !== undefined && void deleteVocabItem(item.id)}
                    className="text-text-muted active:text-error transition-colors p-1 rounded-md active:scale-90"
                    aria-label="Apagar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
