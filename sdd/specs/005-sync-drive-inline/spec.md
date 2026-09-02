# Feature Specification: Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark

**Slug**: `005-sync-drive-inline`

**Created**: 2026-09-02

**Status**: Convergida

**Input**: Melhorar a UX de sincronização com o Google Drive, levantada pelo usuário ao testar dois bugfixes de sincronização nesta mesma sessão (`sdd/bugs/tela-sincronizacao-na-nuvem-sem-opcao/` e `sdd/bugs/reconectar-google-drive-nao-recupera-bookmarks/`): (1) o token de acesso ao Drive expira a cada ~55min e hoje não existe nenhuma renovação silenciosa em segundo plano — o usuário precisa entrar manualmente em Configurações e clicar em "Conectar Google Drive" toda vez que o token expira entre sessões de uso; (2) na tela de Detalhes do Livro, quando um bookmark novo não sincroniza, o usuário quer poder tocar no próprio ícone de nuvem daquele bookmark pra já conectar (se precisar) e sincronizar ali mesmo, sem navegar até Configurações.

## Escopo

### Incluído

- Quando qualquer tentativa de sincronização (bookmark, progresso ou vocabulário) encontrar o token do Google Drive ausente ou expirado, o sistema tenta renovar esse token silenciosamente (reaproveitando o mecanismo de reautenticação já existente, que já retorna sem exibir nada quando o escopo já foi concedido antes) antes de marcar o item como erro/pendente.
- Quando a renovação silenciosa não resolver (ex: acesso revogado, ou o usuário nunca concedeu o escopo do Drive), o sistema mantém o fluxo de autenticação completo já existente — incluindo abrir o seletor de conta/consentimento quando for realmente necessário.
- O botão manual "Conectar Google Drive" em Configurações > Sincronização na Nuvem continua existindo como fallback pra esses casos.
- Na tela de Detalhes do Livro, o ícone de nuvem de cada bookmark (hoje só informativo, refletindo `syncError`/`syncedAt`) passa a ser tocável quando o bookmark está pendente (nunca sincronizado) ou com erro de sincronização.
- Tocar num ícone de bookmark tocável dispara a sincronização de **todos** os bookmarks pendentes/com erro daquele livro (não só o bookmark tocado) — reconectando o Drive primeiro se necessário, usando o mesmo fluxo completo de autenticação (com prompt visível se for a primeira conexão ou o acesso tiver sido revogado).
- Durante essa sincronização disparada pelo toque, os ícones dos bookmarks daquele livro mostram um estado visual de "sincronizando" (ex: spinner no lugar do ícone de nuvem), até o resultado final (sincronizado ou erro).
- Ícone de bookmark já sincronizado (sem erro, com `syncedAt` preenchido) continua só informativo — sem ação de toque.

### Fora de Escopo

- Mudar a duração do token do Drive (~55min) ou implementar um fluxo de `refresh_token` de longa duração (OAuth offline) — o token continua com a mesma duração curta, só passa a ser renovado de forma mais oportuna e silenciosa.
- Estender o ícone tocável/estado "sincronizando" pra progresso ou vocabulário — eles continuam sem um ponto de entrada visual próprio nesta feature; só se beneficiam da renovação silenciosa de token nos bastidores.
- Mover a visibilidade de status de sincronização de "Configurações > Sincronização na Nuvem" pra tela de Detalhes do Livro — essa tela de Configurações continua existindo exatamente como está hoje; esta feature só adiciona um atalho a mais, não substitui nada.
- Qualquer mudança visual ou de comportamento na tela "Configurações > Sincronização na Nuvem" além do benefício indireto da renovação silenciosa (ela já reflete o status atualizado, sem mudança de UI).
- Notificações push, toasts globais ou qualquer aviso fora do fluxo já existente quando uma sincronização falhar.
- Sincronização em segundo plano com o app fechado (background task/worker/service) — a tentativa de renovação só acontece quando alguma sincronização é de fato disparada dentro do app aberto (por uma ação do usuário ou por um fluxo automático já existente, como a sync de vocabulário no login).
- Limite/cooldown explícito de quantas vezes a renovação silenciosa pode ser tentada por período — fica como decisão técnica pro `sdd-plan`, não fixado nesta spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usuário deixa de precisar reconectar manualmente na maioria das vezes (Priority: P1)

