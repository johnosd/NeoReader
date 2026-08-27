# Feature Specification: Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano

**Slug**: `001-audiobook-background-playback`

**Created**: 2026-08-26

**Status**: Em Execução

**Input**: gostaria de ajustar a forma como funciona o modo audio-book (tts). quando coloco neste modo ele começa ler o livro usando tts, mas parece que após um periodo, a tela desliga e ele para de ler, eu gostaria que quando etivesse nesse modo ele continuasse a leitura com tss sem ser interrompido

## Escopo

### Incluído

- Narração TTS contínua (modo audiobook) do NeoReader Android continua tocando sem interrupção quando a tela do dispositivo apaga sozinha por inatividade.
- Narração continua tocando quando o usuário coloca o app em segundo plano (Home, troca de app) ou bloqueia o celular manualmente.
- Notificação persistente (estilo player de mídia) enquanto o audiobook toca em segundo plano, com capa do livro, título/capítulo atual e controles de play/pause/avançar.
- Controles da notificação/tela de bloqueio refletem e alteram o mesmo estado de reprodução usado dentro do app.
- Pausa automática ao perder o foco de áudio (ligação recebida, outro app de mídia) e retomada automática quando o foco volta.
- Ao reabrir o app durante playback em segundo plano, o leitor mostra o trecho sendo narrado no momento, sincronizado.

### Fora de Escopo

