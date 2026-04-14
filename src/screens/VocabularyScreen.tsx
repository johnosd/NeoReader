import { Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
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

  // Intercepta o botão Back físico do Android
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', onBack)
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [onBack])

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-[#a0a0a0] active:text-white transition-colors p-1 -ml-1"
          aria-label="Voltar"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">Vocabulário</h1>
      </header>

      <main className="px-4 pb-24">
        {/* Carregando */}
        {items === undefined && (
          <div className="flex justify-center pt-16">
            <div className="w-6 h-6 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Lista vazia */}
        {items?.length === 0 && <EmptyState />}

        {/* Itens salvos */}
        {items && items.length > 0 && (
          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.id} className="bg-[#1a1a1a] rounded-xl p-4 flex flex-col gap-3">
                {/* Badge: título do livro */}
                <span className="text-[#6366f1] text-xs font-semibold uppercase tracking-wide truncate">
                  {item.bookTitle}
                </span>

                {/* Texto original — até 3 linhas */}
                <p className="text-[#a0a0a0] text-sm leading-relaxed line-clamp-3">
                  {item.sourceText}
                </p>

                <div className="border-t border-[#2a2a2a]" />

                {/* Tradução */}
                <p className="text-white text-sm leading-relaxed">
                  {item.translatedText}
                </p>

                {/* Botão apagar */}
                <div className="flex justify-end">
                  <button
                    onClick={() => item.id !== undefined && void deleteVocabItem(item.id)}
                    className="text-[#a0a0a0] active:text-red-400 transition-colors p-1"
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <span className="text-5xl">⭐</span>
      <h2 className="text-lg font-semibold text-white">Nenhum item salvo</h2>
      <p className="text-[#a0a0a0] text-sm max-w-64">
        Toque em um parágrafo durante a leitura e salve com ⭐
      </p>
    </div>
  )
}
