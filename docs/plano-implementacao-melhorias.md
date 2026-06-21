# Plano de Implementação — Melhorias Competitivas

Gerado em: 2026-06-20
Baseado na análise competitiva vs ReadEra e Moon+ Reader.

**Fora do escopo deste plano:**
- Sync com Dropbox/WebDAV (decisão futura)
- Suporte a PDF (ver doc estratégico separado a criar: `docs/feature-pdf-support.md`)

---

## Visão geral das fases

| Fase | Conteúdo | Esforço | Impacto |
|---|---|---|---|
| 1 | AMOLED + Zoom em imagens | ~1 dia | Alta percepção de qualidade |
| 2 | Notas livres em marcadores | ~3 dias | Diferencial de aprendizado |
| 3 | Busca no texto do livro | ~4 dias | Feature básica que falta |
| 4 | Download em lote do Drive | ~2 dias | Remove fricção de import |
| 5 | Reordenação drag-and-drop nas coleções | ~3 dias | Polimento de UX |

---

## Fase 1 — Melhorias visuais rápidas

**Meta:** dois itens de baixo esforço com alta percepção de qualidade vs concorrentes.

### 1.1 Modo AMOLED (pure black)

**Contexto:** Moon+ Reader recebe pedidos recorrentes de preto puro em telas OLED. O NeoReader usa `#0a0a0a` — quase preto, mas não desliga pixels OLED. Adicionar o tema é pequeno e melhora a comparação direta.

**Decisão de design:** AMOLED é uma variante do tema escuro, não um tema separado. Aparece como checkbox "Preto AMOLED" nas configurações de aparência, visível apenas quando o tema escuro está ativo.

**Arquivos a tocar:**

- `src/screens/SettingsScreen.tsx`
  - Adicionar toggle "Preto AMOLED" na seção Aparência
  - Salvar em `localStorage` com chave `neoreader:amoled-mode`

- `src/hooks/useReaderTheme.ts` (criar se não existir, ou localizar o equivalente)
  - Exportar flag `isAmoled: boolean`
  - Quando ativo: trocar `bg-[#0a0a0a]` → `bg-black`, `bg-[#1a1a1a]` → `bg-[#0a0a0a]`

- `src/components/reader/EpubViewer.tsx`
  - Em `buildReaderCSS()`: quando AMOLED, injetar `body { background: #000000 !important }`

- `src/screens/LibraryScreen.tsx` e layout raiz
  - Aplicar classe `bg-black` quando AMOLED ativo (em vez de `bg-[#0a0a0a]`)

**Checklist:**
- [x] AMOLED disponível como tema 'black' no seletor de temas (já existia)
- [x] Paleta com `background: #000000` definida em `readerPreferences.ts`
- [x] Reader (iframe CSS) aplica background puro preto via palette
- [x] Chave i18n `reader.theme.black` presente nos 3 idiomas
- [x] `npm run build` passa sem erros

> Nota: AMOLED já estava implementado como tema `'black'` no sistema de temas existente.
> Nenhuma alteração necessária — item concluído antes do sprint.

---

### 1.2 Zoom em imagens EPUB

**Contexto:** pedido em reviews do Moon+. Importante para livros técnicos, quadrinhos e livros com mapas. O desafio técnico é que o conteúdo está num iframe — eventos de toque não bubblem para o React.

**Solução:** injetar JS no iframe que escuta toque em `<img>`, envia `postMessage` com o `src` da imagem para o React, que abre um modal full-screen com zoom nativo.

**Arquivos a tocar:**

- `src/components/reader/EpubViewer.tsx`
  - Em `injectReaderScripts()` (ou equivalente): injetar script que adiciona listener `click`/`touchend` em todas as `<img>`
  - Ao tocar numa imagem: `window.parent.postMessage({ type: 'IMAGE_TAP', src: img.src }, '*')`
  - No `useEffect` que escuta `message` events: tratar `IMAGE_TAP` → abrir modal com `imageSrc`

- `src/components/reader/ImageZoomModal.tsx` (novo arquivo)
  - Modal full-screen com `<img>` centralizada
  - CSS: `touch-action: pinch-zoom` para zoom nativo do browser/WebView
  - Botão X no canto para fechar
  - Fundo preto com `opacity-90`

