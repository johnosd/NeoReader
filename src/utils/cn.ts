// Concatena classes descartando falsy (false, null, undefined, 0, ''). Equivalente
// à `clsx` mas sem dependência — útil em componentes com variantes condicionais.
// Aceitamos `unknown` porque padrões como `cond && 'classe'` podem produzir valores
// não-string quando `cond` vem de expressões variadas.
export function cn(...classes: unknown[]): string {
  return classes.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ')
}
