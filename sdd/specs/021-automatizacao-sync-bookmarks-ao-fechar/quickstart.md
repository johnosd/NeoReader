# Quickstart: Verificação Manual

## Pré-requisitos

1. Dispositivo Android físico conectado via USB.
2. App compilado em modo Release (`npm run android:build` seguido do build do AAB e assinatura, ou via Android Studio em variante release).
3. Conta Google de teste configurada no dispositivo.

## Cenários de Sucesso

### 1. Sync silencioso ao fechar o livro
1. Logar no app, abrir um livro e fazer uma marcação (bookmark).
2. Forçar a invalidação do token (simulando 1 hora de expiração). No código temporário de teste, isso pode ser feito disparando `clearLastToken()` do novo plugin via DevTools.
3. Fechar o livro (`handleBack`).
4. **Esperado**: O toast de `reader.bookmarkSyncPendingNotice` NÃO deve aparecer. O log (`adb logcat`) deve mostrar a renovação silenciosa do token via `GoogleDriveAuthPlugin` e o sucesso em `bookmark.sync.success`.

### 2. Gatilho: Retorno ao App (Foreground)
1. Fazer um bookmark, forçar desconexão ou colocar modo avião, e fechar o livro (o bookmark ficará pendente no banco local).
2. Mandar o app para background.
3. Retirar do modo avião.
4. Trazer o app para foreground.
5. **Esperado**: O app detecta o resume, roda o `scheduleBookmarkDriveSync`, que aciona a renovação silenciosa (se necessário) e limpa a fila pendente.

### 3. Gatilho: Conexão de Rede
1. Com app aberto e sem rede, criar bookmark (fica pendente).
2. Ligar o Wi-Fi.
3. **Esperado**: O event listener do window (`online`) aciona o `scheduleBookmarkDriveSync` imediatamente, enviando os dados pro Drive silenciosamente.

### 4. Caso Residual (`needsUi=true`)
1. Abrir configurações do Google no Android do celular de teste. Revogar permissões de acesso ao NeoReader.
2. Tentar criar/sincronizar um bookmark. A renovação via `Identity` falhará em background pedindo UI.
3. Fechar o app (background) e reabri-lo (foreground).
4. **Esperado**: Apenas no momento do foreground (ou cold start), a tela de consentimento do Google é exibida ao usuário, interrompendo o fluxo normal apenas onde é aceitável. Após consentir, a fila deve descarregar.

