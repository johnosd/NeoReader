# Assessment Explora: Automatização do sync de bookmarks ao fechar

- **Slug**: automatizacao-sync-bookmarks-ao-fechar
- **Criado**: 2026-09-23 (rodada depois do primeiro Decide, para responder
  às perguntas bloqueantes dele)
- **Origem**: ideia do backlog + perguntas bloqueantes de `decision.md`
  (primeira versão)

## Ideia Bruta

Remover o aviso de erro que aparece ao fechar o livro com bookmark
pendente e fazer o sync acontecer sozinho, sem o usuário ir a
Marcações/Configurações.

**Resposta do usuário à pergunta 1 (2026-09-23)**: "não podemos ficar sem
sincronizar o bookmark e sem avisar. devemos tentar sincronizar sempre
que possível sem avisar ao usuário de forma automática". A abordagem A
(só silenciar) está descartada. O objetivo é sync automático de verdade.

## Evidência a Favor

### Spike em device real — AuthorizationClient renova o token sem UI

- **Código**: commit `7c669a8` (`spike: testa token do Drive sem UI via
  AuthorizationClient`), isolado para ser revertido com
  `git revert 7c669a8`. Plugin nativo `DriveAuthSpikePlugin` chama
  `Identity.getAuthorizationClient(activity).authorize()` com
  `drive.appdata`, **sem** `requestOfflineAccess`, e testa o token
  resultante com `GET drive/v3/files?spaces=appDataFolder`.
- **Ambiente**: build **debug**, device RXCX103NMVZ, usuário já logado
  (com o escopo concedido antes pelo fluxo do `@capacitor-firebase/authentication`).
  Chamado via CDP (`Capacitor.nativePromise`), sem nenhuma UI nova no app.
- **Resultado** (logcat tag `DriveAuthSpike`, 2026-09-23 09:18-09:19):

| # | Ação | needsUi | Token | Drive appData | Tempo |
| --- | --- | --- | --- | --- | --- |
| 1 | `authorize(allowUi:false)` | false | sim | 200 | 658 ms |
| 2 | `clearLastToken` → `authorize(allowUi:false)` | false | sim | 200 | 393 ms |
| 3 | `clearLastToken` → `authorize(allowUi:false)` | false | sim | 200 | 291 ms |

- Conclusão: **existe caminho sem UI** no Android quando o escopo já foi
  concedido. A premissa de "não há renovação silenciosa" (revisão da
  feature 005) só vale para o plugin do Firebase, por causa do
  `forceCodeForRefreshToken=true`. Não vale para a plataforma.
- O escopo concedido pelo login atual (plugin Firebase) é reconhecido pelo
  `AuthorizationClient`. Não precisou de um novo consentimento.
- Benefício colateral: a mesma renovação serve para os syncs de progresso e
  vocabulário, que passam pelo mesmo `GoogleDriveAppDataService`.

## Evidência Contra

- **O spike não provou que um token novo foi emitido depois do
  `clearToken`**: o log só mostra os 8 primeiros caracteres (`ya29.a0A`,
  iguais em todos os tokens do Google). O `clearToken` é a forma
  documentada de invalidar o cache, e a chamada seguinte ainda devolveu um
  token válido (200), mas a expiração natural de 1h **não foi testada**.
  (ASSUMPTION: se comporta igual.)
- **Só build debug**: o release é assinado pela chave de app signing do
  Play, e o bug aberto de Google Sign-In no AAB aponta justamente para
  SHA-1/assinatura. O `AuthorizationClient` depende do mesmo Android OAuth
  client (package + SHA-1). Então, se o login falha no release, isso
  provavelmente também falha.
- **Não testado**: escopo revogado pelo usuário (em myaccount.google.com),
  offline, conta trocada. Nesses casos `hasResolution()` deve voltar `true`
  (precisa de UI), então continua existindo um caso residual em que o sync
  automático não é possível.
- **Web**: o spike é só Android. No web o fluxo é outro (popup do Firebase
  JS SDK) e não foi avaliado.

## Perguntas em Aberto

- No caso residual (`needsUi=true`: escopo revogado ou conta trocada), o
  que o usuário vê? Pela resposta dele ("não pode ficar sem sincronizar e
  sem avisar"), algum sinal ainda é necessário, mas só nesse caso raro.
  Decidir no `sdd-specify`.
- A expiração natural de 1h se comporta igual ao `clearToken`? Validar
  durante a feature (esperar >1h com o app aberto e sincronizar).
- O login e o token funcionam no AAB de release? Mesmo gate do bug aberto
  de Google Sign-In.
