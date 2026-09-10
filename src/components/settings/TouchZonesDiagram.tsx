// Diagrama somente-leitura das zonas de toque ativas hoje na tela de
// leitura. Sem onClick/handler algum de propósito — é só documentação
// visual (US2 da feature 012), não uma UI de customização.
interface TouchZonesDiagramProps {
  chromeLabel: string
  chromeAction: string
  translateLabel: string
  translateAction: string
  tocLabel: string
  tocAction: string
}

export function TouchZonesDiagram({
  chromeLabel,
  chromeAction,
  translateLabel,
  translateAction,
  tocLabel,
  tocAction,
}: TouchZonesDiagramProps) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="relative aspect-[9/16] w-full max-w-[160px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-bg-base">
        <div className="absolute inset-x-0 top-0 flex h-[18%] items-center justify-center border-b border-indigo-primary/30 bg-indigo-primary/15 text-[10px] font-bold text-indigo-primary">1</div>
        <div className="absolute inset-x-0 bottom-0 flex h-[18%] items-center justify-center border-t border-indigo-primary/30 bg-indigo-primary/15 text-[10px] font-bold text-indigo-primary">1</div>
        <div className="absolute inset-y-[18%] right-0 flex w-[16%] items-center justify-center border-l border-indigo-primary/30 bg-indigo-primary/15 text-[10px] font-bold text-indigo-primary">1</div>
        <div className="absolute inset-y-[18%] left-0 flex w-[16%] items-center justify-center border-r border-purple-primary/40 bg-purple-primary/20 text-[10px] font-bold text-purple-light">3</div>
        <div className="absolute inset-y-[18%] left-[16%] right-[16%] flex items-center justify-center bg-purple-light/10 text-[10px] font-bold text-purple-light">2</div>
      </div>

      <ul className="flex w-full flex-col gap-3 text-sm">
        <li className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-primary/20 text-[11px] font-bold text-indigo-primary">1</span>
          <div>
            <p className="font-semibold text-text-primary">{chromeLabel}</p>
            <p className="text-xs text-text-muted">{chromeAction}</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-light/20 text-[11px] font-bold text-purple-light">2</span>
          <div>
            <p className="font-semibold text-text-primary">{translateLabel}</p>
            <p className="text-xs text-text-muted">{translateAction}</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-primary/30 text-[11px] font-bold text-purple-light">3</span>
          <div>
            <p className="font-semibold text-text-primary">{tocLabel}</p>
            <p className="text-xs text-text-muted">{tocAction}</p>
          </div>
        </li>
      </ul>
    </div>
  )
}
