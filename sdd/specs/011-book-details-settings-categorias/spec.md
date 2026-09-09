# Feature Specification: Reorganizar Aba Configurações do Livro em Categorias Navegáveis

**Slug**: `011-book-details-settings-categorias`

**Created**: 2026-09-09

**Status**: Convergida

**Input**: Gostaria de assim como fizemos nas configurações globais, fazer o mesmo nas configurações do livro (book-details) criando categorias invés de deixar tudo na mesma tela, facilitando o acesso ao usuário. Além disso incluir a aba details como uma categoria dentro de settings.

## Escopo

<!--
  Não-objetivos explícitos. Preencher com o que a entrevista do sdd-specify
  levantou. Evita expansão de escopo não solicitada durante o sdd-execute.
-->

### Incluído

- Reorganizar o conteúdo hoje exposto de uma vez na aba "Configurações" da tela de detalhes do livro (`BookDetailsScreen`) em um menu de categorias (lista vertical, ícone + nome + descrição), no mesmo padrão visual já usado pelo menu principal de Configurações globais (feature `004-settings-categorias`).
- Três categorias clicáveis, cada uma abrindo uma subtela dedicada dentro da própria aba Configurações:
  - **Aparência do Leitor**: preview ao vivo (`ReaderPreviewPanel`), banner de diagnóstico de estilos fortes do EPUB (com ação "aplicar leitura confortável"), tema do leitor, fonte do livro (com badges de fonte NeoReader/original), tamanho da fonte, altura da linha, modo de leitura (original/confortável).
  - **Idioma**: idioma do livro (com bottom sheet de seleção) e idioma de tradução padrão (com bottom sheet de seleção) consolidados numa única categoria — mesmo espírito de consolidação já aplicado em "Idioma" nas configurações globais.
  - **Narração**: provedor de TTS (bottom sheet), voz selecionada (bottom sheet com busca e preview de áudio), velocidade de fala (bottom sheet).
- Migração da aba "Detalhes" (hoje uma aba própria e independente na lista de abas: Capítulos/Marcadores/Destaques/Avaliações/Autor/Configurações/Detalhes) para dentro da aba Configurações, como uma quarta categoria clicável chamada **Detalhes**, preservando 1:1 o conteúdo atual: sinopse/informações do livro (`BookInfoDetails`), diagnósticos de fontes de metadados (`BookInfoDiagnosticsSection`), idioma detectado, data de adição, último acesso e tamanho do arquivo.
- Remoção da aba "Detalhes" da lista de abas (`TABS`) da tela de detalhes do livro — a aba "Configurações" mantém seu nome e posição atuais na lista.
- Navegação em profundidade dentro da aba Configurações: a partir do menu de categorias, tocar numa categoria abre sua subtela; tocar em voltar (botão da UI dentro da subtela, botão físico/gesto do Android) retorna ao menu de categorias — nunca sai da tela de detalhes do livro direto a partir de uma subcategoria. Tocar em voltar estando no menu de categorias (aba Configurações, sem nenhuma subcategoria aberta) segue o comportamento já existente da aba (parte da navegação normal por abas da tela de detalhes do livro).
- Reset de navegação ao trocar de aba: se o usuário está dentro de uma categoria (ex.: Narração) e troca para outra aba da tela de detalhes do livro (ex.: Capítulos), ao retornar para a aba Configurações o menu de categorias é exibido novamente (a subtela anterior não é lembrada).
- Preservação 1:1 do comportamento interno de cada configuração e do conteúdo de Detalhes (toggles, selects, bottom sheets, validação, persistência, preview de áudio, diagnósticos, ações de refresh) — só muda onde cada um vive na navegação.
- Textos novos (nomes e descrições das categorias no menu) traduzidos nos 3 idiomas já suportados (pt-BR, en, es), reaproveitando o sistema de i18n existente.
- Aplicação igual em Web e Android — sem divergência de comportamento entre as duas superfícies (mesmo componente React usado nas duas).

### Fora de Escopo

