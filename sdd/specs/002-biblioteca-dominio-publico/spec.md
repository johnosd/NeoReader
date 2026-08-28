# Feature Specification: Biblioteca de Domínio Público (Standard Ebooks)

**Slug**: `002-biblioteca-dominio-publico`

**Created**: 2026-08-28

**Status**: Convergida

**Input**: Criar uma feature de biblioteca de domínio público (Standard Ebooks) dentro do app, usando o handoff de `sdd/assessments/livros-dominio-publico-dentro-app-download/decision.md` como contexto de entrada.

## Escopo

### Incluído

- Seção "Clássicos em Inglês" dentro da tela Descubra, com catálogo curado de EPUBs de domínio público do Standard Ebooks, em grid simples (sem busca/filtro).
- Atalho no estado vazio da tela Biblioteca (quando o usuário não tem nenhum livro) que leva a essa seção.
- Download de um EPUB individual, direto da fonte (Standard Ebooks), restrito a Android nativo.
- Após o download concluir, import automático pelo pipeline de import já existente (`BookImportService`) — o livro passa a existir na Biblioteca como um `Book` local normal (capa, metadados, progresso, etc.), sem storage/schema paralelo.
- Indicador de progresso do download inline no card do título.
- Download continua em segundo plano se o usuário navegar pra outra tela do app antes de concluir.
- Tratamento de erro de download (rede indisponível, conexão interrompida) com opção de tentar novamente.
- Copy da seção deixa explícito que o conteúdo é em inglês.

### Fora de Escopo

- Build Web — esta fase cobre só Android nativo (CORS do Standard Ebooks não é resolvido aqui; ver `decision.md`).
- Gutendex / Project Gutenberg como fonte adicional.
- Open Library como fonte de arquivo (cogitada só como enriquecimento futuro de metadados/capa).
- Busca ou filtro dentro do catálogo de domínio público.
- Sincronização/atualização automática do catálogo em segundo plano — a lista do MVP é curada e fixa; refresh de catálogo (via feed de novidades do Standard Ebooks ou re-curadoria manual) é decisão operacional fora desta spec.
- Abertura automática do livro após o download — o livro fica disponível na Biblioteca, o usuário decide quando abrir.
- Sistema automatizado de validação jurídica por título (curadoria manual do Standard Ebooks é aceita como mitigação suficiente para o risco Brasil x EUA — decisão já registrada em `problem.md`).
- Mensagem específica de "espaço de armazenamento insuficiente" — reaproveita o tratamento de erro genérico já existente no pipeline de import.
- Continuação do download entre sessões do app (se o app for encerrado/morto pelo sistema operacional durante um download, ele não retoma sozinho ao reabrir).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usuário novo sem livros baixa seu primeiro clássico (Priority: P1)

Um usuário instala o NeoReader e abre o app pela primeira vez. A Biblioteca está vazia — ele não tem nenhum EPUB próprio importado. Em vez de um beco sem saída, ele vê um atalho que leva a uma seção de clássicos gratuitos, escolhe um título, baixa, e passa a ter um livro pronto pra ler.

**Why this priority**: É o problema central que motivou a feature (app vazio no primeiro uso) — sem esta jornada, a feature não entrega valor algum.

**Independent Test**: Com a Biblioteca vazia, tocar no atalho, escolher um título no grid da seção "Clássicos em Inglês", tocar em baixar, aguardar a conclusão, e confirmar que o livro aparece na Biblioteca e abre normalmente no leitor.

**Acceptance Scenarios**:

1. **Given** a Biblioteca está vazia, **When** o usuário abre a tela Biblioteca, **Then** ele vê um atalho pra seção de clássicos gratuitos.
2. **Given** o usuário está na seção "Clássicos em Inglês" dentro de Descubra, **When** toca em "baixar" num título, **Then** vê um indicador de progresso no card daquele título.
3. **Given** o download concluiu com sucesso, **When** o usuário volta pra Biblioteca, **Then** o livro aparece na lista normal, com capa e metadados, pronto pra abrir.

---

### User Story 2 - Usuário já com livros baixa clássicos adicionais (Priority: P2)

Um usuário que já importou seus próprios EPUBs navega até Descubra, encontra a seção "Clássicos em Inglês" e baixa um ou mais títulos adicionais — por exemplo, pra praticar inglês com o Word Lens/TTS.

**Why this priority**: Extensão natural da mesma infraestrutura da P1, cobrindo o usuário recorrente (não só o de primeiro uso).

**Independent Test**: Com a Biblioteca já populada, navegar até Descubra > Clássicos em Inglês, baixar um título, e confirmar que ele aparece na Biblioteca ao lado dos livros já existentes.

