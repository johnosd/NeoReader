import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, BottomSheet, EmptyState } from '../ui'
import {
  findCurrentTocPath,
  getDirectNavigationHref,
  getTocSubitems,
  hasTocChildren,
} from '../../utils/toc'

interface TocDrawerProps {
  open: boolean
  toc: TocItem[]
  currentHref?: string | null
  currentLabel?: string | null
  onSelect: (href: string) => void
  onClose: () => void
}

const EMPTY_TOGGLED_PATHS = new Set<string>()

function getDefaultExpandedPaths(toc: TocItem[], currentPath?: string | null): Set<string> {
  const next = new Set<string>()

  function collectExpandedPaths(items: TocItem[], parentPath = '') {
    items.forEach((item, index) => {
      const path = parentPath ? `${parentPath}.${index}` : `${index}`
      const children = getTocSubitems(item)
      if (children.length === 0) return

      if (!parentPath || currentPath?.startsWith(`${path}.`)) {
        next.add(path)
      }

      collectExpandedPaths(children, path)
    })
  }

  collectExpandedPaths(toc)
  return next
}

export function TocDrawer({ open, toc, currentHref, currentLabel, onSelect, onClose }: TocDrawerProps) {
  const [toggledState, setToggledState] = useState<{
    toc: TocItem[]
    currentPath?: string | null
    paths: Set<string>
  }>({ toc, currentPath: null, paths: EMPTY_TOGGLED_PATHS })
  const currentPath = findCurrentTocPath(toc, currentHref, currentLabel)
  const defaultExpanded = useMemo(() => getDefaultExpandedPaths(toc, currentPath), [toc, currentPath])
  const toggledPaths = toggledState.toc === toc && toggledState.currentPath === currentPath
    ? toggledState.paths
    : EMPTY_TOGGLED_PATHS
  const expanded = useMemo(() => {
    const next = new Set(defaultExpanded)
    for (const path of toggledPaths) {
      if (next.has(path)) next.delete(path)
      else next.add(path)
    }
    return next
  }, [defaultExpanded, toggledPaths])

  function toggleExpand(path: string) {
    setToggledState((prev) => {
      const previousPaths = prev.toc === toc && prev.currentPath === currentPath
        ? prev.paths
        : EMPTY_TOGGLED_PATHS
      const next = new Set(previousPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { toc, currentPath, paths: next }
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
                currentPath={currentPath}
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
  currentPath,
  parentPath = '',
  expanded,
  onToggle,
  onSelect,
}: {
  items: TocItem[]
  depth: number
  currentPath: string | null
  parentPath?: string
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (href: string) => void
}) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => {
        const path = parentPath ? `${parentPath}.${i}` : `${i}`
        const children = getTocSubitems(item)
        const hasChildren = hasTocChildren(item)
        const isExpanded = expanded.has(path)
        const isCurrent = currentPath === path
        const isCurrentAncestor = Boolean(currentPath?.startsWith(`${path}.`))

        return (
          <div key={`${item.href}-${path}`} className="relative">
            <span
              className={`absolute -left-[26px] top-3 h-3 w-3 rounded-full border-2 border-bg-reader ${
                isCurrent
                  ? 'bg-purple-light shadow-[0_0_0_4px_rgba(224,170,255,0.2)]'
                  : isCurrentAncestor
                    ? 'bg-purple-primary/70 shadow-[0_0_0_4px_rgba(123,44,191,0.14)]'
                    : depth === 0
                      ? 'bg-purple-primary shadow-[0_0_0_4px_rgba(123,44,191,0.18)]'
                      : 'bg-white/20'
              }`}
            />

            <div className="flex items-start gap-3">
              <button
                onClick={() => onSelect(getDirectNavigationHref(item))}
                aria-label={item.label}
                className={`-mx-2 -my-1 min-w-0 flex-1 rounded-md px-2 py-1 text-left transition-colors ${
                  isCurrent
                    ? 'bg-purple-primary/15 ring-1 ring-inset ring-purple-primary/35'
                    : isCurrentAncestor
                      ? 'bg-white/[0.04]'
                      : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <p className={`${depth === 0 ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'} min-w-0 flex-1 truncate text-[15px]`}>
                    {item.label}
                  </p>
                  {isCurrent && (
                    <Badge tone="purple" className="shrink-0 px-2 py-0.5 text-[9px] tracking-normal">
                      Agora
                    </Badge>
                  )}
                </div>
                {hasChildren && (
                  <p className="mt-1 text-xs text-text-muted">
                    Abre direto na primeira seção útil deste agrupamento.
                  </p>
                )}
              </button>

              {hasChildren && (
                <button
                  onClick={() => onToggle(path)}
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
                  items={children}
                  depth={depth + 1}
                  currentPath={currentPath}
                  parentPath={path}
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
