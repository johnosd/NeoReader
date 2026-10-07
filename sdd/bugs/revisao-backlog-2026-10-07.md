# Revisão dos bugs do backlog — 2026-10-07

Escopo: todos os 17 bugs de `.planning/backlog.md` (16 no painel e 1 em Ideias Futuras). Revisados relatórios anteriores, caminhos atuais de código e testes. Não houve correção de código nem substituição dos relatórios históricos.

## Resultado

| Classificação atual | Quantidade |
| --- | --- |
| Correção mantida no código, sem regressão identificada nesta revisão | 11 |
| Memória mitigada; resolução do alerta depende de telemetria externa | 1 |
| Correção/mitigação presente, mas validação final continua parcial | 3 |
| Problema ainda presente | 2 |

“Correção mantida” combina código atual, testes rerrodados quando disponíveis e evidência histórica. Não significa que 11 cenários foram repetidos hoje em Android/produção. A suíte passar não prova ausência de bugs sem cobertura, como o EPUB FXL reproduzido abaixo.

## Avaliação individual

| Bug / registro em `sdd/bugs/` | Avaliação atual | Evidência e limite |
| --- | --- | --- |
| `alerta-play-console-uso-memoria-acima` | Mitigado; métrica externa inconclusiva | `MainActivity.onTrimMemory`, `TtsPlaybackService.releaseCoverBitmap/onTrimMemory`, limpeza do cache Word Lens no background, capas lazy e limites de 20 livros continuam presentes. Testes de Home/hooks/Word Lens passaram. O P90/alerta atual do Play Console não foi consultado; não afirmar que ele desapareceu. |
| `bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit` | Mitigado; manter `partial` | `maxWorkers`, `hookTimeout: 20000` e `testTimeout: 10000` presentes. Suíte completa passou em 77,29 s sem timeout. Não foi forçada a carga extrema/intermitente original. |
| `npm-run-androidrun-falha-gradlew-not` | Correção mantida | `package.json` chama `scripts/run-android.ps1`, que executa `gradlew.bat`. Parser PowerShell: 0 erros. Execução/instalação Android não repetida hoje; confirmação ponta a ponta permanece no `test.md` anterior. |
| `tela-sincronizacao-na-nuvem-sem-opcao` | Correção mantida | `needsDriveConnect` ainda inclui `pending-offline` e `permission-error`; testes de SettingsSyncScreen passaram. |
| `reconectar-google-drive-nao-recupera-bookmarks` | Correção mantida | Reconnect ainda usa `db.bookmarks.toArray()` e reagenda todos os bookIds, inclusive sem `syncError`; teste específico permanece e passou na suíte. |
| `vitestconfigts-usa-pooloptions-depreciado-no-vitest` | Corrigido | `poolOptions` ausente; `maxWorkers` no nível correto. Suíte executada sem o warning de depreciação reportado. |
| `bucket-optimization-0-alerta-play-console` | Ainda presente; `held`, low | As duas regras amplas `-keep class com.getcapacitor.** { *; }` e `-keep class com.getcapacitor.community.tts.** { *; }` continuam em `proguard-rules.pro`. Sem sintoma funcional; manter a decisão anterior de adiar. Métrica atual do Play Console não consultada. |
| `app-pedindo-login-google-muita-frequencia` | Correção mantida; fluxo evoluiu | `useCredentialManager: false`, preservação de token e cooldown presentes. Feature 021 acrescentou `renewDriveTokenSilently`, sem UI durante sync, e consentimento residual na abertura/resume do app. Testes de FirebaseAuthService/GoogleDriveAppDataService/triggers passaram. Não confundir esse consentimento residual deliberado com o loop antigo; OAuth real não repetido. |
| `entitlement-pro-oscila-sync-vocabulario-sai` | Sintoma original corrigido | `syncVocabulary` e serviços ativos de sync/restore aguardam `waitForEntitlements`; BillingService e integração de bookmarks passaram. Ressalva: `restoreVocabularyFromDrive` ainda usa `waitForInit`, contrariando uma frase do fix histórico, mas não possui chamador em `src/`; não é evidência de regressão no cold start atual. |
| `bookmark-nao-sincroniza-ao-clicar-no` | Fix mantido; Test agora `partial` | `handleSyncBookmarksTap` reconecta em `permission-error` antes de reagendar. Dois testes específicos rerrodados passaram. Criado `test.md`, antes ausente. Falta Android com token real para fechar a integração. |
| `clique-no-paragrafo-nao-abre-menu` | Correção mantida | `getPhysicalTapPosition` continua calculando posição física; teste da seção de 6.000 px permanece e passou na suíte. |
| `menu-chrome-leitor-some-sozinho-apos` | Correção mantida | `useChromeAutoHide`: hide inicial de 10 s; reabertura manual cancela timer e não agenda outro. Testes do hook/ReaderScreen passaram. |
| `sincronizar-bookmarks-automaticamente-ao-fechar-livro` | Correção mantida | `handleBack` continua chamando `scheduleBookmarkDriveSync` para pendências. Testes de ReaderScreen e triggers de sync passaram; feature 021 acrescentou retry no cold start/resume/online. |
| `highlight-some-ao-tocar-no-mesmo` | Correção mantida | `sectionHasHighlights` continua evitando `surroundContents` ao traduzir. T044/T044b permanecem e passaram na suíte. Confirmação histórica em device está no `test.md`. |
| `sync-bookmarks-nao-acontece-ao-fechar` | Fix antigo substituído pela feature 021; validação real ainda parcial | O guard/toast antigo foi removido deliberadamente. Agora o leitor agenda mesmo com `permission-error`; o serviço renova silenciosamente e só bloqueia quando consentimento é realmente necessário. Testes desse contrato passaram. T015 (revogação real) e T016 (expiração real >1h) da feature 021 continuam pendentes; não fechar como `verified` nesta auditoria. |
| `fallback-silencioso-tts-premium-nativo-android` | Correção mantida | `useTTS` mantém retry/backoff de 429 e separação entre retry e persistir fallback; `ReaderScreen` não persiste nem avisa no fallback silencioso. Testes de useTTS/ReaderScreen passaram. A taxa de 429 em sessão longa/outros providers não foi medida hoje. |
| `epub-layout-fixo-no-abre` (antes em Ideias Futuras) | Ainda existe, reproduzido; high | Check real `epub-fxl.check.js` reprovou e registrou `reader.open.failure` em 8.134 ms. Confirmado em contextos isolados adicionais: páginas carregadas e erro de abertura. Avaliação detalhada em `epub-layout-fixo-no-abre/assessment.md`. |

