# Bug Fix: App pede consentimento do Google repetidamente (Drive)

- **Slug**: app-pedindo-login-google-muita-frequencia
- **Corrigido**: 2026-09-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Trocado o caminho nativo de sign-in do Drive para `useCredentialManager: false`
(o ramo do Credential Manager força re-consentimento a cada autorização) e
removida toda renovação automática de token disparada por sync de background —
renovar abre UI, e nenhum código de background deve poder abrir UI. Agora só o
botão "Reconectar" de Settings pede login, e um token válido nunca é apagado
por uma resposta sem token.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/FirebaseAuthService.ts` | modified | `useCredentialManager: false` nas duas chamadas com escopo Drive; `refreshDriveToken` agora exige `{ userInitiated }`, retorna `DriveTokenRefreshOutcome`, nunca grava token vazio, tem cooldown persistido + teto por sessão para chamadas não-iniciadas pelo usuário, e loga a falha em vez de engolir |
| `src/services/GoogleDriveAppDataService.ts` | modified | removidos `refreshAccessToken` e o retry-once; sem token lança `missing-token`, 401/403 lança `permission-denied` sem repetir |
| `src/services/BookmarkDriveRestoreService.ts` | modified | early return quando o status já é `permission-error`; removido o `setBookmarkDriveSyncStatus('pending-offline')` que desarmava esse guard |
| `src/screens/SettingsSyncScreen.tsx` | modified | passa `{ userInitiated: true }` e só reseta status/reagenda syncs quando o outcome é `refreshed` |
| `src/__tests__/services/FirebaseAuthService.test.ts` | modified | +4 casos (ver abaixo); `localStorage.clear()` no `beforeEach` |
| `src/__tests__/services/GoogleDriveAppDataService.test.ts` | modified | 4 testes de retry reescritos para o comportamento sem renovação |
| `src/__tests__/services/BookmarkDriveRestoreService.test.ts` | modified | +1 caso; reset de status no `beforeEach` |
| `src/__tests__/screens/SettingsSyncScreen.test.tsx` | modified | mock passa a devolver `'refreshed'`; +1 caso de cancelamento |

## Tests Added or Updated

- `FirebaseAuthService.test.ts::refreshDriveToken evita o Credential Manager ao pedir o escopo do Drive` — trava a causa raiz (A): se alguém remover `useCredentialManager: false`, o re-consentimento volta.
- `FirebaseAuthService.test.ts::refreshDriveToken mantem o token atual quando o provedor responde sem accessToken` — trava a causa (C), o loop de apagar/pedir/apagar.
- `FirebaseAuthService.test.ts::refreshDriveToken nao inicia por background enquanto o cooldown estiver ativo` — trava o rate limit e confirma que ação do usuário continua passando.
- `FirebaseAuthService.test.ts::mantem o login nativo no Android` — atualizado para exigir `useCredentialManager: false`.
- `GoogleDriveAppDataService.test.ts::falha sem token sem chamar fetch e sem tentar renovar` e `::mapeia HTTP 403 como permissao negada sem repetir o request` — travam a causa (B): background não pode disparar renovação.
- `GoogleDriveAppDataService.test.ts::HTTP 401 nao repete a requisicao` e `::usa o token corrente a cada request, sem cachear entre chamadas` — substituem os dois testes que afirmavam o retry-once.
- `BookmarkDriveRestoreService.test.ts::pula restauracao quando o status ja e permission-error, sem chamar Drive` — trava o caso do import em lote (uma solicitação por livro).
- `SettingsSyncScreen.test.tsx::reconectar cancelado nao reseta status nem re-agenda sync` — cancelar não deve reagendar syncs que vão falhar.

## Local Verification

- `npx vitest run` nos 3 arquivos diretamente afetados → 24 passed
- `npx tsc --noEmit` → sem erros
- `npm run lint` → sem erros
- `npm test` (suíte completa) → **856 passed, 2 skipped, 0 failed** (113 arquivos)
- `npm run build` → `✓ built in 6.59s`
- Checagens manuais: **nenhuma em device real** — a validação no Android é da
  fase Test. Ver "Follow-ups".

## Deviations from Assessment

1. **`allowInteractiveRefresh` não foi implementado como flag.** O assessment
   propunha um flag em `GoogleDriveAppDataService` para permitir renovação
   interativa só ao botão de Settings. Na prática o botão chama
   `refreshDriveToken()` direto e nunca constrói um `GoogleDriveAppDataService`
   interativo, então o flag seria código morto. Em vez disso, a renovação
   automática foi removida do serviço por completo, e a intenção ficou
   expressa no parâmetro obrigatório `{ userInitiated }` de
   `refreshDriveToken` — qualquer chamador novo é forçado a declarar o que é.
   Mesma garantia, menos abstração (regra de ouro 4 do CLAUDE.md).

2. **`BookImportService.ts` não foi alterado.** O assessment propunha resolver
   o token uma vez antes do loop de import em lote. O guard adicionado em
   `restoreBookBookmarksFromDrive` já produz o mesmo resultado: o primeiro
   livro falha com `missing-token` (sem rede — o erro é lançado antes do
   `fetch`), o status vira `permission-error`, e os N-1 livros seguintes saem
   pelo early return. Uma tentativa por lote em vez de uma por livro, sem
   mexer no import.

3. **`refreshDriveToken` mudou de assinatura e de tipo de retorno**
   (`Promise<void>` → `Promise<DriveTokenRefreshOutcome>`, com parâmetro
   obrigatório). O assessment previa só o cooldown interno. A mudança de
   retorno foi necessária para o item novo em `SettingsSyncScreen`: sem saber
   o resultado, ele resetava os status e reagendava todos os syncs mesmo
   quando o usuário cancelava a tela.

## Follow-ups

- **Validação em device real é obrigatória antes de fechar** (fase Test):
  confirmar via `npm run android:logs:diagnostics:run` que uma renovação
  ocorre sem tela de consentimento e devolve `accessToken` não nulo. Nada
  disso foi verificado em Android nesta fase.
- **Validar também no AAB de release**, não só em debug — a mudança mexe no
  caminho de sign-in, que é a área do bug conhecido do Google Sign-In no
  release (aberto em 2026-05-14).
- **Dívida assumida:** `useCredentialManager: false` usa o `GoogleSignIn`
  legado, que o Google está descontinuando. Documentado em comentário no
  código. Reavaliar quando o plugin parar de hardcodar
  `requestOfflineAccess(..., true)`.
- **Feature 005** (`005-sync-drive-inline`) descreve "renovação silenciosa"
  que nunca existiu. Atualizar a documentação dessa feature.
- **Fora do código:** conferir no Google Cloud Console o publishing status do
  consentimento OAuth e preencher Privacy Policy / ToS (causa D do
  assessment) — segunda fonte de re-consentimento.
- Considerar UI que torne `permission-error` mais visível: agora o sync para
  em silêncio até o usuário ir em Settings.
