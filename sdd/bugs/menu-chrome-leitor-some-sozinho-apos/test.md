# Bug Verification: Menu de chrome do leitor some sozinho após ~2.5s

- **Slug**: menu-chrome-leitor-some-sozinho-apos
- **Testado**: 2026-09-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma reportado (chrome fechando sozinho ~2.5s depois de reaberto por
toque) foi causado por `useChromeAutoHide` reagendar o timer em toda
reabertura — o teste de regressão adicionado no fix reproduz exatamente
esse cenário (reabre, avança 10s no relógio simulado, chrome continua
visível) e passa. Nenhuma regressão encontrada na suite completa. Único
ponto não coberto é confirmação manual em device real (ver Residual
Risks).

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix, automatizada) | `npx vitest run src/__tests__/hooks/useChromeAutoHide.test.ts` — teste `handleCenterTap ao reabrir o chrome NÃO agenda auto-hide` | pass | Reproduz o cenário exato do relato (reabrir por toque, esperar bem mais que o antigo delay de 2.5s) e confirma que o chrome não some mais sozinho. |
| Testes novos/atualizados | `npx vitest run src/__tests__/hooks/useChromeAutoHide.test.ts` | pass | 7/7. |
| Suite de regressão (reader) | `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` | pass | 34/34, sem regressão nos call sites alterados (Aparência/Marcadores/TOC/Vocabulário/TTS/Imagem). |
| Suite completa | `npm test` (rodada na fase Fix, mesmo estado de código) | pass | 873 passando, 2 skipped pré-existentes. |
| Lint / type-check | `npm run lint` + `npx tsc --noEmit` (fase Fix, mesmo estado de código) | pass | Sem erros. |
| Build de produção | `npm run build` (fase Fix, mesmo estado de código) | pass | Build completo sem erros. |
| Reprodução manual em device real | — | not-run | Não executado nesta rodada — ver Residual Risks. |

## Output Excerpts

```
Test Files  2 passed (2)
     Tests  41 passed (41)
```
(`useChromeAutoHide.test.ts` + `ReaderScreen.test.tsx`, reexecutados nesta
fase Test sobre o código já corrigido — nenhuma mudança de código desde a
verificação da fase Fix.)

## Residual Risks

- Confirmação manual em device real (RXCX103NMVZ) não foi feita —
  recomendado antes de considerar 100% fechado, especialmente pra sentir
  o novo delay de 10s na prática e confirmar que não incomoda na abertura
  de um livro. Listado como Follow-up em `fix.md`.
- Mudança de comportamento é perceptível em qualquer fluxo que hoje conta
  com o chrome sumindo sozinho (ex: usuário que gostava do auto-hide
  depois de abrir TOC/Marcadores) — não há teste de opinião de UX, só de
  comportamento; se incomodar no uso real, é ajuste de produto, não bug.

## Recommendation

Fechar — verificado por teste automatizado que reproduz o sintoma exato
relatado, sem regressão na suite completa, lint, type-check ou build.
Recomendo uma checagem manual rápida no device real na próxima sessão de
uso do leitor pra confirmar a sensação do delay de 10s, mas isso não
bloqueia considerar o bug corrigido.
