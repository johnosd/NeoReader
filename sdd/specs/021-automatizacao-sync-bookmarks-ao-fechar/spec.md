# Feature Specification: Automatização do sync de bookmarks ao fechar

**Status**: Convergida

## Scope

**Included:**
- Implementação de método nativo Android para obtenção e renovação do token do Google Drive (`drive.appdata`) em background, sem UI, utilizando `Identity.getAuthorizationClient().authorize()`.
- Integração da renovação automática no `GoogleDriveAppDataService`.
- Remoção do toast de erro (`reader.bookmarkSyncPendingNotice`) no caminho feliz de uso normal.
- Tentativas de re-sincronização de bookmarks pendentes ativadas pelos seguintes gatilhos:
  - Ao fechar o livro.
  - Ao voltar ao foreground (app resume).
  - Ao recuperar a conexão de rede.
- Caso residual (`needsUi=true`, ex: escopo revogado): o sistema deve enfileirar a pendência e abrir a tela de login/consentimento apenas na próxima vez que o usuário abrir o app (cold start ou foreground resume), evitando interrupções durante a leitura.
- Reversão do código do spike (`DriveAuthSpikePlugin`) e reescrita limpa na forma de um plugin definitivo com testes adequados.
- Validação obrigatória da solução no build de release em dispositivo físico.

**Out of Scope:**
- Backend ou uso de refresh token de longa duração (FR-009).
- Fluxo web (Firebase JS SDK).
- Sincronização em background com o app completamente fechado via WorkManager (os gatilhos são apenas in-app).
- Qualquer mudança no formato dos arquivos salvos no Drive.

## User Stories

1. **P1:** Como usuário Pro, quero que meus bookmarks sejam sincronizados para o Drive de forma invisível mesmo em sessões de leitura longas (>1h), para que eu não precise ver mensagens de erro chatas ao fechar o livro ou me preocupar em reconectar manualmente.
2. **P2:** Como usuário Pro, caso haja um problema irreversível de permissão (ex: revoguei o acesso do app no Google), quero ser convidado a fazer login novamente apenas quando abrir o app, para que minha leitura não seja interrompida abruptamente por um popup.

## Edge Cases

- **Dispositivo Offline:** Se o usuário ficar offline, o sync deve ser suspenso e o sistema deve aguardar o gatilho "Ao recuperar a conexão de rede" ou o fechamento do livro/retorno ao app para tentar novamente.
- **Sessão Expirada no Google / Permissão Revogada:** O `authorize()` falhará pedindo UI. O app captura esse estado e agenda a tela de login para a próxima abertura/retorno do app.
- **Incompatibilidade no Build de Release (Google Sign-In Bug):** O build de release usa assinaturas diferentes, o que já causou bugs no Sign-In no passado. A feature deve ser confirmada nesse ambiente antes de ser dada como concluída.

## Functional Requirements

- **FR-001:** O sistema DEVE renovar o token do Google Drive silenciosamente no Android usando `Identity.getAuthorizationClient().authorize()` sem disparar a intent de UI (sem `requestOfflineAccess`).
- **FR-002:** O sistema DEVE tentar reenviar os bookmarks marcados como pendentes sempre que ocorrer um dos gatilhos: fechar livro, resume do app ou reconexão de rede.
- **FR-003:** O sistema NÃO DEVE exibir a notificação `reader.bookmarkSyncPendingNotice` se o processo de sync for capaz de renovar o token e completar com sucesso.
- **FR-004:** O sistema DEVE exibir a tela de login/consentimento na próxima inicialização (ou resume) caso a renovação de token retorne que UI é necessária (`hasResolution() == true` ou equivalente).
- **FR-005:** A implementação do plugin nativo final DEVE substituir o código do spike exploratório (`7c669a8`).

## Measurable Outcomes

- **SC-001:** O evento de telemetria `bookmark.sync.success` ocorre sem interação do usuário mesmo após 1 hora de sessão contínua.
- **SC-002:** Zero instâncias de `reader.bookmarkSyncPendingNotice` exibidas em uso normal com permissões ativas.
- **SC-003:** A funcionalidade de sync opera sem falhas em um build assinado de release.

## Assumptions

- O comportamento de `AuthorizationClient.authorize()` sem UI continua consistente mesmo em uso repetido após as sessões normais de 1 hora.
- O bug existente de Google Sign-In no AAB de release não inviabilizará totalmente a chamada se o SHA-256 de release estiver correto no console do Firebase/Google Cloud.
- Acionar a tela de login na reabertura do app (resume) é aceitável para o usuário no caso residual raro.

## Clarifications

### Sessão 2026-09-23
- Q: Caso residual (escopo revogado ou conta trocada, exigindo UI): Qual sinal o usuário deve receber se o sync falhar silenciosamente? → A: deve abrir tela de login.
- Q: Em quais gatilhos devemos tentar sincronizar novamente os bookmarks pendentes? → A: Ao fechar o livro, Ao voltar ao foreground (app resume), Ao recuperar a conexão de rede.
- Q: Critério de aceite: Devemos vincular a validação desta feature ao build de release, considerando o possível impacto do bug existente de Google Sign-In? → A: Sim, validar obrigatoriamente no build de release no device antes de concluir a feature.
- Q: Como proceder com o código atual do spike? → A: Reverter o spike e reescrever como um plugin definitivo com testes durante a feature.
- Q: Clarificação sobre UX: Para o caso residual onde o token falha silenciosamente, quando exatamente a tela de login/consentimento deve ser aberta para não interromper bruscamente o usuário? → A: abrir tela de login apenas quando o usuario abrir novamente o app.