- Comportamento no navegador/Web (PWA) — depende de cada browser e não é alterado por esta feature.
- Qualquer reprodução de TTS avulsa/curta (ex: pronúncia de palavra no Word Lens, `speakOne`) — só a narração contínua do audiobook é afetada.
- Build iOS — o projeto hoje é Android + Web, sem build iOS.
- Sobrevivência a gerenciadores de bateria agressivos de fabricante (ex: MIUI, ColorOS, One UI em modo extremo) que exigem o usuário desativar otimização de bateria manualmente — comportamento do fabricante fora do controle do app.
- Encerramento explícito do app pelo usuário (removê-lo da tela de apps recentes) — nesse caso é esperado que a narração pare; não é tratado como interrupção indevida.
- Sincronização de progresso entre dispositivos durante playback em segundo plano — usa o mecanismo de progresso já existente, sem mudanças aqui.
- Mudanças no toggle "Manter tela ligada" (Configurações > Narração) — continua existindo como preferência independente (ver Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tela apaga sozinha e a narração continua (Priority: P1)

Um usuário deixa o celular narrando um livro em modo audiobook, apoiado na mesa. Depois de um tempo de inatividade a tela apaga sozinha (comportamento normal do Android) — hoje isso faz a narração parar; o usuário quer que ela continue normalmente.

**Why this priority**: É o bug relatado originalmente e o cenário mais comum de uso do audiobook (ouvir sem olhar pra tela). Sem isso, a feature não resolve o problema central.

**Independent Test**: Iniciar o modo audiobook, não tocar no celular até a tela apagar sozinha por inatividade, e confirmar que a narração continua audível por pelo menos 30 minutos sem parar.

**Acceptance Scenarios**:

1. **Given** o audiobook está tocando e o app em primeiro plano, **When** a tela apaga sozinha por inatividade, **Then** a narração continua normalmente, avançando pelos parágrafos do livro.
2. **Given** a narração continua com a tela apagada, **When** o usuário liga a tela novamente e abre o app, **Then** o leitor mostra o parágrafo que está sendo narrado no momento, com o progresso correspondente ao tempo decorrido.

---

### User Story 2 - App em segundo plano ou celular bloqueado manualmente (Priority: P2)

Um usuário inicia o audiobook e sai do app (aperta Home, troca para outro app, ou pressiona o botão de energia para bloquear o celular). Ele espera que a narração continue tocando normalmente, como um player de podcast.

**Why this priority**: Extensão natural do cenário P1 — ouvir em segundo plano enquanto usa outro app ou com o celular no bolso é o uso típico de um audiobook.

**Independent Test**: Iniciar o audiobook, colocar o app em segundo plano (Home ou trocar de app) ou bloquear o celular manualmente, aguardar alguns minutos, e confirmar que a narração continuou tocando durante esse período.

**Acceptance Scenarios**:

1. **Given** o audiobook está tocando, **When** o usuário aperta Home ou abre outro app, **Then** a narração continua tocando normalmente em segundo plano.
2. **Given** o audiobook está tocando, **When** o usuário pressiona o botão de energia para bloquear o celular manualmente, **Then** a narração continua tocando normalmente.
3. **Given** a narração tocou em segundo plano por vários minutos, **When** o usuário reabre o app, **Then** o progresso do livro reflete o tempo que passou tocando (não voltou ao ponto em que o app foi colocado em segundo plano).

---

### User Story 3 - Controles de reprodução na notificação/tela de bloqueio (Priority: P3)

Com a tela apagada, bloqueada, ou o app em segundo plano, o usuário quer pausar, retomar ou avançar a narração sem precisar reabrir o app — usando a notificação do Android ou os controles da tela de bloqueio, com a capa e o título do livro visíveis.

**Why this priority**: Depende da infraestrutura de reprodução em segundo plano das stories P1/P2 já existir; sem isso a notificação não teria o que controlar. Mas entrega valor por si só (conveniência de controle sem desbloquear o celular).

**Independent Test**: Com o audiobook tocando e a tela apagada/bloqueada ou o app em segundo plano, usar o botão de pause/play na notificação ou na tela de bloqueio e confirmar que a narração pausa/retoma corretamente, e que a capa/título exibidos correspondem ao livro atual.

**Acceptance Scenarios**:

1. **Given** o audiobook está tocando em segundo plano, **When** o sistema operacional exibe a notificação de reprodução, **Then** ela mostra a capa do livro, o título/capítulo atual, e controles de play/pause e avançar.
2. **Given** a notificação de reprodução está visível, **When** o usuário toca em pause pela notificação ou tela de bloqueio, **Then** a narração pausa e, ao reabrir o app, o estado de pausa é o mesmo mostrado ali.
3. **Given** a narração está pausada pela notificação, **When** o usuário toca em play novamente, **Then** a narração retoma do ponto exato em que parou.
4. **Given** o audiobook termina o livro ou é parado (stop), **When** isso acontece, **Then** a notificação é removida automaticamente.

---

### User Story 4 - Pausa e retomada automática em interrupções de áudio (Priority: P4)

Enquanto o audiobook toca, o usuário recebe uma ligação telefônica ou abre outro app que também reproduz áudio (ex: Spotify). Ele espera que o audiobook ceda o áudio automaticamente e retome sozinho depois, sem precisar reiniciar a narração manualmente.

**Why this priority**: Cenário de interrupção menos frequente que apagar a tela ou trocar de app, mas evita uma experiência quebrada (dois áudios simultâneos ou narração perdida) quando acontece.

**Independent Test**: Iniciar o audiobook, receber uma ligação (ou simular perda de foco de áudio abrindo outro app de mídia), confirmar que a narração pausa sozinha; encerrar a ligação (ou parar o outro app), e confirmar que a narração retoma sozinha de onde parou.

**Acceptance Scenarios**:

1. **Given** o audiobook está tocando, **When** uma ligação telefônica é recebida, **Then** a narração pausa automaticamente antes do toque/atendimento.
2. **Given** a narração foi pausada por uma ligação, **When** a ligação termina, **Then** a narração retoma automaticamente do ponto em que parou.
3. **Given** o audiobook está tocando, **When** outro app inicia reprodução de áudio que assume o foco (ex: Spotify), **Then** a narração pausa automaticamente e não retoma enquanto o outro app estiver com o foco de áudio.

---

### Edge Cases

- Usuário troca de livro ou fecha o leitor enquanto o audiobook toca em segundo plano → notificação é removida e a narração para.
- O livro termina de narrar enquanto o app está em segundo plano → a notificação reflete o fim (ou desaparece) e, ao reabrir o app, o estado mostrado é "parado", não "tocando".
- A síntese está usando um provedor premium (Speechify/ElevenLabs/Fish Audio) que depende de rede, e a conexão cai enquanto em segundo plano → o fallback automático para TTS nativo já existente continua funcionando normalmente.
- Toques rápidos e repetidos no botão de play/pause da notificação → o estado final exibido no app e na notificação permanece consistente (sem dessincronizar).
- Bateria do celular entra em modo de economia de energia agressivo do próprio Android (não do fabricante) → a narração deve continuar, já que reprodução de mídia em segundo plano é uma categoria que o Android prioriza manter viva.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE continuar a narração TTS contínua (modo audiobook) sem interrupção quando a tela do dispositivo apagar automaticamente por inatividade, enquanto o app não tiver sido fechado pelo usuário.
- **FR-002**: O sistema DEVE continuar a narração TTS contínua quando o usuário colocar o app em segundo plano (Home, troca de app) ou bloquear o dispositivo manualmente, até o fim do livro ou pausa/parada manual.
- **FR-003**: O sistema DEVE exibir uma notificação persistente enquanto o audiobook estiver tocando fora do primeiro plano, indicando que o NeoReader está narrando.
- **FR-004**: A notificação DEVE exibir a capa do livro e o título/capítulo atual sendo narrado, junto com controles de play/pause e avançar.
- **FR-005**: O sistema DEVE permitir pausar e retomar a narração pelos controles da notificação/tela de bloqueio, refletindo o mesmo estado de reprodução usado dentro do app.
- **FR-006**: A notificação DEVE ser removida automaticamente quando a narração for encerrada (fim do livro, parada manual, ou fechamento do leitor/livro).
- **FR-007**: O sistema DEVE pausar automaticamente a narração ao perder o foco de áudio do dispositivo (ex: chamada telefônica recebida, outro app de mídia assume a reprodução).
- **FR-008**: O sistema DEVE retomar automaticamente a narração do ponto em que parou somente quando a perda de foco de áudio foi transitória (ex: chamada telefônica) e o foco for devolvido ao app; quando a perda for permanente (ex: usuário abriu outro app de mídia de propósito, como o Spotify), o sistema NÃO deve retomar sozinho — a narração fica pausada até o usuário retomar manualmente.
- **FR-009**: Ao reabrir o app enquanto o audiobook está tocando em segundo plano, o leitor DEVE exibir o parágrafo/trecho sendo narrado no momento, sincronizado com a narração em andamento.
- **FR-010**: O comportamento de não-interrupção (FR-001 a FR-009) DEVE ser automático para o modo audiobook — não deve depender de nenhuma configuração manual do usuário para funcionar.
- **FR-011**: O fallback automático já existente entre provedor de TTS premium e TTS nativo DEVE continuar funcionando normalmente durante a narração em segundo plano.
- **FR-012**: Este comportamento aplica-se apenas ao build Android nativo (Capacitor); o comportamento da versão Web permanece inalterado.
- **FR-013**: Este comportamento aplica-se somente ao modo de narração contínua do livro (audiobook); reproduções avulsas de TTS (ex: pronúncia de palavra) não são afetadas e mantêm o comportamento atual.

### Key Entities

*Não aplicável — esta feature altera comportamento de reprodução em tempo de execução e não introduz novas entidades de dados persistidas.*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário inicia o modo audiobook, deixa a tela apagar por inatividade, e a narração permanece audível continuamente por pelo menos 30 minutos sem parar sozinha.
- **SC-002**: Um usuário coloca o app em segundo plano ou bloqueia o celular manualmente durante o audiobook por 15+ minutos; ao reabrir o app, o progresso do livro avançou de acordo com o tempo decorrido tocando.
- **SC-003**: Um usuário consegue pausar e retomar a narração usando os controles da notificação/tela de bloqueio, sem abrir o app, com sucesso em pelo menos 95% das tentativas.
- **SC-004**: Ao receber uma ligação durante o audiobook, a narração pausa automaticamente e retoma sozinha após a ligação terminar, sem qualquer ação manual do usuário.
- **SC-005**: Após o lançamento desta feature, o relato original ("a tela desliga e a leitura para") deixa de ocorrer em uso normal do app.

## Assumptions

- O app já usa TTS nativo (`@capacitor-community/text-to-speech`) e provedores premium (Speechify, ElevenLabs, Fish Audio) via áudio HTML5, com fallback automático entre eles já implementado; essa lógica de escolha de provedor não muda.
- Esta feature é exclusiva do build Android nativo; a versão Web/PWA não é afetada e mantém o comportamento atual (sujeito ao navegador).
- O toggle "Manter tela ligada" existente em Configurações > Narração é mantido como está — vira uma preferência independente e opcional para quem quer a tela acesa por motivo visual (ex: acompanhar o texto), e deixa de ser o mecanismo responsável por manter a narração viva em segundo plano, já que essa responsabilidade passa a ser automática (FR-010).
- Gerenciadores de bateria agressivos específicos de fabricante (ex: MIUI, ColorOS) que exigem o usuário liberar manualmente o app da otimização de bateria não são cobertos por esta feature.
- Encerrar o app explicitamente pela tela de apps recentes é uma ação deliberada do usuário; espera-se que a narração pare nesse caso.

## Clarifications

### Sessão 2026-08-26

- Q: Quando o audiobook (TTS) estiver tocando, qual comportamento você quer para a tela? → A: Tela pode apagar, áudio continua tocando em segundo plano (como Spotify/podcast).
- Q: Se o usuário sair do app (Home, outro app, ou bloquear manualmente), a leitura em áudio deve continuar tocando? → A: Sim, deve continuar tocando até terminar ou ser pausada manualmente.
- Q: Você quer controles de play/pause/pular na tela de bloqueio ou notificação do Android? → A: Sim, quero controles.
- Q: Esse comportamento deve ser automático sempre que o audiobook estiver tocando, ou continuar como opção manual em Configurações? → A: Automático, sem configuração.
- Q: Essa melhoria deve valer só para Android nativo, ou também Web/PWA? → A: Só Android nativo.
- Q: Se tocar uma ligação ou o usuário abrir outro app de áudio (ex: Spotify), o que deve acontecer com o audiobook? → A: Pausa e retoma depois automaticamente.
- Q: O que deve aparecer na notificação/tela de bloqueio com os controles? → A: Capa do livro + título + controles (play/pause/avançar).
- Q: "Modo audiobook" é especificamente a narração contínua a partir do texto do leitor — essa é a única situação afetada, e não reproduções avulsas de TTS (ex: pronúncia de palavra)? → A: Sim, só a narração contínua.

### Sessão 2026-08-26 (sdd-plan)

- FR-008 tinha um `[NEEDS CLARIFICATION]` sobre retomar ou não a narração após ceder o foco de áudio pra outro app de mídia. Resolvido durante o `sdd-plan` (`plan.md`, Decisões Invariantes): o Android já distingue perda de foco **transitória** (`AUDIOFOCUS_LOSS_TRANSIENT`, ex: chamada) de perda **permanente** (`AUDIOFOCUS_LOSS`, ex: outro app assumiu deliberadamente) — a retomada automática vale só pra transitória. FR-008 atualizado para refletir isso.
