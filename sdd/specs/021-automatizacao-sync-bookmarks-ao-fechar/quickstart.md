# Quickstart: Verificação Manual

## Pré-requisitos

1. Dispositivo Android físico conectado via USB (`adb devices`).
2. Build de debug instalado (`npx cap run android` não funciona no Windows):
   ```powershell
   npm run build
   npx cap sync android
   cd android; .\gradlew.bat assembleDebug; cd ..
   adb -s <device> install -r android\app\build\outputs\apk\debug\app-debug.apk
   ```
   A validação no AAB de release (SC-003) foi dispensada pelo usuário em
   2026-09-23: o problema de assinatura do release já tinha ocorrido antes e
   não exige mudança.
3. Usuário Pro logado com Google, com o Drive já conectado ao menos uma vez.
4. Para disparar código no WebView (só em debug), via CDP:
   ```powershell
   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>   # pid: adb shell pidof com.johnny.neoreader
   ```
   Em seguida, avaliar JS pela página `https://localhost/` (Chrome em
   `chrome://inspect`, ou um script Node com `Runtime.evaluate`).
5. Logcat limpo antes de cada cenário (`adb logcat -c`); os eventos aparecem
   como `NeoReaderEvent <nome>` na tag `Capacitor/Console`.

## Cenários de Sucesso

### 1. Sync silencioso com token vencido
1. Simular o TTL de ~55min vencido **sem matar o processo**:
   ```js
   localStorage.setItem('neoreader:drive-token-expiry', '0'); location.reload()
   ```
   > Não use `localStorage.removeItem` + `am force-stop`. O WebView grava o
   > localStorage em disco de forma assíncrona, e o `force-stop` descarta a
   > escrita: o token antigo sobrevive e o teste passa sem exercitar a
   > renovação (aconteceu em 2026-09-23).
2. Abrir um livro, criar um bookmark e fechar o livro (`handleBack`).
3. **Esperado**: nenhum toast e nenhuma tela do Google. No logcat:
   `pluginId: GoogleDriveAuth, methodName: authorizeSilent` →
   `drive.token.silent.renewed` → `bookmark.sync.success`. Confirme que a
   chamada `authorizeSilent` aparece: sem ela, a renovação não foi
   exercitada, mesmo que o sync passe.

### 2. Gatilho: Retorno ao App (Foreground)
1. Ativar o modo avião, criar um bookmark e fechar o livro (o bookmark fica
   pendente no banco local).
2. Mandar o app para background e desativar o modo avião.
3. Trazer o app para foreground.
4. **Esperado**: `retryPendingBookmarkSyncs` roda no resume, agenda o sync dos
   livros com bookmark pendente (renovando o token sem UI, se necessário), e o
   bookmark sai do vermelho em Marcações.

### 3. Gatilho: Conexão de Rede
1. Com o app aberto e sem rede, criar um bookmark (fica pendente).
2. Ligar o Wi-Fi.
3. **Esperado**: o listener `online` do window dispara
   `retryPendingBookmarkSyncs` e envia os dados ao Drive sem ação do usuário.

### 4. Caso Residual (`needsUi=true`)
1. Revogar o acesso do NeoReader em myaccount.google.com → Segurança →
   Apps de terceiros.
2. Criar um bookmark e fechar o livro. A renovação sem UI responde que
   precisa de consentimento.
3. **Esperado durante a leitura**: nenhuma tela. Logcat com
   `drive.token.silent.needs-ui`, e `localStorage['neoreader:drive-consent-required'] === '1'`.
4. Mandar o app para background e trazê-lo de volta (ou fazer cold start).
5. **Esperado**: só nesse momento a tela de consentimento do Google aparece
   (`refreshDriveToken({ userInitiated: false })`, que respeita o cooldown de
   30min). Depois de consentir, a flag é limpa e a fila de bookmarks
   pendentes é enviada (`bookmark.sync.success`). Se o usuário cancelar, a
   tela não reaparece a cada resume durante o cooldown.

### 5. Expiração real (SC-001)
1. Deixar o app aberto por mais de 1h desde a última renovação.
2. Criar um bookmark e fechar o livro.
3. **Esperado**: igual ao cenário 1, mas agora o token emitido deve ser
   diferente do anterior (o Google só devolve o do cache enquanto ele ainda é
   válido).
