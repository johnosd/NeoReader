import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, BottomSheet, EmptyState } from '../ui'

interface TocDrawerProps {
  open: boolean
  toc: TocItem[]
  onSelect: (href: string) => void
  onClose: () => void
}

function getDirectNavigationHref(item: TocItem): string {
  for (const child of item.subitems ?? []) {
    const target = getDirectNavigationHref(child)
    if (target) return target
  }
  return item.href
}

export function TocDrawer({ open, toc, onSelect, onClose }: TocDrawerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpanded(new Set(toc.filter(item => item.subitems?.length).map(item => item.href)))
  }, [toc])

  function toggleExpand(href: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Índice"
      className="border-t border-white/10 bg-[rgba(15,7,24,0.94)] backdrop-blur-2xl"
    >
      {toc.length === 0 ? (
        <EmptyState
          title="Índice não disponível"
          description="Este EPUB não forneceu uma estrutura navegável para o sumário."
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-white/8 bg-bg-surface-2/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-light/80">
                  Navegação direta
                </p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  Escolha uma seção para abrir o conteúdo útil mais próximo, sem cair em páginas stub.
                </p>
              </div>
              <Badge tone="purple" className="shrink-0 px-2.5 py-1 text-[10px] normal-case tracking-normal">
                {toc.length} itens
              </Badge>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-[rgba(18,9,26,0.84)] px-4 py-5 shadow-card backdrop-blur-xl">
            <div className="relative ml-3 border-l border-white/10 pl-5">
              <TocList
                items={toc}
                depth={0}
                expanded={expanded}
                onToggle={toggleExpand}
                onSelect={onSelect}
              />
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

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
    <div className="space-y-4">
      {items.map((item, i) => {
        const hasChildren = !!item.subitems?.length
        const isExpanded = expanded.has(item.href)

        return (
          <div key={`${item.href}-${i}`} className="relative">
            <span
              className={`absolute -left-[26px] top-2.5 h-3 w-3 rounded-full border-2 border-bg-reader ${depth === 0 ? 'bg-purple-primary shadow-[0_0_0_4px_rgba(123,44,191,0.18)]' : 'bg-white/20'}`}
            />

            <div className="flex items-start gap-3">
              <button
                onClick={() => onSelect(getDirectNavigationHref(item))}
                aria-label={item.label}
                className="min-w-0 flex-1 text-left"
              >
                <p className={`${depth === 0 ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'} truncate text-[15px]`}>
                  {item.label}
                </p>
                {hasChildren && (
                  <p className="mt-1 text-xs text-text-muted">
                    Abre direto na primeira seção útil deste agrupamento.
                  </p>
                )}
              </button>

              {hasChildren && (
                <button
                  onClick={() => onToggle(item.href)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-muted transition-all duration-150 active:scale-[0.94] active:bg-white/10"
                  aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="mt-3 border-l border-white/8 pl-4">
                <TocList
                  items={item.subitems!}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
