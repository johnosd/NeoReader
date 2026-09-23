# Assessment Decision: Automatização do sync de bookmarks ao fechar

- **Slug**: automatizacao-sync-bookmarks-ao-fechar
- **Decidido**: 2026-09-23
- **Problem**: ./problem.md
- **Veredito**: go (revisado em 2026-09-23 após o spike — ver "Revisão" no fim; o veredito original era needs-clarification)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Report direto do usuário, que já pediu 2 vezes em setembro (bugs de 09-10 e 09-11). O fato de o usuário estar vendo o toast é também evidência real de que o fix `sync-bookmarks-nao-acontece-ao-fechar` (que ficou `partial` por falta de reprodução em device) funciona em produção. |
| Força da evidência | adequate | A causa está documentada no código e na revisão da feature 005: sem renovação silenciosa do token no Android. Não medido: a frequência real de `permission-error` por sessão (ASSUMPTION: a maioria das sessões com mais de 1h desde o último login). |
| Valor vs. custo de inação | adequate | Nenhum dado se perde localmente, mas o sync Pro parece quebrado e o aviso aparece com frequência. |
| Viabilidade / apetite | **unknown** | Depende do que "invisível" significa. **Remover só o toast** é trivial, mas não sincroniza nada: o bookmark continua pendente sem avisar ninguém. **Sincronizar de verdade sem interação** exige um token do Drive obtido sem UI, e isso está comprovadamente impossível com o plugin atual. Um caminho nativo alternativo não foi testado (ver abordagem C). |
| Fit estratégico | strong | O sync de nuvem é um diferencial Pro e aparece no onboarding (feature 019). Resolver o token de raiz também beneficia os syncs de progresso e vocabulário. |

## Abordagens Candidatas

### A — Silêncio total + retry oportunista

- Remover o toast. Os bookmarks pendentes ficam guardados, e o sync é
  tentado de novo sozinho quando o token voltar a ser válido: no cold start
  com token persistido válido, depois de uma reconexão em Settings (que já
  faz isso em `SettingsSyncScreen.tsx:151-157`) etc. Um indicador passivo
  (ícone vermelho em Marcações, que já existe) substitui o aviso ativo.
- Custo: baixo. Não resolve o sync em si. Na maioria das sessões o bookmark
  só sobe quando o usuário reconectar por conta própria, e agora sem
  lembrete.
- **Recomendada**: só como paliativo, e somente se o usuário aceitar
  explicitamente o trade-off "sem aviso = pode ficar sem sync
  indefinidamente".

### B — Aviso menos intrusivo em vez de nenhum

- Manter o sinal, mas mostrar só uma vez por sessão (ou por dia) em vez de
  todo fechamento. Outra opção é trocar o texto de "erro" por um CTA de
  reconexão com um toque.
- Custo: baixo. Não é "invisível", mas reduz o incômodo sem esconder o risco.
- **Recomendada**: não como resposta à ideia original. Fica como fallback
  se C não for viável.

### C — Token do Drive silencioso via API nativa (solução de raiz)

- Pedir o escopo `drive.appdata` por um método nativo novo no
  `NeoReaderLibraryPlugin` que use `Identity.getAuthorizationClient().authorize()`
  (Google Identity Services) **sem** `requestOfflineAccess`. Assim o
  plugin `@capacitor-firebase/authentication` e o seu
  `forceCodeForRefreshToken=true` hardcoded ficam fora do caminho.
  **ASSUMPTION a validar**: quando o escopo já foi concedido antes, essa API
  devolve o access token sem UI (`hasResolution() == false`). Se isso se
  confirmar, `GoogleDriveAppDataService` poderia renovar o token em
  background sem violar o invariante "nunca abrir consentimento sem ação do
  usuário".
- Custo: médio a alto (código nativo Java, testes em device, possível
  interação com o bug aberto de Google Sign-In no AAB de release). Resolve
  bookmark, progresso e vocabulário de uma vez. Na prática é outra feature,
  maior que a ideia original.
- **Recomendada**: sim, como direção, mas só depois de um spike curto que
  prove a premissa em device.

## Veredito

**needs-clarification.** O problema é real e bem entendido (a validade e o
fit estão fortes), mas a viabilidade está `unknown` e não é detalhe de
implementação. O pedido "sincronizar de forma automática e invisível" junta
duas coisas que hoje não cabem juntas:

- O sync automático ao fechar **já existe** (bug de 09-10) e funciona
  enquanto o token vale.
- O aviso só aparece quando esse sync **não consegue** rodar. Removê-lo sem
  resolver o token (abordagem A) troca um aviso chato por uma falha
  silenciosa. Isso contraria a decisão que o próprio usuário tomou em 09-11
  ("quer o aviso no momento de fechar").

Um `go` agora levaria a implementar a abordagem A achando que o problema
foi resolvido. Fica em aberto até as perguntas abaixo serem respondidas.

### Se needs-clarification — Perguntas Bloqueantes

1. **Decisão de produto**: se o token estiver expirado, é aceitável que o
   bookmark fique **sem sincronizar e sem nenhum aviso** até o usuário
   reconectar por conta própria (abordagem A)? Ou o objetivo real é "nunca
   precisar reconectar" (abordagem C)?
2. **Spike técnico (bloqueia C)**: em device real (RXCX103NMVZ), um método
   nativo com `AuthorizationClient.authorize()` para `drive.appdata`, sem
   `requestOfflineAccess`, devolve access token **sem UI** quando o escopo
   já foi concedido? E isso funciona no build de release (considerando o bug
   aberto de Google Sign-In no AAB)?
