# Bug Verification: Highlight some ao tocar no mesmo parágrafo pra abrir tradução

- **Slug**: highlight-some-ao-tocar-no-mesmo
- **Testado**: 2026-09-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Reprodução original (destacar uma palavra, tocar noutra parte da mesma
frase pra traduzir) executada no device real (SM-S911B) com a build da
4ª rodada — o highlight não some mais. Usuário confirmou explicitamente
("agora sim"). Suíte completa, lint, type-check e build seguem limpos.
Fecha o ciclo depois de 4 rodadas de investigação — as 3 primeiras
tentativas (reflow, dedupe por cfi, fila global de serialização)
miravam sintomas correlacionados mas não a causa raiz; a 4ª, encontrada
lendo o código-fonte do `foliate-js` diretamente, resolveu de fato.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — device real | Destacar palavra numa frase, tocar noutra parte da mesma frase pra traduzir | pass | Confirmado pelo usuário no device (SM-S911B) após a 4ª rodada. |
| Testes novos/atualizados | `npx vitest run src/__tests__/components/EpubViewer.test.tsx` | pass | 122/122 — `T044` (com highlights, evita mutação de DOM) e `T044b` (sem highlights, comportamento original preservado) confirmam a causa raiz real. |
| Suite de regressão | `npm test` | pass | 911 passando, 2 skipped pré-existentes — nenhuma regressão. |
| Lint / type-check | `npm run lint && npx tsc --noEmit` | pass | Ambos limpos. |
| Build de produção | `npm run build` | pass | Limpo. |

## Output Excerpts

```
Test Files  112 passed | 2 skipped (114)
     Tests  911 passed | 2 skipped (913)
```

## Residual Risks

- Efeito colateral aceito conscientemente (documentado em `fix.md` →
  Follow-ups): traduzir um parágrafo numa seção que já tem QUALQUER
  highlight perde a precisão de destacar só a frase específica durante a
  tradução (usa o parágrafo inteiro via `.nr-hl` em vez de
  `.nr-hl-sentence`) — troca deliberada de UX por confiabilidade dos
  highlights existentes.
- Não foi testado explicitamente o cenário de MUITOS highlights (10+) na
  mesma seção com tradução simultânea em rajada — o teste manual cobriu
  2-5 highlights, consistente com o que já foi reproduzido nas rodadas
  anteriores.

## Recommendation

Fechar — verificado ponta a ponta no device real, com causa raiz
confirmada no código-fonte do vendor (não só inferida por log) e
cobertura de teste automatizado tanto pro caso COM highlights (usa o
fallback seguro) quanto SEM highlights (preserva o comportamento
original).
