# Plano: Importar EPUB Pelo "Abrir Com" Do Android

## Metadados

- Feature: NeoReader como app de abertura para arquivos EPUB no Android.
- Data: 2026-07-09.
- Status geral: In progress.
- Contexto de autoria: plano criado com a skill `plan-feature` a partir da duvida sobre aparecer na lista de apps ao abrir um EPUB baixado no Android.
- Escopo alvo: Android via Capacitor.

## Objetivo

Permitir que o NeoReader apareca na lista de apps do Android ao tocar em um arquivo `.epub` baixado ou selecionado em outro app, importe o livro usando o fluxo nativo ja existente e abra o leitor apos a importacao bem-sucedida.

## Nao objetivos

- Nao implementar suporte iOS.
- Nao alterar o fluxo web de upload de EPUB.
- Nao mudar a regra de duplicidade nesta primeira versao: se o livro ja existe, mostrar a mensagem atual de duplicado.
- Nao implementar `ACTION_SEND` na primeira entrega, salvo se a decisao de produto mudar antes da implementacao.
- Nao adicionar suporte a outros formatos alem de EPUB.

## Explicacoes Das Decisoes Pendentes

### `ACTION_VIEW` vs `ACTION_SEND`

- `ACTION_VIEW` e o fluxo de "Abrir com". Ele e acionado quando o usuario toca em um EPUB e escolhe um app para abrir o arquivo. E o caso descrito na solicitacao original.
- `ACTION_SEND` e o fluxo de "Compartilhar". Ele aparece em share sheets e em acoes como "Enviar para". Isso aumenta os pontos de entrada, mas tambem exige tratar payloads diferentes (`EXTRA_STREAM`) e pode fazer o NeoReader aparecer em contextos menos claros.
- Decisao recomendada para esta feature: implementar apenas `ACTION_VIEW` no primeiro escopo. `ACTION_SEND` fica como fase futura se houver demanda real.

### MIME estrito vs fallbacks

- O MIME correto de EPUB e `application/epub+zip`. Se o filtro aceitar apenas esse MIME, o NeoReader aparece somente quando o app de origem informa o tipo corretamente.
- Alguns gerenciadores de arquivo, navegadores ou downloads podem informar EPUB como `application/octet-stream` ou `application/zip`. Se o NeoReader tambem aceitar esses fallbacks, ele aparece em mais casos, mas pode aparecer para arquivos binarios ou ZIPs que nao sao EPUB.
- A mitigacao obrigatoria, se houver fallback, e validar no app: nome `.epub` quando disponivel e estrutura EPUB real durante `prepareLocalEpubImport`.
- Decisao recomendada para a primeira implementacao: comecar com `application/epub+zip`; adicionar `application/octet-stream` como fallback somente se o QA em device mostrar que EPUB baixado nao aparece no seletor. Nao usar `*/*`.

## Decisoes Ja Tomadas

- A feature e Android apenas.
- O usuario precisa estar logado para importar e abrir o livro.
- Se o arquivo recebido ja existir, mostrar "Este livro ja esta na biblioteca." ou mensagem equivalente ja existente.
- Apos importacao bem-sucedida, assumir o comportamento original desejado: abrir o livro no leitor.
- Usar o fluxo nativo existente de copia para arquivo local privado, metadados, hash e dedupe.

## Assumptions

- "Ja importado" na resposta do item 2 foi interpretado como "depois que importar com sucesso, abrir o livro". Se a intencao era apenas importar sem abrir, ajustar antes da implementacao.
- O login atual continua sendo obrigatorio para acessar biblioteca/leitor.
- Um erro de permissao ao consumir o `content://` apos login deve ser tratado com mensagem para reabrir o arquivo, a menos que a implementacao adicione staging nativo antes do login.

## Perguntas Abertas

