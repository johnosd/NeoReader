# Roadmap de Melhorias: NeoReader vs Concorrentes

Análise competitiva baseada em 100 reviews do ReadEra (4.8★) e Moon+ Reader (3.98★).

---

## Onde o NeoReader já vence (não mexer)

| Feature | ReadEra | Moon+ | NeoReader |
|---|---|---|---|
| Posição de leitura salva | Bug relatado | Bug crítico (5 reviews, 1★) | ✅ CFI-based, debounced |
| TTS premium | Básico | Básico | ✅ 4 providers |
| Tradução inline | ❌ | ❌ | ✅ Diferencial único |
| Vocabulário salvo | ❌ | ❌ | ✅ Com contexto e cache |
| Conta de usuário | ❌ (pedido #1) | ❌ (pedido #1) | ✅ Firebase auth |
| Sync na nuvem | ❌ | Parcial | ✅ Google Drive (bookmarks) |
| Highlight confiável | N/A | Bug crítico (5 reviews) | ✅ Robusto |
| Crashes | Nenhum relatado | Bug crítico (2 reviews) | ✅ Stack sólido |

---

## Fase 1 — Bugs críticos

- [x] **[BUG] Isolamento de dados por conta de usuário**

  **Problema:** o DB Dexie tem nome hardcoded `'NeoReaderDB'` (`src/db/database.ts:32`). Quando usuário B loga após A, vê os dados de A. Limpeza simples não serve — ao voltar para A seus dados sumiriam.

  **Solução:** um banco Dexie por uid (`NeoReaderDB-{uid}`), com reload ao trocar de conta.

  **Implementação:**
  - `src/db/database.ts` — ler `localStorage.getItem('neoreader:active-uid') ?? 'guest'` e passar para `super()`
  - `src/App.tsx` — detectar mudança de uid: atualizar localStorage + `window.location.reload()`
  - `src/services/FirebaseAuthService.ts` — no `signOut()`: setar uid para `'guest'` + reload
  - `src/services/FeatureQuotaService.ts` — incluir uid nas chaves de localStorage (`neoreader:feature-quota:{uid}:*`)

  **Verificação:**
  1. Conta A → importar livro X → logout → login conta B → biblioteca vazia ✅
  2. Voltar para conta A → livro X ainda está lá ✅

---

## Fase 2 — Melhorias rápidas

- [x] **Mais cores de highlight: 4 → 8**

  Pedido em ambos os concorrentes. NeoReader tem `indigo | emerald | amber | rose`. Adicionar `purple | cyan | orange | pink`.
  - `src/db/bookmarks.ts` — expandir tipo `BookmarkColor`
  - `src/components/reader/BookmarkSheet.tsx` — paleta de 8 cores na UI

- [x] **Nome do capítulo + % no footer do reader**

  Pedido em Moon+ (freq: 4). Footer exibe `"Cap. 3: Nome · 32% do cap."`. Top bar simplificada (só % do livro).
  - `src/components/reader/ReaderChrome.tsx` — linha de progresso no footer, remoção do badge de capítulo do top

---

## Fase 3 — Features de destaque

- [x] **TTS com tela bloqueada (Wake Lock Android)**

  Pedido explícito em reviews do ReadEra ("audio poderia ser ouvido com o celular bloqueado"). Moon+ não tem. Diferencial real.
  - Adicionado plugin `@capacitor-community/keep-awake`
  - Criado `src/services/WakeLockService.ts`
  - `src/hooks/useTTS.ts` — acquire ao iniciar, release ao pausar/parar/unmount
  - `src/screens/SettingsScreen.tsx` — toggle "Manter tela acesa" na seção Narração

- [x] **Régua de leitura (Focus Line)**

  Moon+ lançou recentemente e usuários ficaram "APAIXONADOS". ReadEra não tem. Janela de oportunidade.
  - `src/components/reader/EpubViewer.tsx` — CSS `body::after` injetado no iframe via `buildReaderCSS`
  - `src/screens/ReaderScreen.tsx` — toggle Switch no sheet de aparência, estado em localStorage

---

## Fase 4 — Sync expandido

- [x] **Sync de progresso de leitura na nuvem**

  Sync é pedido #1 em ambos os concorrentes. NeoReader já sincroniza bookmarks via Drive — a infra existe.
  - `src/services/ProgressDriveSyncService.ts` + `ProgressDriveSyncModel.ts` criados
  - `src/db/progress.ts` — `upsertProgress()` dispara `scheduleProgressDriveSync()`
  - `src/hooks/useProgressDriveSyncStatus.ts` — status reativo via `useSyncExternalStore`
  - `src/screens/SettingsScreen.tsx` — 3 linhas de status (bookmarks, progresso, vocabulário)
  - `src/services/DriveDataSyncStatus.ts` — factory compartilhada entre os três serviços

- [x] **Sync de vocabulário na nuvem**

  Mesmo padrão do anterior.
  - `src/services/VocabularyDriveSyncService.ts` + `VocabularyDriveSyncModel.ts` criados
  - `src/db/vocabulary.ts` — `addVocabItem()` e `deleteVocabItem()` disparam sync
  - `src/hooks/useVocabularyDriveSyncStatus.ts` — status reativo
  - Sync inicial disparado em `App.tsx` ao logar (garante status 'connected' sem ação do usuário)

- [x] **[FIX] Regressões pós-Fase 4: double login + syncs pending/offline**

  Causa raiz: `window.location.reload()` disparava durante o próprio fluxo de login (`null → uid`), zerando o token Drive em memória.
  - `src/App.tsx` — reload só ocorre em troca de conta (`rawStoredUid !== null`), não no primeiro login
  - `src/services/FirebaseAuthService.ts` — guard `silentDriveRefreshAttempted` impede segunda chamada quando `useAuth` re-renderiza (ex: troca de locale)

---

## Fase 5 — Organização, descoberta e imersão

- [ ] **Visualização em Grade Diagonal 3D**

  A biblioteca ganha um segundo modo de visualização: as capas são exibidas em uma grade com perspectiva CSS 3D, toda inclinada em um plano diagonal descendente da esquerda para a direita. Os livros "extrapolam" as bordas da tela, criando profundidade visual. Toggle no header da LibraryScreen, preferência salva em `localStorage`.

  **Técnica:** `perspective: 800px` no container pai + `rotateX(15deg) rotateY(-20deg) rotateZ(-3deg)` no grid + `overflow: visible` para o efeito de sangria. Capas em portrait 2:3 com sombra pronunciada.

  - `src/components/DiagonalBookGrid.tsx` — novo componente: grid 3D + cards simplificados (capa + título)
  - `src/screens/LibraryScreen.tsx` — botão toggle lista ↔ grade no header, salvar `neoreader:library-view-mode` em localStorage

- [ ] **Coleções/Prateleiras com ordem fixa**

  ReadEra: "organização em pastas" é feature amada (freq: 6). Moon+: "estante embaralha sozinha" é bug crítico. Tags já existem no NeoReader, mas não prateleiras com ordem manual persistente por livro.

  - Schema DB v15: tabela `collections` (`++id, &name, createdAt, updatedAt`) + campos `collectionId?: number` e `collectionOrder?: number` em `books`
  - `src/db/collections.ts` — CRUD de coleções (criar, renomear, deletar, listar)
  - `src/screens/LibraryScreen.tsx` — filtro "Por coleção" no FilterBar existente
  - `src/hooks/useLibraryCatalog.ts` — filtro `activeFilter === 'collection:{id}'`
  - UI: long press num livro → "Adicionar à coleção" no `BookOptionsSheet`

- [ ] **Destaque visual de vocabulário salvo**

  Diferencial único de aprendizado: palavras já salvas no vocabulário aparecem sublinhadas pontilhadas (⋯) ao reler o livro — reforço passivo sem interrupção. Toque na palavra abre o VocabBottomSheet com a tradução.

  A infra de injeção já existe em `EpubViewer.tsx` (CSS/JS no iframe). Só precisa de dados + lógica de match.

  - `src/db/vocabulary.ts` — nova função `getVocabByBookId(bookId)` retornando `sourceText[]`
  - `src/components/reader/EpubViewer.tsx` — recebe prop `vocabWords: string[]`; injeta CSS (`.nr-vocab { text-decoration: underline dotted #6366f1 }`) + JS que percorre textNodes e wrapa matches

---

## Cronograma estimado

| Fase | Conteúdo | Esforço estimado |
|---|---|---|
| 1 | Bug de isolamento de conta | ~1 dia |
| 2 | Cores de highlight + número de página | ~1 dia |
| 3 | TTS wake lock + régua de leitura | ~4 dias |
| 4 | Sync de progresso + vocabulário | ~1 semana |
| 5 | Grade diagonal 3D + Coleções + vocabulário destacado | ~1,5 semana |
