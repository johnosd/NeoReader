# Feature Specification: Suporte a Catálogos OPDS (Públicos e Self-Hosted)

**Slug**: `003-opds-catalogos`

**Created**: 2026-08-31

**Status**: Convergida

**Input**: Permitir que o usuário adicione catálogos OPDS (públicos ou self-hosted, ex: Calibre-Web, Kavita), navegue neles e baixe livros direto pro app. Usando o handoff de `sdd/assessments/suporte-catlogos-opds-pblicos-self-hosted/decision.md` (veredito `go`) como contexto de entrada.

## Escopo

### Incluído

- Tela em Settings pra listar, adicionar, editar e remover catálogos OPDS — nome, URL base, credencial opcional (usuário/senha).
- Detecção automática do formato do catálogo (OPDS 1.x Atom/XML ou OPDS 2.0 JSON) e do esquema de autenticação (ex.: Básica ou Digest) exigido pelo servidor — usuário nunca escolhe isso manualmente.
- Tela Descobrir com uma row de amostra por catálogo cadastrado (incluindo o catálogo padrão pré-configurado e qualquer self-hosted adicionado pelo usuário), com "ver mais" levando à navegação completa daquele catálogo.
- Navegação completa de um catálogo: hierarquia de pastas/seções, paginação ("carregar mais") e busca por texto.
- Filtro de EPUB-only na normalização do feed (não na UI): só entries com link de aquisição EPUB aparecem na lista; entries de navegação (pastas) sempre aparecem.
- Download de um EPUB de qualquer catálogo, reaproveitando o pipeline de import já existente — o livro baixado vira um `Book` local normal, sem storage/schema paralelo.
- Estado visual por item (não baixado / baixando / já na biblioteca), tanto na amostra quanto na navegação completa.
- Project Gutenberg pré-configurado por padrão na primeira instalação; Standard Ebooks e Internet Archive como sugestões pré-preenchidas (não habilitadas) no formulário de adicionar catálogo.
- Migração da seção "Clássicos em Inglês" (feature 002) pra ser alimentada por um feed OPDS do Standard Ebooks, seguindo o mesmo mecanismo de row-amostra + "ver mais" dos demais catálogos.
- Credencial de auth armazenada fora de texto puro no banco local.

### Fora de Escopo

- Web/browser — feature restrita a Android nativo no v1 (mesma restrição de CORS já assumida na feature 002; self-hosted sem proxy de produção não é viável na Web).
- OAuth ou qualquer esquema de autenticação além de Básica. Digest Auth também fica de fora do v1 — decisão tomada no `sdd-plan` ao descobrir que `CapacitorHttp` não suporta nativamente e exigiria implementar MD5 do zero (ausente no Web Crypto); servidor self-hosted só em modo Digest não funciona nesta versão.
- Download/sincronização automática de catálogo em segundo plano (ex.: "assinar" um catálogo pra baixar novidades sozinho).
- Suporte a formatos além de EPUB (PDF, MOBI, CBZ, audiobooks OPDS etc.).
- Motor de validação jurídica por catálogo/título adicionado pelo usuário — responsabilidade do conteúdo de catálogos de terceiros que o próprio usuário cadastra é dele, não do app.
- Feedbooks, como catálogo pré-configurado ou sugestão (serviço descontinuado).
- Continuação de download entre sessões do app (herdado do mesmo comportamento da feature 002).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usuário navega e baixa um livro do catálogo padrão (Priority: P1)

Um usuário abre a tela Descobrir e vê uma row de amostra do Project Gutenberg (catálogo pré-configurado, sem precisar cadastrar nada). Toca num título, baixa, e o livro aparece na Biblioteca.

**Why this priority**: Valida o motor central (buscar, parsear, filtrar EPUB, baixar via pipeline existente) sem depender da UI de gestão de catálogos — é a fatia mínima que já entrega valor sozinha.

**Independent Test**: Com o app recém-instalado (sem nenhum catálogo cadastrado manualmente), abrir Descobrir, ver a row do Gutenberg, tocar em baixar num título, confirmar que aparece na Biblioteca ao concluir.

**Acceptance Scenarios**:

1. **Given** o app está recém-instalado, **When** o usuário abre Descobrir, **Then** vê uma row de amostra do Project Gutenberg.
2. **Given** a row do Gutenberg está visível, **When** o usuário toca em "baixar" num título, **Then** vê indicador de progresso no item.
3. **Given** o download concluiu, **When** o usuário volta pra Biblioteca, **Then** o livro aparece normalmente, com capa e metadados.

