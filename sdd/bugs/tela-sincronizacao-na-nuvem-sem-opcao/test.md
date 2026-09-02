# Bug Verification: Sincronização na Nuvem sem opção de conectar/reconectar fora do caso "token expirado"

- **Slug**: `tela-sincronizacao-na-nuvem-sem-opcao`
- **Testado**: 2026-09-02
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original (usuário Pro sem sync anterior via nada visível pra
conectar o Google Drive) não reproduz mais: com o fix aplicado, o teste
automatizado que simula exatamente esse estado (`isPro: true`, todos os 3
status em `pending-offline`, o default real dos stores sem sync anterior)
encontra a linha "Conectar Google Drive" na tela. Suite completa, lint,
type-check e build seguem limpos, sem regressão.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx --reporter=verbose` | pass | O teste `mostra acao de conectar Google Drive pra usuario Pro que nunca sincronizou (pending-offline)` simula com precisão o estado do bug relatado (usuário Pro, `pending-offline` nos 3 tipos de sync, sem nenhuma mutação prévia de store) e confirma que a ação aparece. Não revertido pra pré-fix pra confirmar a falha original ao vivo — faria isso exigir editar código, proibido nesta fase (read-only); confirmado por leitura de código que a condição anterior (`hasPermissionError`, só `'permission-error'`) não seria satisfeita por `'pending-offline'`, logo o elemento não existiria antes do fix. |
| Reprodução — não regressão (usuário Free) | mesmo comando acima, teste `mostra sync de bookmarks como recurso Pro nas configuracoes` | pass | Assert nova (`queryByText('Conectar Google Drive')` é `null`) confirma que a ação não vaza pra usuário Free — condição de status `pro-required` nunca ativa o gate alargado. |
| Testes novos/atualizados | `npx vitest run src/__tests__/screens/SettingsSyncScreen.test.tsx` | pass | 2/2 testes do arquivo, ambos relevantes ao fix. |
| Suite de regressão | `npm test` | pass | 766 passed \| 2 skipped (768 total) — 2 skips são pré-existentes, não relacionados a este fix. Era 765 passed antes do fix (+1 = o teste novo). |
| Lint | `npm run lint` | pass | Sem erros/warnings. |
| Type-check | `npx tsc --noEmit` | pass | Sem erros. |
| Build | `npm run build` | pass | Build de produção limpo; único warning é o de chunk size pré-existente, não relacionado. |

## Output Excerpts

```
✓ src/__tests__/screens/SettingsSyncScreen.test.tsx > SettingsSyncScreen > mostra sync de bookmarks como recurso Pro nas configuracoes 143ms
✓ src/__tests__/screens/SettingsSyncScreen.test.tsx > SettingsSyncScreen > mostra acao de conectar Google Drive pra usuario Pro que nunca sincronizou (pending-offline) 33ms

Test Files  1 passed (1)
     Tests  2 passed (2)
```

```
Test Files  106 passed | 2 skipped (108)
     Tests  766 passed | 2 skipped (768)
```

## Residual Risks

- Nenhuma verificação manual no device Android foi feita especificamente
  pra este fix — é uma mudança pontual de condição booleana + texto,
  totalmente coberta pela lógica já testada (`handleReconnectDrive`/
  `refreshDriveToken` não mudaram). Risco residual: nenhum comportamento
  novo de UI além do já validado por teste (aparecer/sumir a linha), e o
  clique já reaproveita a mesma função testada implicitamente desde a
  feature `004-settings-categorias`.
- A limitação estrutural mais ampla — não existir um status
  `'never-connected'` distinto de `'pending-offline'` — continua existindo
  por design (ver "Alternativas" em `assessment.md`); não é regressão nem
  pendência deste fix, é um limite consciente do escopo.

## Recommendation

Fechar — verificado por teste automatizado que reproduz com precisão o
estado relatado (usuário Pro sem sync anterior), sem regressão na suíte
completa (766 passed), lint/type-check/build limpos. Recomendo validação
visual rápida no device na próxima vez que o app for reinstalado pra outro
motivo (não é bloqueante pra fechar este bug).
