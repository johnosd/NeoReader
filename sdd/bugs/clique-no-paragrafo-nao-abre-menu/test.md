# Bug Verification: Clique no parágrafo não abre o menu contextual perto do início/fim do capítulo

- **Slug**: clique-no-paragrafo-nao-abre-menu
- **Testado**: 2026-09-09
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma original não reproduz mais no cenário exato pedido pelo usuário
(livro "Como fazer amigos e influenciar pessoas", capítulo "Pingo de mel",
último parágrafo perto do fim de uma seção bem mais alta que a tela). O fix
se manteve estável em `npm run dev` (`npm run build` já tinha confirmado o
bundle de produção antes). Uma tentativa de reprodução inicial pareceu
"ainda travada", mas era um acerto acidental na borda FÍSICA real da tela
(857px de uma janela de 861px) — comportamento correto e intencional
("toque na margem alterna o chrome"), não uma regressão; refeito com o
scroll ajustado, o clique no mesmo parágrafo abriu a tradução normalmente.
Nenhuma regressão encontrada nos 873 testes da suite completa.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — cenário exato do usuário | Playwright: abrir livro via `npm run dev`, TOC → "CAPÍTULO 4 Pingo de mel", rolar até o último parágrafo ("Comece de maneira amigável."), clicar nele | pass | `reader.contextMenu.open` disparou (screenshot confirma o painel de tradução abrindo); nenhum `reader.tap.ignored reason=chrome-zone` para esse clique |
| Regressão do comportamento intencional na borda física | Mesmo parágrafo, clique a 857px de uma janela de 861px (borda física real) | pass | Corretamente ainda cai em `chrome-zone` — confirma que a correção não removeu o toggle de chrome nas bordas físicas de verdade, só corrigiu a métrica errada |
| Testes novos/atualizados | `npx vitest run src/__tests__/components/EpubViewer.test.tsx` | pass | 102/102 (101 preexistentes + 1 novo, incluindo o caso que reproduz o bug) |
| Suite de regressão completa | `npm test` | pass | 873 passaram, 2 skipped (preexistentes, não relacionados) |
| Lint / type-check | `npx tsc --noEmit` e `npm run lint` | pass | Sem erros em nenhum dos dois |
| Build de produção | `npm run build` | pass | Concluído sem erros (warnings de chunk size preexistentes, não relacionados) |

## Output Excerpts

Reprodução pós-fix (clique físico no meio da tela, Y=397 de 861px, parágrafo
estruturalmente perto do fim de uma seção de 6883px):
```
reader.selection.start sectionIndex=22 paragraphIndex=48
reader.contextMenu.open sectionIndex=22 paragraphIndex=48 translationId="1"
reader.translation.panel.open state="loading"
```
("Translation failed" apareceu na UI depois — falha da chamada de rede real
pra MyMemory nesse ambiente, não relacionada ao bug; o painel abriu
normalmente, que é o que este bug cobre.)

Controle — mesmo parágrafo, clique na borda física real (Y=857 de 861px):
```
reader.tap.ignored reason="chrome-zone" zone="visible"
```
(esperado e correto — não é regressão.)

Suites automatizadas:
```
EpubViewer.test.tsx: Test Files 1 passed | Tests 102 passed
npm test (completa): Test Files 112 passed | 2 skipped (114); Tests 873 passed | 2 skipped (875)
tsc --noEmit: exit 0
eslint .: exit 0
vite build: ✓ built in 8.21s
```

## Residual Risks

- Não testado em device Android real pós-fix (a fase Assess já tinha achado
  o device difícil de automatizar via `adb input` para este tipo de
  reprodução — ver `assessment.md`). O mecanismo corrigido usa
  `doc.defaultView.frameElement` e o shadow DOM do renderer, ambos
  disponíveis em WebView Android (mesmo motor Chromium), então o risco é
  baixo, mas não foi confirmado visualmente no device.
- Não testado com fonte/tema mudando em tempo real durante leitura (o efeito
  que recria os iframes só roda em `[fontSize, fontFamily, ...]`, fora do
  escopo direto deste bug).

## Recommendation

Fechar — verificado ponta a ponta no cenário exato relatado pelo usuário
(reprodução ao vivo + suíte automatizada + build de produção), sem
regressão no comportamento intencional das bordas físicas da tela.

**Confirmação final do usuário (2026-09-09)**: build debug instalado no
device real (`RXCX103NMVZ`, `com.johnny.neoreader`) via
`npm run build` → `npx cap sync android` → `gradlew.bat assembleDebug` →
`adb install -r`. Usuário testou manualmente no device e confirmou:
"funcionou, pode fechar o bug". Bug encerrado.
