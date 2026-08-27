# Bug Fix: Timeouts flaky no Vitest sob carga (hookTimeout/testTimeout)

<!--
  Preenchido pela fase Fix do sdd-bugfix — a ÚNICA fase que edita
  código-fonte. Nunca edite assessment.md; qualquer desvio do que ele previu
  vai em "Deviations from Assessment" abaixo, não como reescrita silenciosa.
-->

- **Slug**: bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit
- **Corrigido**: 2026-08-27
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`vitest.config.ts` limita o paralelismo (`maxThreads` = metade dos cores lógicos, calculado dinamicamente) e sobe `hookTimeout`/`testTimeout` para reduzir a contenção entre workers que causava timeouts flaky em testes com setup pesado, sem tocar nos arquivos de teste afetados.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `vitest.config.ts` | modified | Adiciona `poolOptions.threads.maxThreads: Math.max(2, Math.floor(os.cpus().length / 2))`, `hookTimeout: 20000` e `testTimeout: 10000` (defaults eram 10000/5000). O cálculo dinâmico via `os.cpus().length` evita hardcodar pro nº de cores desta máquina de dev, funcionando em qualquer host que rode a suíte. |

## Tests Added or Updated

- Nenhum teste novo — conforme previsto no assessment, a mudança é de configuração de execução, não de lógica de teste.

## Local Verification

- Comando rodado: `npm run build` → passou sem erros.
- Comando rodado: `npm test` (suíte completa, `vitest run`) → **74 arquivos passaram, 2 skipped (76 total); 585 testes passaram, 2 skipped (587 total); 0 falhas.** Duração 256.59s — mais lenta que antes da mudança (trade-off esperado e documentado no assessment: menos paralelismo = wall-time maior).
- Checagem manual: nenhum timeout em `BookmarkDriveSyncIntegration.test.ts`, `SettingsScreen.test.tsx` ou `BookDetailsScreen.test.tsx` nesta rodada completa.

## Deviations from Assessment

Nenhuma. Segui a remediação preferida do assessment (limitar `maxThreads` + aumentar timeouts, só em `vitest.config.ts`), sem precisar tocar nos 3 arquivos de teste citados.

## Follow-ups

- Como o sintoma original é intermitente (só aparece sob carga total), uma única rodada limpa não prova ausência definitiva de flakiness — a fase Test deve considerar isso ao julgar o veredito (não superestimar pra `verified` com base em uma corrida só, dado o histórico de intermitência).
