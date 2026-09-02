# Feature Specification: Reorganizar Tela de Settings em Categorias Navegáveis

**Slug**: `004-settings-categorias`

**Created**: 2026-09-02

**Status**: Convergida

**Input**: Precisamos organizar a tela de configurações do app. Hoje o usuário clica em Configurações e aparece uma tela com todas as configurações juntas. O ideal seria o usuário clicar em Configurações e ver uma lista/seção/botão com cada tipo de configuração, e ao clicar na config desejada abrir somente aquelas configurações — assim organizamos essa tela e facilitamos para o usuário na hora de procurar o que deseja.

## Escopo

### Incluído

- Nova tela principal de Settings que mostra um menu de categorias (lista vertical, ícone + nome, no mesmo padrão visual já usado por "Catálogos OPDS" hoje) em vez da lista longa atual com tudo junto.
- Uma subtela dedicada por categoria, mostrando somente as configurações daquele grupo.
- Categorias clicáveis (cada uma abre sua própria subtela): **Plano** (nova, ver abaixo), **Idioma** (nova, consolida "Idioma do App" + "Tradução"), **Aparência do Leitor**, **Word Lens**, **Narração** (inclui as chaves dos provedores de voz — Speechify, ElevenLabs, Fish Audio — movidas de Integrações, ajuste feito durante o teste manual da feature), **Integrações/Chaves de API** (só a chave do YouTube Data API, depois da mudança acima), **Catálogos OPDS** (já existe, sem mudança), **Sincronização na Nuvem**.
- A categoria **Plano** mostra, no menu principal, só um resumo (badge "PRO" ou "Free"); ao tocar, abre uma subtela com o status completo de "NeoReader Pro" (ação pra Paywall) e as cotas de uso mensal (Book Intelligence, Descubra/NYT) — ajuste feito durante o teste manual: primeiro as cotas foram juntadas dentro do bloco Plano no próprio menu principal, depois o usuário pediu que esse bloco inteiro virasse uma categoria clicável igual às demais (menu principal fica só com linhas de categoria, sem nenhum bloco expandido).
- "Build/Sobre" (chaves públicas de build) foi removido do menu — informação irrelevante pro usuário final, não fazia parte do pedido original.
- Depois deste ajuste, o menu principal não tem mais nenhum item "direto" (sem subtela) — todas as 8 linhas são categorias clicáveis, uniformes.
- Navegação em profundidade: voltar de dentro de uma categoria retorna ao menu de categorias do Settings (não sai do Settings direto); voltar estando no menu de categorias sai do Settings normalmente. Vale tanto pro botão de voltar da UI quanto pro botão físico/gesto do Android.
- Preservação 1:1 do comportamento interno de cada configuração (toggles, selects, campos de chave de API, validação, persistência, bottom sheets) — só muda onde cada uma vive na navegação.
- Textos novos (nomes e descrições das categorias no menu) traduzidos nos 3 idiomas já suportados (pt-BR, en, es), reaproveitando o sistema de i18n existente.

### Fora de Escopo

- Campo de busca por texto no Settings — a organização em categorias já resolve o problema de achar a configuração certa nesta versão.
- Badges ou indicadores visuais de alerta dinâmico nas linhas do menu principal (ex.: erro de sincronização aparecendo no item "Sincronização" antes de abrir a categoria). Decisão explícita: a visibilidade de alertas de sincronização será resolvida numa feature futura separada, provavelmente movendo esse status para a tela de detalhes do livro — não faz parte desta reorganização.
- Qualquer consolidação de categorias além de "Idioma" — Narração e Integrações continuam sendo duas categorias/subtelas separadas (só o conteúdo entre elas foi rebalanceado: chaves de voz foram pra Narração, YouTube ficou em Integrações, ver Clarifications).
- Mudança de conteúdo, comportamento ou lógica interna de qualquer configuração individual (ex.: novos campos, novas validações, novos toggles).
- Redesenho visual dos controles internos (toggles, selects, inputs, cards) — reaproveita os componentes já existentes.
- Mudanças na tela de Paywall ou na tela de Catálogos OPDS além de garantir que ela já se encaixa no mesmo padrão de navegação (ela já é uma subtela independente hoje).
- Divergência de comportamento entre Web e Android — a reorganização vale igualmente para as duas superfícies.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usuário vê um menu curto de categorias ao abrir Settings (Priority: P1)