O usuário usa o app normalmente ao longo do dia (cria/edita um bookmark, avança a leitura, adiciona uma palavra ao vocabulário) depois de um intervalo grande sem abrir o app — tempo suficiente pro token do Drive expirar. Hoje isso trava a sincronização até o usuário notar e ir manualmente em Configurações reconectar. Com a mudança, a próxima ação de sync tenta renovar o token sozinha, em segundo plano, sem o usuário perceber nada na maioria dos casos.

**Why this priority**: É a mudança estrutural central — resolve a fricção relatada ("pede pra conectar toda hora") sem exigir nenhuma ação nova do usuário. Sozinha, já reduz drasticamente a necessidade do fluxo manual.

**Independent Test**: Simular um token expirado (ou aguardar a expiração natural) com o Drive já conectado antes (escopo já concedido), disparar uma sincronização qualquer (criar um bookmark, por exemplo), e confirmar que ela completa com sucesso sem exigir nenhum toque em "Conectar".

**Acceptance Scenarios**:

1. **Given** o token do Drive expirou mas o escopo já foi concedido antes, **When** o usuário dispara qualquer sincronização (bookmark, progresso ou vocabulário), **Then** o sistema renova o token sozinho, em segundo plano, e a sincronização completa normalmente sem exigir toque manual.
2. **Given** a renovação silenciosa não resolveu (ex: acesso revogado), **When** o usuário abre Configurações > Sincronização na Nuvem, **Then** o botão manual "Conectar Google Drive" continua disponível e funcional, do jeito que já funciona hoje.

---

### User Story 2 - Usuário resolve um bookmark pendente direto da tela de Detalhes (Priority: P1)

O usuário cria ou edita um bookmark e percebe (pelo ícone de nuvem cinza ou vermelho) que ele não sincronizou. Em vez de navegar até Configurações, ele toca no próprio ícone do bookmark — isso já conecta o Drive (se precisar) e sincroniza os bookmarks pendentes daquele livro, ali mesmo.

**Why this priority**: É o segundo pedido central do usuário — um caminho mais intuitivo e direto pra resolver o problema no exato lugar onde ele é percebido, sem trocar de tela.

**Independent Test**: Com um bookmark pendente/com erro visível na tela de Detalhes, tocar no ícone de nuvem dele, ver o estado "sincronizando", e confirmar que o ícone atualiza pro estado sincronizado (ou erro, se a tentativa falhar de verdade) sem sair da tela.

**Acceptance Scenarios**:

1. **Given** o usuário está na tela de Detalhes de um livro com pelo menos um bookmark pendente ou com erro, **When** ele toca no ícone de nuvem desse bookmark, **Then** o sistema dispara a sincronização de todos os bookmarks pendentes/com erro daquele livro, reconectando o Drive primeiro se necessário.
2. **Given** a sincronização foi disparada pelo toque, **When** ela está em andamento, **Then** os ícones dos bookmarks envolvidos mostram um estado visual de "sincronizando", distinto de pendente/sincronizado/erro.
3. **Given** o usuário nunca conectou o Google Drive (nem tentou antes), **When** ele toca no ícone de um bookmark pendente, **Then** o sistema abre o fluxo completo de autenticação (com o seletor de conta/consentimento visível), do mesmo jeito que o botão de Configurações já faz hoje.
4. **Given** um bookmark já está sincronizado (ícone verde, sem erro), **When** o usuário toca nele, **Then** nada acontece — esse ícone não é uma ação, só informativo.

---

### User Story 3 - Renovação automática e ação manual continuam consistentes entre si (Priority: P2)

Os dois pontos de entrada (renovação automática em qualquer sync, e o ícone tocável na tela de Detalhes) usam o mesmo mecanismo de conexão por baixo — não são dois sistemas paralelos. Se um resolver a conexão, o outro reflete isso imediatamente.

**Why this priority**: Garante que a experiência seja coerente (não uma tela dizendo "conectado" e outra "pendente" ao mesmo tempo por inconsistência entre os dois pontos de entrada), mas não é bloqueante — as duas primeiras stories já entregam o valor central.

