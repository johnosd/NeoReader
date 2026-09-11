# Bug Fix: Sync de bookmarks não acontece ao fechar a tela de leitura

- **Slug**: sync-bookmarks-nao-acontece-ao-fechar
- **Corrigido**: 2026-09-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`handleBack` (`ReaderScreen.tsx`) já tentava sincronizar bookmarks
pendentes ao fechar o livro (fix anterior, `677a91e`), mas essa tentativa é
um no-op silencioso quando o status cacheado do Drive é `permission-error`
(token expirado/ausente — não se autorrenova). Agora, nesse caso
específico, em vez de chamar `scheduleBookmarkDriveSync` (fadado a
descartar a chamada), `ReaderScreen` avisa o app via uma nova prop
`onBookmarkSyncBlocked(message)`, que `App.tsx` exibe como um toast
discreto sobrevivendo à transição de tela (mesmo padrão já usado pra erros
de importação externa). Fora do caso `permission-error`, o comportamento
anterior é preservado.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/screens/ReaderScreen.tsx` | modified | Import de `getCachedBookmarkDriveSyncStatus` (`BookmarkDriveSyncStatus`). Nova prop `onBookmarkSyncBlocked?: (message: string) => void` (default no-op). `handleBack`: se houver bookmark pendente, checa o status cacheado — `permission-error` chama `onBookmarkSyncBlocked(t('reader.bookmarkSyncPendingNotice'))` em vez de `scheduleBookmarkDriveSync`; qualquer outro status mantém a chamada direta. `t` adicionado às deps do `useCallback`. |
| `src/App.tsx` | modified | Novo estado `bookmarkSyncNotice`. Novo bloco `<Toast tone="warning">` em `renderWithExternalImportFeedback` (mesmo padrão de `externalImportError`, sobrevive à navegação porque vive fora do `ReaderScreen`). `case 'reader'` passa `onBookmarkSyncBlocked={setBookmarkSyncNotice}`. |
| `src/i18n/messages.ts` | modified | Nova chave `reader.bookmarkSyncPendingNotice` em pt-BR/en/es, reaproveitando o tom de `settings.bookmarkSync.description.permissionError` já existente. |
| `src/__tests__/screens/ReaderScreen.test.tsx` | modified | Novo mock de `@/services/BookmarkDriveSyncStatus` (`getCachedBookmarkDriveSyncStatus`, default `'connected'` no `beforeEach`). +1 teste novo. |

## Tests Added or Updated

- `ReaderScreen.test.tsx::ao fechar o livro com bookmark pendente e status permission-error, avisa em vez de tentar sincronizar` — trava o caminho principal do fix: bookmark com `syncedAt: null` + status cacheado `permission-error` + clique em "voltar" → `scheduleBookmarkDriveSync` **não** chamado, `onBookmarkSyncBlocked` chamado com uma string, `onBack` chamado normalmente.
- Os 2 testes existentes de `handleBack` (bookmark pendente com status normal → sincroniza; todos sincronizados → não sincroniza) continuam passando sem alteração — cobrem o caminho que não mudou.

## Local Verification

- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 52 passed (era 51; +1 novo).
- `npm run lint` → sem erros.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.
- `npm test` (suíte completa) → 920 passed, 2 skipped (pré-existentes), 0 failed, 113 arquivos passando + 2 skipped. Os avisos `Not implemented: Window's scrollTo()` no output são ruído pré-existente do jsdom, não relacionados a esta mudança.
- `npm run build` → build de produção concluído sem erros (warning de chunk size >500kB é pré-existente).
- Checagem manual no device: **não realizada nesta fase** — a fase Test é quem deve confirmar. Como o gatilho depende do status `permission-error` (não reproduzível sob demanda sem um token de Drive de fato expirado), a fase Test deve validar via forçar esse estado (ex.: revogar acesso do app no Google, ou usar o fluxo já documentado em `bookmark-nao-sincroniza-ao-clicar-no`) ou aceitar a cobertura automatizada como evidência suficiente, dependendo do que for viável.

## Deviations from Assessment

Nenhuma — o fix seguiu exatamente a remediação decidida com o usuário no
`assessment.md` (toast via `App.tsx`, sem abrir `refreshDriveToken` a
partir do fechamento do leitor). Único ajuste não listado explicitamente
nos arquivos do assessment: `src/i18n/messages.ts`, necessário porque a
mensagem do toast precisa ser localizada (pt-BR/en/es) — já estava
implícito em "Nova mensagem i18n" no assessment, só não estava listado em
"Files likely to change"; não é uma descoberta que muda a causa raiz.

## Follow-ups

- `bookmark-nao-sincroniza-ao-clicar-no` (2026-09-08) segue com fix
  `applied` e fase Test nunca rodada — é o bug irmão que corrigiu o mesmo
  padrão no ícone manual de `BookDetailsScreen`. Vale rodar a fase Test
  nele também, já que ambos os fixes tocam a mesma causa raiz
  (`permission-error` sticky em `BookmarkDriveSyncStatus`).
- Se no futuro isso se repetir para outros pontos de mutação de bookmark
  (`db/bookmarks.ts` — criação/edição/exclusão fora do fechamento do
  leitor), o mesmo padrão de aviso pode precisar ser estendido pra lá; fora
  do escopo deste report (que falava especificamente de "fechar a tela de
  leitura").