**Acceptance Scenarios**:

1. **Given** a Biblioteca já tem livros, **When** o usuário abre Descubra, **Then** vê a seção "Clássicos em Inglês" junto das seções já existentes.
2. **Given** o usuário baixa um título cujo mesmo clássico ele já tinha importado de outra fonte, **When** o download conclui, **Then** o novo arquivo é tratado pelo pipeline de dedupe já existente (comportamento herdado, sem regra nova nesta feature).

---

### User Story 3 - Falha de rede durante o download (Priority: P3)

O usuário tenta baixar um título sem conexão de internet, ou a conexão cai no meio do download. O app comunica o erro claramente e permite tentar novamente, sem travar a navegação.

**Why this priority**: Garante que a feature não deixe o usuário confuso ou travado quando a rede falha. Não bloqueia o valor central (coberto por P1/P2), mas é necessário pra uma experiência confiável.

**Independent Test**: Desligar a conexão de rede do dispositivo, tentar baixar um título, confirmar mensagem de erro clara com opção de tentar novamente; religar a rede e confirmar que o retry funciona.

**Acceptance Scenarios**:

1. **Given** o dispositivo está sem conexão, **When** o usuário toca em "baixar" um título, **Then** vê uma mensagem de erro clara (ex: "sem conexão") no card, sem travar a tela.
2. **Given** um download falhou no meio (conexão caiu), **When** o usuário toca em "tentar novamente", **Then** o download reinicia do zero pro mesmo título.
3. **Given** o catálogo (lista de títulos e capas) já está embutido no app, **When** o usuário está offline, **Then** a seção "Clássicos em Inglês" ainda mostra a lista normalmente — só o download em si exige rede.

---

### Edge Cases

- Usuário toca em "baixar" duas vezes seguidas no mesmo título antes do primeiro download terminar — não deve disparar dois downloads paralelos do mesmo arquivo.
- Usuário navega pra outra tela do app com um download em andamento — o download continua em segundo plano (ver User Story 3 / FR-010); o indicador de progresso deve refletir isso ao voltar pra seção.
- A URL de download de um título específico do catálogo fica indisponível (link quebrado do lado do Standard Ebooks) — tratado como falha de download comum (FR-006), sem necessidade de detecção especial.
- Falta de espaço de armazenamento no dispositivo durante o download — reaproveita o erro genérico de import já existente (Fora de Escopo: mensagem específica).
- App é encerrado/morto pelo sistema operacional com um download em andamento — o download não retoma sozinho ao reabrir o app (Fora de Escopo: continuidade entre sessões).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE exibir uma seção "Clássicos em Inglês" dentro da tela Descubra, com um catálogo curado de títulos de domínio público (Standard Ebooks), em formato de grid simples, sem busca nem filtro.
- **FR-002**: Sistema DEVE exibir, para cada título do catálogo, ao menos capa, título e autor.
- **FR-003**: Sistema DEVE permitir ao usuário iniciar o download de um EPUB individual a partir do catálogo, funcionalidade restrita ao Android nativo (não disponível na build Web).
- **FR-004**: Sistema DEVE mostrar um indicador de progresso do download, associado ao card do título correspondente, enquanto o download estiver em andamento.
- **FR-005**: Sistema DEVE, ao concluir o download com sucesso, importar o EPUB automaticamente pelo pipeline de import existente (`BookImportService`) e exibi-lo na Biblioteca do usuário, sem exigir nenhuma ação manual adicional.
- **FR-006**: Sistema DEVE exibir uma mensagem de erro clara e uma opção de tentar novamente quando o download falhar (rede indisponível, conexão interrompida, URL de origem indisponível).
- **FR-007**: Sistema DEVE exibir um atalho para a seção "Clássicos em Inglês" no estado vazio da tela Biblioteca (quando o usuário não possui nenhum livro).
- **FR-008**: Sistema DEVE deixar explícito, na copy da seção (título/descrição), que o conteúdo do catálogo é em inglês.
- **FR-009**: Sistema NÃO DEVE exigir conexão de rede para exibir a lista/catálogo em si — a lista (títulos, autores, capas) é embutida no app; só o download individual de um EPUB exige rede.
- **FR-010**: Sistema DEVE manter o download em andamento mesmo que o usuário navegue para outra tela dentro do app antes da conclusão, e refletir o progresso/conclusão ao retornar à seção.
- **FR-011**: Sistema NÃO DEVE permitir que o mesmo título tenha dois downloads simultâneos disparados por toques repetidos.
- **FR-012**: Sistema DEVE tratar falha por falta de espaço de armazenamento durante o download reaproveitando o caminho de erro genérico já existente no pipeline de import, sem mensagem dedicada.