- Qualquer mudança na lista de abas além de remover "Detalhes" — Capítulos, Marcadores, Destaques, Avaliações e Autor continuam exatamente como estão hoje, com seus próprios conteúdos e badges de contagem.
- Campo de busca por texto dentro da aba Configurações — a categorização já resolve o problema de organização nesta versão (mesma decisão já tomada na feature 004 para as configurações globais).
- Badges ou indicadores dinâmicos de estado nas linhas do menu de categorias (ex.: mostrar o provedor de TTS atual na linha "Narração", ou o idioma atual na linha "Idioma") — o menu mostra só ícone + nome + descrição estática, igual ao padrão da maioria das categorias do Settings global (exceção "Plano", que não se aplica aqui).
- Mudança de conteúdo, comportamento ou lógica interna de qualquer configuração individual, do preview, dos diagnósticos ou das informações de Detalhes (ex.: novos campos, novas validações, nova lógica de fallback de TTS).
- Redesenho visual dos controles internos (toggles, selects, bottom sheets, `ReaderPreviewPanel`, `BookInfoDetails`, `BookInfoDiagnosticsSection`) — reaproveita os componentes já existentes.
- Mudanças nas configurações globais do app (`SettingsScreen` e subtelas já existentes da feature 004) — esta feature mexe exclusivamente na aba Configurações da tela de detalhes do livro.
- Qualquer alteração na forma como o usuário chega até a tela de detalhes do livro, ou nas demais seções da tela (header, capa, sinopse resumida, botões de ação, estatísticas) fora da área das abas.

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories devem ser PRIORIZADAS como jornadas de usuário
  ordenadas por importância. Cada story deve ser INDEPENDENTEMENTE TESTÁVEL -
  ou seja, se apenas UMA delas for implementada, ainda existe um MVP viável
  que entrega valor.

  Atribua prioridades (P1, P2, P3...) a cada story, onde P1 é a mais crítica.
  Cada story deve poder ser desenvolvida, testada, entregue e demonstrada
  independentemente das demais.
-->

### User Story 1 - Usuário vê um menu curto de categorias ao abrir a aba Configurações (Priority: P1)

Hoje, ao tocar na aba "Configurações" dentro da tela de detalhes de um livro, o usuário se depara com uma lista longa e rolável contendo preview, diagnóstico de estilos, tema, fonte, tamanho, altura de linha, modo de leitura, idioma do livro, tradução e toda a seção de narração (TTS) misturados. Com a mudança, o usuário toca em "Configurações" e vê um menu curto com as categorias (Aparência do Leitor, Idioma, Narração, Detalhes).

**Why this priority**: É a mudança estrutural central da feature — sem isso, nada mais faz sentido. Sozinha, já resolve o problema relatado (aba poluída, difícil de escanear e de achar o controle certo).

**Independent Test**: Abrir a tela de detalhes de um livro, tocar na aba "Configurações" e confirmar que aparece um menu de 4 categorias (ícone + nome + descrição), não a lista longa atual com tudo exposto de uma vez.

**Acceptance Scenarios**:

1. **Given** o usuário está na tela de detalhes de um livro, **When** ele toca na aba "Configurações", **Then** vê um menu com 4 linhas de categoria (Aparência do Leitor, Idioma, Narração, Detalhes), não a lista antiga com todos os controles expostos.
2. **Given** o usuário está no menu de categorias da aba Configurações, **When** ele observa a lista, **Then** consegue identificar pelo nome/ícone/descrição do que se trata cada categoria sem precisar entrar nela.

---

### User Story 2 - Usuário entra numa categoria específica e ajusta uma configuração do livro (Priority: P1)

O usuário quer mudar algo específico deste livro (ex.: o tema do leitor ou a voz de narração). Ele toca na categoria desejada no menu da aba Configurações, vê somente os controles daquele grupo, faz o ajuste, e volta ao menu de categorias.