Hoje, ao abrir Configurações, o usuário se depara com uma tela longa contendo todas as configurações do app misturadas (plano, aparência, idioma, narração, integrações, sincronização etc). Com a mudança, o usuário abre Configurações e vê uma lista curta de categorias — cada uma representando um grupo de configurações relacionadas.

**Why this priority**: É a mudança estrutural central da feature — sem isso, nada mais faz sentido. Sozinha, já resolve o problema relatado (tela poluída, difícil de escanear).

**Independent Test**: Abrir a tela de Configurações e confirmar que aparece uma lista de categorias (não a lista longa de configurações individuais), com no máximo ~10 itens no total entre categorias clicáveis e linhas diretas.

**Acceptance Scenarios**:

1. **Given** o usuário está em qualquer tela do app, **When** ele toca em "Configurações", **Then** vê uma lista de categorias (ícone + nome), não a lista antiga com todas as configurações expostas de uma vez.
2. **Given** o usuário está no menu de categorias, **When** ele observa a lista, **Then** consegue identificar pelo nome/ícone do que se trata cada categoria sem precisar entrar nela.

---

### User Story 2 - Usuário entra numa categoria específica e ajusta uma configuração (Priority: P1)

O usuário quer mudar algo específico (ex.: o tema do leitor). Ele toca na categoria "Aparência do Leitor" no menu, vê somente as configurações daquele grupo, faz o ajuste, e volta ao menu de categorias.

**Why this priority**: Junto com a US1, forma o par mínimo que entrega o valor completo pedido — não bastava só reorganizar visualmente, o fluxo de entrar/ajustar/voltar precisa funcionar ponta a ponta com paridade total ao comportamento atual.

**Independent Test**: A partir do menu de categorias, entrar em "Aparência do Leitor", mudar o tema do leitor, confirmar que a mudança persiste (reabrindo o app ou navegando pro leitor), voltar ao menu de categorias e confirmar que outras configurações (ex.: Word Lens) não apareceram misturadas na tela de Aparência.

**Acceptance Scenarios**:

1. **Given** o usuário está no menu de categorias, **When** toca em uma categoria (ex.: "Aparência do Leitor"), **Then** entra numa subtela mostrando somente as configurações daquele grupo.
2. **Given** o usuário está dentro de uma categoria, **When** ajusta uma configuração (toggle, select, campo de texto), **Then** o comportamento (validação, persistência, feedback visual) é idêntico ao que existe hoje na tela única.
3. **Given** o usuário está dentro de uma categoria, **When** toca em voltar (botão da UI ou botão físico/gesto do Android), **Then** retorna ao menu de categorias do Settings, não sai do Settings nem do app.
4. **Given** o usuário está no menu de categorias (não dentro de nenhuma subcategoria), **When** toca em voltar, **Then** sai do Settings normalmente, como acontece hoje.

---

### User Story 3 - Usuário acessa status do plano e uso numa categoria dedicada (Priority: P2)

O usuário quer saber se é Pro ou Free, e quanto já usou das cotas mensais gratuitas (Book Intelligence, Descubra/NYT). No menu principal, a linha "Plano" mostra um resumo rápido (badge "PRO" ou "Free"); ao tocar nela, entra numa subtela com o status completo — incluindo o botão pra abrir a tela de Paywall (upgrade/detalhes da assinatura).

**Why this priority**: Junta status de plano + uso num só lugar, com o mesmo padrão de navegação das outras categorias — mas não é bloqueante, o valor central já foi entregue pelas duas primeiras stories.

**Independent Test**: No menu de categorias, confirmar que a linha "Plano" mostra o badge correto (PRO pra usuário Pro, Free pra usuário Free) e que tocar nela abre uma subtela mostrando tanto o status/ação de "NeoReader Pro" (leva pra Paywall) quanto as duas cotas de uso mensal.

