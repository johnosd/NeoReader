import { useEffect, useLayoutEffect, useRef } from 'react'

export type LibraryScrollViewMode = 'list' | 'grid'

interface LibraryScrollSignatureParams {
  viewMode: LibraryScrollViewMode
  activeFilter: string
  search: string
  sort: string
}

// Cache module-level (fora do lifecycle do componente): src/App.tsx só
// renderiza a tela no topo da pilha de navegação (sem keep-alive), então
// LibraryScreen desmonta de verdade ao abrir um livro — um useRef/state local
// não sobreviveria a esse ciclo. Resolvido a cada reload completo do app;
// isso é aceito, a spec não exige sobreviver entre sessões.
const scrollPositions = new Map<string, number>()

function buildSignature({ viewMode, activeFilter, search, sort }: LibraryScrollSignatureParams): string {
  return `${viewMode}:${activeFilter}:${search.trim().toLowerCase()}:${sort}`
}

// Ao trocar viewMode, o virtualizador antigo (sendo desmontado) e o novo
// (recém-montado) ainda mexem em window.scrollTo por conta própria por
// alguns frames — o antigo reafirma sua última posição conhecida
// (Virtualizer._willUpdate) e o novo corrige o scroll conforme mede a
// altura real de cada linha (resizeItem/applyScrollAdjustment), mesmo com
// scrollMargin quieto. Um único scrollTo síncrono perde essa corrida
// (achado testando no browser real — a lib reafirma a posição antiga por
// cima). Reafirma por alguns frames pra ser a última palavra.
function forceScrollTo(y: number, frames = 8) {
  window.scrollTo(0, y)
  let remaining = frames
  function tick() {
    window.scrollTo(0, y)
    remaining -= 1
    if (remaining > 0) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * Restaura a posição de scroll da Biblioteca ao voltar de um livro (mesma
 * combinação de viewMode/filtro/busca/ordenação de antes) e reseta pro topo
 * sempre que essa combinação muda enquanto a tela está montada (FR-003/FR-004
 * da spec).
 */
export function useLibraryScrollRestore(params: LibraryScrollSignatureParams): void {
  const signature = buildSignature(params)
  const previousSignatureRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (previousSignatureRef.current === null) {
      // Primeira montagem desta instância do componente: restaura a posição
      // salva pra essa assinatura, se houver; senão começa do topo (nunca
      // herda o scroll que a tela anterior da pilha de navegação deixou).
      previousSignatureRef.current = signature
      forceScrollTo(scrollPositions.get(signature) ?? 0)
      return
    }

    if (previousSignatureRef.current !== signature) {
      // Filtro/busca/ordenação mudou com a tela já montada — é uma lista
      // nova, sempre volta ao topo e descarta a posição salva da assinatura
      // anterior (não faz sentido reaproveitá-la depois).
      scrollPositions.delete(previousSignatureRef.current)
      previousSignatureRef.current = signature
      forceScrollTo(0)
    }
  }, [signature])

  useEffect(() => {
    function handleScroll() {
      scrollPositions.set(signature, window.scrollY)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [signature])
}