**Checklist:**
- [x] Não usa postMessage — listener direto no Document do iframe (mesma origem)
- [x] Conflito com tradução evitado: imagens dentro de `#nr-translation-block` são ignoradas
- [x] Prop `onImageTap` adicionada a `EpubViewerProps` e destruturada no componente
- [x] `useSyncRef(onImageTap)` adicionado para evitar stale closure no listener do iframe
- [x] Handler no `doc.addEventListener('click')` detecta `<img>` e chama callback
- [x] `ImageZoomModal.tsx` criado com overlay full-screen, botão X e `touch-action: pinch-zoom`
- [x] State `zoomedImageSrc` e prop `onImageTap` conectados no `ReaderScreen`
- [x] `npm run build` passa sem erros
- [ ] Testar no device: pinch-to-zoom funciona no Android WebView
- [ ] Testar: toque em imagem dentro de parágrafo não abre tradução

---

## Fase 2 — Notas livres em marcadores

**Meta:** usuário pode adicionar texto livre a qualquer marcador. A nota fica visível na lista de marcadores e também como indicador tocável diretamente no texto do livro.

**Decisão:** tooltip no reader — o trecho anotado exibe um pequeno ponto/ícone; tocar abre um sheet com o texto da nota. Mesma mecânica de postMessage do zoom.

### 2.1 Schema do banco

- `src/db/database.ts`
  - Bump de versão (ex: v16 se collections foi v15)
  - Adicionar campo `note?: string` na tabela `bookmarks`
  - Migration: nenhuma ação necessária (campo opcional, registros existentes ficam sem nota)

- `src/types/book.ts` (ou onde `Bookmark` está tipado)
  - Adicionar `note?: string` ao tipo

### 2.2 UI de criação e edição

- `src/components/reader/BookmarkSheet.tsx` (ou equivalente de criação)
  - Adicionar campo `<textarea>` opcional abaixo da paleta de cores
  - Placeholder: "Adicionar nota… (opcional)"
  - Máximo sugerido: 500 caracteres com contador visível
  - Salvar nota junto ao bookmark no Dexie

- `src/components/reader/BookmarksListSheet.tsx` (lista de marcadores)
  - Exibir prévia da nota (1 linha truncada) abaixo do trecho citado
  - Botão "Editar" no item abre o sheet de edição com nota preenchida

### 2.3 Indicador visual no reader

**Mecânica:** após carregar uma seção, o EpubViewer injeta no iframe uma lista de CFIs com nota. O iframe injeta um `::after` puntinho no trecho correspondente e escuta toque → postMessage.

- `src/db/bookmarks.ts`
  - Nova query: `getBookmarksWithNotesByCfi(bookId, chapterCfi)` → retorna bookmarks com `note` não-vazio da seção atual

- `src/components/reader/EpubViewer.tsx`
  - Prop nova: `annotatedBookmarks: { cfi: string; note: string }[]`
  - Em `injectReaderScripts()`: injetar função `highlightAnnotations(list)` que localiza os ranges CFI e adiciona classe `.nr-annotated` (ponto indigo no final do range)
  - Ao tocar num `.nr-annotated`: `postMessage({ type: 'NOTE_TAP', note: '...' })`
  - Escutar `NOTE_TAP` → abrir `NotePopup` com o texto

- `src/screens/ReaderScreen.tsx`
  - Buscar `annotatedBookmarks` via `useLiveQuery` e passar ao EpubViewer

- `src/components/reader/NotePopup.tsx` (novo arquivo)
  - Sheet pequeno (bottom sheet ou tooltip) com o texto da nota
  - Read-only; botão "Editar" → abre BookmarkSheet

**Checklist:**
- [ ] Campo `note` no schema Dexie (bump de versão)
- [ ] Tipo `Bookmark` atualizado com `note?: string`
- [ ] Textarea opcional no sheet de criação com contador de caracteres
- [ ] Prévia da nota na lista de marcadores
- [ ] Edição de nota funcional
- [ ] Script no iframe adiciona marcador visual em trechos anotados
- [ ] Toque no marcador visual envia postMessage corretamente
- [ ] `NotePopup` exibe texto e oferece ação de editar
- [ ] Sync Drive continua funcionando (campo `note` incluído no modelo de sync)
- [ ] `npm run build` passa sem erros