**Acceptance Scenarios**:

1. **Given** o usuário está no menu de categorias, **When** observa a linha "Plano", **Then** vê um badge indicando "PRO" (usuário Pro) ou "Free" (usuário Free), sem precisar entrar na categoria.
2. **Given** o usuário toca na linha "Plano", **When** a subtela carrega, **Then** vê o status completo de "NeoReader Pro" (com badge "Ativo" se for Pro) e as duas cotas de uso mensal (Book Intelligence, Descubra/NYT).
3. **Given** o usuário está dentro da categoria "Plano", **When** toca em "NeoReader Pro", **Then** vai pra tela de Paywall, com o mesmo comportamento já existente hoje.

---

### User Story 4 - Configurações de idioma consolidadas num só lugar (Priority: P3)

"Idioma do App" (idioma da interface) e "Tradução" (idioma padrão de tradução inline) hoje ficam em seções separadas na tela longa. Na nova organização, ambas vivem dentro de uma única categoria "Idioma".

**Why this priority**: É uma melhoria de agrupamento que reduz fragmentação, mas não é essencial pro valor central da reorganização (que já é entregue pelas stories P1).

**Independent Test**: Entrar na categoria "Idioma", confirmar que tanto o seletor de idioma da interface quanto o seletor de idioma padrão de tradução aparecem ali, cada um mantendo seu próprio controle (bottom sheet) já existente, e que ajustar qualquer um dos dois continua funcionando como hoje.

**Acceptance Scenarios**:

1. **Given** o usuário entra na categoria "Idioma", **When** a tela carrega, **Then** vê tanto a opção de idioma da interface do app quanto a de idioma padrão de tradução, sem precisar navegar entre duas categorias diferentes.
2. **Given** o usuário muda o idioma da interface dentro dessa categoria, **When** confirma a escolha, **Then** o app muda de idioma imediatamente, do mesmo jeito que acontece hoje.

### Edge Cases

- Categoria com poucas configurações (ex.: "Idioma", com só 2 linhas) deve funcionar e parecer completa mesmo sendo uma subtela curta — não precisa de conteúdo mínimo artificial.
- Usuário aperta o botão físico de voltar do Android repetidamente a partir de dentro de uma categoria: cada toque sobe um nível (categoria → menu → tela anterior ao Settings), nunca pula direto pro app fechar ou voltar mais de um nível de uma vez.
- Usuário Pro vs. usuário free: a linha "Plano" no menu principal deve continuar refletindo o status correto (badge "PRO" ou "Free"), e o badge "Ativo" (dentro da subtela) continua só pra quem é Pro, igual ao comportamento atual.
- Estado de erro de sincronização (ex.: permissão expirada do Drive) continua aparecendo normalmente dentro da categoria "Sincronização na Nuvem" quando o usuário entra nela — só não aparece antecipado no menu principal (ver Fora de Escopo).
- Categorias "Narração" (chaves de voz: Speechify, ElevenLabs, Fish Audio) e "Integrações/Chaves de API" (YouTube) mantêm o comportamento de expandir/contrair cada provedor igual ao que existia na tela única, agora cada uma dentro da sua subtela dedicada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE substituir a tela única de Settings (com todas as configurações expostas de uma vez) por uma tela de menu mostrando categorias em lista vertical (ícone + nome), no mesmo padrão visual já usado pela linha "Catálogos OPDS" existente.
- **FR-002**: Sistema DEVE agrupar as configurações ajustáveis existentes nas seguintes categorias clicáveis, cada uma abrindo uma subtela dedicada: Plano, Idioma, Aparência do Leitor, Word Lens, Narração, Integrações/Chaves de API, Catálogos OPDS, Sincronização na Nuvem.
- **FR-003**: Sistema DEVE consolidar "Idioma do App" e "Tradução" (idioma padrão de tradução) numa única categoria "Idioma", mantendo os dois controles (bottom sheets) já existentes intactos dentro dela.
- **FR-004**: Sistema DEVE exibir, na linha "Plano" do menu principal, um badge de resumo ("PRO" pra usuário Pro, "Free" pra usuário Free), sem expor o restante do conteúdo de plano/uso diretamente no menu.
- **FR-005**: Sistema DEVE, dentro da subtela "Plano", exibir o status completo de "NeoReader Pro" (com badge "Ativo" pra usuários Pro e ação pra abrir a tela de Paywall) e as cotas de uso mensal (Book Intelligence, Descubra/NYT), já que nenhuma delas tem configuração ajustável própria — só essa categoria as agrupa.
- **FR-006**: Sistema DEVE, ao acionar o comando de voltar (botão da UI ou botão físico/gesto do Android) estando dentro de uma categoria, retornar ao menu de categorias do Settings — nunca sair do Settings direto a partir de uma subcategoria.
- **FR-007**: Sistema DEVE, ao acionar o comando de voltar estando no menu de categorias do Settings (fora de qualquer subcategoria), sair do Settings normalmente, preservando o comportamento de navegação já existente hoje.
- **FR-008**: Sistema DEVE preservar integralmente o comportamento funcional de cada configuração já existente (toggles, selects, campos de chave de API com validação, persistência local, bottom sheets, mensagens de erro/sucesso) — a reorganização é exclusivamente de navegação e agrupamento visual, não de lógica interna.
- **FR-009**: Sistema NÃO DEVE adicionar badges ou indicadores dinâmicos de alerta (ex.: erro de sincronização) nas linhas do menu principal de categorias nesta feature.
- **FR-010**: Sistema NÃO DEVE adicionar campo de busca por texto ao Settings nesta feature.
- **FR-011**: Sistema DEVE traduzir todo texto novo introduzido pela reorganização (nomes e descrições de categoria no menu) nos 3 idiomas já suportados pelo app (pt-BR, en, es), reaproveitando o sistema de i18n existente.
- **FR-012**: Sistema DEVE aplicar a mesma reorganização igualmente em Web e Android, sem divergência de comportamento entre as duas superfícies.