### Key Entities *(include if feature involves data)*

- **Catalog Entry (domínio público)**: item do catálogo curado embutido no app — título, autor, capa, URL de download do EPUB, identificador da fonte (Standard Ebooks). Existe só como dado de catálogo; vira um `Book` de verdade somente após download + import bem-sucedido.
- **Download State**: estado de progresso (idle / downloading / success / error) associado a um Catalog Entry, válido durante a sessão do app; não é persistido entre reaberturas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário novo, com a Biblioteca vazia, consegue chegar de "nenhum livro" a "1 livro pronto pra ler" em no máximo 3 toques (atalho → escolher título → baixar).
- **SC-002**: Uma fração mensurável de usuários novos (sem import próprio prévio) abre pelo menos 1 livro via essa seção dentro das primeiras 24h após instalar. **Não mensurável nesta fase** — o NeoReader não tem telemetria/analytics remoto hoje (é local-first, sem backend próprio de dados de uso; `DiagnosticsLogger`/`ImportDiagnostics` só escrevem em log local via `console`/`adb logcat`, não agregam entre usuários). Fica registrado como meta qualitativa/aspiracional; decisão explícita de não adicionar infraestrutura de analytics só para esta feature (ver `plan.md` R-005).
- **SC-003**: A taxa de falha de download (excluindo falhas de conectividade do próprio usuário) fica baixa o suficiente para não gerar reclamação recorrente. **Não mensurável nesta fase**, mesma razão do SC-002 — sem telemetria remota, ninguém consegue calcular essa taxa agregada. Validação fica restrita a testes manuais/`quickstart.md` durante o desenvolvimento.
- **SC-004**: Zero notificações de infração de direitos autorais relacionadas ao catálogo embutido, em produção.

## Assumptions

- A seção fica disponível para todos os usuários (free e Pro) — não é bloqueada pelo entitlement Pro, consistente com o objetivo de reduzir fricção para usuário novo (que ainda nem decidiu assinar).
- Ads já existentes na tela Descubra (ocultados para usuário Pro) continuam se aplicando normalmente à seção nova, sem lógica adicional específica desta feature.
- O catálogo curado do MVP foi entregue com 5 títulos verificados manualmente (Pride and Prejudice, Frankenstein, The Adventures of Sherlock Holmes, A Christmas Carol, Dracula) — suficiente pra validar o mecanismo ponta a ponta. Expandir pra ~30-50 títulos é trabalho de curadoria de conteúdo, rastreado como follow-up não-bloqueante (`tasks.md` T030), fora do escopo de código desta spec.
- O card do catálogo reaproveita visualmente o padrão de rows/cards já usado em Descubra (ex: `NytBooksRow`), mantendo consistência com a direção visual "Netflix for Books".
- "Continuar em segundo plano" (FR-010) significa dentro da mesma sessão do app em primeiro plano, navegando entre telas do NeoReader — não é playback/download persistente estilo notificação do sistema operacional (isso não foi pedido nem faz sentido pro caso de uso).

## Clarifications

### Sessão 2026-08-28

- Q: Onde essa "prateleira" de livros de domínio público aparece no app? → A: Dentro do Descubra (nova seção) + atalho no estado vazio da Biblioteca.
- Q: Como rotular a seção, já que todo o catálogo é em inglês? → A: Deixar claro que é em inglês (ex: "Clássicos em Inglês").
- Q: Estilo de navegação do catálogo no MVP (lista pequena e curada)? → A: Grid simples, sem busca/filtro.
- Q: Feedback durante e depois do download de um livro? → A: Progresso inline no card; ao concluir, o livro fica na Biblioteca (não abre sozinho).
- Q: Se o usuário sair da tela/navegar pra outro lugar com um download em andamento, o que acontece? → A: Continua em segundo plano (dentro da sessão do app).
- Q: Como tratar erro de espaço insuficiente de armazenamento durante o download? → A: Reaproveita o erro genérico já existente no pipeline de import.

### Sessão 2026-08-28 (pós-plan, achado A-001 do Analyze)

- Q: SC-002/SC-003 exigem telemetria agregada entre usuários que o NeoReader não tem hoje (achado A-001 do `sdd-plan`) — adiciona infraestrutura de analytics só pra esta feature, ou aceita que ficam sem medição nesta fase? → A: Aceita sem medição nesta fase (opção 1) — sem adicionar analytics de produto por causa desta spec.
