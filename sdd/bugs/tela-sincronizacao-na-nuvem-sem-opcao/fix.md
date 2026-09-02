# Bug Fix: Sincronização na Nuvem sem opção de conectar/reconectar fora do caso "token expirado"

- **Slug**: `tela-sincronizacao-na-nuvem-sem-opcao`
- **Corrigido**: 2026-09-02
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A condição que controla a linha de ação "Conectar Google Drive" em
`SettingsSyncScreen.tsx` foi alargada de "só quando `permission-error`" pra
"quando `permission-error` OU `pending-offline`" — cobrindo também o
usuário Pro que nunca sincronizou nada ainda. O texto do botão (3 locales)
foi generalizado pra não presumir mais uma conexão prévia ("token
expirado"), já que agora ele também aparece pra quem nunca autorizou o
Drive.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/screens/SettingsSyncScreen.tsx` | modified | Variável `hasPermissionError` renomeada pra `needsDriveConnect`; condição agora inclui `pending-offline` além de `permission-error` pros 3 status (bookmark/progress/vocabulary). Nenhuma mudança em `handleReconnectDrive` — a função já cobria os dois casos. |
| `src/i18n/messages.ts` | modified | `settings.cloudSync.reconnect.title`/`.description` reescritas nos 3 locales (pt-BR: "Conectar Google Drive" / "Toque para autorizar o acesso ao Google Drive."; en: "Connect Google Drive" / "Tap to authorize access to Google Drive."; es: "Conectar Google Drive" / "Toca para autorizar el acceso a Google Drive."), removendo a menção específica a "token expirado". |
| `src/__tests__/screens/SettingsSyncScreen.test.tsx` | modified | Novo teste: usuário Pro com todos os status em `pending-offline` (default real dos stores, sem sync anterior) vê a linha "Conectar Google Drive". Teste existente (usuário Free) ganhou uma asserção extra confirmando que a ação continua ausente nesse caso. |

## Tests Added or Updated

- `src/__tests__/screens/SettingsSyncScreen.test.tsx::mostra acao de conectar Google Drive pra usuario Pro que nunca sincronizou (pending-offline)` — trava a regressão: sem essa mudança, este teste falha (a linha não aparecia pra status `pending-offline`).
- `src/__tests__/screens/SettingsSyncScreen.test.tsx::mostra sync de bookmarks como recurso Pro nas configuracoes` — asserção nova (`queryByText('Conectar Google Drive')` deve ser `null`) confirma que usuário Free continua sem a ação.

## Local Verification

- `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx` → 2 passed.
- `npm run lint` → limpo.
- `npx tsc --noEmit` → limpo.
- `npm test` (suíte completa) → 766 passed | 2 skipped (era 765 antes do fix).
- `npm run build` → limpo (mesmo warning pré-existente de chunk size, não relacionado).
- Checagem manual: não reinstalei no device pra esta correção pontual — a
  lógica é puramente uma condição booleana já coberta pelo teste automatizado
  novo; a fase Test decide se reprodução manual é necessária.

## Deviations from Assessment

Nenhuma — a remediação seguiu exatamente o que `assessment.md` propôs como
"Preferida" (alargar a condição + generalizar o texto + renomear a
variável), dentro dos 3 arquivos previstos em "Files likely to change".

## Follow-ups

- Nenhum follow-up de código. A alternativa descartada no assessment
  (status `'never-connected'` distinto de `pending-offline`) continua
  registrada lá como nota pra uma eventual feature futura de sync — não é
  follow-up deste fix.
