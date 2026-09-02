# Bug Fix: Reconectar Google Drive não recupera bookmarks sem tentativa prévia registrada

- **Slug**: `reconectar-google-drive-nao-recupera-bookmarks`
- **Corrigido**: 2026-09-02
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`handleReconnectDrive` (em `SettingsSyncScreen.tsx`) agora re-agenda sync
pra **todos** os `bookId`s com bookmark local, não só os que já tinham
`syncError` gravado — espelhando exatamente o padrão já usado pro bloco de
progress logo abaixo. Isso recupera bookmarks que nunca chegaram a tentar
sincronizar (porque `scheduleBookmarkDriveSync` descartava a chamada
enquanto o status era `permission-error`, sem nunca gravar erro nenhum).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/screens/SettingsSyncScreen.tsx` | modified | `db.bookmarks.filter((b) => b.syncError != null).toArray()` virou `db.bookmarks.toArray()` — coleta incondicional de todos os `bookId`s distintos com bookmark local, igual ao bloco de progress. Comentário explicando o porquê (não óbvio: o guard de `permission-error` em `scheduleBookmarkDriveSync` descarta chamadas silenciosamente, sem gravar erro). |
| `src/__tests__/screens/SettingsSyncScreen.test.tsx` | modified | Novo teste + mocks de `@/db/database`, `@/services/FirebaseAuthService`, `@/services/BookmarkDriveSyncService`, `@/services/ProgressDriveSyncService` e `@/services/VocabularyDriveSyncService` (os 2 últimos preservando o store real via `importOriginal`, só substituindo a função de agendar sync — os hooks de status dependem do store real via `useSyncExternalStore`). |

## Tests Added or Updated

- `src/__tests__/screens/SettingsSyncScreen.test.tsx::reconectar re-agenda bookmarks de todos os livros, mesmo sem syncError registrado` — seeda 2 bookmarks (livro 42 sem `syncError`, livro 7 com `syncError` já registrado), clica em "Conectar Google Drive", confirma que `scheduleBookmarkDriveSync` é chamado pros dois `bookId`s. Sem o fix, só o livro 7 seria chamado.

## Local Verification

- `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx --reporter=verbose` → 3 passed (as 2 anteriores + a nova).
- `npm run lint` → limpo.
- `npx tsc --noEmit` → limpo.
- `npm test` (suíte completa) → 767 passed | 2 skipped (769 total) — era 766 antes deste fix.
- `npm run build` → limpo (mesmo warning pré-existente de chunk size).
- Checagem manual: não reinstalei no device especificamente pra este fix
  ainda — o usuário reportou o sintoma original ao vivo; a fase Test decide
  se pede reprodução manual de novo.

## Deviations from Assessment

Nenhuma — a remediação seguiu exatamente a opção "Preferida" do
`assessment.md`.

## Follow-ups

- A alternativa descartada no assessment (remover o guard de
  `permission-error` em `scheduleBookmarkDriveSync` pra que CRUD de
  bookmark durante token inválido já grave `syncError` na hora) continua
  registrada lá como observação — não é follow-up deste fix, é uma mudança
  de escopo maior (afetaria todo disparo de sync de bookmark, não só o
  fluxo de reconexão).
