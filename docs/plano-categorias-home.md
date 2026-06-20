# Plano: Rows de Categorias na Home

## Contexto e motivação

O usuário quer que os livros da biblioteca apareçam agrupados por gênero (Fiction, Business, etc.) na tela Home, em rows horizontais estilo Netflix — igual às rows "Continue Reading" e "My Books" que já existem.

**Descoberta chave:** A infra já está pronta. Google Books, Open Library e `<dc:subject>` do EPUB já são consultados e salvos na tabela `bookInfo` no campo `category: BookInfoValue<BookCategory[]>`. Não são necessárias novas chamadas de API, novas dependências, nem mudanças de schema no banco.

O que falta: (1) normalizar categorias brutas para um conjunto curado de gêneros, (2) agrupar livros por gênero, (3) exibir rows na Home.

---

## Investigação: qualidade das categorias por fonte

| Fonte | Exemplo real de retorno | Qualidade |
|---|---|---|
| Google Books | `"Fiction / Literary"`, `"Business & Economics / Finance"` | Alta — estruturado |
| Open Library | `"Fiction"`, `"New York (N.Y.)"`, `"Detective and mystery stories"` | Média — ruidoso |
| EPUB `<dc:subject>` | Varia muito por editora | Baixa — inconsistente |

**Estratégia de prioridade:** Google Books → Open Library → EPUB subject.

---

## Gêneros canônicos (10 categorias)

| ID interno | Label exibido | Keywords de mapeamento |
|---|---|---|
| `fiction` | Fiction | fiction, literary, novel, contemporary |
| `mystery` | Mystery & Thriller | mystery, thriller, crime, suspense, detective |
| `sci-fi-fantasy` | Sci-Fi & Fantasy | science fiction, fantasy, sci-fi, speculative |
| `romance` | Romance | romance, love, relationship, erotica |
| `nonfiction` | Non-Fiction | nonfiction, non-fiction, true crime, narrative |
| `business` | Business | business, economics, management, finance, entrepreneur |
| `self-help` | Self-Help | self-help, personal development, motivational, productivity, psychology |
| `history-bio` | History & Biography | history, biography, memoir, historical, autobiography |
| `science-tech` | Science & Tech | science, technology, computers, medicine, health |
| `kids-ya` | Children & YA | children, juvenile, young adult, ya, middle grade |

Livros sem gênero reconhecível **não aparecem nas rows de categoria** (ficam só nas rows "My Books" e "Continue Reading").

---

## Arquitetura da solução

### Arquivos a criar

| Arquivo | Responsabilidade |
|---|---|
| `src/utils/categoryNormalizer.ts` | Mapear `BookCategory[]` → gênero canônico ou `null` |
| `src/hooks/useCategoryGroups.ts` | Query Dexie + agrupamento por gênero, mesmo padrão de `useLibraryGroups.ts` |

### Arquivos a modificar

| Arquivo | O que muda |
|---|---|
| `src/screens/HomeScreen.tsx` | Importar `useCategoryGroups`, adicionar rows abaixo de "My Books" |

### Arquivos reutilizados sem modificação

| Arquivo | Como é reutilizado |
|---|---|
| `src/components/BookRow.tsx` | Já renderiza null se `books.length === 0` — basta passar os grupos |
| `src/hooks/useLibraryGroups.ts` | Referência de padrão (`useLiveQuery` + `useMemo`) |
| `src/types/bookInfo.ts` | Tipos `BookCategory`, `StoredBookInfo`, `BookInfoValue` |

---

## Estimativa de esforço

| Fase | O que fazer | Tempo estimado |
|---|---|---|
| 1 | `categoryNormalizer.ts` | ~1-2h |
| 2 | `useCategoryGroups.ts` | ~2h |
| 3 | `HomeScreen.tsx` — adicionar rows | ~1h |
| 4 | Testes manuais + build | ~30min |
| **Total** | | **~5-6h** |

---

## Fase 1 — `src/utils/categoryNormalizer.ts`

### O que faz

Recebe o array `BookCategory[]` (do campo `bookInfo.category.value`) e retorna o ID do gênero canônico ou `null` se não reconhecer nenhuma categoria.

### Estrutura do arquivo