---

## Fase 3 — Busca no texto do livro

**Meta:** usuário digita uma palavra ou frase e navega pelos resultados dentro do EPUB. Feature básica que falta ao NeoReader e que ambos os concorrentes têm.

**API:** foliate-js expõe `book.search(query)` que retorna um AsyncGenerator de matches com CFI. Cada match tem `{ cfi, excerpt }`.

### 3.1 UI de busca

- `src/components/reader/SearchBar.tsx` (novo arquivo)
  - Barra deslizante que aparece abaixo do top bar do reader
  - Input de texto, ícone de lupa, contador "3 de 12", botões `‹` `›` para navegar
  - Botão X fecha e limpa busca
  - Animação: `translate-y` de cima para baixo ao abrir

- `src/screens/ReaderScreen.tsx`
  - Botão de busca (ícone `Search` do Lucide) no top bar
  - Estado `searchOpen: boolean` e `searchQuery: string`
  - Ao fechar busca: limpar highlights

### 3.2 Lógica de busca

- `src/hooks/useBookSearch.ts` (novo arquivo)
  - Recebe `book` (instância foliate-js) e `query: string`
  - Executa `book.search(query)` e coleta resultados num array `SearchResult[]`
  - Expõe: `results`, `currentIndex`, `goNext()`, `goPrev()`, `isSearching: boolean`
  - `currentResult` → dispara navegação via CFI (mesmo mecanismo dos marcadores)

### 3.3 Highlight dos resultados no iframe

- `src/components/reader/EpubViewer.tsx`
  - Prop nova: `searchResults: { cfi: string }[]` e `activeSearchCfi: string | null`
  - Injetar função no iframe: `highlightSearch(cfis, activeCfi)` — adiciona classe `.nr-search-match` (amarelo) e `.nr-search-active` (laranja) nos ranges
  - Limpar highlights ao receber `cfis = []`

**Checklist:**
- [ ] Botão de busca no top bar do reader
- [ ] `SearchBar` abre/fecha com animação suave
- [ ] `useBookSearch` executa `book.search()` e coleta resultados
- [ ] Navegação prev/next funciona e rola para o resultado
- [ ] Resultado ativo destacado em cor diferente dos demais
- [ ] Busca case-insensitive
- [ ] Estado "sem resultados" exibido claramente
- [ ] Fechar busca limpa todos os highlights
- [ ] Busca não interfere com tradução inline (ambas usam postMessage — verificar conflito de tipos)
- [ ] Performance aceitável em EPUBs grandes (busca é async, UI não trava)
- [ ] `npm run build` passa sem erros

---

## Fase 4 — Download em lote do Drive

**Meta:** usuário seleciona uma pasta no Google Drive e importa múltiplos EPUBs de uma vez, eliminando a fricção de import arquivo a arquivo.

**Contexto:** `docs/feature-google-drive-import.md` já existe — verificar se há arquitetura documentada lá antes de implementar.

### 4.1 Seletor de pasta Drive

- `src/services/GoogleDriveService.ts` (estender serviço existente)
  - Novo método: `listFolders()` → lista pastas na raiz e subpastas
  - Novo método: `listEpubsInFolder(folderId)` → retorna `{ id, name, size }[]` de `.epub` na pasta

- `src/components/DriveFolderPicker.tsx` (novo arquivo)
  - Sheet com lista de pastas do Drive (breadcrumb para navegar subpastas)
  - Ao selecionar pasta: carrega lista de EPUBs disponíveis

### 4.2 Seleção e importação em lote

- `src/components/DriveBatchImportSheet.tsx` (novo arquivo)
  - Lista de EPUBs encontrados na pasta com checkbox
  - "Selecionar todos" / "Limpar seleção"
  - Botão "Importar X livros" na base
  - Progresso individual por arquivo (barra ou spinner por linha)
  - Erros por arquivo exibidos inline (não bloqueia os demais)

