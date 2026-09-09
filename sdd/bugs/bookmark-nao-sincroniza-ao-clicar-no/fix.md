# Bug Fix: Bookmark não sincroniza ao clicar no ícone (fica vermelho)

- **Slug**: bookmark-nao-sincroniza-ao-clicar-no
- **Corrigido**: 2026-09-08
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`handleSyncBookmarksTap` (`BookDetailsScreen.tsx`) agora chama
`refreshDriveToken({ userInitiated: true })` antes de reagendar o sync
quando o status cacheado é `permission-error` — restaurando o FR-005/US2 da
feature `005-sync-drive-inline` (reconectar o Drive inline pelo próprio
ícone), que ficou quebrado depois que o bugfix
`app-pedindo-login-google-muita-frequencia` removeu a "renovação
silenciosa" da qual esse comportamento dependia.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/screens/BookDetailsScreen.tsx` | modified | Import de `refreshDriveToken` (`FirebaseAuthService`) e `getCachedBookmarkDriveSyncStatus` (`BookmarkDriveSyncStatus`). `handleSyncBookmarksTap`: lê o status cacheado antes do reset; se `permission-error`, chama `refreshDriveToken({ userInitiated: true })` e só prossegue (reset + `scheduleBookmarkDriveSync`) se o outcome for `'refreshed'`. Qualquer outro status mantém o comportamento anterior (reset + retry direto). |
| `src/__tests__/screens/BookDetailsScreen.test.tsx` | modified | Mock de `@/services/BookmarkDriveSyncStatus` ganha `getCachedBookmarkDriveSyncStatus` (default `'pending-offline'` no `beforeEach`); novo mock de `@/services/FirebaseAuthService` (`refreshDriveToken`). +2 testes novos, +1 asserção no teste existente. |

## Tests Added or Updated

- `BookDetailsScreen.test.tsx::toque com status permission-error reconecta o Drive antes de agendar a sincronizacao` — trava o caminho principal do fix: status `permission-error` + `refreshDriveToken` resolvendo `'refreshed'` → `refreshDriveToken({ userInitiated: true })` chamado, seguido de `setBookmarkDriveSyncStatus('pending-offline')` e `scheduleBookmarkDriveSync(1)`.
- `BookDetailsScreen.test.tsx::toque com status permission-error nao agenda sincronizacao se a reconexao nao renovar o token` — trava o guard: se `refreshDriveToken` não resolver `'refreshed'` (usuário cancelou, ou provedor sem token), nem `scheduleBookmarkDriveSync` nem `setBookmarkDriveSyncStatus` são chamados — sem repetir uma sincronização fadada a falhar.
- `BookDetailsScreen.test.tsx::tocar no icone reseta o status e agenda a sincronizacao do livro` (existente) — nova asserção `expect(mocks.refreshDriveToken).not.toHaveBeenCalled()`, explicitando que o caminho antigo (status não é `permission-error`) continua sem reconectar.

## Local Verification

- `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx` → 29 passed (era 27; +2 novos).
- `npm run lint` → sem erros.
- `npx tsc --noEmit` → sem erros.
- `npm test` (suíte completa) → 863 passed, 2 skipped, 0 failed (114 arquivos).
- `npm run build` → build de produção concluído sem erros (warning de chunk size >500kB é pré-existente, não relacionado a esta mudança).
- Checagens manuais no device: **não refeitas nesta fase** — a reprodução original (fase Assess) já usou o device real via `adb logcat`; a fase Test é quem deve confirmar no device com o build atualizado.

## Deviations from Assessment

Nenhuma — o fix seguiu exatamente a remediação preferida descrita em
`assessment.md` (checar status cacheado, chamar `refreshDriveToken` só
quando `permission-error`, manter o resto do fluxo intacto). Único arquivo
de produção alterado (`BookDetailsScreen.tsx`), como previsto.

## Follow-ups

- O `assessment.md` já registra um risco aceito: `getCachedBookmarkDriveSyncStatus()`
  é um status global (não por livro) — se outro livro deixou o status em
  `permission-error`, tocar o ícone deste livro também dispara reconexão.
  Mesmo comportamento que `SettingsSyncScreen` já tem hoje; não é regressão
  desta mudança.
- Vale considerar atualizar `sdd/specs/005-sync-drive-inline/plan.md`
  ("Cuidados para Retomada") pra registrar que FR-005/US2-Cenário-3 foi
  restaurado por este bugfix — fora do escopo do `sdd-bugfix` (não edita
  documentação de feature), mas relevante se alguém rodar `sdd-converge`
  nessa feature de novo.
