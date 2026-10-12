# Bug Fix: Backup de API keys atravessa contas

- **Slug**: backup-api-keys-atravessa-contas
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário via orquestrador)

- Namespace do backup em Preferences por `db.name`: `neoreader:settings:${db.name}:${field}`.
- Chave legada `neoreader:settings:${field}` só é lida quando `db.name === 'NeoReaderDB'` (dono original).
- Fallback para a legada só se nenhuma chave namespaced existir (`null`), nunca quando existem vazias.
- `backupApiKeys` no banco legado remove as chaves legadas depois de gravar as namespaced.
- Testes novos em arquivo separado (o `settings.test.ts` existente mocka `db` sem `name` e roda como web).

## Summary

O backup das API keys em Capacitor Preferences passou a ser por conta (nome do
banco Dexie ativo). Uma conta nova não restaura mais as chaves de outra; a chave
legada sem namespace só migra para o banco legado `NeoReaderDB` e é apagada na
primeira gravação, para que apagar a key não a faça reaparecer.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/db/settings.ts` | modified | `prefKey` com `db.name`; `legacyPrefKey`; `readApiKeys`; fallback legado restrito; remoção da legada no backup |
| `src/__tests__/db/settings.apiKeyBackup.test.ts` | added | 6 testes com Preferences em memória e `db.name` controlável |

## Tests Added or Updated

- `settings.apiKeyBackup.test.ts::conta nova não herda o backup legado nem o de outra conta` — trava o R12.
- `::restaura o backup namespaced da própria conta` — recuperação pós-perda de IndexedDB continua.
- `::banco legado migra a chave antiga sem namespace` — migração do dono original.
- `::banco legado não ressuscita a chave antiga depois que o backup namespaced existe`.
- `::updateAppSettings grava na chave da conta e remove a legada no banco legado`.
- `::updateAppSettings em outra conta não toca no backup legado`.

## Local Verification

- `npx vitest run src/__tests__/db/settings.apiKeyBackup.test.ts src/__tests__/db/settings.test.ts` → 2 arquivos, 13 testes passaram.
- `npx eslint src/db/settings.ts src/__tests__/db/settings.apiKeyBackup.test.ts` → limpo.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.

## Deviations from Assessment

- Nenhuma no código. Observação: o probe R12 do relatório não serve como reprodução pós-fix — ele roda com o banco legado `NeoReaderDB` (sem `active-uid`) e mocka `Preferences.get` por `key.endsWith('speechifyApiKey')`, que também casa com a chave namespaced. Os testes novos substituem essa reprodução com contas distintas.

## Follow-ups

- Limpar o backup em Preferences de contas removidas (fora do escopo; não vaza, só ocupa espaço).
- Validação em device (login A → salvar key → login B) não foi feita.
