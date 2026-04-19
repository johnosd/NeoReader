import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'

interface TocDrawerProps {
  open: boolean
  toc: TocItem[]
  onSelect: (href: string) => void
  onClose: () => void
}

export function TocDrawer({ open, toc, onSelect, onClose }: TocDrawerProps) {
  // Set de hrefs expandidos — por padrão, expande itens raiz que têm subseções
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Inicializa estado de expansão quando o TOC carrega (roda uma vez ao abrir o livro)
  useEffect(() => {
    setExpanded(
      new Set(toc.filter(item => item.subitems?.length).map(item => item.href))
    )
  }, [toc])

  function toggleExpand(href: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  const translateX = open ? 'translate-x-0' : '-translate-x-full'

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-[29]"
          onClick={onClose}
        />
      )}

      <div
        className={`absolute left-0 top-0 bottom-0 z-30 w-4/5 max-w-[320px] bg-[#1a1a1a]
          transition-transform duration-300 ${translateX} flex flex-col`}
      >
        {/* pt-10 deixa espaço para status bar do Android (~24-28px) */}
        <div className="flex items-center justify-between px-5 pt-10 pb-4 border-b border-[#2a2a2a] shrink-0">
          <h2 className="text-white font-semibold text-base">Índice</h2>
          <button
            onClick={onClose}
            className="p-1 -mr-1 text-[#a0a0a0] active:opacity-60"
            aria-label="Fechar índice"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pb-8">
          {toc.length === 0 ? (
            <p className="text-[#a0a0a0] text-sm px-5 py-4">Índice não disponível</p>
          ) : (
            <TocList
              items={toc}
              depth={0}
              expanded={expanded}
              onToggle={toggleExpand}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
    </>
  )
}

// Componente recursivo — renderiza capítulos e subseções com expansão dinâmica
function TocList({
  items,
  depth,
  expanded,
  onToggle,
  onSelect,
}: {
  items: TocItem[]
  depth: number
  expanded: Set<string>
  onToggle: (href: string) => void
  onSelect: (href: string) => void
}) {
  return (
    <>
      {items.map((item, i) => {
        const hasChildren = !!item.subitems?.length
        const isExpanded = expanded.has(item.href)

        return (
          <div key={`${item.href}-${i}`}>
            <div
              className="flex items-center"
              style={{ paddingLeft: `${depth * 16}px` }}
            >
              {hasChildren ? (
                <button
                  onClick={() => onToggle(item.href)}
                  className="p-2 shrink-0 text-[#6b6b7a] active:opacity-60"
                  aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                >
                  {isExpanded
                    ? <ChevronDown size={16} />
                    : <ChevronRight size={16} />
                  }
                </button>
              ) : (
                // w-8 = 32px: alinha texto com itens que têm chevron (p-2 + icon-16 + p-2)
                <span className="w-8 shrink-0" />
              )}

              <button
                onClick={() => onSelect(item.href)}
                className={`flex-1 text-left py-3 pr-5 text-sm active:bg-[#2a2a2a]
                  ${depth === 0 ? 'text-[#e8e8e8]' : 'text-[#a0a0a0]'}`}
              >
                {item.label}
              </button>
            </div>

            {hasChildren && isExpanded && (
              <TocList
                items={item.subitems!}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