**Why this priority**: Junto com a US1, forma o par mínimo que entrega o valor completo pedido — não bastava só reorganizar visualmente, o fluxo de entrar/ajustar/voltar precisa funcionar ponta a ponta com paridade total ao comportamento atual (persistência por livro, bottom sheets, preview de áudio).

**Independent Test**: A partir do menu de categorias, entrar em "Aparência do Leitor", mudar o tema do leitor deste livro, confirmar que a mudança persiste (reabrindo o livro no leitor ou saindo e voltando à tela de detalhes), voltar ao menu de categorias e confirmar que outras configurações (ex.: Narração) não apareceram misturadas na subtela de Aparência.

**Acceptance Scenarios**:

1. **Given** o usuário está no menu de categorias da aba Configurações, **When** toca em uma categoria (ex.: "Narração"), **Then** entra numa subtela mostrando somente os controles daquele grupo.
2. **Given** o usuário está dentro de uma categoria, **When** ajusta uma configuração (toggle, select, bottom sheet), **Then** o comportamento (validação, persistência por livro, feedback visual, preview de áudio quando aplicável) é idêntico ao que existe hoje na aba única.
3. **Given** o usuário está dentro de uma categoria, **When** toca em voltar (botão da UI ou botão físico/gesto do Android), **Then** retorna ao menu de categorias da aba Configurações, sem sair da tela de detalhes do livro.
4. **Given** o usuário está no menu de categorias da aba Configurações (não dentro de nenhuma subcategoria), **When** toca em voltar, **Then** o comportamento segue igual ao já existente hoje para a navegação normal da tela de detalhes do livro (não é um comportamento novo introduzido por esta feature).

---

### User Story 3 - Usuário acessa as informações e diagnósticos do livro (antiga aba Detalhes) como uma categoria (Priority: P1)

O usuário quer ver a sinopse completa, os diagnósticos de onde vieram os metadados do livro, o idioma detectado, a data de adição, o último acesso e o tamanho do arquivo — hoje isso vive numa aba própria chamada "Detalhes". Com a mudança, ele toca na aba "Configurações" e depois na categoria "Detalhes" para ver essas informações.

**Why this priority**: É o segundo pedido explícito do usuário (mover Detalhes pra dentro de Configurações) e reduz o número total de abas na tela, sem o qual a lista de abas continuaria com um item redundante fora do padrão de categorias.

**Independent Test**: Confirmar que a aba "Detalhes" não existe mais na lista de abas da tela de detalhes do livro; entrar em Configurações → Detalhes e confirmar que sinopse, diagnósticos, idioma detectado, data de adição, último acesso e tamanho do arquivo aparecem exatamente como apareciam na aba antiga.

**Acceptance Scenarios**:

1. **Given** o usuário está na tela de detalhes de um livro, **When** observa a lista de abas, **Then** não vê mais uma aba "Detalhes" separada — só Capítulos, Marcadores, Destaques, Avaliações, Autor e Configurações.
2. **Given** o usuário está no menu de categorias da aba Configurações, **When** toca em "Detalhes", **Then** vê sinopse/informações do livro, diagnósticos de metadados, idioma detectado, data de adição, último acesso e tamanho do arquivo, com o mesmo conteúdo e ações (ex.: refresh de metadados) que existiam na aba antiga.

### Edge Cases