---

### User Story 2 - Usuário adiciona um catálogo self-hosted próprio (Priority: P1)

Um usuário que roda Calibre-Web ou Kavita em casa vai em Settings, adiciona seu servidor (URL + usuário/senha, se exigir login), e passa a ver uma row de amostra dele em Descobrir.

**Why this priority**: É o problema central que motivou a feature — sem isso, usuário self-hosted continua sem forma de conectar a própria biblioteca. Junto com a P1 acima, forma o par mínimo que entrega o valor completo do pedido original.

**Independent Test**: Em Settings > Catálogos OPDS, adicionar um servidor de teste (com e sem credencial, em execuções separadas), confirmar que a row correspondente aparece em Descobrir com títulos reais daquele servidor.

**Acceptance Scenarios**:

1. **Given** o usuário está em Settings > Catálogos OPDS, **When** preenche nome, URL e (opcionalmente) usuário/senha e salva, **Then** o catálogo aparece na lista e uma row correspondente passa a existir em Descobrir.
2. **Given** o servidor exige login e a credencial informada está correta, **When** o app busca a amostra, **Then** os títulos aparecem normalmente, sem erro.
3. **Given** a credencial informada está incorreta, **When** o app tenta buscar o catálogo, **Then** o usuário vê uma mensagem específica de "credencial inválida" (não um erro genérico).
4. **Given** um catálogo já cadastrado, **When** o usuário edita ou remove esse catálogo em Settings, **Then** a row correspondente em Descobrir é atualizada ou some, respectivamente.

---

### User Story 3 - Usuário navega o catálogo completo via "ver mais" (Priority: P2)

A partir da row de amostra de qualquer catálogo (padrão ou self-hosted), o usuário toca em "ver mais" e entra numa tela de navegação completa: pode folhear pastas/seções, carregar mais itens ao rolar, e buscar por texto.

**Why this priority**: Estende o valor da P1/P2 pra catálogos grandes, onde a amostra sozinha não é suficiente — mas as duas primeiras já entregam um MVP funcional sem isso.

**Independent Test**: A partir de uma row de amostra existente, tocar em "ver mais", navegar por pelo menos uma pasta/seção, rolar até carregar mais itens, buscar por um termo, e baixar um item a partir dessa tela.

**Acceptance Scenarios**:

1. **Given** o usuário está na row de amostra de um catálogo, **When** toca em "ver mais", **Then** entra numa tela de navegação completa daquele catálogo.
2. **Given** o catálogo tem subpastas/seções, **When** o usuário toca numa delas, **Then** navega pra dentro, com um caminho de volta claro.
3. **Given** a lista atual tem mais itens do que a página carregada, **When** o usuário rola até o fim, **Then** mais itens são carregados automaticamente.
4. **Given** o usuário digita um termo de busca, **When** confirma a busca, **Then** vê só os itens que batem com o termo, dentro do mesmo catálogo.
5. **Given** um item já foi baixado antes (de uma sessão anterior), **When** o usuário navega até ele de novo, **Then** o item aparece marcado como "já na biblioteca", sem precisar re-baixar pra descobrir.

---

### User Story 4 - "Clássicos em Inglês" migra pra rodar sobre OPDS (Priority: P3)

A seção "Clássicos em Inglês" (hoje uma lista estática mantida à mão pela feature 002) passa a seguir o mesmo mecanismo dos demais catálogos: amostra vinda de um feed OPDS público do Standard Ebooks, com "ver mais" levando à lista curada já existente (o feed completo do Standard Ebooks exige conta paga, então não dá pra oferecer navegação OPDS ao vivo completa pra esse catálogo específico).

**Why this priority**: Unifica a experiência (todo catálogo segue o mesmo padrão visual) e reduz a manutenção manual da lista, mas não é bloqueante — a seção já funciona hoje do jeito antigo.

**Independent Test**: Abrir Descobrir, confirmar que "Clássicos em Inglês" aparece com o mesmo mecanismo de amostra + "ver mais" dos demais catálogos, e que os títulos da amostra refletem lançamentos recentes do Standard Ebooks (não mais uma lista fixa desatualizável só por deploy do app).

**Acceptance Scenarios**:

1. **Given** o usuário abre Descobrir, **When** a seção "Clássicos em Inglês" carrega, **Then** ela segue o mesmo layout de row-amostra + "ver mais" das demais.
2. **Given** o usuário toca em "ver mais" nessa seção, **Then** vê a lista curada de títulos já existente (comportamento herdado da feature 002), não uma navegação OPDS ao vivo.

