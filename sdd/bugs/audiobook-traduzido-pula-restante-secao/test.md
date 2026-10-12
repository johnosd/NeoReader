# Bug Verification: Audiobook traduzido pula o restante da seção

- **Slug**: audiobook-traduzido-pula-restante-secao
- **Testado**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

A reprodução automatizada (hooks reais `useTranslatedAudiobook` + `useTTS`, a
mesma montagem do probe R09) não reproduz mais o bug: a fala espera a tradução
pendente, retoma no parágrafo seguinte e só então chama `onFinished`. Os
cenários de cancelamento e de erro do produtor também passam, e as suítes de
TTS/ReaderScreen continuam verdes. O resultado é `partial` só porque o build e a
suíte completa, de propósito, não foram rodados aqui, e o QA em device também
não foi feito.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) | `npx vitest run src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx` (cenário R09 com expectativa invertida) | pass | Fala 'Primeiro.' e depois 'Segundo.'; `onFinished` 1x só no fim real. |
| Teste falha sem o fix | Cópia temporária do teste sem ligar `waitForMoreChunks` (fase Fix) | pass (5/6 falham como esperado) | Mostra que o teste pega o bug. |
| Testes novos/atualizados | mesmo arquivo: stop, pause, erro do produtor, cancel e fim real durante a espera | pass | 6/6 |
| Suíte de regressão relevante | `npx vitest run` com useTTS, useTranslatedAudiobookPlayback, ReaderScreen, useTtsSleepTimer e TranslatedAudiobookService | pass | 5 arquivos, 171 testes |
| Lint / type-check | `npx tsc -p tsconfig.app.json --noEmit`; `npx eslint` nos 4 arquivos alterados | pass | exit 0 em ambos |
| Build + suíte completa | `npm run build`, `npm test` | pass | Rodado pelo orquestrador em 2026-10-12 com R01+R03+R09+R07 juntos: lint ok; 152 arquivos e 1.582 testes passaram (2 ignorados); build ok |
| QA em device | Leitura traduzida com rede lenta no Android | not-run | Sem device/rede lenta controlada nesta sessão. |

## Output Excerpts

```
Test Files  5 passed (5)
     Tests  171 passed (171)
tsc exit: 0
eslint exit: 0
```

## Residual Risks

- O jsdom não exercita o `TextToSpeech` nativo real nem o `<audio>` premium; o comportamento de pausa/stop durante a espera no Android precisa de QA.
- Retomar após pausar durante a espera, se a tradução ainda não chegou, repete a última frase já falada antes de voltar a esperar (detalhes em fix.md, Follow-ups).
- O probe `reports/code-review-2026-10-10/tts.probe.tsx` (R09) não liga a opção nova, então continua "confirmando" o comportamento antigo; ele não serve de critério depois do fix.

## Recommendation

Segurar o fechamento definitivo até o orquestrador rodar `npm run build` e
`npm test` completos e até um QA rápido em device (leitura traduzida com rede
lenta em capítulo de diálogos curtos, incluindo pausa e stop durante a espera).
Se os dois passarem, pode fechar.
