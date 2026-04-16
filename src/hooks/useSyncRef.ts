import { useRef, useEffect } from 'react'

// Mantém uma ref sempre sincronizada com o valor mais recente de um callback ou prop.
// Solução padrão para stale closure em event listeners registrados uma única vez —
// ex: listeners dentro do iframe do foliate criados no evento 'load'.
export function useSyncRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value }, [value])
  return ref
}