```ts
import type { BookCategory } from '../types/bookInfo'

// Ordem de exibição das rows na Home
export const CANONICAL_GENRE_ORDER = [
  'fiction',
  'mystery',
  'sci-fi-fantasy',
  'romance',
  'nonfiction',
  'business',
  'self-help',
  'history-bio',
  'science-tech',
  'kids-ya',
] as const

export type CanonicalGenre = typeof CANONICAL_GENRE_ORDER[number]

export const GENRE_LABELS: Record<CanonicalGenre, string> = {
  'fiction': 'Fiction',
  'mystery': 'Mystery & Thriller',
  'sci-fi-fantasy': 'Sci-Fi & Fantasy',
  'romance': 'Romance',
  'nonfiction': 'Non-Fiction',
  'business': 'Business',
  'self-help': 'Self-Help',
  'history-bio': 'History & Biography',
  'science-tech': 'Science & Tech',
  'kids-ya': 'Children & YA',
}

// Mapeamento keyword → gênero (lowercase, partial match)
const KEYWORD_MAP: Array<{ keywords: string[]; genre: CanonicalGenre }> = [
  { keywords: ['kids', 'children', 'juvenile', 'young adult', 'ya', 'middle grade'], genre: 'kids-ya' },
  { keywords: ['mystery', 'thriller', 'crime', 'suspense', 'detective'], genre: 'mystery' },
  { keywords: ['science fiction', 'sci-fi', 'fantasy', 'speculative'], genre: 'sci-fi-fantasy' },
  { keywords: ['romance', 'erotica'], genre: 'romance' },
  { keywords: ['business', 'economics', 'management', 'finance', 'entrepreneur', 'investing'], genre: 'business' },
  { keywords: ['self-help', 'personal development', 'motivational', 'productivity'], genre: 'self-help' },
  { keywords: ['history', 'biography', 'memoir', 'historical', 'autobiography'], genre: 'history-bio' },
  { keywords: ['science', 'technology', 'computers', 'medicine', 'health', 'physics', 'biology'], genre: 'science-tech' },
  { keywords: ['nonfiction', 'non-fiction', 'true crime', 'narrative nonfiction'], genre: 'nonfiction' },
  { keywords: ['fiction', 'literary', 'novel', 'contemporary'], genre: 'fiction' },
]

export function normalizeCategory(categories: BookCategory[]): CanonicalGenre | null {
  for (const cat of categories) {
    const lower = cat.label.toLowerCase()
    for (const { keywords, genre } of KEYWORD_MAP) {
      if (keywords.some(kw => lower.includes(kw))) return genre
    }
  }
  return null
}
```

### Checklist Fase 1

- [ ] Criar arquivo `src/utils/categoryNormalizer.ts`
- [ ] Definir `CANONICAL_GENRE_ORDER` (array de IDs na ordem de exibição)
- [ ] Definir `GENRE_LABELS` (Record ID → string exibida)
- [ ] Implementar `KEYWORD_MAP` com os 10 gêneros
- [ ] Implementar `normalizeCategory(categories: BookCategory[]): CanonicalGenre | null`
- [ ] kids-ya deve ser testada primeiro (evita que "children's business book" vá para `business`)
- [ ] Testar manualmente com exemplos reais do Google Books (abrir DevTools, ver `bookInfo`)

---

## Fase 2 — `src/hooks/useCategoryGroups.ts`

### O que faz

Mesmo padrão de `useLibraryGroups.ts`: query reativa no Dexie via `useLiveQuery`, cálculo de grupos no `useMemo`. Retorna grupos ordenados prontos para renderizar.

### Estrutura do arquivo

```ts
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { resolveReadingState } from '../utils/readingState'
import { normalizeCategory, CANONICAL_GENRE_ORDER, GENRE_LABELS, type CanonicalGenre } from '../utils/categoryNormalizer'
import type { BookWithProgress } from './useLibraryGroups'

export interface CategoryGroup {
  genre: CanonicalGenre
  label: string           // ex: "Mystery & Thriller"
  books: BookWithProgress[]
}

interface CategoryGroupsResult {
  isLoading: boolean
  groups: CategoryGroup[]  // só grupos com >= 2 livros, na ordem de CANONICAL_GENRE_ORDER
}

const MIN_BOOKS_PER_ROW = 2   // rows com 1 livro não aparecem
const MAX_ROWS_HOME = 6       // limita rows na Home para não virar scroll infinito

export function useCategoryGroups(): CategoryGroupsResult {
  const data = useLiveQuery(async () => {
    const [books, allProgress, allBookInfo] = await Promise.all([
      db.books.toArray(),
      db.progress.toArray(),
      db.bookInfo.toArray(),
    ])
    return { books, allProgress, allBookInfo }
  }, [])

  return useMemo((): CategoryGroupsResult => {
    if (data === undefined) return { isLoading: true, groups: [] }

    const { books, allProgress, allBookInfo } = data

    const progressMap = new Map(allProgress.map(p => [p.bookId, p]))
    const bookInfoMap = new Map(allBookInfo.map(info => [info.bookId, info]))

    // Agrupar por gênero
    const grouped = new Map<CanonicalGenre, BookWithProgress[]>()

    for (const book of books) {
      const info = bookInfoMap.get(book.id!) ?? null
      const rawCategories = info?.category?.value ?? []
      const genre = normalizeCategory(rawCategories)
      if (!genre) continue  // livro sem categoria reconhecível, ignora

      const bookWithProgress: BookWithProgress = {
        ...book,
        ...resolveReadingState(book, progressMap.get(book.id!) ?? null),
        bookInfo: info,
      }

      if (!grouped.has(genre)) grouped.set(genre, [])
      grouped.get(genre)!.push(bookWithProgress)
    }

    // Montar resultado na ordem canônica, filtrar grupos pequenos, limitar rows
    const groups: CategoryGroup[] = CANONICAL_GENRE_ORDER
      .filter(genre => (grouped.get(genre)?.length ?? 0) >= MIN_BOOKS_PER_ROW)
      .slice(0, MAX_ROWS_HOME)
      .map(genre => ({
        genre,
        label: GENRE_LABELS[genre],
        books: grouped.get(genre)!,
      }))

    return { isLoading: false, groups }
  }, [data])
}
```

