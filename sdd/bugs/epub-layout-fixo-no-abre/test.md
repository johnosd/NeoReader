# Bug Verification: EPUB de layout fixo não abre

- **Slug**: epub-layout-fixo-no-abre
- **Testado**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A reprodução original foi executada depois do fix no navegador com o mesmo EPUB FXL de 24 páginas: abertura, rolagem até o fim e retorno ao início passaram, com conteúdo visível e sem o timeout. Os testes novos demonstram a falha antes da alteração e passam depois; regressão completa, lint e build de produção passaram.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução original | `scripts/verificacao-visual/epub-fxl.check.js` via Playwright, harness real | pass | Rerrodado na fase Test: 3/3 cenários, nenhum erro no console. Contexto isolado, viewport 412 × 915, deviceScaleFactor 3. |
| Regressões novas e do leitor | `npx vitest run src/__tests__/components/EpubViewer.test.tsx` | pass | 124 testes aprovados; os dois novos tinham falhado antes do patch. Inclui o watchdog para ausência de seção utilizável, EPUB reflowable, highlights, tradução e TTS. |
| Suíte completa | `npm test` | pass | 150 arquivos aprovados, 2 ignorados; 1.555 testes aprovados, 2 ignorados, 94,25 s. |
| Lint | `npm run lint` | pass | Sem erros. |
| Type-check e bundle de produção | `npm run build` | pass | `tsc -b` e Vite; bundling 3,15 s. Warnings de tamanho de chunk e tempo de plugins. |
| Android | — | skipped | Usuário optou por validação local e pediu deixar o teste no aparelho pendente. |

## Output Excerpts

```text
abertura: páginas 1/2, iframes vivos 3, tinta 21,8%
fim: páginas 23/24, iframes vivos 8, tinta 21,4%
retorno ao início: páginas 1/2, iframes vivos 8, tinta 21,3%
summary: 3/3 aprovados; errors: []
```

## Residual Risks

- Verificado em Chromium desktop com emulação mobile; WebView Android não foi exercitado nesta sessão. O veredito cobre a reprodução local original e os gates executados.
- O fixture é sintético; quadrinhos/livros ilustrados reais podem ter particularidades de estilos e viewport que não estão neste arquivo.
- A suíte emite avisos conhecidos de `Window.scrollTo` ausente no jsdom, sem falha de testes.

## Recommendation

Fechar o bug de abertura: sintoma original não reproduz mais no navegador, com teste automatizado e reprodução real aprovados. Smoke Android permanece como cobertura adicional autorizada para depois.