3. **Dado de frequência** (opcional, mas ajuda a priorizar): com que
   frequência `permission-error` aparece por sessão? Dá para medir com
   `bookmark.sync.failure` + `syncError: missing-token` no
   `DiagnosticsLogger` (skill `android-debug`).

**Fase a revisitar**: explora. Rodar o spike da pergunta 2 e registrar o
resultado em `explora.md`. Depois reabrir o Decide: se o spike passar,
provável `go` para uma feature "token do Drive silencioso" (escopo maior
que bookmarks). Se falhar, decidir entre A e B com a resposta da pergunta 1.

---

## Revisão 2026-09-23 — Decide reaberto após o spike

<!-- Anexado; nada acima foi reescrito. -->

- **Veredito revisado**: **go** (abordagem C)
- **Evidência nova**: `./explora.md`. Resposta do usuário à pergunta 1 e
  spike em device (commit `7c669a8`).

### Respostas às perguntas bloqueantes

1. **Produto**: o usuário descartou a abordagem A. O bookmark não pode
   ficar sem sync e sem aviso; o sistema deve sincronizar automaticamente,
   sem avisar, sempre que for possível.
2. **Spike**: `AuthorizationClient.authorize()` devolveu o token do Drive
   **sem UI** 3 de 3 vezes (inclusive depois de `clearToken`), e todas as
   chamadas ao `appDataFolder` responderam 200. Build debug, device
   RXCX103NMVZ.
3. **Frequência de `permission-error`**: não medida. Deixou de ser
   bloqueante, porque a solução elimina a causa em vez de depender da
   frequência.

### Scorecard revisado

| Critério | Antes | Agora | Notas |
| --- | --- | --- | --- |
| Validade do problema | strong | strong | Inalterado. |
| Força da evidência | adequate | strong | Causa confirmada no código e solução confirmada em device real. |
| Valor vs. custo de inação | adequate | strong | A solução serve para bookmark, progresso e vocabulário; o sync Pro passa a funcionar de fato. |
| Viabilidade / apetite | unknown | adequate | Provado em debug. Não é `strong` por 2 riscos abertos: o AAB de release (mesmo gate do bug de Google Sign-In) e a expiração natural de 1h, que só foi simulada com `clearToken`. Os dois viram critérios de aceite da feature, não bloqueiam a decisão. |
| Fit estratégico | strong | strong | Inalterado. |

### Se go — Handoff

- **Problema**: o token do Drive expira em ~1h, e o plugin
  `@capacitor-firebase/authentication` só renova com tela de consentimento
  (`forceCodeForRefreshToken=true` hardcoded). Por isso qualquer sync
  (bookmarks, progresso, vocabulário) cai em `permission-error` e o usuário
  vê o toast `reader.bookmarkSyncPendingNotice` ao fechar o livro.
- **Abordagem recomendada**: obter e renovar o token do Drive por um método
  nativo com `Identity.getAuthorizationClient().authorize()` (escopo
  `drive.appdata`, sem `requestOfflineAccess`), só no modo sem UI em
  background. Se `hasResolution()` vier `false`, usar o token. Se vier
  `true`, não abrir UI em background: é o caso residual. Integrar esse
  token no ponto em que `GoogleDriveAppDataService` pega o token, com
  retry-once quando der `missing-token`/401. Isso reintroduz a ideia da
  US1 da feature 005, agora sobre uma premissa comprovada. Com isso,
  `permission-error` deixa de ser pegajoso e `scheduleBookmarkDriveSync`
  pode tentar de novo.
- **Escopo sugerido**:
  - Entra: método nativo de token sem UI (evoluindo ou substituindo o
    `DriveAuthSpikePlugin`); renovação automática no
    `GoogleDriveAppDataService`; remoção do toast
    `reader.bookmarkSyncPendingNotice` no caminho normal; revisão do guard
    `permission-error` em `scheduleBookmarkDriveSync`; re-tentar bookmarks
    pendentes quando o token voltar (cold start, retorno do app ao
    foreground).
  - Não entra: backend/refresh token de longa duração (FR-009 continua
    fora); fluxo web (Firebase JS SDK); sync com o app fechado
    (WorkManager); mudança no formato dos arquivos no Drive.
  - Invariante que continua valendo: **nenhuma UI de consentimento sem ação
    explícita do usuário**. O `authorize()` em background nunca lança o
    `PendingIntent`.
- **Métricas de sucesso**: `bookmark.sync.success` sem toque do usuário
  depois de mais de 1h de sessão; zero `drive.token.refresh.*` ou telas do
  Google sem ação do usuário; o toast deixa de aparecer no uso normal.
- **Perguntas em aberto pro sdd-specify**:
  1. Caso residual (`needsUi=true`: escopo revogado ou conta trocada): que
     sinal o usuário recebe? Pela resposta dele, precisa existir algum sinal,
     mas só nesse caso. Por exemplo, o ícone vermelho em Marcações/Settings
     em vez de toast a cada fechamento.
  2. Em quais gatilhos tentar de novo os pendentes: fechar o livro, voltar
     ao foreground, cold start, voltar a ter rede?
  3. Critério de aceite no AAB de release, ligado ao bug aberto de Google
     Sign-In. Se o login falha no release, o token silencioso também falha.
  4. O código do spike (`7c669a8`) evolui para o plugin definitivo ou é
     revertido e reescrito? Recomendação: reverter e reescrever dentro da
     feature, com testes.
