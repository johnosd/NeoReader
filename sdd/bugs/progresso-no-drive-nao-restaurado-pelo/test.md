# Bug Verification: Progresso no Drive não é restaurado pelo app

- **Slug**: progresso-no-drive-nao-restaurado-pelo
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Os três critérios de aceitação estão cobertos por testes automatizados com Drive
simulado: posição remota mais recente aplicada antes da abertura, posição local
mais recente vence, e abrir/fechar um livro sem progresso no início não grava
nem publica reinício. Não houve teste com Drive real/dois dispositivos, e build
e suite completa ficaram para o orquestrador — por isso `partial`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | Testes do hook (`restaura o progresso do Drive antes...`, `abrir e fechar no início não grava reinício`) | pass | Reprodução original era estática; equivalente automatizado com serviço mockado no hook e Drive mockado no serviço |
| Testes novos/atualizados | `npx vitest run src/__tests__/hooks/useReaderProgress.test.tsx src/__tests__/services/ProgressDriveSyncService.test.ts` | pass | 8 + 6 |
| Regressão próxima | `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/screens/SettingsSyncScreen.test.tsx src/__tests__/App.test.tsx` | pass | Rodado junto com os testes de settings: 7 arquivos, 175 testes |
| Lint | `npx eslint` nos arquivos alterados | pass | |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | |
| Build / suite completa | `npm run build` / `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Corpus EPUB (`npm run test:debug-epubs`) | — | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |
| Drive real / dois dispositivos | manual | not-run | Sem sessão Drive nem device nesta sessão |

## Output Excerpts

```
Test Files  7 passed (7)
     Tests  175 passed (175)
```

## Residual Risks

- Abertura de livro para usuário Pro com Drive pode esperar até 2,5 s em rede ruim (skeleton).
- Progresso de início gravado com timestamp novo antes desta correção continua "vencendo" o remoto pelo LWW (dano pré-existente).
- Viewers que reportam `fraction` > 0 já no primeiro relocate de um livro sem progresso (ex.: capa fora da contagem) ainda gravariam; não observado, não testado em corpus real.

## Recommendation

Segurar até build + suite completa do orquestrador passarem; depois fechar. Recomendável um teste manual com dois aparelhos e Drive real antes do próximo release.
