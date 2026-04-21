// Remove o offset de caractere do final de um CFI para comparação por posição de nó.
// epubcfi(/6/4!/4/2/2:14) → epubcfi(/6/4!/4/2/2)
// Evita falso negativo em isBookmarked: o mesmo nó pode ter offsets diferentes entre relocates.
export function normalizeCfi(cfi: string): string {
  return cfi.replace(/:[\d]+(\[.*?\])?$/, '')
}
