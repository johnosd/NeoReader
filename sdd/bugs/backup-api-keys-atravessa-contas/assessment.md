# Bug Assessment: Backup de API keys atravessa contas

- **Slug**: backup-api-keys-atravessa-contas
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md`, achado R12 (P2); reprodução em `reports/code-review-2026-10-10/data.probe.ts` (teste "R12")
- **Veredito**: valid
- **Severidade**: medium

## Report

> **R12 — P2 — Backup de API keys atravessa contas.** Configurações Dexie são
> por conta, mas as quatro chaves de backup em Preferences usam
> `neoreader:settings:${field}`, sem usuário. `getSettings` restaura quando
> chaves locais estão vazias, inclusive na primeira entrada de outra conta.
>
> **Aceitação:** novo login não recebe chave anterior; atualização/restauração
> preserva a conta correta; apagar chave não a faz reaparecer do backup antigo.

## Symptom

No Android, a conta B que entra pela primeira vez (banco Dexie novo, sem
settings) recebe as API keys (Speechify, ElevenLabs, Fish Audio, YouTube) da
conta A, restauradas do backup em Capacitor Preferences. Esperado: cada conta só
recupera o próprio backup.

## Reproduction

1. Conta A salva uma API key → `updateAppSettings` → `backupApiKeys` grava
   `neoreader:settings:speechifyApiKey` no SharedPreferences.
2. Logout/login com conta B → `App.tsx` grava `neoreader:active-uid = B` e
   recarrega; `database.ts` abre `NeoReaderDB-B` (vazio).
3. `getSettings()` vê todas as keys vazias → `restoreApiKeysFromPreferences()` lê
   a chave global → grava e devolve a key de A para B.

Reproduzido pelo teste R12 do probe (Preferences mockado com chave sintética
de A, banco vazio): `getSettings` real devolve a chave.

## Suspected Code Paths

- `src/db/settings.ts:16-18` — `prefKey(field)` não inclui nenhum identificador de conta.
- `src/db/settings.ts:20-25` — `backupApiKeys` grava na chave global (B também sobrescreve o backup de A).
- `src/db/settings.ts:27-37` / `46-54` — restauração usa a chave global sempre que o local está vazio.
- `src/db/database.ts:42-49` — o nome do banco já é o "dono" estável da conta (`NeoReaderDB` legado ou `neoreader:db-name:{uid}` / `NeoReaderDB-{uid}`).

## Root Cause Hypothesis

Confiança: high. Os dados Dexie foram isolados por conta (um banco por uid),
mas o backup em Preferences ficou fora desse isolamento — a chave é global no
dispositivo e a restauração não sabe a quem o backup pertence.

## Proposed Remediation

**Preferida**: namespace do backup pelo nome do banco Dexie ativo (`db.name`),
que já é o identificador estável de conta usado pelo app:
`neoreader:settings:${db.name}:${field}`.

- `db.name` é melhor que o uid: guest → `NeoReaderDB-guest`; o primeiro usuário
  pós-update continua mapeado para `NeoReaderDB`; e é exatamente o escopo do
  dado que o backup protege (se o banco for limpo, o mesmo nome é reaberto).
- **Migração segura da chave legada** (`neoreader:settings:${field}`): só é
  lida quando `db.name === 'NeoReaderDB'` — o banco legado, cujo dono é a conta
  que já usava o app antes do isolamento por conta (App.tsx mapeia o primeiro
  uid detectado para `NeoReaderDB`). Nenhuma outra conta (nem guest em
  `NeoReaderDB-guest`) recebe a chave legada.
- Fallback para a legada só quando **nenhuma** chave namespaced existe
  (`value === null`), não quando existem vazias — senão apagar as chaves
  faria a legada reaparecer.
- Ao gravar o backup a partir do banco legado, remover as chaves legadas
  (`Preferences.remove`) — completa a migração e garante que apagar a key não
  a ressuscite do backup antigo.

**Alternativas**:
- Namespace pelo uid (`localStorage['neoreader:active-uid']`): equivalente, mas
  o uid pode ficar `null` no banco legado e exige mapear null→legado à parte;
  `db.name` já resolve isso.
- Descartar a chave legada (nunca migrar): mais seguro, mas um usuário legítimo
  que perca o IndexedDB após o update perderia a recuperação. Rejeitado.

**Files likely to change**:
- `src/db/settings.ts`
- `src/__tests__/db/settings.test.ts`

**Tests to add or update**:
- Conta nova (`NeoReaderDB-B`) com só a chave legada/de A no Preferences → `getSettings` NÃO restaura.
- Conta com backup namespaced próprio → restaura.
- Banco legado `NeoReaderDB` com só a chave legada → restaura (migração).
- Banco legado com chaves namespaced vazias + legada preenchida → não restaura (apagar não ressuscita).
- `updateAppSettings` grava nas chaves namespaced e, no banco legado, remove as legadas.

## Risks & Considerations

- Se, antes desta correção, uma conta B (banco `NeoReaderDB-B`) salvou keys, o
  `backupApiKeys` dela sobrescreveu a chave legada; após o update o dono do
  `NeoReaderDB` poderia herdar essa key de B — mas só se o próprio IndexedDB dele
  estiver vazio (perda de dados). Resíduo aceito: não há como saber, só pela
  chave legada, quem a escreveu por último.
- Usuários que só usaram o app como guest antes do isolamento: guest sem
  `active-uid` usa `NeoReaderDB` e fica dono da legada até um login mapear o uid
  para esse mesmo banco — consistente com o comportamento dos dados Dexie.
- Backups de contas antigas em Preferences continuam lá (não há limpeza por
  conta no logout) — fora do escopo; não vazam, só ocupam bytes.

## Open Questions

- Nenhuma bloqueante.
