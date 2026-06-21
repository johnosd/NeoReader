# Feature: Import de Livros do Google Drive

## Contexto

O NeoReader já tem import local de EPUBs e sync de progresso/marcadores/vocabulário via Drive. Esta feature adiciona o Google Drive como **fonte de importação de livros**, com modelo freemium: 5 imports gratuitos, ilimitado no Pro.

**Decisão arquitetural:** Usamos o `ACTION_OPEN_DOCUMENT` nativo do Android (já usado no import local), que naturalmente inclui Google Drive como fonte de documentos. Isso evita o escopo `drive.readonly` e a revisão formal do Google (que pode demorar semanas). O plugin Java já usa `ContentResolver.openInputStream()`, que lida com content:// URIs do Drive de forma transparente — **nenhum código nativo novo necessário**.

---

## Complexidades e Riscos

| # | Item | Impacto | Mitigação |
|---|------|---------|-----------|
| 1 | Plugin suporta Drive URIs (ContentResolver) | Risco ZERO | Verificado em `NeoReaderLibraryPlugin.java` |
| 2 | Sem progress de download | UX: spinner genérico durante download | Label "Drive" no spinner do FAB durante import |
| 3 | Offline durante import | ContentResolver falha | Toast "Sem conexão. Conecte-se para importar do Drive." |
| 4 | Freemium por dispositivo | Counter no IndexedDB, não sincroniza entre devices | Aceitável no MVP |
| 5 | Picker genérico (usuário pode desviar pro local) | Se contarmos pelo botão clicado: conta mesmo se escolher local | Contar pelo `importSource` passado pelo botão — comportamento simples e honesto |

---

## Fluxo

```
FAB (HomeScreen) → ImportSourceSheet
  ├── "Do dispositivo"   → fluxo atual (sem mudança)
  └── "Do Google Drive"
        ↓
        checkDriveImportGate()   ← Pro OR driveImportCount < 5
        ├── bloqueado → paywall
        └── liberado  → selectNativeEpubFile({ source: 'drive' })
                              ↓
                        prepareLocalEpubImport()   ← já funciona com Drive URIs
                              ↓
                        importNativeEpub(file, { importSource: 'drive' })
                              ↓
                        incrementDriveImportCount()
                              ↓
                        toast "Livro importado do Drive!"
```

---

## Fase 1 — Tipos e Banco de Dados

- [x] Adicionar `importSource?: 'local' | 'drive'` à interface `Book` em `src/types/book.ts`
- [x] Adicionar `driveImportCount?: number` ao tipo `UserSettings` em `src/types/settings.ts`
- [x] Criar migração versão 16 em `src/db/database.ts` — inicializar `driveImportCount = 0` no registro de settings existente

## Fase 2 — Lógica de Negócio (BookImportService)

- [x] Adicionar parâmetro `options?: { importSource?: 'local' | 'drive' }` em `importNativeEpub()`
- [x] Propagar `importSource` até `importSingleEpubRecord()` e salvar no registro do livro
- [x] Adicionar método `checkDriveImportGate()` — consulta billing status + driveImportCount
- [x] Adicionar método `incrementDriveImportCount()` — delega para `db/settings.ts`

## Fase 3 — Componente ImportSourceSheet

- [x] Criar `src/components/ImportSourceSheet.tsx`
  - Opção "Do dispositivo" → callback `onSelectLocal`
  - Opção "Do Google Drive" → callback `onSelectDrive`
  - Badge mostrando imports restantes ("X de 5 grátis") para free; badge "Pro" para assinantes
  - Padrão visual de `QuickBookActionsSheet.tsx`

## Fase 4 — Integração

> **Nota:** o doc original apontava `AddBookButton.tsx`, mas o FAB ativo do app vive em
> `HomeScreen.tsx`. A integração foi feita lá (decisão correta — `AddBookButton` é componente
> legado não renderizado na tela principal).

- [x] `HomeScreen.tsx` abre `ImportSourceSheet` no clique do FAB (apenas no nativo; web mantém picker direto)
- [x] Handler "Do dispositivo" → chama fluxo original (sem regressão)
- [x] Handler "Do Google Drive":
  - Chama `checkDriveImportGate()`
  - Se bloqueado: abre paywall via `onOpenPaywall`
  - Se liberado: `selectNativeEpubFile()` → import com `{ importSource: 'drive' }` → `incrementDriveImportCount()`
- [x] Label "Drive" exibido no spinner do FAB durante import do Drive
- [x] `App.tsx` passa `onOpenPaywall` ao `HomeScreen`

## Fase 5 — Build e Verificação

- [x] `npm run build` passa sem erros de tipo
  - Corrigido bug pré-existente em `FirebaseAuthService.ts` (chamada a `silentlyRefreshDriveToken` que nunca existiu)
- [ ] Testar no Android: botão import abre sheet com duas opções
- [ ] "Do dispositivo" → funciona igual ao antes (sem regressão)
- [ ] "Do Google Drive" → picker abre, Drive aparece como fonte, import funciona
- [ ] Importar 5 livros → 6ª tentativa exibe paywall
- [ ] Usuário Pro → sem limite de imports
- [ ] EPUB duplicado → toast "livro já existe"
- [ ] Sem internet → toast de erro claro

---

## Arquivos Modificados

| Arquivo | Tipo | O que mudou |
|---------|------|------------|
| `src/types/book.ts` | Edição | Tipo `BookImportSource` + campo `importSource` em `Book` |
| `src/types/settings.ts` | Edição | Campo `driveImportCount` em `UserSettings` + normalize |
| `src/db/database.ts` | Edição | Migração versão 16 |
| `src/db/settings.ts` | Edição | Função `incrementDriveImportCount()` |
| `src/services/BookImportService.ts` | Edição | Gate, counter, propagação de `importSource` |
| `src/services/FirebaseAuthService.ts` | Fix | Removida chamada a `silentlyRefreshDriveToken` (inexistente) |
| `src/screens/HomeScreen.tsx` | Edição | FAB abre sheet; handlers local/Drive; paywall; toast sucesso |
| `src/App.tsx` | Edição | Passa `onOpenPaywall` ao `HomeScreen` |
| `src/components/ImportSourceSheet.tsx` | **Novo** | Bottom sheet de escolha de fonte |