- Confirmar se o primeiro escopo deve ficar em `ACTION_VIEW` apenas ou tambem incluir `ACTION_SEND`.
- Confirmar apos teste em aparelho real se `application/epub+zip` basta para EPUBs baixados no app alvo, ou se precisa de `application/octet-stream`.
- Decidir se vale implementar staging nativo pre-login ja na primeira versao para reduzir risco de perda da permissao temporaria do `content://`.

## Estado Atual

Arquivos relevantes:

- `android/app/src/main/AndroidManifest.xml`: hoje declara apenas launcher em `MainActivity`; nao ha `intent-filter` para EPUB.
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`: registra `NeoReaderLibraryPlugin`; usa `launchMode="singleTask"` no manifest, entao novos intents devem ser tratados em `onNewIntent`.
- `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`: ja possui selecao nativa de arquivo, leitura/copia por `Uri`, `prepareLocalEpubImport`, `consumePendingFileSelection` e `buildFileMetadata(Uri)`.
- `src/services/NativeLibraryImportService.ts`: interface JS do plugin nativo; consome arquivo pendente e prepara importacao local.
- `src/services/BookImportService.ts`: `importNativeEpub` ja copia para arquivo local privado, extrai metadados, detecta duplicado, salva registro e retorna `bookId`.
- `src/screens/HomeScreen.tsx` e `src/screens/LibraryScreen.tsx`: importam arquivos nativos selecionados pelo usuario, mas nao abrem automaticamente o leitor apos importacao.
- `src/App.tsx`: controla navegacao local; `openReader(book)` ja abre a rota `reader`.
- `src/db/books.ts`: tem `getAllBooks`, `addBook`, `updateLastOpened`, mas nao exporta helper simples `getBookById`.
- Testes existentes em `src/__tests__/services/BookImportService.test.ts`, `src/__tests__/services/NativeLibraryImportService.test.ts`, `src/__tests__/screens/HomeScreen.test.tsx` e `src/__tests__/App.test.tsx`.

## Arquitetura Proposta

### Fluxo principal

1. Android recebe `Intent.ACTION_VIEW` com um EPUB.
2. Codigo nativo valida action, scheme, MIME e/ou extensao quando disponivel.
3. Codigo nativo extrai metadados minimos do `Uri`: `name`, `uri`, `path`, `size`.
4. Codigo nativo salva esse payload como "external open intent" pendente, separado da selecao manual de arquivo.
5. JS consome o intent pendente por novo metodo do plugin, por exemplo `consumePendingExternalEpubIntent`.
6. Se o usuario nao estiver logado, o app mantem o fluxo de login e so tenta importar quando estiver `signed-in`.
7. App chama `BookImportService.importNativeEpub(nativeFile, { importSource: 'local' })`.
8. Ao receber `bookId`, app busca o livro e navega para `reader`.
9. Se `importNativeEpub` falhar por duplicidade, exibe mensagem de erro e permanece na tela atual.

### Separacao de payloads pendentes

Nao reutilizar `PENDING_FILE_RESULT_KEY` para o fluxo externo. Esse key hoje serve ao seletor nativo chamado pela UI. Reutilizar o mesmo canal criaria risco de Home/Library consumirem o arquivo externo antes do coordenador raiz conseguir abrir o leitor.

Criar um canal novo no plugin:

- `PENDING_EXTERNAL_EPUB_INTENT_KEY`
- Metodo nativo: `consumePendingExternalEpubIntent`
- Metodo TS: `consumePendingExternalEpubIntent(): Promise<NativeFolderFile | null>`

### Tratamento de login

Comportamento inicial recomendado:

- Se o app abrir via EPUB e o usuario nao estiver autenticado, manter Login/Welcome como hoje.
- Depois de `auth.state.status === 'signed-in'`, consumir o intent pendente e importar.
- Se a leitura do `content://` falhar por permissao expirada, exibir mensagem curta: pedir para abrir o arquivo novamente.

Hardening opcional:

- Ao receber o intent no nativo, copiar imediatamente para `files/import-tmp` e salvar um `file://` temporario como pendente. Isso preserva o arquivo mesmo se o login passar por redirect/background. E mais robusto, mas aumenta o escopo nativo.