## Checagens executadas

- `npm test`: 150 arquivos aprovados, 2 ignorados; **1.553 testes aprovados, 2 ignorados**, duração 77,29 s. Avisos de `Window.scrollTo` não implementado no jsdom, sem falha da suíte.
- `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx -t 'toque com status permission-error' --reporter=verbose`: **2 aprovados**, 68 não selecionados pelo filtro.
- `npm run lint`: passou sem erros.
- Parser PowerShell de `scripts/run-android.ps1`: 0 erros.
- Playwright com o harness real e EPUB FXL de 24 páginas: **falhou**, reproduzindo o bug. Tentativa inicial de conexão do navegador integrado indisponível por falha de sandbox Windows; reprodução realizada pela ferramenta Playwright disponível.
- `npm run build`: passou (`tsc -b` + Vite, bundling em 3,17 s); avisos de tamanho de chunk e tempo de plugins, sem erro.
- Android, OAuth real, Play Console e novo build nativo de release: não executados/consultados.

## Prioridade sugerida

1. Corrigir `epub-layout-fixo-no-abre`: impede abrir uma categoria inteira de livros e tem reprodução local determinística.
2. Completar a validação real do ícone de sync e os cenários T015/T016 da feature 021; os testes automatizados já passam.
3. Manter a mitigação de flakiness observada e conferir a métrica de memória no Play Console quando houver acesso/evidência.
4. Manter a otimização R8 em `held`, conforme decisão anterior.

O item de PDF com nitidez após zoom ≥300% não foi contado como bug: o backlog o registra como melhoria aceita pelo dono do produto.

## Atualização após autorização dos fixes — 2026-10-07

O usuário pediu executar `sdd-bugfix` nos dois problemas presentes. O diagnóstico acima é o retrato anterior aos patches; o painel do backlog e os relatórios próprios registram o resultado posterior:

- `epub-layout-fixo-no-abre`: **verified** no navegador. Dois testes de regressão falharam antes do patch e passam depois; 124 testes do EpubViewer aprovados; reprodução original com 24 páginas, 3/3 cenários aprovados e nenhum erro.
- `bucket-optimization-0-alerta-play-console`: removidas as duas regras R8 amplas; resultado local de release/mapping em `bucket-optimization-0-alerta-play-console/test.md`. O smoke no aparelho e a confirmação da métrica do Play Console permanecem pendentes. O usuário optou explicitamente por deixar a validação no aparelho para depois.
- Gates depois dos patches: **1.555 testes aprovados e 2 ignorados**, lint e build de produção aprovados.

Não houve commit nem publicação. Patches mínimos nos arquivos previstos pelos assessments.
