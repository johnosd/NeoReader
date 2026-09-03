# Bug Verification: `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4

<!--
  Preenchido pela fase Test do sdd-bugfix — read-only, nunca edita código.
  Nunca marque "verified" se a reprodução não foi de fato executada; use
  "partial"/"not-run" e diga isso explicitamente. Superestimar aqui é pior
  que não verificar.
-->

- **Slug**: vitestconfigts-usa-pooloptions-depreciado-no-vitest
- **Testado**: 2026-09-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O warning `DEPRECATED 'test.poolOptions' was removed in Vitest 4` não aparece mais em `npm test`. Suíte completa, lint e build de produção rodados de forma independente (não reaproveitando output da fase Fix) confirmam ausência de regressão.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npm test` | pass | Bloco `DEPRECATED` ausente do output; antes do fix aparecia sempre no topo. |
| Testes novos/atualizados | — | n/a | Nenhum teste novo previsto (mudança é config de tooling, sem comportamento a travar). |
| Suite de regressão | `npm test` | pass | 106 arquivos / 775 testes passaram, 2 skipped — mesma contagem de antes do fix. |
| Lint / type-check | `npm run lint` | pass | Sem output (ESLint limpo). |
| Build de produção | `npm run build` | pass | `tsc -b` + build Vite concluíram sem erro; únicos warnings são pré-existentes (chunk size, plugin timings), sem relação com a mudança. |

## Output Excerpts

```
> neoreader@0.0.0 test
> vitest run

 RUN  v4.1.4 C:/Users/johns/Documents/Projetos/NeoReader/NeoReader

 Test Files  106 passed | 2 skipped (108)
      Tests  775 passed | 2 skipped (777)
```

(sem bloco `DEPRECATED` antes do `RUN`, diferente do output pré-fix)

## Residual Risks

- `test:watch` (`vitest` sem `run`) não foi verificado interativamente — usa o mesmo `vitest.config.ts`, então o comportamento deve ser idêntico, mas não foi rodado nesta fase.

## Recommendation

Fechar — verificado ponta a ponta. Warning de depreciação eliminado, suíte de testes, lint e build de produção passam sem regressão.