## Plano Por Fases

## Fase 1: Intent Filter E Captura Nativa

Status: Done.

Proposito:

Fazer o Android reconhecer o NeoReader como app que pode abrir EPUB e persistir o arquivo recebido para consumo pelo JS.

Arquivos/areas provaveis:

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`
- `android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java`
- Possivel helper novo em `android/app/src/main/java/com/johnny/neoreader/`

Checklist de implementacao:

- [x] Adicionar `intent-filter` para `android.intent.action.VIEW`.
- [x] Incluir `android.intent.category.DEFAULT`.
- [x] Aceitar `application/epub+zip` para `content` e, se necessario, `file`.
- [x] Nao adicionar `ACTION_SEND` nesta fase.
- [x] Implementar captura em `onCreate` e `onNewIntent`, respeitando `launchMode="singleTask"`.
- [x] Validar que o `Intent` possui `data` ou payload equivalente.
- [x] Extrair `name`, `uri`, `path`, `size` com log diagnostico sem registrar conteudo sensivel.
- [x] Salvar payload em uma chave pendente especifica para intent externo.
- [x] Tentar `takePersistableUriPermission` apenas quando a flag persistable existir; aceitar fallback de permissao temporaria.
- [x] Garantir que intents nao EPUB sejam ignorados ou resultem em erro controlado.

Testes:

- [x] Adicionar teste nativo se houver infraestrutura viavel; caso contrario registrar que a validacao nativa sera manual/adb.
- [ ] Verificar com `adb shell cmd package query-intent-activities -a android.intent.action.VIEW -t application/epub+zip` que o NeoReader aparece.
- [ ] Validar manualmente abrindo um EPUB pelo app Files/Downloads.
- [ ] Validar que tocar no icone normal ainda abre o app pela home.

Evidencia 2026-07-09:

- Implementado `ExternalEpubIntentStore`, captura via `NeoReaderLibraryPlugin.handleOnNewIntent` e evento retido `externalEpubIntent`.
- `.\gradlew.bat :app:assembleDebug` passou, validando compilacao Java e processamento do manifest.
- Nao houve QA manual/adb em device nesta sessao; estes itens seguem pendentes na Fase 5.

Acceptance criteria:

- NeoReader aparece no seletor Android para EPUB com MIME `application/epub+zip`.
- Abrir o app pelo launcher continua funcionando.
- Abrir um EPUB com o app fechado, aberto em background ou ja em foreground registra um payload pendente unico.

Commit sugerido:

- Boundary: manifest + captura nativa + metodo de consumo bruto.
- Mensagem: `Add Android EPUB view intent handling`

Riscos e validacao:

- Filtros com MIME fallback amplo podem poluir a lista de apps. Evitar nesta fase.
- `content://` pode ter permissao temporaria; testar com app real de Downloads/Files.

## Fase 2: Ponte JS Para Intent Externo

Status: Done.

Proposito:

Expor o arquivo externo pendente ao React sem interferir nos fluxos existentes de selecao manual.

Arquivos/areas provaveis:

- `src/services/NativeLibraryImportService.ts`
- `src/__tests__/services/NativeLibraryImportService.test.ts`

Checklist de implementacao:

- [x] Estender a interface `NeoReaderLibraryPlugin` com `consumePendingExternalEpubIntent`.
- [x] Criar export TS `consumePendingExternalEpubIntent`.
- [x] Normalizar resposta para `NativeFolderFile`.
- [x] Retornar `null` fora de plataforma nativa.
- [x] Manter `consumePendingNativeFileSelection` sem mudanca semantica.
- [x] Adicionar logs diagnosticos de consumo externo.
- [x] Adicionar listener TS `addExternalEpubIntentListener` para intents recebidos com o app aberto.

Testes:

- [x] Testar retorno `null` quando nao ha pendente.
- [x] Testar normalizacao de `{ name, uri, path, size }`.
- [x] Testar que nao chama plugin fora de plataforma nativa.
- [x] Testar registro do listener `externalEpubIntent`.
- [x] Rodar `npm test -- src/__tests__/services/NativeLibraryImportService.test.ts`.

Evidencia 2026-07-09:

- `npm test -- src/__tests__/services/NativeLibraryImportService.test.ts` passou com 23 testes.

Acceptance criteria:

- O app consegue diferenciar "arquivo selecionado pela UI" de "arquivo recebido por abrir com".
- Nenhum teste existente de importacao nativa quebra.

Commit sugerido:

- Boundary: service TS + testes do service.
- Mensagem: `Expose pending external EPUB intents to JS`

Riscos e validacao:

- Regressao no seletor manual se os canais pendentes forem confundidos. Manter chaves e metodos separados.

## Fase 3: Coordenador Raiz De Importar E Abrir

Status: Done.

Proposito:

Consumir o intent externo no nivel do app, respeitar login, importar o livro e abrir o leitor.

Arquivos/areas provaveis:

- `src/App.tsx`
- `src/db/books.ts`
- `src/services/BookImportService.ts` se precisar expor um resultado mais rico
- `src/i18n/messages.ts`
- `src/__tests__/App.test.tsx`

Checklist de implementacao:

- [x] Adicionar helper `getBookById(id: number)` em `src/db/books.ts` ou usar padrao existente equivalente.
- [x] Em `App.tsx`, adicionar efeito que roda apenas em plataforma nativa.
- [x] O efeito deve aguardar `auth.state.status === 'signed-in'` antes de importar.
- [x] Se houver pending external EPUB enquanto nao logado, manter Login/Welcome e nao iniciar importacao.
- [x] Ao importar com sucesso, buscar o livro por `bookId` e chamar o mesmo fluxo de `openReader`.
- [x] Exibir estado de carregamento global curto durante importacao externa.
- [x] Em erro de duplicidade, exibir toast/mensagem "Este livro ja esta na biblioteca.".
- [x] Em erro de permissao/arquivo inacessivel, exibir mensagem orientando abrir o EPUB novamente.
- [x] Evitar importacao concorrente usando `BookImportService.isImportInProgress`.
- [x] Evitar reprocessar o mesmo intent se o componente renderizar novamente.

Testes:

- [x] Testar que usuario nao logado nao dispara importacao.
- [x] Testar que, apos login, consome pending external EPUB, chama `importNativeEpub`, busca o livro e renderiza `ReaderScreen`.
- [x] Testar erro de duplicidade exibido.
- [x] Testar importacao concorrente bloqueada.
- [x] Rodar `npm test -- src/__tests__/App.test.tsx src/__tests__/services/BookImportService.test.ts`.

Evidencia 2026-07-09:

- `npm test -- src/__tests__/App.test.tsx` passou com 20 testes.
- `npm test -- src/__tests__/services/BookImportService.test.ts` passou com 18 testes.
- `npm test -- src/__tests__/services/NativeLibraryImportService.test.ts src/__tests__/App.test.tsx` passou com 42 testes.
- `npm run lint` passou.
- `npm run build` passou.
- `npm test` completo falhou por timeout de 5s em `src/__tests__/screens/BookDetailsScreen.test.tsx`, fora do escopo desta feature; o arquivo passou isoladamente.
- Tentativas com `npm test -- --testTimeout=10000` e `npm test -- --test-timeout=10000` ainda mantiveram timeout efetivo de 5s nesse arquivo e falharam sob carga da suite completa.

Acceptance criteria:

- Usuario logado abre EPUB pelo Android e cai direto no leitor depois da importacao.
- Usuario nao logado ve o fluxo de login; depois de autenticar, o app tenta importar/abrir.
- Duplicado mostra erro e nao abre outro registro.

Commit sugerido:

- Boundary: coordenador App + helper DB + i18n + testes.
- Mensagem: `Import and open external EPUB intents`

