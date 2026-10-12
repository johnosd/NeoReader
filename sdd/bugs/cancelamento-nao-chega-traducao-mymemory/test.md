# Bug Verification: Cancelamento não chega à tradução MyMemory

- **Slug**: cancelamento-nao-chega-traducao-mymemory
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O cenário R10 (sinal já abortado, provider MyMemory) não reproduz mais, e os caminhos relacionados ficaram travados por teste: abort em andamento, premium, backoff do retry e parágrafo dividido. Os testes dos chamadores, o tsc e o eslint passam. O resultado é `partial`, e não `verified`, porque o build e a suite completa ainda não rodaram (o orquestrador vai rodar) e porque a probe original não foi executada como arquivo.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix), probe original | `npx vitest run reports/code-review-2026-10-10/translation.probe.ts -t R10` | pass | Rodado pelo orquestrador com `--config reports/code-review-2026-10-10/vitest.review.config.ts`: o probe (que afirma o defeito) agora falha, ou seja, o sintoma não reproduz |
| Reprodução equivalente | `TranslationService.test.ts::MyMemory com signal já abortado não despacha a requisição` | pass | `fetch` não é chamado e a chamada rejeita com AbortError |
| Testes novos (9) | `npx vitest run src/__tests__/services/http.test.ts src/__tests__/services/TranslationService.test.ts` | pass | Na fase Fix, os 8 testes de abort falharam com o código de HEAD, o que confirma que travam o bug |
| Regressão dos chamadores | `npx vitest run` em http, TranslationService, AuthorService, DeepL, GoogleDriveAppData, GoogleTranslate, NytBooks, OpenAiTranslation, TranslatedAudiobook, TranslationProviderRegistry e `bookInfo/` | pass | 16 arquivos, 182 testes |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` | pass | Sem saída |
| Lint (arquivos alterados) | `npx eslint` nos 4 arquivos | pass | |
| Build / suite completa / lint global | `npm run build`, `npm test`, `npm run lint` | pass | Rodado pelo orquestrador em 2026-10-12 com todos os fixes P2 juntos: lint ok; 155 arquivos e 1.633 testes passaram (2 ignorados); build ok; test:debug-epubs 71/71 |

## Output Excerpts

```
Test Files  16 passed (16)
     Tests  182 passed (182)
TSC=0
ESLINT=0
```

## Residual Risks

- Não foi validado em device nem no WebView Android. A composição usa só `addEventListener`/`AbortController.abort(reason)`, sem `AbortSignal.any`.
- Um cache hit encontrado depois que o sinal aborta, durante o `await` do cache, ainda resolve. Isso é inofensivo, porque a UI descarta o resultado.

## Recommendation

Segurar o fechamento até o orquestrador rodar o build e a suite completa. Se passarem, fechar.
