# Bug Verification: Menu do EPUB fixo sem estilos do leitor

- **Slug**: menu-epub-fixo-sem-estilos-leitor
- **Testado**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O problema visual foi corrigido e confirmado no navegador e no S23: cartão e botões seguem o mesmo CSS do leitor, com a página original preservada. A verificação geral permanece partial por avisos de sandbox no teste de marcador do navegador, cuja causa específica não foi isolada; eles não impediram a persistência do marcador.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Regressão antes do patch | Vitest, `aplica o design do menu` | fail | Style ausente |
| Regressão depois do patch | `node node_modules/vitest/vitest.mjs run src/__tests__/components/EpubViewer.test.tsx` | pass | 128 testes; tema, páginas posteriores, XHTML e ausência de overrides globais |
| Renderer real | `epub-fxl.check.js` via Playwright | partial | 5/5 cenários visuais/funcionais passam; guard de console sinaliza seis avisos de sandbox |
| Inspeção visual | Captura do painel no navegador | pass | Cartão e quatro ações, ícones proporcionais e labels legíveis |
| Suite completa | `npm test` | pass | 1559 passaram, 2 skipped preexistentes |
| Lint | `npm run lint` | pass | Sem erros |
| Tipos/bundle | `npm run build` | pass | Avisos de tamanho/PDF.js preexistentes |
| Build Android | `cap sync android`; `gradlew.bat --offline -p android assembleRelease` | pass | BUILD SUCCESSFUL, 30 segundos |
| Instalação | Cópia do release assinada com debug compatível; `adb install -r` | pass | 1.0.19/code 23, R8, sem DEBUGGABLE; dados preservados |
| Device QA | S23 RXCX103NMVZ → Resume → Continue reading → página 11 → toque (540,1170) | pass | Menu estilizado observado em captura; marcador existente permaneceu (1 bookmark) |
| Logs Android | Collect/analyze, PID 23244 | partial | 1176 linhas; um aviso Chromium “Seed missing signature” na abertura; nenhum crash observado |
| Restauração | `android_device_qa.py restore` | pass | Wi-Fi=1, dados=1, stay-awake=15, mismatches vazio |

## Output Excerpts

Estilos computados: radius `18px`, fonte `Inter, system-ui`, ações `grid`, tile `40px`, ícone `17px`. Conteúdo original: fonte `28px`, fundo `rgb(255, 255, 255)`. Marcador no harness isolado persistiu: `count=1`.

APK release original SHA256: `a6de47616311bbb29b2d7118bc2424180e2c4cf6b1641cec22a3027743734932`.

## Residual Risks

- Console do navegador registra bloqueios de script pelo sandbox durante o fluxo de marcador; o checker continua mostrando a ressalva. Captura omitida e animações desativadas somente no diagnóstico não eliminaram os avisos. A proteção allow-same-origin, sem allow-scripts, foi preservada.
- No Android, o aviso de seed pertence à inicialização do Chromium; não foi correlacionado com falha do menu. O classificador não prova ausência de todos os erros.
- “Translation failed.” continua aparecendo para este livro de teste no aparelho; falha já registrada no bug anterior, fora do escopo visual.
- Mudança de tema foi testada automaticamente; o S23 foi inspecionado no tema já escolhido pelo usuário, sem modificar suas preferências.
- Capturas e logs privados temporários são removidos após síntese. O servidor local foi encerrado.

## Recommendation

O visual solicitado está corrigido e instalado, mantendo o fluxo funcional. Conservar status partial até esclarecer os avisos do sandbox; não reabrir a implementação visual sem nova evidência de falha.