**Independent Test**: Reconectar pelo ícone da tela de Detalhes e verificar que Configurações > Sincronização na Nuvem já reflete "Conectado" sem precisar de nenhuma ação adicional nessa segunda tela, e vice-versa.

**Acceptance Scenarios**:

1. **Given** o usuário reconectou o Drive tocando no ícone de um bookmark, **When** ele abre Configurações > Sincronização na Nuvem, **Then** vê o status já atualizado (conectado), sem precisar tocar em nada lá.
2. **Given** o usuário reconectou pelo botão de Configurações, **When** ele volta pra tela de Detalhes de um livro com bookmark antes pendente, **Then** o ícone reflete o novo estado (sincronizado) na próxima vez que a tela avaliar o status daquele bookmark.

### Edge Cases

- Sem internet nenhuma: a renovação silenciosa falha por rede (não por token/permissão) — o item continua em estado pendente, sem loop infinito de novas tentativas automáticas, e o ícone/botão continuam disponíveis pra um novo toque manual.
- Toques repetidos/rápidos no mesmo ícone: não deve disparar múltiplas sincronizações simultâneas pro mesmo livro.
- Usuário edita ou apaga um bookmark enquanto a sincronização disparada pelo toque ainda está em andamento: não deve gerar duplicação nem estado inconsistente — mesmo tratamento de concorrência que o mecanismo de sync já aplica hoje.
- Usuário Free (não Pro): o ícone de bookmark não aparece (comportamento já existente hoje, sem mudança) — nada tocável pra esse usuário.
- Livro sem nenhum bookmark pendente/com erro: nenhum ícone fica tocável, nenhuma ação nova disponível.
- Renovação silenciosa disparada por um tipo de sync (ex: progresso) resolve o token a tempo de outro tipo de sync (ex: bookmark), que estava esperando na mesma janela, também se beneficiar — sem pedir renovação duplicada pro mesmo token quase ao mesmo tempo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE, ao detectar o token do Google Drive ausente ou expirado no início de qualquer tentativa de sincronização (bookmark, progresso ou vocabulário), tentar renovar esse token silenciosamente — reaproveitando o mecanismo de reautenticação já existente — antes de marcar o item como erro/pendente.
- **FR-002**: Sistema DEVE, quando a renovação silenciosa resolver o token, prosseguir com a sincronização normalmente, sem exigir nenhuma ação do usuário.
- **FR-003**: Sistema DEVE, quando a renovação silenciosa não resolver o token (ex: acesso revogado, nunca concedido), manter disponível o fluxo de fallback manual já existente em Configurações > Sincronização na Nuvem.
- **FR-004**: Sistema DEVE exibir o ícone de nuvem de cada bookmark, na tela de Detalhes do Livro, como tocável quando o bookmark estiver pendente (nunca sincronizado) ou com erro de sincronização.
- **FR-005**: Sistema DEVE, ao tocar num ícone de bookmark tocável, disparar a sincronização de todos os bookmarks pendentes ou com erro daquele livro — reconectando o Drive primeiro se necessário, usando o fluxo completo de autenticação (incluindo prompt visível quando for a primeira conexão ou o acesso tiver sido revogado).
- **FR-006**: Sistema DEVE exibir um estado visual de "sincronizando" nos ícones dos bookmarks durante a sincronização disparada pelo toque, distinto dos estados existentes (pendente/sincronizado/erro).
- **FR-007**: Sistema NÃO DEVE tornar tocável o ícone de um bookmark já sincronizado (sem erro, com `syncedAt` preenchido).
- **FR-008**: Sistema NÃO DEVE disparar múltiplas tentativas de sincronização simultâneas pro mesmo livro a partir de toques repetidos no ícone.
- **FR-009**: Sistema NÃO DEVE alterar a duração do token do Drive nem implementar um fluxo de `refresh_token` de longa duração nesta feature.
- **FR-010**: Sistema NÃO DEVE estender o ícone tocável/estado "sincronizando" pra progresso ou vocabulário nesta feature.
- **FR-011**: Sistema NÃO DEVE remover, substituir ou alterar visualmente a tela "Configurações > Sincronização na Nuvem" além de já refletir o status atualizado pela renovação silenciosa.

### Key Entities

