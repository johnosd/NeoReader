# Bug Verification: Timeouts flaky no Vitest sob carga (hookTimeout/testTimeout)

<!--
  Preenchido pela fase Test do sdd-bugfix — read-only, nunca edita código.
  Nunca marque "verified" se a reprodução não foi de fato executada; use
  "partial"/"not-run" e diga isso explicitamente. Superestimar aqui é pior
  que não verificar.
-->

- **Slug**: bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit
- **Testado**: 2026-08-27
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Duas rodadas independentes de `npm test` completo desde o fix (uma na fase Fix, outra agora na fase Test) passaram sem nenhum timeout nos 3 arquivos citados no bug nem em qualquer outro arquivo. Isso é evidência favorável forte, mas o sintoma original é **intermitente por natureza** (só aparecia sob carga total da máquina) — duas corridas limpas reduzem a probabilidade do problema, mas não provam ausência definitiva, então o veredito fica em `partial` em vez de `verified`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — rodada 1 | `npm test` (fase Fix) | pass | 585 testes passaram, 2 skipped, 0 falhas, 256.59s. Sem timeout em `BookmarkDriveSyncIntegration`, `SettingsScreen` ou `BookDetailsScreen`. |
| Reprodução (pós-fix) — rodada 2 (independente, fase Test) | `npm test` | pass | 585 testes passaram, 2 skipped, 0 falhas, 276.03s. Mesmo resultado — nenhum timeout. |
| Testes novos/atualizados | — | not-run | Nenhum teste foi adicionado (mudança é de configuração, conforme assessment). |
| Suite de regressão | `npm test` (acima, ambas rodadas) | pass | Nenhuma regressão nos outros 583 testes/74 arquivos. |
| Lint | `npm run lint` | pass | Sem erros nem warnings. |
| Build | `npm run build` (rodado durante a fase Fix, `vitest.config.ts` não afeta o bundle de produção) | pass | `tsc -b && vite build` completo sem erros. |

## Output Excerpts

```
> npm test (rodada 1, fase Fix)
 Test Files  74 passed | 2 skipped (76)
      Tests  585 passed | 2 skipped (587)
   Duration  256.59s

> npm test (rodada 2, fase Test)
 Test Files  74 passed | 2 skipped (76)
      Tests  585 passed | 2 skipped (587)
   Duration  276.03s
```

## Residual Risks

- O sintoma original só aparecia "sob carga total" da máquina — as duas rodadas de validação não forçaram contenção artificial (ex.: rodar outros processos pesados em paralelo), então não replicam o pior caso relatado no report original. Não há como garantir 100% que o timeout nunca mais vai ocorrer, só que ficou significativamente menos provável (menos workers competindo + timeouts maiores como rede de segurança).
- O wall-time da suíte completa subiu de forma consistente (~256-276s vs. o que era antes, não medido diretamente, mas o assessment já previa esse trade-off) — aceito conforme decisão da fase Fix, mas vale monitorar se cresce a ponto de incomodar o fluxo de dev.
- Se a flakiness reaparecer no futuro em outro arquivo com padrão de setup pesado (mesmo padrão de `SettingsScreen`/`BookDetailsScreen`), o playbook agora é claro: primeiro suspeitar de contenção do Vitest, não do teste em si.

## Recommendation

Segurar — duas rodadas limpas consecutivas dão razoável confiança de que o fix reduz a contenção, mas por ser um bug de intermitência sob carga, uma verificação padrão não pode confirmar `verified` com certeza. Recomendo considerar o bug resolvido na prática (fechar) se o usuário concordar que a evidência das duas rodadas é suficiente; caso prefira mais rigor, rodar `npm test` mais algumas vezes (idealmente com a máquina sob alguma carga concorrente) antes de fechar definitivamente.