- Livro com poucos dados de Detalhes (ex.: sem `lastOpenedAt` ainda, ou sem idioma detectado) deve funcionar dentro da categoria Detalhes exatamente como funciona hoje na aba antiga (linhas condicionais que só aparecem quando há dado).
- Usuário aperta o botão físico de voltar do Android repetidamente a partir de dentro de uma categoria da aba Configurações: cada toque sobe um nível (categoria → menu de categorias → comportamento normal de navegação da tela de detalhes do livro), nunca pula direto pra fora da tela de detalhes ou fecha o app.
- Usuário troca de aba (ex.: de Configurações para Capítulos) estando dentro de uma categoria (ex.: Narração) e depois volta para a aba Configurações: o menu de categorias é exibido novamente, não a categoria em que estava antes de trocar de aba.
- Nenhuma configuração fica "perdida" ao navegar entre categorias — como hoje, cada ajuste já é salvo imediatamente (por livro) assim que o usuário interage com o controle, então não existe estado de edição não salvo que possa se perder ao trocar de categoria ou de aba.
- Banner de diagnóstico de estilos fortes do EPUB (que hoje aparece condicionalmente no topo da aba Configurações) só deve aparecer dentro da categoria "Aparência do Leitor", não no menu de categorias nem em nenhuma outra categoria.
- Banner de aviso de chave de API ausente para o provedor de TTS selecionado (`IntegrationHelpBanner`, hoje exibido condicionalmente na seção de Narração) continua aparecendo, agora dentro da categoria "Narração".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE substituir o conteúdo único da aba "Configurações" (com todos os controles expostos de uma vez) por um menu de categorias em lista vertical (ícone + nome + descrição), no mesmo padrão visual já usado pelo menu principal de Configurações globais.
- **FR-002**: Sistema DEVE agrupar os controles hoje existentes na aba Configurações da tela de detalhes do livro em 3 categorias clicáveis: "Aparência do Leitor" (preview, diagnóstico de estilos, tema, fonte, tamanho de fonte, altura de linha, modo de leitura), "Idioma" (idioma do livro + idioma de tradução, consolidados), "Narração" (provedor de TTS, voz, velocidade).
- **FR-003**: Sistema DEVE adicionar uma quarta categoria clicável "Detalhes" dentro da aba Configurações, contendo 1:1 o conteúdo hoje exibido na aba "Detalhes" (sinopse/informações do livro, diagnósticos de fontes de metadados, idioma detectado, data de adição, último acesso, tamanho do arquivo).
- **FR-004**: Sistema DEVE remover a aba "Detalhes" da lista de abas da tela de detalhes do livro, mantendo o nome e a posição atuais da aba "Configurações" na lista.
- **FR-005**: Sistema DEVE, ao acionar o comando de voltar (botão da UI ou botão físico/gesto do Android) estando dentro de uma categoria da aba Configurações, retornar ao menu de categorias — nunca sair da tela de detalhes do livro direto a partir de uma subcategoria.
- **FR-006**: Sistema DEVE, ao acionar o comando de voltar estando no menu de categorias da aba Configurações (fora de qualquer subcategoria), preservar o comportamento de navegação já existente hoje para a tela de detalhes do livro (sem alteração introduzida por esta feature).
- **FR-007**: Sistema DEVE resetar a navegação interna da aba Configurações para o menu de categorias sempre que o usuário sair dessa aba (trocar para outra aba) e retornar a ela — a subtela de categoria em que o usuário estava antes de trocar de aba não é lembrada.
- **FR-008**: Sistema DEVE preservar integralmente o comportamento funcional de cada configuração e de cada informação de Detalhes já existente (toggles, selects, bottom sheets com busca e preview de áudio, validação, persistência por livro, diagnósticos, ações de refresh, mensagens de erro/sucesso) — a reorganização é exclusivamente de navegação e agrupamento visual, não de lógica interna.
- **FR-009**: Sistema NÃO DEVE adicionar badges ou indicadores dinâmicos de estado (ex.: provedor de TTS atual, idioma atual) nas linhas do menu de categorias da aba Configurações nesta feature.
- **FR-010**: Sistema NÃO DEVE adicionar campo de busca por texto à aba Configurações nesta feature.
- **FR-011**: Sistema DEVE traduzir todo texto novo introduzido pela reorganização (nomes e descrições de categoria no menu) nos 3 idiomas já suportados pelo app (pt-BR, en, es), reaproveitando o sistema de i18n existente.
- **FR-012**: Sistema DEVE aplicar a mesma reorganização igualmente em Web e Android, sem divergência de comportamento entre as duas superfícies.

### Key Entities *(include if feature involves data)*

