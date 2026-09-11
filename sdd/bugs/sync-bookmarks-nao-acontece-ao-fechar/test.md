# Bug Verification: Sync de bookmarks não acontece ao fechar a tela de leitura

- **Slug**: sync-bookmarks-nao-acontece-ao-fechar
- **Testado**: 2026-09-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O fix está aplicado e coberto por um teste automatizado que reproduz
exatamente a lógica do guard (`permission-error` → avisa via
`onBookmarkSyncBlocked` em vez de tentar `scheduleBookmarkDriveSync`, que
seria descartado em silêncio). Suite completa, lint, type-check e build
estão limpos, rerrodados nesta fase (não reaproveitados da fase Fix sem
checar de novo). **Não foi possível reproduzir o sintoma original ao vivo**
— nem antes nem depois do fix — porque isso exige um estado real de
`permission-error` no Google Drive (token expirado/revogado), que só surge
depois de sign-in real via Google OAuth. Esse login não pode ser forçado de
forma automatizada nesta sessão (exigiria as credenciais reais do usuário
num fluxo de consentimento do Google), então o veredito fica em `partial`
em vez de `verified`, conforme a regra do próprio skill: reprodução não
executada não pode virar `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Teste novo (guard permission-error) | `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` | pass | 52/52, incluindo o teste novo `ao fechar o livro com bookmark pendente e status permission-error, avisa em vez de tentar sincronizar`. Rerrodado nesta fase (não só reaproveitado da fase Fix). |
| Suite de regressão (ReaderScreen) | mesmo comando acima | pass | Os 2 testes anteriores de `handleBack` (bookmark pendente sincroniza / já sincronizado não sincroniza) continuam passando sem alteração. |
| Suite completa | `npm test` | pass | 920 passed, 2 skipped (pré-existentes), 0 failed, 113 arquivos. Rerrodada do zero nesta fase. |
| Lint | `npm run lint` | pass | Sem erros, rerrodado nesta fase. |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | Sem erros, rerrodado nesta fase. |
| Build de produção | `npm run build` | pass | Sem erros, rerrodado nesta fase (warning de chunk size >500kB é pré-existente, não relacionado). |
| Reprodução ao vivo do sintoma original (device ou navegador real) | — | **not-run** | Exigiria: (a) sign-in real via Google OAuth (a UI da app bloqueia tudo antes do login — `App.tsx` só renderiza o leitor com `auth.state.status === 'signed-in'`), e (b) um token de Drive de fato expirado/revogado pra cair em `permission-error` de verdade. Nenhum dos dois é automatizável nesta sessão sem as credenciais e a ação explícita do usuário (revogar/nunca conectar o acesso do app ao Drive). Não tentei simular isso injetando estado via console/mocks fora do ambiente de teste — teria sido reprodução fabricada, não real. |

## Output Excerpts

```
Test Files  1 passed (1)
     Tests  52 passed (52)
```

```
Test Files  113 passed | 2 skipped (115)
     Tests  920 passed | 2 skipped (922)
Duration  185.76s
```

## Residual Risks

- **Principal**: o comportamento em produção — usuário real, Drive
  realmente com token expirado, fechando o leitor com bookmark pendente,
  vendo o toast aparecer — nunca foi observado ao vivo. A lógica está
  isolada e testada (`getCachedBookmarkDriveSyncStatus().code ===
  'permission-error'` → `onBookmarkSyncBlocked`, senão
  `scheduleBookmarkDriveSync`), mas a integração ponta a ponta (Firebase
  Auth real → GoogleDriveAppDataService real → status cacheado real →
  `ReaderScreen` → `App.tsx` → `Toast` renderizado) só foi validada por
  mocks.
- O caminho mais fácil pra fechar esse risco na prática: a próxima vez que
  o usuário (ou qualquer usuário Pro) tiver o Drive desconectado/token
  expirado e fechar um livro com bookmark pendente, o toast deve aparecer
  — se não aparecer, é sinal de que algo na integração real (não coberto
  por mock) está diferente do esperado.
- Mesma lacuna já existia nos 2 bugs irmãos: `test.md` de
  `sincronizar-bookmarks-automaticamente-ao-fechar-livro` já tinha marcado
  "Comportamento com Drive desconectado (sem token) não foi testado no
  device" como risco residual não testado — este ciclo de Test não fecha
  essa lacuna, só a confirma e a documenta explicitamente. `bookmark-nao-
  sincroniza-ao-clicar-no` segue com a fase Test nunca rodada.
- Nenhuma regressão detectada na suite completa, lint, type-check ou
  build.

## Recommendation

**Segurar como `partial`, não fechar ainda.** A mudança é de baixo risco
(lógica isolada, bem coberta por teste, sem tocar em
`BookmarkDriveSyncService`/`GoogleDriveAppDataService`) e pode seguir para
commit/PR com essa ressalva documentada. Mas o fechamento definitivo do
bug (`verified`) depende de uma confirmação real em algum momento: da
próxima vez que o Drive estiver desconectado/expirado, verificar se o
toast "Bookmark salvo localmente. Reconecte o Google Drive em
Configurações para sincronizar." aparece ao fechar um livro com bookmark
pendente. Se aparecer como esperado, é só rodar a fase Test de novo pra
promover o veredito; se não aparecer, reabrir a fase Assess com essa
evidência nova.
