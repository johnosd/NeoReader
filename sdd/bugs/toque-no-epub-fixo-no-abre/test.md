# Bug Verification: Toque no EPUB fixo não abre menu contextual

- **Slug**: toque-no-epub-fixo-no-abre
- **Testado**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O toque central abriu o painel com Bookmark no renderer real do navegador e no release minificado instalado no Samsung S23. No navegador isolado, o clique criou um marcador no IndexedDB e ele permaneceu após reabrir o livro.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução antes do fix | Clique físico em (206, 450), viewport 412 × 915 | fail | chrome-zone falsa; após converter coordenadas, foi revelado erro XML do painel |
| Regressão de toque/XHTML | `node node_modules/vitest/vitest.mjs run src/__tests__/components/EpubViewer.test.tsx` | pass | 127 testes; centro, bordas e marcação válida em XHTML |
| Renderer real | `scripts/verificacao-visual/epub-fxl.check.js` via Playwright | pass | 4/4: abertura, fim, retorno, toque e marcador persistido; zero erros de console |
| Suite completa | `npm test` | pass | 1558 passaram; 2 skipped preexistentes |
| Lint | `npm run lint` | pass | Sem erros |
| Tipos e bundle | `npm run build` | pass | Avisos de tamanho de chunk e PDF.js preexistentes |
| Android | `cap sync android` e `gradlew.bat --offline -p android assembleRelease` | pass | Release minificado, 1.0.19 / versionCode 23 |
| Instalação | Cópia do release com assinatura debug compatível; `adb install -r` | pass | Dados preservados, APK instalado sem DEBUGGABLE |
| Reprodução Android | Home → Resume → Continue reading → toque em (540, 1170), página 9 do livro sintético | pass | Painel com Next, Listen, Bookmark e Save visível; nenhuma criação de marcador no aparelho |
| Logs Android | Collect/analyze após reprodução | pass | PID 424; 1100 linhas; zero achados no classificador, sem crash observado |
| Restauração | `android_device_qa.py restore` | pass | Wi-Fi=1, dados=1, stay-awake=15; mismatches vazio |

## Output Excerpts

Antes: `reader.tap.ignored`, `reason=chrome-zone`, `zone=visible`.

Depois: `4/4 aprovados`; marcador persistido: `count=1`; `BUILD SUCCESSFUL in 27s`.

APK release original SHA256: `d87c34bcc992732faa99b8b4a5348cc8f24ce3338a31e121390e5994c1d1a9b3`.

## Residual Risks

- Android cobriu abertura do menu; criação/persistência foi exercitada no navegador isolado para não adicionar marcadores ao aparelho do usuário.
- No Android, a tradução real exibiu “Translation failed.”. O menu e a ação de marcador permaneceram disponíveis; a causa do erro do provedor não foi investigada neste bug. O teste automatizado usa resposta controlada de tradução.
- O FXL mantém a aparência original do documento, com botões nativos sem o tema do painel dos EPUBs comuns; não houve alteração visual neste fix.
- Assinatura debug compatível valida R8, mas não substitui testes de integrações que dependem do certificado de produção.
- Capturas, dumps e logs brutos temporários são removidos após síntese; não foram publicados dados de conta nem texto pessoal.

## Recommendation

Fechar o bug de abertura do menu: reprodução executada e corrigida no navegador e no Android. Repetir manualmente Bookmark → fechar/reabrir no aparelho; avaliar o erro de tradução separadamente se persistir.