Não aplicável — esta feature reorganiza navegação e apresentação de configurações e informações já existentes por livro, sem introduzir ou alterar entidades de dados persistidas (`BookSettings`, `AppSettings`, `StoredBookInfo` continuam com o mesmo formato).

## Success Criteria *(mandatory)*

<!-- DEVEM ser tecnologicamente agnósticos e mensuráveis. -->

### Measurable Outcomes

- **SC-001**: A aba Configurações da tela de detalhes do livro mostra, ao ser aberta, um menu de exatamente 4 linhas de categoria — visualmente muito mais curto que a lista atual (que hoje soma 9 seções completas com seus controles expostos de uma vez, mais a aba Detalhes separada).
- **SC-002**: A lista de abas da tela de detalhes do livro passa de 7 para 6 abas (Detalhes deixa de existir como aba própria).
- **SC-003**: Usuário consegue localizar e começar a ajustar qualquer configuração específica do livro, ou consultar qualquer informação da antiga aba Detalhes, em no máximo 2 toques a partir da aba Configurações (1 toque na categoria + 1 toque/ajuste no controle desejado, ou leitura direta da informação).
- **SC-004**: Nenhuma configuração ou informação existente perde funcionalidade, valor persistido ou comportamento de validação após a reorganização — paridade 1:1 verificável comparando o estado antes/depois da mudança.
- **SC-005**: Usuário consegue voltar de qualquer profundidade de navegação dentro da aba Configurações (subcategoria → menu de categorias → comportamento normal da tela) sem nunca pular um nível ou ficar preso, usando tanto o botão de voltar da UI quanto o botão físico/gesto do Android.

## Assumptions

- O padrão visual e de navegação já usado pelo menu principal de Configurações globais (feature `004-settings-categorias`: lista vertical com ícone + nome + descrição, subtela dedicada por categoria) é reaproveitado aqui, mas a implementação técnica (navegação local dentro do componente da aba vs. reaproveitamento de algum padrão de rota) é decisão a ser confirmada no `sdd-plan`, não fixada nesta spec.
- Os nomes de categoria usados nesta spec ("Aparência do Leitor", "Idioma", "Narração", "Detalhes") são labels de trabalho; o texto final exibido ao usuário pode ser ajustado durante a implementação, desde que a categorização e o agrupamento descritos aqui sejam preservados.
- Nenhuma configuração ou informação nova é introduzida por esta feature — o número e o conteúdo dos controles e informações existentes permanecem os mesmos, só a navegação e o agrupamento mudam.
- As demais abas da tela de detalhes do livro (Capítulos, Marcadores, Destaques, Avaliações, Autor) e o restante da tela (header, capa, ações, estatísticas) não são afetados por esta feature.

## Clarifications

### Sessão 2026-09-09

- Q: Como agrupar as configurações do livro em categorias? → A: 3 categorias consolidadas — "Aparência do Leitor" (preview, diagnóstico de estilos, tema, fonte, tamanho, altura de linha, modo de leitura), "Idioma" (idioma do livro + tradução consolidados) e "Narração" (provedor TTS, voz, velocidade) — mesmo espírito de consolidação da feature 004.
- Q: A aba "Detalhes" vira categoria dentro de Configurações com conteúdo 1:1, ou parte dela se funde com "Idioma"? → A: Categoria própria "Detalhes", conteúdo 1:1, sem fundir nada com "Idioma" (FR-003).
- Q: Ao voltar de dentro de uma categoria da aba Configurações, o usuário deve retornar ao menu de categorias (sem sair da tela de detalhes do livro)? → A: Sim, mesmo padrão da feature 004 — categoria → menu → comportamento normal da tela (FR-005/FR-006).
- Q: A aba mantém o nome "Configurações" mesmo incluindo o conteúdo antigo de Detalhes? → A: Sim, mantém "Configurações"; "Detalhes" some da lista de abas (FR-004).
- Q: Se o usuário troca de aba estando dentro de uma categoria e depois volta para Configurações, o que aparece? → A: Sempre volta pro menu de categorias — sem lembrar a última categoria aberta (FR-007).
