# Bug Fix: Sincronizar bookmarks automaticamente ao fechar o livro

- **Slug**: sincronizar-bookmarks-automaticamente-ao-fechar-livro
- **Corrigido**: 2026-09-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`handleBack` (`ReaderScreen.tsx`) agora checa se algum bookmark do livro
está com `syncedAt == null` antes de sair do leitor e, se houver, chama
`scheduleBookmarkDriveSync(book.id!)` — dando ao sync (que já dispara na
criação do bookmark, mas é assíncrono contra a API do Drive) mais uma
chance de terminar sem exigir o toque manual na aba de Marcações.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/screens/ReaderScreen.tsx` | modified | Import de `scheduleBookmarkDriveSync`. `bookmarks` (useLiveQuery) refatorado: fallback `?? []` movido pra um `useMemo` próprio (evita array novo a cada render, exigido pelo `handleBack` agora depender de `bookmarks`). `handleBack`: se `bookmarks.some(b => !b.syncedAt)`, chama `scheduleBookmarkDriveSync(book.id!)` (fire-and-forget) antes de `onBack()`. |
| `src/__tests__/screens/ReaderScreen.test.tsx` | modified | Mock de `dexie-react-hooks` virou posicional (bookmarks/vocabWords/highlights, só bookmarks controlável por teste). Mock de `@/services/BookmarkDriveSyncService` novo. Mock de `ReaderChrome` ganhou um botão `go-back` ligado à prop `onBack` (antes só expunha `onTtsToggle`). +3 testes. |

## Tests Added or Updated

- `ReaderScreen.test.tsx::ao fechar o livro, sincroniza bookmarks pendentes automaticamente` — bookmark com `syncedAt: null` + clique em "voltar" → `scheduleBookmarkDriveSync(1)` chamado.
- `ReaderScreen.test.tsx::ao fechar o livro, nao sincroniza se todos os bookmarks ja estao sincronizados` — bookmark com `syncedAt` preenchido → `scheduleBookmarkDriveSync` não chamado (evita API supérflua).
- `ReaderScreen.test.tsx::ao fechar o livro sem nenhum bookmark, nao tenta sincronizar` — lista vazia → `scheduleBookmarkDriveSync` não chamado.

## Local Verification

- `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` → 37 passed (era 34; +3 novos).
- `npx tsc --noEmit` → sem erros.
- `npm test` (suíte completa) → 884 passed, 2 skipped, 0 failed.
- `npm run lint` → sem erros (1 warning de `react-hooks/exhaustive-deps` apareceu na primeira rodada e foi corrigido — ver Deviations).
- `npm run build` → build de produção concluído sem erros.
- Checagem manual no device: **não realizada nesta fase** — a fase Test é quem deve confirmar (criar bookmark, fechar o livro rápido, checar Marcações já sincronizado).

## Deviations from Assessment

O assessment não previu que adicionar `bookmarks` às deps de `handleBack`
dispararia o lint `react-hooks/exhaustive-deps` ("bookmarks could change
every render", por causa do fallback `?? []`). Corrigido movendo esse
fallback pra um `useMemo` próprio (`bookmarksResult ?? []`), conforme a
própria sugestão do ESLint — pequeno, mas fora do que o assessment listou
em "Files likely to change" (mesmo arquivo, só mais uma linha). Não achei
necessário reabrir o Assess por isso — é ajuste mecânico sugerido pela
ferramenta, não uma descoberta que muda a causa raiz ou a remediação.

## Follow-ups

- A alternativa registrada no assessment (também sincronizar quando o app
  vai pra background, via `useCapacitorAppStateChange`) não foi
  implementada — fora do escopo do relato original ("fechar o livro").
  Considerar se aparecer relato equivalente pra esse caso.
