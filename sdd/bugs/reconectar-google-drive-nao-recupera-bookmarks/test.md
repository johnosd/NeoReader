# Bug Verification: Reconectar Google Drive não recupera bookmarks sem tentativa prévia registrada

- **Slug**: `reconectar-google-drive-nao-recupera-bookmarks`
- **Testado**: 2026-09-02
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O teste automatizado novo reproduz com precisão o cenário relatado (livro
com bookmark sem `syncError` registrado, ao lado de um livro com erro já
registrado) e confirma que ambos os `bookId`s são re-agendados pro sync
depois de reconectar — antes do fix, só o livro com erro já registrado
seria. Suite completa, lint, type-check e build seguem limpos.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx --reporter=verbose` | pass | Teste `reconectar re-agenda bookmarks de todos os livros, mesmo sem syncError registrado` confirma `scheduleBookmarkDriveSync` chamado tanto pro `bookId` sem erro quanto pro com erro. Não revertido pra pré-fix ao vivo (fase Test é read-only); por leitura de código, a versão anterior (`db.bookmarks.filter((b) => b.syncError != null)`) excluiria o bookmark sem erro do resultado, então o teste falharia nesse ponto sem o fix. |
| Testes novos/atualizados | `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx` | pass | 3/3 (as 2 do bug irmão + a nova). |
| Suite de regressão | `npm test` | pass | 767 passed \| 2 skipped (769 total) — 2 skips pré-existentes, não relacionados. Era 766 antes deste fix. |
| Lint | `npm run lint` | pass | Sem erros/warnings. |
| Type-check | `npx tsc --noEmit` | pass | Sem erros. |
| Build | `npm run build` | pass | Build de produção limpo; warning de chunk size pré-existente, não relacionado. |

## Output Excerpts

```
✓ src/__tests__/screens/SettingsSyncScreen.test.tsx > SettingsSyncScreen > mostra sync de bookmarks como recurso Pro nas configuracoes 154ms
✓ src/__tests__/screens/SettingsSyncScreen.test.tsx > SettingsSyncScreen > mostra acao de conectar Google Drive pra usuario Pro que nunca sincronizou (pending-offline) 34ms
✓ src/__tests__/screens/SettingsSyncScreen.test.tsx > SettingsSyncScreen > reconectar re-agenda bookmarks de todos os livros, mesmo sem syncError registrado 110ms

Test Files  1 passed (1)
     Tests  3 passed (3)
```

```
Test Files  106 passed | 2 skipped (108)
     Tests  767 passed | 2 skipped (769)
```

## Residual Risks

- Nenhuma verificação manual no device foi feita ainda especificamente pra
  este fix — o sintoma original foi reportado ao vivo pelo usuário, mas a
  confirmação de que ele sumiu depende de reinstalar e reconectar de novo
  com um bookmark real sem `syncError`. Recomendado antes de considerar
  isso 100% fechado do ponto de vista de UX real (não só cobertura de
  teste).
- `syncBookBookmarks` continua marcando `connected` mesmo com lista vazia
  de bookmarks (diferente de progress, que tem early-return pra `bookId`
  sem registro) — comportamento pré-existente, fora do escopo deste fix,
  não é regressão.

## Recommendation

Fechar do ponto de vista de código — verificado por teste automatizado que
reproduz com precisão o cenário relatado, sem regressão na suíte completa
(767 passed), lint/type-check/build limpos. Recomendo uma validação visual
rápida no device (reinstalar, criar um bookmark, simular
`permission-error`/offline, reconectar, confirmar que o bookmark some do
estado "pendente") na próxima janela de teste manual — não bloqueante pra
fechar.
