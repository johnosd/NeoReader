interface TocSheetProps {
  open: boolean
  toc: TocItem[]
  onSelect: (href: string) => void
  onClose: () => void
}

export function TocSheet({ open, toc, onSelect, onClose }: TocSheetProps) {
  const translateY = open ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
      {/* Backdrop escuro — clique fecha o sheet */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-[29]"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 max-h-[60vh] bg-[#1a1a1a] rounded-t-2xl
          transition-transform duration-300 ${translateY} flex flex-col`}
      >
        {/* Handle visual */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#2a2a2a]" />
        </div>

        <h2 className="text-white font-semibold px-5 pb-3 shrink-0">Índice</h2>

        {/* Lista scrollável */}
        <div className="overflow-y-auto flex-1 pb-8">
          {toc.length === 0 ? (
            <p className="text-[#a0a0a0] text-sm px-5 py-4">Índice não disponível</p>
          ) : (
            <TocList items={toc} depth={0} onSelect={onSelect} />
          )}
        </div>
      </div>
    </>
  )
}

// Componente recursivo para subitens do TOC (ex: seções dentro de capítulos)
function TocList({
  items,
  depth,
  onSelect,
}: {
  items: TocItem[]
  depth: number
  onSelect: (href: string) => void
}) {
  return (
    <>
      {items.map((item, i) => (
        <div key={`${item.href}-${i}`}>
          <button
            onClick={() => onSelect(item.href)}
            // pl-5 base + pl-4 por nível de profundidade
            className={`w-full text-left py-3 pr-5 text-sm active:bg-[#2a2a2a]
              ${depth === 0 ? 'text-white' : 'text-[#a0a0a0]'}`}
            style={{ paddingLeft: `${20 + depth * 16}px` }}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList items={item.subitems} depth={depth + 1} onSelect={onSelect} />
          )}
        </div>
      ))}
    </>
  )
}