Riscos e validacao:

- O fluxo de login pode fazer o app ir para background; permissao temporaria do URI pode expirar em alguns provedores.
- `appStateChange` hoje cancela importacoes quando o app vai para background; garantir que isso nao cancele antes da importacao comecar.

## Fase 4: Fallbacks De MIME E Hardening Opcional

Status: Not started.

Proposito:

Ampliar compatibilidade com apps que nao reportam EPUB corretamente, sem fazer o NeoReader aparecer para muitos arquivos incorretos.

Arquivos/areas provaveis:

- `android/app/src/main/AndroidManifest.xml`
- Codigo nativo de validacao/captura.
- Testes manuais em aparelho real.

Checklist de implementacao:

- [ ] Rodar QA com EPUB baixado pelo navegador/app alvo.
- [ ] Se NeoReader nao aparecer, adicionar fallback controlado para `application/octet-stream`.
- [ ] Considerar `application/zip` apenas se houver evidencia concreta.
- [ ] Manter validacao runtime por nome `.epub` quando disponivel.
- [ ] Confiar na validacao estrutural de `prepareLocalEpubImport` para bloquear arquivos invalidos.
- [ ] Se login perder permissao do URI, implementar staging nativo para `files/import-tmp`.

Testes:

- [ ] Repetir query de intent para `application/epub+zip`.
- [ ] Se fallback for adicionado, validar que EPUB com MIME fallback aparece.
- [ ] Validar que um ZIP comum nao e importado e mostra erro controlado.
- [ ] Validar login + importacao externa em device real.

Acceptance criteria:

- Compatibilidade aumentada sem aceitar importacoes invalidas silenciosamente.
- Erros de arquivo invalido/permissao expirada sao compreensiveis.

Commit sugerido:

- Boundary: fallbacks ou staging, separadamente da implementacao principal.
- Mensagem: `Harden external EPUB intent compatibility`

Riscos e validacao:

- Fallbacks amplos podem fazer o app aparecer para muitos arquivos. Preferir adicionar somente apos evidencia em device.
- Staging pre-login copia arquivo antes do login; manter apenas em app private storage e limpar temporarios.

## Fase 5: QA Final, Documentacao E Release Notes

Status: Not started.

Proposito:

Fechar validacao automatizada/manual e registrar comportamento no projeto.

Arquivos/areas provaveis:

- `README.md` se for util documentar o fluxo Android.
- `docs/features/importar-epub-android-abrir-com.md`
- Scripts/logs de QA Android, se usados.

Checklist de implementacao:

- [ ] Atualizar este plano com evidencias de testes.
- [ ] Documentar comandos de build/run se necessario.
- [ ] Registrar decisoes finais sobre `ACTION_SEND` e MIME fallback.
- [ ] Confirmar que nenhum arquivo secreto/log pesado foi alterado sem necessidade.