Não aplicável — esta feature reaproveita campos já existentes (`syncError`, `syncedAt` de bookmark; status de sync de progresso/vocabulário), sem introduzir ou alterar entidades de dados persistidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Depois de o token expirar durante o uso normal do app (sem o usuário abrir Configurações antes), a próxima ação de sincronização recupera a conexão sozinha na maioria dos casos (quando o Drive já foi conectado antes), sem exigir toque manual em "Conectar".
- **SC-002**: Usuário consegue resolver um bookmark pendente ou com erro inteiramente a partir da tela de Detalhes do Livro, sem precisar navegar até Configurações.
- **SC-003**: Quando a renovação automática falha de verdade (revogado/nunca conectado), o usuário ainda tem um caminho claro de recuperação — tanto pelo fallback em Configurações quanto pelo próprio ícone de bookmark, e ambos os caminhos levam ao mesmo resultado (mesmo fluxo de autenticação).
- **SC-004**: Nenhuma sincronização duplicada ou concorrente é disparada pro mesmo bookmark/livro por causa dos novos pontos de entrada (ícone tocável + renovação automática rodando ao mesmo tempo que outro tipo de sync).

## Assumptions

- O mecanismo de reautenticação já existente (`refreshDriveToken()`, que chama `signInWithGoogle` com o escopo do Drive) já retorna silenciosamente, sem exibir nada ao usuário, quando esse escopo já foi concedido antes — confirmado por investigação de código nesta sessão (no Android nativo, a API de autorização do Google só mostra UI quando o escopo ainda não foi concedido). Esta feature reaproveita esse comportamento já existente; não cria um novo mecanismo de autenticação.
- O ícone de nuvem por bookmark (`Cloud`/`CloudOff`) já existe na tela de Detalhes do Livro e já reflete corretamente `syncError`/`syncedAt` — esta feature só adiciona interatividade (toque) e um novo estado visual ("sincronizando"), sem mudar quando cada estado hoje aparece.
- O mecanismo de sincronização de bookmark já tem alguma forma de guard contra chamadas concorrentes pro mesmo livro (evita rodar duas sincronizações do mesmo livro ao mesmo tempo) — presumido suficiente pra cobrir FR-008; o `sdd-plan` confirma se esse guard já existente cobre também o caso do toque no ícone, ou se precisa de ajuste.
- Esta feature parte dos dois bugs corrigidos na mesma sessão (`tela-sincronizacao-na-nuvem-sem-opcao`, `reconectar-google-drive-nao-recupera-bookmarks`) e do item já registrado como "feature futura" nas Assumptions de `004-settings-categorias/spec.md` sobre mover visibilidade de sync pra tela de detalhes do livro — mas o escopo aqui é mais específico (ação inline no ícone, não uma migração completa da tela de status).

## Clarifications

### Sessão 2026-09-02

- Q: Quando o app deve tentar renovar o token sozinho, sem o usuário clicar em nada? → A: Só quando uma sincronização realmente for tentada (lazy, no momento da tentativa) — não proativamente ao abrir o app.
- Q: Se a renovação silenciosa falhar de verdade, o que acontece? → A: Mantém o botão manual em Configurações como fallback (sem adicionar avisos/toasts novos).
- Q: Ao tocar no ícone de um bookmark pendente/com erro, o que deve sincronizar? → A: Todos os bookmarks pendentes/com erro daquele livro, não só o bookmark tocado.
- Q: O ícone de bookmark deve ficar tocável em todos os estados, ou só pendente/erro? → A: Só quando pendente ou com erro; ícone já sincronizado continua só informativo.
- Q: O refresh silencioso vale só pra bookmarks, ou pros 3 tipos de sync (bookmarks, progresso, vocabulário)? → A: Os 3 igualmente, já que compartilham o mesmo token (FR-001 cobre os 3 tipos).
- Q: Se o usuário nunca concedeu acesso ao Drive e toca no ícone de bookmark pendente na tela de Detalhes, pode abrir o seletor de conta ali, fora de Configurações? → A: Sim, mesmo fluxo completo de autenticação, disparado de qualquer lugar (FR-005).
- Q: Durante a sincronização disparada pelo toque, precisa de um estado visual de "sincronizando"? → A: Sim — sem isso o usuário não sabe se o toque registrou (FR-006).