### Key Entities

Não aplicável — esta feature reorganiza navegação e apresentação de configurações já existentes, sem introduzir ou alterar entidades de dados persistidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tela principal de Settings mostra no máximo ~10 itens no total — hoje são 8 categorias clicáveis, todas uniformes (nenhum item "direto"/expandido) — visualmente mais curta que a lista atual (que hoje soma 11 seções completas com seus controles expostos).
- **SC-002**: Usuário consegue localizar e começar a ajustar qualquer configuração específica em no máximo 2 toques a partir da tela principal de Settings (1 toque na categoria + 1 toque/ajuste na configuração desejada).
- **SC-003**: Nenhuma configuração existente perde funcionalidade, valor persistido ou comportamento de validação após a reorganização — paridade 1:1 verificável comparando o estado antes/depois da mudança.
- **SC-004**: Usuário consegue voltar de qualquer profundidade de navegação dentro do Settings (subcategoria → menu → tela anterior) sem nunca pular um nível ou ficar preso, usando tanto o botão de voltar da UI quanto o botão físico/gesto do Android.

## Assumptions

- O padrão de navegação por pilha de rotas já usado no app (`App.tsx`, `useState<Route[]>` com push/pop) e já aplicado pela subtela "Catálogos OPDS" existente será reaproveitado para as novas subtelas de categoria — decisão técnica a ser confirmada no `sdd-plan`, não fixada nesta spec.
- A forma como alertas de sincronização são exibidos ao usuário (hoje, direto na tela de Settings) é um problema conhecido e será tratada numa feature futura separada, possivelmente movendo esse status para a tela de detalhes do livro — fora do escopo desta reorganização.
- Os nomes de categoria usados nesta spec ("Idioma", "Aparência do Leitor", "Narração", "Integrações/Chaves de API" etc.) são labels de trabalho; o texto final exibido ao usuário pode ser ajustado durante a implementação, desde que a categorização e o agrupamento descritos aqui sejam preservados.
- Nenhuma configuração nova é introduzida por esta feature — o número e o conteúdo das configurações existentes permanecem os mesmos, só a navegação muda.

## Clarifications

### Sessão 2026-09-02