Testes:

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npx cap sync android`
- [ ] `npx cap run android` ou build/run equivalente em device.
- [ ] QA manual: abrir EPUB com app fechado.
- [ ] QA manual: abrir EPUB com app em background.
- [ ] QA manual: abrir EPUB ja logado.
- [ ] QA manual: abrir EPUB deslogado e concluir login.
- [ ] QA manual: abrir EPUB duplicado.
- [ ] QA manual: abrir arquivo nao EPUB se fallback MIME for adicionado.

Acceptance criteria:

- Suite automatizada relevante passa.
- Fluxo principal funciona em Android real.
- Plano fica atualizado com status, testes executados e riscos residuais.

Commit sugerido:

- Boundary: docs finais e pequenos ajustes de QA.
- Mensagem: `Document Android external EPUB import QA`

Riscos e validacao:

- Testes automatizados nao substituem device QA porque intent resolution e URI grants dependem do Android/provedor.

## Manual QA Detalhado

- Instalar build debug no aparelho.
- Baixar um EPUB no Android.
- Tocar no arquivo no app Downloads/Files.
- Confirmar que NeoReader aparece em "Abrir com".
- Escolher NeoReader.
- Confirmar que, estando logado, o livro e importado e o leitor abre.
- Repetir com o mesmo arquivo e confirmar mensagem de duplicado.
- Forcar app fechado e repetir.
- Deixar app em background e repetir.
- Sair da conta, abrir EPUB, confirmar que login e solicitado e que o app tenta importar apenas depois do login.
- Se houver fallback MIME, testar um ZIP comum e confirmar erro controlado.

## Acessibilidade

- Mensagens globais de importacao/erro devem usar componentes ja existentes de feedback visual.
- Nao introduzir controles novos sem label.
- O fluxo externo deve ter texto curto e claro para importacao, duplicidade e permissao expirada.

## Performance

- A copia e hash do EPUB ja acontecem no plugin nativo com executor de IO.
- Evitar ler o EPUB inteiro em base64 no JS.
- Manter bloqueio de importacao concorrente ja existente em `ImportCoordinator`.
- Limpar arquivos temporarios com `cleanupNativeImportTemp`.

## Seguranca E Privacidade

- Nao registrar caminho completo sensivel ou conteudo do arquivo em logs.
- Aceitar apenas `content://` e `file://` esperados; rejeitar schemes desconhecidos.
- Nao usar MIME `*/*`.
- Arquivos copiados devem ficar em storage privado do app.
- Nao mudar regras de auth/DB por usuario.

## Rollout E Backout

- Rollout: entregar em build Android, validar em device real antes de publicar.
- Backout simples: remover os `intent-filter` de `ACTION_VIEW` para o NeoReader deixar de aparecer no seletor, mantendo o importador manual intacto.
- Se a ponte JS causar regressao, desabilitar apenas o consumo de `consumePendingExternalEpubIntent` e manter o manifest temporariamente fora da release.

## Plano De Commits

- Commit 1: Android manifest e captura nativa do intent externo.
- Commit 2: ponte TS e testes de `NativeLibraryImportService`.
- Commit 3: coordenador em `App`, helper DB, i18n e testes de fluxo.
- Commit 4: fallbacks/hardening se comprovadamente necessarios.
- Commit 5: docs e evidencias finais.

## Instrucoes Para Execucao Futura

Ao executar este plano:

- Ler este arquivo antes de editar codigo.
- Marcar a fase ativa como `In progress`.
- Atualizar checkboxes conforme cada item for concluido.
- Registrar testes executados e resultados na fase correspondente.
- Se uma decisao mudar, adicionar nota em "Decisoes Ja Tomadas" ou "Perguntas Abertas".
- Nao criar commits sem pedido explicito.

## Handoff Para Proxima Sessao

Proximo passo recomendado:

1. Rodar QA em device/emulador: instalar o debug build, abrir um EPUB via Files/Downloads e confirmar que NeoReader aparece em "Abrir com".
2. Se o app nao aparecer para EPUBs baixados no app alvo, executar Fase 4 e adicionar fallback controlado para `application/octet-stream`.
3. Se o app aparecer, executar Fase 5: `npx cap sync android`, `npx cap run android` em device e checklist manual completo.

Comandos uteis:

- `rg -n "intent-filter|launchMode|consumePendingNativeFileSelection|importNativeEpub|prepareLocalEpubImport" android src`
- `npm test -- src/__tests__/services/NativeLibraryImportService.test.ts src/__tests__/services/BookImportService.test.ts src/__tests__/App.test.tsx`
- `npm run lint`
- `npm run build`
- `npx cap sync android`
- `npx cap run android`

Risco principal ainda aberto:

- Permissao temporaria de `content://` durante login. Se aparecer em QA, implementar staging nativo antes de tentar importar apos autenticacao.
- A resolucao real do intent depende do provedor Android; `assembleDebug` validou manifest/Java, mas nao substitui teste com app Files/Downloads.