### Checklist Fase 2

- [ ] Criar arquivo `src/hooks/useCategoryGroups.ts`
- [ ] Importar `resolveReadingState` (já usado em `useLibraryGroups.ts`)
- [ ] Importar `normalizeCategory` e constantes do `categoryNormalizer.ts`
- [ ] `useLiveQuery` busca `books`, `progress`, `bookInfo` em paralelo (mesmo padrão)
- [ ] `useMemo` agrupa livros por gênero normalizado
- [ ] Filtrar grupos com menos de `MIN_BOOKS_PER_ROW = 2` livros
- [ ] Respeitar `MAX_ROWS_HOME = 6` para limitar scroll na Home
- [ ] Livros sem `bookInfo` ou categoria `null` são ignorados silenciosamente
- [ ] Rodar `npx tsc --noEmit` e confirmar sem erros de tipo

---

## Fase 3 — `src/screens/HomeScreen.tsx`

### O que muda

Adicionar import de `useCategoryGroups` e renderizar as rows abaixo da row "My Books" existente.

### Diff aproximado

```tsx
// Adicionar import no topo:
import { useCategoryGroups } from '../hooks/useCategoryGroups'

// Dentro do componente, junto com os outros hooks:
const { groups: categoryGroups } = useCategoryGroups()

// Após a BookRow "My Books" existente, antes do FAB/BottomNav:
{categoryGroups.map(group => (
  <BookRow
    key={group.genre}
    title={group.label}
    books={group.books}
    onPress={handleOpenBook}
    onOpenOptions={book => setOptionsBook(book)}
  />
))}
```

### Onde exatamente inserir

Localizar no JSX a `<BookRow>` com `title={t('home.myBooks')}` (ou equivalente) e adicionar o bloco de categorias logo abaixo. `BookRow` já retorna `null` se `books.length === 0`, então não precisa de guard extra.

### Checklist Fase 3

- [ ] Adicionar import de `useCategoryGroups` em `HomeScreen.tsx`
- [ ] Chamar `useCategoryGroups()` no corpo do componente
- [ ] Renderizar `categoryGroups.map(...)` com `<BookRow>` após a row "My Books"
- [ ] Passar `onPress={handleOpenBook}` e `onOpenOptions={book => setOptionsBook(book)}`
- [ ] Confirmar que o loading state da Home não quebra (enquanto `isLoading: true`, `groups` é `[]`, então nada renderiza)
- [ ] Não remover nenhuma row existente (hero, in-progress, recent)

---

## Fase 4 — Verificação

### Checklist de teste manual

- [ ] Importar ao menos 3 livros de gêneros distintos (ex: um romance, um de negócios, uma ficção científica)
- [ ] Aguardar enriquecimento via Google Books (ocorre automaticamente no import; pode levar alguns segundos)
- [ ] Confirmar que as rows de categoria aparecem na Home abaixo de "My Books"
- [ ] Confirmar que livros aparecem na categoria certa
- [ ] Importar um livro obscuro sem categoria — confirmar que não quebra nada e não aparece em nenhuma categoria
- [ ] Importar um segundo livro da mesma categoria — confirmar que a row aparece (mínimo 2)
- [ ] Confirmar scroll horizontal funciona dentro de cada row
- [ ] Confirmar que tap abre o livro normalmente
- [ ] Confirmar que o menu de opções (3 pontos) abre o `QuickBookActionsSheet`
- [ ] Rodar `npm run build` — build deve passar sem erros

### Como verificar os dados de categoria no DevTools

No browser (modo web `npm run dev`):
```js
// No console do browser, ver categorias de um livro específico
const all = await window._db?.bookInfo.toArray()
console.table(all?.map(b => ({ bookId: b.bookId, cats: b.category?.value?.map(c => c.label) })))
```

---

## Decisões tomadas e trade-offs

**Por que não usar o sistema de Tags?**
Tags são user-created labels (`src/db/tags.ts`). Misturar categorias automáticas com tags manuais criaria confusão: o usuário veria tags que não criou, sem forma clara de removê-las. Melhor manter as duas coisas separadas.

**Por que não adicionar campo `genre` no `Book`?**
Evita migração de banco (já está na versão 15). Derivar on-the-fly de `bookInfo` é zero-custo — já carregamos `bookInfo` em `useLibraryGroups` de qualquer forma.

**Por que max 6 rows na Home?**
Com 10 gêneros possíveis, uma biblioteca pequena teria muitas rows esparsas. 6 é o equilíbrio entre variedade e usabilidade. Pode ser ajustado na constante `MAX_ROWS_HOME`.

**Por que mínimo de 2 livros por row?**
Uma row com um único livro parece bug, não feature. Com 2+ livros o scroll horizontal faz sentido visual.