- `src/hooks/useDriveBatchImport.ts` (novo arquivo)
  - Recebe lista de `driveFileId[]`
  - Baixa e importa sequencialmente (não paralelo — evita saturar memória)
  - Expõe: `progress: { id, status: 'pending'|'downloading'|'done'|'error' }[]`

- `src/screens/LibraryScreen.tsx`
  - Ponto de entrada: botão "Importar do Drive" já existente (ou adicionar) → abre `DriveFolderPicker`

**Checklist:**
- [ ] Ler `docs/feature-google-drive-import.md` antes de implementar (pode ter arquitetura já definida)
- [ ] `listFolders()` e `listEpubsInFolder()` no DriveService
- [ ] Navegação de pastas no picker (pelo menos 1 nível de subpasta)
- [ ] Checkbox de seleção múltipla + "selecionar todos"
- [ ] Import sequencial com progresso por arquivo
- [ ] Erros por arquivo não bloqueiam os demais
- [ ] Livros importados aparecem na biblioteca sem precisar recarregar
- [ ] Drive auth já existente reutilizada (não pede nova autorização)
- [ ] `npm run build` passa sem erros

---

## Fase 5 — Reordenação drag-and-drop nas coleções

**Meta:** dentro de uma coleção, o usuário pode reordenar os livros arrastando. Ordem persiste no banco.

**Decisão:** drag-and-drop com `@dnd-kit`. Campo `collectionOrder` já existe no schema (Fase 5 do roadmap anterior).

### 5.1 Dependência nova

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Justificativa: @dnd-kit é a biblioteca de DnD mais usada em React mobile-first, sem dependência de HTML5 drag (que não funciona no Android WebView). Tamanho: ~15kb gzipped.

### 5.2 Modo de edição

- `src/screens/LibraryScreen.tsx`
  - Quando uma coleção está ativa no filtro: exibir botão "Reordenar" no header
  - `isReorderMode: boolean` — quando ativo, desabilita navegação para o reader e exibe handles de drag

### 5.3 Grid com DnD

- `src/components/LibraryGridView.tsx`
  - Quando `isReorderMode`: envolver grid com `<DndContext>` e `<SortableContext>`
  - Cada capa vira um `<SortableItem>` com handle visual (ícone de 6 pontos, aparece só no modo)
  - `onDragEnd`: atualizar `collectionOrder` dos livros afetados no Dexie

- `src/db/collections.ts`
  - Nova função: `updateCollectionOrder(bookIds: number[])` — recebe a ordem final e escreve `collectionOrder` em batch

### 5.4 Persistência

- A ordem é salva assim que `onDragEnd` dispara (sem botão "salvar" separado)
- `useLibraryCatalog.ts`: query já ordena por `collectionOrder` quando coleção ativa — verificar e ajustar se necessário

**Checklist:**
- [ ] Instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- [ ] Botão "Reordenar" aparece apenas quando uma coleção está selecionada
- [ ] Handle visual de drag aparece em cada capa no modo de edição
- [ ] Drag funciona no Android WebView (testar no device)
- [ ] `onDragEnd` salva nova ordem no Dexie via `updateCollectionOrder`
- [ ] `useLibraryCatalog` respeita `collectionOrder` ao buscar livros da coleção
- [ ] Sair do modo reordenação restaura comportamento normal (toque abre livro)
- [ ] Livros sem coleção não exibem botão de reordenação
- [ ] `npm run build` passa sem erros

---

## Notas de execução

- **Ordem recomendada:** seguir as fases em sequência — Fase 1 é o aquecimento, Fase 5 é o mais arriscado (dependência nova)
- **Device test:** Fases 1.2, 2.3 e 5 dependem de comportamento no Android WebView. Testar no device antes de declarar concluído.
- **Build obrigatório:** rodar `npm run build` ao final de cada fase antes de marcar como concluído.
- **Sync Drive:** ao adicionar campo `note` (Fase 2), verificar se `VocabularyDriveSyncModel` e `BookmarksDriveSyncModel` incluem o novo campo no serialization.
- **Conflitos de postMessage:** Fases 1.2 e 2.3 adicionam novos tipos de mensagem no iframe. Garantir que o switch/handler em `EpubViewer` não conflita com os tipos existentes (`TRANSLATION`, `SENTENCE_TAP`, etc.).