- Q: Todas as 11 seções atuais devem virar categoria clicável, ou só as que têm várias configurações (deixando itens de 1 linha como atalho direto)? → A: Todas viram categoria, exceto os itens puramente informativos/de ação direta sem nada pra configurar (ver pergunta seguinte).
- Q: As categorias devem espelhar 1:1 as seções atuais, ou consolidar relacionadas? → A: Consolidar as relacionadas — proposta apresentada e confirmada: só "Idioma do App" + "Tradução" viram uma única categoria "Idioma"; o restante mantém a separação atual (ex.: Narração e Integrações continuam separadas, já que a chave do YouTube em Integrações não é sobre voz).
- Q: "Cotas de Uso" e "Build/Sobre" (sem nada pra configurar) também devem virar categoria clicável, ou ficam como linha direta no menu? → A: Ficam como linha direta no menu principal, sem subtela.
- Q: Layout do novo menu principal — lista vertical ou grid de cards? → A: Lista vertical (ícone + nome + seta), reaproveitando o padrão visual já usado por "Catálogos OPDS".
- Q: Ao voltar de dentro de uma categoria, o usuário deve retornar ao menu de categorias do Settings (não sair do Settings direto)? → A: Sim, confirmado — mesmo padrão já usado por "Catálogos OPDS" (FR-006/FR-007).
- Q: A categoria "Sincronização na Nuvem" deve mostrar um badge de alerta no menu principal quando houver erro pendente (ex.: permissão expirada), já que hoje esse aviso aparece direto na tela sem precisar clicar em nada? → A: Não nesta feature — a forma atual de exibir status de sincronização não está boa e será revista numa feature futura separada (provavelmente movendo essa visibilidade para a tela de detalhes do livro, onde o usuário já vê o sincronismo de bookmarks). Por isso, nenhum badge dinâmico é adicionado ao menu principal agora (FR-009).
- Q: A "facilidade de procurar" mencionada no pedido original deve incluir um campo de busca por texto, ou a categorização já resolve isso? → A: Só categorização nesta versão — sem campo de busca (FR-010).

### Sessão 2026-09-02 (ajustes pós-implementação, durante teste manual no device)

Depois do MVP (Fases 3-5) implementado e instalado no device pra validação manual (T029), o usuário pediu 3 ajustes ao ver o menu funcionando de verdade:

- Q: As chaves dos provedores de voz (Speechify, ElevenLabs, Fish Audio) ficam em "Integrações" ou fazem mais sentido dentro de "Narração"? → A: Mover pra "Narração" — são configuração de voz, cabem melhor junto do card de TTS nativo e do banner "Leitura por voz sempre funciona" (que já citava esses provedores). "Integrações" continua existindo como categoria separada, agora só com o YouTube Data API (não é sobre voz, mantém a separação original de categorias — ver Fora de Escopo).
- Q: "Cotas de Uso" continua como seção própria no menu, ou faz mais sentido junto de "Plano Pro"? → A: Juntar dentro do bloco "Plano" — status de plano e uso mensal são o mesmo assunto pro usuário (FR-005 revisado).
- Q: A seção "Build/Sobre" (chaves públicas de build, nota técnica sobre VITE_ env vars) deve continuar no menu principal? → A: Remover — é informação de debug/compliance voltada pro desenvolvedor, não pro usuário final; nunca fez parte do pedido original da feature.

### Sessão 2026-09-02 (ajuste adicional: Plano vira categoria)

Depois de ver o ajuste anterior (cotas dentro do bloco "Plano" já expandido direto no menu principal), o usuário achou que não estava certo — queria o mesmo padrão das outras categorias.

- Q: O bloco "Plano" (NeoReader Pro + as 2 cotas, expandido direto no menu principal) deve virar uma categoria clicável com subtela própria, igual às demais, ou continuar expandido no menu? → A: Virar categoria — menu principal mostra só uma linha "Plano" com badge de resumo ("PRO"/"Free"); tocar nela abre uma subtela com o status completo do Pro e as 2 cotas (FR-004/FR-005 revisados). Resultado: o menu principal fica 100% uniforme — todas as 8 linhas são categorias clicáveis, nenhuma expandida/direta.