---

### User Story 5 - Falha de rede ou de catálogo mal formado (Priority: P3)

O usuário está sem conexão, ou o catálogo cadastrado responde com um feed inválido/corrompido. O app comunica isso claramente, sem travar a navegação.

**Why this priority**: Garante confiabilidade, mas não bloqueia o valor central das stories anteriores.

**Independent Test**: Desligar a rede do dispositivo e abrir Descobrir; confirmar estado vazio com "tentar novamente". Separadamente, cadastrar uma URL que não responde um feed OPDS válido e confirmar mensagem de erro clara ao tentar carregar a amostra.

**Acceptance Scenarios**:

1. **Given** o dispositivo está sem conexão, **When** o usuário abre Descobrir, **Then** vê um estado vazio claro (ex.: "sem conexão") com opção de tentar novamente, sem travar a tela.
2. **Given** a rede volta, **When** o usuário toca em "tentar novamente", **Then** a busca é refeita normalmente.
3. **Given** uma URL cadastrada não responde um feed OPDS válido (parse falha), **When** o app tenta carregar a amostra desse catálogo, **Then** mostra erro claro nesse item, sem quebrar as demais rows da tela.

### Edge Cases

- Entry sem nenhum link de aquisição EPUB (só PDF/MOBI, por exemplo) fica oculta da lista — nunca aparece com um link "errado".
- Entry com múltiplos formatos de aquisição guarda só o link EPUB, ignorando os demais.
- Entry de navegação (pasta, sem link de aquisição) sempre aparece, independente do filtro de formato.
- Usuário tenta adicionar um catálogo com a mesma URL de um já cadastrado — comportamento de duplicata precisa ficar claro (ex.: aviso, não duplicar silenciosamente).
- Usuário remove um catálogo que tem downloads em andamento — downloads já iniciados não devem travar/crashar; UX de cancelamento ou conclusão em segundo plano.
- Usuário remove o catálogo padrão (Gutenberg) e não tem nenhum outro cadastrado — tela Descobrir mostra estado vazio com CTA claro pra adicionar um catálogo.
- Toque duplicado no mesmo item antes do download anterior concluir é ignorado (comportamento herdado da feature 002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE permitir ao usuário adicionar um catálogo OPDS informando nome e URL base, com campo opcional de usuário/senha para servidores que exigem login.
- **FR-002**: Sistema DEVE detectar automaticamente se um catálogo responde em OPDS 1.x (Atom/XML) ou OPDS 2.0 (JSON), sem exigir escolha manual do usuário.
- **FR-003**: Sistema DEVE autenticar contra o servidor usando Basic Auth a partir da credencial informada, sem exigir que o usuário escolha um esquema. Digest Auth fica fora do v1 (ver Non-Goals) — CapacitorHttp não tem suporte nativo, e implementar exigiria MD5 do zero (ausente no Web Crypto).
- **FR-004**: Sistema DEVE armazenar a credencial de um catálogo fora de texto puro no banco local (nunca em texto plano no Dexie).
- **FR-005**: Sistema DEVE exibir uma mensagem específica de "credencial inválida" quando o servidor recusar a autenticação, distinta de erro genérico de rede/formato.
- **FR-006**: Sistema DEVE permitir listar, editar e remover catálogos cadastrados em Settings, incluindo o catálogo padrão pré-configurado.
- **FR-007**: Sistema DEVE exibir, na tela Descobrir, uma row de amostra por catálogo cadastrado, com "ver mais" levando à navegação completa daquele catálogo.
- **FR-008**: Sistema DEVE permitir, a partir do "ver mais", navegar a hierarquia de pastas/seções de um catálogo.
- **FR-009**: Sistema DEVE carregar mais itens automaticamente ("carregar mais") quando o feed do catálogo indicar que há mais páginas.
- **FR-010**: Sistema DEVE permitir busca por texto dentro da navegação completa de um catálogo.
- **FR-011**: Sistema DEVE, na normalização do feed, manter apenas entries cujo link de aquisição tenha tipo contendo `application/epub+zip`; entries sem esse link ficam ocultas da lista.
- **FR-012**: Sistema DEVE, quando uma entry tiver múltiplos formatos de aquisição, guardar apenas o link EPUB.
- **FR-013**: Sistema DEVE sempre exibir entries de navegação (sem link de aquisição), independente do filtro de formato.
- **FR-014**: Sistema DEVE permitir baixar um EPUB de qualquer entry visível reaproveitando o mesmo pipeline de import já usado para EPUBs adicionados manualmente, sem storage/schema paralelo para o livro em si.
- **FR-015**: Sistema DEVE exibir estado visual por item (não baixado / baixando / já na biblioteca) tanto na row de amostra quanto na navegação completa.
- **FR-016**: Sistema DEVE marcar um item como "já na biblioteca" a partir de um vínculo local salvo entre a entry do catálogo e o livro resultante, criado assim que um download dessa entry é concluído — sem depender de rebaixar o arquivo para descobrir.
- **FR-017**: Sistema DEVE vir com o catálogo Project Gutenberg (`https://www.gutenberg.org/ebooks/search.opds/`) pré-configurado por padrão na primeira instalação.
- **FR-018**: Sistema DEVE oferecer Standard Ebooks e Internet Archive como sugestões de URL pré-preenchida no formulário de adicionar catálogo, sem habilitá-los automaticamente.
- **FR-019**: Sistema NÃO DEVE incluir Feedbooks como catálogo pré-configurado ou sugestão.
- **FR-020**: Sistema DEVE migrar a seção "Clássicos em Inglês" para ser alimentada por um feed OPDS público do Standard Ebooks na amostra, mantendo o "ver mais" desse catálogo específico na lista curada já existente da feature 002.
- **FR-021**: Sistema DEVE exibir um estado vazio claro (ex.: "sem conexão") com opção de tentar novamente quando a tela Descobrir não conseguir buscar dados de rede, sem travar a navegação.
- **FR-022**: Sistema DEVE restringir esta feature a Android nativo no v1 — build Web fica fora de escopo.
- **FR-023**: Sistema DEVE permitir remover o catálogo padrão como qualquer outro catálogo cadastrado; se o usuário remover todos os catálogos, a tela Descobrir DEVE mostrar um estado vazio com opção de adicionar um novo.
- **FR-024**: Sistema DEVE atribuir automaticamente tags de assunto e idioma ao livro baixado de um catálogo OPDS, extraídas dos metadados da entry quando disponíveis, reaproveitando o mecanismo de tags já existente na Biblioteca (sem tela nova).
- **FR-025**: Sistema DEVE oferecer, na navegação completa de um catálogo, opções de ordenação (Padrão/Populares/Recentes/Aleatório) — convenção específica do Gutenberg (`sort_order`), aplicada genericamente como parâmetro extra em qualquer catálogo; servidor que não reconhece o parâmetro deve ser ignorado sem erro.
- **FR-026**: Sistema DEVE alternar automaticamente, na navegação completa de um catálogo, entre layout de lista (página só com entries de navegação) e grid de cards (página com pelo menos uma entry de publicação), sem opção manual do usuário.
- **FR-027**: Sistema DEVE, ao salvar um catálogo (novo ou editado) em Settings, testar a conexão com exatamente os dados informados antes de persistir — só grava o catálogo se a conexão for bem-sucedida; falha exibe o motivo específico (rede, formato ou credencial) sem salvar nada.
- **FR-028**: Sistema DEVE exibir, na lista de catálogos em Settings, um indicador de status de conexão por catálogo (conectado/sem conexão/verificando) e um atalho que abre a navegação completa daquele catálogo diretamente, sem depender da tela Descobrir.
- **FR-029**: Sistema DEVE, ao buscar a capa de uma entry de catálogo com credencial, autenticar essa requisição da mesma forma que o restante do catálogo — servidores self-hosted que exigem auth em toda URL (ex.: Calibre) não podem depender de um `<img>` sem credencial.
- **FR-030**: Sistema DEVE exibir, no estado de erro de um download, o motivo específico quando disponível (ex.: "já está na biblioteca"), em vez de sempre um texto genérico.

### Key Entities *(include if feature involves data)*

- **Catálogo OPDS**: registro local de uma fonte configurada — nome, URL base, se exige credencial, e uma referência à credencial armazenada de forma segura (nunca a credencial em si). Inclui tanto o catálogo padrão pré-configurado quanto os adicionados pelo usuário.
- **Entry de Catálogo (normalizada)**: item já processado pela camada de normalização do feed — pode ser uma entry de navegação (pasta/seção) ou uma entry de aquisição (livro com link EPUB), com título, autor, capa e link de download quando aplicável.
- **Vínculo Entry → Livro Baixado**: registro local que liga uma entry específica de um catálogo ao `Book` resultante do download, usado para exibir o estado "já na biblioteca" sem precisar rebaixar o arquivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuário consegue ir de "catálogo cadastrado" a "livro na Biblioteca" inteiramente dentro do fluxo Descobrir → ver mais → baixar, sem sair do app ou depender de import manual de arquivo.
- **SC-002**: % de usuários que adicionam pelo menos 1 catálogo próprio (self-hosted ou público) além do padrão pré-configurado. **Não mensurável nesta fase**: o projeto não tem telemetria remota/analytics agregado entre usuários (local-first, sem backend de dados de uso) — mesma lacuna já documentada e aceita conscientemente na feature 002 (`plan.md` dela, R-005). Fica como métrica de referência caso o produto adicione telemetria de uso no futuro (decisão maior que esta feature).
- **SC-003**: Taxa de sucesso de download via catálogo OPDS (downloads concluídos sem erro / downloads tentados), comparável à taxa já observada no download de "Clássicos em Inglês" (feature 002). **Não mensurável nesta fase**, mesmo motivo do SC-002.
- **SC-004**: Zero credencial de catálogo armazenada em texto puro, verificável por revisão do dado persistido localmente.
- **SC-005**: Usuário com servidor self-hosted em modo de autenticação Básica consegue cadastrar o catálogo e ver a amostra carregar informando só usuário/senha, sem nenhuma configuração extra.

## Assumptions

- A infraestrutura de rede nativa (equivalente ao `CapacitorHttp` já validado na feature 002) segue disponível e contorna CORS no Android nativo; a feature não tenta resolver CORS na Web.
- O feed OPDS completo do Standard Ebooks continua restrito a supporters (verificado ao vivo nesta assessment: `401 Unauthorized` sem credencial) — se isso mudar no futuro, a User Story 4 pode ser revisitada pra usar navegação OPDS completa também nesse catálogo.
- Servidores self-hosted (Calibre-Web, Kavita) implementam OPDS 1.x e/ou 2.0 de forma razoavelmente aderente ao padrão; robustez contra feed malformado (ex.: XML mal escapado) é best-effort, não uma garantia formal.
- Autenticação é só Basic Auth no v1 — o usuário nunca escolhe esquema, só informa usuário/senha quando aplicável. Digest Auth (comum em algumas instalações Calibre-Web/Calibre) fica documentado como limitação conhecida, não coberta nesta versão.
- O dedupe de livro já baixado por outra via (ex.: mesmo clássico importado manualmente antes) continua sendo o comportamento de hash já existente no pipeline de import — não é uma regra nova desta feature.

## Clarifications

### Sessão 2026-08-31

- Q: A tela de navegação completa de um catálogo ("ver mais") deve ter busca por texto? → A: Sim, incluir busca.
- Q: Como navegar quando um catálogo/pasta tem muitas entries (feed paginado via link "next")? → A: "Carregar mais" seguindo o link next do feed.
- Q: Como marcar um item da lista como "já na biblioteca" antes de tentar baixar de novo? → A: Mapeamento local entry→livro salvo após cada download.
- Q: O que a tela Descobrir mostra quando o dispositivo está sem conexão? → A: Estado vazio claro com "tentar novamente".
- Q: O catálogo padrão (Project Gutenberg) pode ser removido/editado pelo usuário, ou fica fixo/protegido? → A: Removível como qualquer outro catálogo.
- Q: Quantos títulos aparecem na row de amostra de cada catálogo? → A: Primeiros itens do feed, sem contagem fixa exata (o que a 1ª página do servidor devolver).
- Q: No formulário de adicionar/editar catálogo, o usuário escolhe explicitamente o esquema de auth, ou só informa usuário+senha? → A: Só usuário+senha; o app negocia o esquema sozinho.
- Q: O que o usuário vê quando o login falha ao acessar um catálogo (credencial errada)? → A: Mensagem específica de credencial inválida, distinta de erro genérico.

### Sessão 2026-09-01

- Q: Ao salvar um catálogo cuja conexão falha (rede/formato), o app deve salvar mesmo assim (comportamento original, `tasks.md` T030) ou bloquear o save? → A: Bloquear — só persiste se a conexão for bem-sucedida (FR-027). Decisão revertida após teste ao vivo contra um Calibre self-hosted real mostrar que o usuário ficava "no escuro" sobre catálogos salvos que nunca funcionaram.
