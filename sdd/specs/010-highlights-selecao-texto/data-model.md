# Fase 1 — Data Model: Highlights de trecho selecionado

**Slug**: `010-highlights-selecao-texto` | **Data**: 2026-09-06

## Entidade: `Highlight`

Arquivo do tipo: `src/types/highlight.ts` (novo — um arquivo, uma
responsabilidade, como `src/types/vocabulary.ts`).

```ts
// Trecho marcado pelo usuário dentro de um livro, com posição de intervalo (CFI
// não colapsado) e cor. Diferente de Bookmark (ponto, sincroniza no Drive) e de
// VocabItem (par origem + tradução).
export interface Highlight {
  id?: number
  bookId: number
  cfi: string          // CFI de INTERVALO (início,fim) — de view.getCFI(index, range)
  paraCfi: string      // CFI colapsado do parágrafo de origem — âncora de fallback (R-001)
  text: string         // texto exatamente como selecionado, gravado integral
  color: string        // chave da paleta compartilhada: 'indigo' | 'purple' | ...
  sectionIndex: number // seção do EPUB — evita resolver o CFI só para agrupar/ordenar
  percentage: number   // posição relativa no livro, para exibir e ordenar a lista
  createdAt: Date
}
```

### Campo a campo — por que existe

| Campo | Por que |
| --- | --- |
| `cfi` | FR-011/FR-012: marca **o intervalo**, não o texto. Vem de `view.getCFI(sectionIndex, range)` com o range **não colapsado** — a diferença exata para o payload de marcador, que faz `range.collapse(true)`. |
| `paraCfi` | Âncora estável de fallback para R-001. Gravado agora para que, se a validação mostrar desvio de CFI, o fallback não exija migração de schema. **Nada o consome nesta rodada** além de ser gravado. |
| `text` | FR-024 (exibir na lista) e insumo do mesmo fallback. Gravado integral; truncar é decisão de exibição. |
| `color` | FR-015. Guarda a **chave** da paleta, não o hex — assim uma futura troca de tom não invalida dado gravado (é o que `Bookmark.color` já faz). |
| `sectionIndex` | Permite repintar por seção no `create-overlay` sem resolver todos os CFIs do livro. |
| `percentage` | FR-024/SC-006: ordenar pela posição no texto e exibir a posição, sem abrir o livro. |
| `createdAt` | FR-024. |

### O que deliberadamente **não** existe

- **`syncKey` / `syncedAt` / `syncError`** — highlights são locais nesta rodada
  (FR-018). Não replicar o aparato de sync do marcador "por simetria".
- **`deletedAt` (soft delete)** — remoção é definitiva (FR-021). Marcador usa
  soft delete porque o Drive precisa propagar a remoção; sem sync, não há motivo.
- **`bookTitle` denormalizado** — o `VocabItem` guarda porque sua lista é
  transversal a livros; a lista de highlights vive na tela de detalhes de **um**
  livro (FR-028a), que já tem o título em mãos.
- **`note`, `favorite`** — Fora de Escopo na spec.

## Schema Dexie — nova versão 19

`src/db/database.ts`. A constitution exige **append-only**: adicionar
`this.version(19)` copiando as stores da 18 e acrescentando `highlights`. Nunca
editar a `version(18)`.

```ts
// Declaração de tabela junto das demais (topo da classe)
highlights!: Table<Highlight>

// Nova versão, ao final do construtor
this.version(19).stores({
  // ...todas as stores idênticas à v18...
  highlights: '++id, bookId, createdAt',
})
```

**Índices**: `bookId` cobre a consulta única da feature (listar/pintar os
highlights de um livro) e o cascade de remoção. `createdAt` acompanha o padrão
das outras tabelas. A ordenação da lista é por `percentage`, feita em memória —
o volume por livro é pequeno e um índice a mais não se paga.

## Repositório: `src/db/highlights.ts`

Funções, no formato dos módulos vizinhos (`src/db/bookmarks.ts`,
`src/db/vocabulary.ts`) — funções soltas, não classe:

| Função | Uso |
| --- | --- |
| `addHighlight(input: Omit<Highlight, 'id'>): Promise<number>` | FR-011 |
| `getHighlightsByBookId(bookId: number): Promise<Highlight[]>` | FR-013 (pintar), FR-024 (listar) — devolve ordenado por `percentage` |
| `updateHighlightColor(id: number, color: string): Promise<void>` | FR-022 |
| `deleteHighlight(id: number): Promise<void>` | FR-021 / FR-026 |

Sem `scheduleDriveSync` em nenhuma delas (FR-018).

## Impacto em código existente

| Arquivo | Mudança |
| --- | --- |
| `src/db/books.ts` | `deleteBook` ganha `db.highlights` na lista de tabelas da transação e um `db.highlights.where('bookId').equals(id).delete()` — FR-018a. Sem isso sobram registros órfãos, exatamente o que o comentário da função já alerta. |
| `src/components/reader/BookmarkSheet.tsx` | A constante `COLORS` (8 cores + `MessageKey` de rótulo) sai do componente para um módulo compartilhado. |
| `src/utils/annotationColors.ts` (novo) | Passa a ser a fonte única da paleta, consumida por marcadores e highlights (FR-015, "sem criar tokens de cor novos"). |
