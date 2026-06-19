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

- [ ] **Sync de progresso de leitura na nuvem**

  Sync é pedido #1 em ambos os concorrentes. NeoReader já sincroniza bookmarks via Drive — a infra existe.
  - Criar `src/services/ProgressDriveSyncService.ts` modelado em `BookmarkDriveSyncService.ts`
  - Trigger de sync em `src/hooks/useCapacitorAppListener.ts` (ao entrar em foreground)
  - Status em `src/screens/SettingsScreen.tsx`

- [ ] **Sync de vocabulário na nuvem**

  Mesmo padrão do anterior.
  - Criar `src/services/VocabularyDriveSyncService.ts`
  - Integrar nos mesmos pontos de trigger

---

## Fase 5 — Organização e retenção

- [ ] **Coleções/Prateleiras com ordem fixa**

  ReadEra: "organização em pastas" é feature amada (freq: 6). Moon+: "estante embaralha sozinha" é bug crítico. NeoReader tem tags, mas não prateleiras com ordem persistente.
  - Schema DB v15: tabela `collections` + campo `collectionId` em `books`
  - `src/screens/LibraryScreen.tsx` — view "Por coleção"
  - `src/hooks/useLibraryCatalog.ts` — filtro por coleção

- [ ] **Streak de leitura e metas diárias**

  Nenhum concorrente tem. `ProfileScreen` já tem stats. Gamificação leve aumenta retenção para o público de aprendizado.
  - Calcular streak diário a partir de `progress.updatedAt`
  - Exibir no `HomeScreen` (hero banner contextual) e `ProfileScreen`

- [ ] **Destaque visual de vocabulário salvo**

  Diferencial único de aprendizado: palavras já salvas aparecem sublinhadas pontilhadas ao reler o livro.
  - `src/components/reader/EpubViewer.tsx` — injetar CSS/JS no iframe
  - `src/db/vocabulary.ts` — buscar palavras salvas por bookId

---

## Cronograma estimado

| Fase | Conteúdo | Esforço estimado |
|---|---|---|
| 1 | Bug de isolamento de conta | ~1 dia |
| 2 | Cores de highlight + número de página | ~1 dia |
| 3 | TTS wake lock + régua de leitura | ~4 dias |
| 4 | Sync de progresso + vocabulário | ~1 semana |
| 5 | Coleções + streak + vocabulário destacado | ~1,5 semana |
