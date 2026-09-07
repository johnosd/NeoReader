// Como o trecho é desenhado: fundo colorido (o que existia antes), sublinhado
// reto, ou risco ondulado. Os três mapeiam direto pros métodos estáticos que o
// foliate-js já oferece (Overlayer.highlight/underline/squiggly) — nenhum é
// desenho customizado nosso.
export type HighlightStyle = 'background' | 'underline' | 'squiggly'

// Trecho marcado pelo usuário dentro de um livro, com posição de intervalo (CFI
// não colapsado), cor e estilo visual. Diferente de Bookmark (ponto, sincroniza
// no Drive) e de VocabItem (par origem + tradução). Local-first, sem sync nesta
// rodada.
export interface Highlight {
  id?: number
  bookId: number
  cfi: string          // CFI de INTERVALO (início,fim) — de view.getCFI(index, range), sem collapse
  paraCfi: string       // CFI colapsado do parágrafo de origem — âncora de fallback (R-001)
  text: string          // texto exatamente como selecionado, gravado integral
  color: string          // chave da paleta compartilhada (ver src/utils/annotationColors.ts)
  // Opcional (não indexado — não precisa de nova version() do Dexie, ver
  // plan.md D-005): highlights gravados antes desta rodada não têm o campo.
  // Sempre ler com fallback `?? 'background'`, nunca assumir presente.
  style?: HighlightStyle
  sectionIndex: number    // seção do EPUB — evita resolver o CFI só para agrupar/repintar
  percentage: number       // posição relativa no livro, para ordenar/exibir na lista
  createdAt: Date
}
