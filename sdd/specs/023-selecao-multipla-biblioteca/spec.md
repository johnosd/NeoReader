# Feature Specification: Seleção múltipla na biblioteca com ações em lote

**Slug**: `023-selecao-multipla-biblioteca`

**Created**: 2026-10-12

**Status**: Em Execução

**Input**: "na tela 'library' eu quero como usuario poder selecionar multiplos livros e fazer ações em lote: excluir, adicionar em colecao, colocar tags tanto na visualização em lista como na visualização em grade"

## Escopo

### Incluído

- Modo de seleção na tela Biblioteca, nas visualizações **lista** e **grade**, ativado por toque longo (long-press) num livro.
- Ações em lote sobre os livros selecionados:
  - **Excluir** (com confirmação).
  - **Mover para coleção**, incluindo criar uma coleção nova na hora e "Sem coleção" para remover todos da coleção atual.
  - **Favoritar / remover dos favoritos** (botão adaptativo).
  - **Definir status de leitura** (não lido / lendo / lido).
- Barra de seleção com contador, botão de sair (X) e acesso às ações.
- Aviso curto de confirmação depois de cada ação concluída.

### Fora de Escopo

- **Tags em lote**: estava no pedido original e foi retirada pelo usuário por enquanto. As tags continuam editáveis livro a livro, como hoje.
- "Selecionar todos" e "inverter seleção".
- Seleção que sobrevive a trocas de filtro, busca ou ordenação. A seleção vale só para o conjunto visível quando o modo começou.
- Botão "Selecionar" no cabeçalho: a entrada é só por long-press.
- "Desfazer" depois da exclusão.
- Seleção múltipla fora da Biblioteca (Home, Descobrir, catálogos OPDS, detalhes do livro).
- Mudar o comportamento das ações individuais (folha de ações rápidas, toque simples para abrir o livro) fora do modo de seleção.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Selecionar vários livros e excluí-los de uma vez (Priority: P1)

O usuário importou uma pasta inteira e quer apagar vários livros que não interessam. Ele segura um livro, outros toques vão marcando livros, e um único comando exclui todos depois da confirmação.

**Why this priority**: entrega o modo de seleção completo (entrar, marcar, desmarcar, sair), que é a base de todas as outras ações. A exclusão em lote é a dor mais concreta: hoje cada livro exige 3 toques e uma confirmação própria.

**Independent Test**: com 5 livros na biblioteca, segurar um, tocar em mais 2, excluir e confirmar. Sobram 2 livros, e os 3 excluídos não deixam progresso, marcadores nem arquivo local.

**Acceptance Scenarios**:

1. **Given** a biblioteca em lista ou grade e fora do modo de seleção, **When** o usuário segura um livro, **Then** o modo de seleção começa, aquele livro aparece marcado e a barra de seleção mostra "1 selecionado".
2. **Given** o modo de seleção ativo, **When** o usuário toca num livro não marcado, **Then** o livro é marcado e o contador sobe. O livro **não** abre.
3. **Given** o modo de seleção ativo, **When** o usuário toca num livro marcado, **Then** ele é desmarcado. Se era o último marcado, o modo de seleção termina.
4. **Given** 3 livros marcados, **When** o usuário escolhe "Excluir", **Then** aparece uma confirmação "Excluir 3 livros?" avisando que progresso, marcadores e vocabulário desses livros também serão apagados.
5. **Given** a confirmação de exclusão aberta, **When** o usuário confirma, **Then** os 3 livros somem da biblioteca, o modo de seleção termina e aparece um aviso curto ("3 livros excluídos").
6. **Given** a confirmação de exclusão aberta, **When** o usuário cancela, **Then** nada é apagado e a seleção continua como estava.
7. **Given** o modo de seleção ativo, **When** o usuário toca no X da barra ou no voltar do Android, **Then** o modo termina sem nenhuma ação e a seleção é descartada.

---

### User Story 2 - Mover vários livros para uma coleção (Priority: P2)

O usuário quer organizar uma série ("Harry Potter 1-7") numa coleção sem abrir livro por livro.

**Why this priority**: é a ação de organização mais pedida depois da exclusão. Depende do modo de seleção da P1, mas é testável sozinha usando o mesmo modo.

**Independent Test**: marcar 3 livros, escolher "Mover para coleção" → "Nova coleção 'Série X'". O filtro da coleção "Série X" mostra exatamente esses 3 livros.

**Acceptance Scenarios**:

1. **Given** N livros marcados, **When** o usuário escolhe "Mover para coleção", **Then** aparece a lista das coleções existentes, a opção "Sem coleção" e a opção de criar uma coleção nova.
2. **Given** a lista de coleções aberta, **When** o usuário escolhe a coleção C, **Then** todos os N livros passam a pertencer a C, mesmo os que estavam em outra coleção (substituição). O modo de seleção termina e aparece "N livros movidos para C".
3. **Given** a lista de coleções aberta, **When** o usuário cria a coleção "Nova" e a confirma, **Then** a coleção é criada e os N livros são movidos para ela.
4. **Given** a lista de coleções aberta, **When** o usuário escolhe "Sem coleção", **Then** os N livros deixam de pertencer a qualquer coleção.
5. **Given** o filtro de uma coleção C ativo, **When** o usuário move livros de C para outra coleção, **Then** esses livros somem da visão filtrada atual.

---

### User Story 3 - Favoritar e definir status de leitura em lote (Priority: P3)

O usuário quer marcar como "lido" vários livros que já leu fora do app, ou favoritar um grupo de uma vez.

**Why this priority**: conveniência. Os dois campos já têm edição individual e o ganho em lote é menor que o das P1 e P2.

**Independent Test**: marcar 3 livros, sendo 1 já favorito, e tocar em "Favoritar": os 3 viram favoritos. Marcar os mesmos 3 de novo: o botão agora diz "Remover dos favoritos". Marcar 2 livros e escolher status "Lido": o filtro de lidos mostra os 2.

**Acceptance Scenarios**:

1. **Given** N livros marcados e pelo menos um que não é favorito, **When** o usuário abre as ações, **Then** a ação aparece como "Favoritar". Ao tocar, todos os N passam a ser favoritos.
2. **Given** N livros marcados e todos já favoritos, **When** o usuário abre as ações, **Then** a ação aparece como "Remover dos favoritos". Ao tocar, todos os N deixam de ser favoritos.
3. **Given** N livros marcados, **When** o usuário escolhe "Status de leitura" → "Lido" (ou "Lendo" / "Não lido"), **Then** todos os N passam a ter esse status.
4. **Given** qualquer ação da P3 concluída, **Then** o modo de seleção termina e aparece um aviso curto com o resultado.

---

### Edge Cases

- **Long-press na grade × toque para abrir**: um toque curto continua abrindo o livro fora do modo de seleção. Só o toque longo inicia a seleção, e soltar o dedo depois do long-press não pode abrir o livro.
- **Long-press × rolagem**: arrastar o dedo para rolar a lista ou a grade não pode disparar o long-press.
- **Long-press × menu de contexto nativo**: o menu de contexto do sistema (copiar, salvar imagem) não pode aparecer sobre a capa.
- **Botões por livro na lista** ("⋯" e o atalho de tags): durante o modo de seleção não abrem a folha individual. Tocar em qualquer parte da linha só alterna a seleção.
- **Livro com arquivo ausente** (`missingFile`) ou arquivo externo: pode ser selecionado e excluído normalmente.
- **Falha parcial**: se a ação falhar para parte dos livros, os que deram certo ficam aplicados. O aviso informa quantos falharam ("2 de 5 não puderam ser excluídos") e o modo termina.
- **Seleção grande** (por exemplo, 200 livros): a ação não trava a tela sem feedback. Há indicação de progresso ou de "processando" até concluir.
- **Biblioteca muda por fora** durante o modo (por exemplo, uma importação terminando): livros que deixaram de existir saem da seleção. Se a seleção ficar vazia, o modo termina.
- **Rolagem e virtualização**: a marcação visual de livros que saem da tela e voltam continua correta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE iniciar o modo de seleção quando o usuário fizer long-press em qualquer livro da Biblioteca, tanto na lista quanto na grade, já marcando esse livro.
- **FR-002**: Fora do modo de seleção, o toque curto num livro DEVE continuar abrindo o livro, e as ações individuais atuais DEVEM continuar funcionando como hoje.
- **FR-003**: No modo de seleção, o toque curto num livro DEVE alternar a marcação dele e NÃO DEVE abrir o livro nem a folha de ações individual.
- **FR-004**: Cada livro marcado DEVE ter indicação visual inequívoca (marca de seleção e destaque) na lista e na grade.
- **FR-005**: No modo de seleção, o cabeçalho da Biblioteca DEVE ser substituído por uma barra com: contador de selecionados, botão para sair (X) e acesso às ações em lote. Busca, filtros, ordenação e troca lista/grade NÃO DEVEM ficar disponíveis enquanto o modo estiver ativo.
- **FR-006**: O botão voltar do Android e o X DEVEM sair do modo de seleção, descartando a seleção, sem executar nenhuma ação e sem sair da tela.
- **FR-007**: Desmarcar o último livro selecionado DEVE encerrar o modo de seleção.
- **FR-008**: A ação "Excluir" DEVE pedir confirmação mostrando a quantidade de livros e avisando que os dados associados (progresso, marcadores, vocabulário) serão apagados. Se confirmada, DEVE apagar cada livro exatamente como a exclusão individual atual, incluindo o arquivo local copiado.
- **FR-009**: A ação "Mover para coleção" DEVE listar as coleções existentes, oferecer "Sem coleção" e permitir criar uma coleção nova. A escolha DEVE substituir a coleção atual de todos os livros selecionados.
- **FR-010**: A ação de favoritos DEVE aparecer como "Remover dos favoritos" quando todos os selecionados já forem favoritos e como "Favoritar" em qualquer outro caso, aplicando o estado correspondente a todos.
- **FR-011**: A ação "Status de leitura" DEVE permitir escolher entre Não lido, Lendo e Lido, aplicando o status escolhido a todos os selecionados.
- **FR-012**: Depois de qualquer ação em lote concluída, o sistema DEVE encerrar o modo de seleção e mostrar um aviso curto com o resultado (quantidade afetada e destino, quando houver).
- **FR-013**: Em falha parcial, o sistema DEVE manter os efeitos já aplicados e informar quantos livros falharam.
- **FR-014**: Todos os textos novos DEVEM existir nos 3 idiomas da interface (pt-BR, en, es), com pluralização correta para 1 e para N livros.
- **FR-015**: Elementos interativos novos (barra, botões, itens marcáveis) DEVEM ter rótulos acessíveis que informem o estado de seleção.

### Key Entities

- **Seleção**: conjunto efêmero (só na tela, não persistido) de identificadores de livros marcados, válido enquanto o modo de seleção estiver ativo.
- **Livro**: entidade existente. Os campos afetados em lote são coleção (uma por livro), favorito, status de leitura e, na exclusão, o próprio registro com seus dados associados.
- **Coleção**: entidade existente. Pode ser criada a partir do fluxo de mover.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Excluir 10 livros exige no máximo 13 toques (1 long-press, 9 toques de seleção, abrir ações, Excluir, Confirmar). Hoje são cerca de 30.
- **SC-002**: Nas visualizações lista e grade, 100% dos toques curtos fora do modo de seleção continuam abrindo o livro (sem regressão).
- **SC-003**: Uma ação em lote sobre 50 livros conclui e devolve o controle ao usuário em menos de 3 s num aparelho Android intermediário.
- **SC-004**: Depois de excluir em lote, nenhum dado associado aos livros excluídos permanece armazenado (mesmo critério da exclusão individual).

## Assumptions

- Hoje o long-press não tem função nos itens da Biblioteca. A lista só bloqueia o menu de contexto, e a grade só abre o livro. Por isso o gesto está livre para a seleção.
- Cada livro pertence a no máximo uma coleção (modelo atual). "Mover para coleção" substitui a coleção do livro em vez de adicioná-lo a mais uma.
- Os status de leitura disponíveis são os 3 atuais (não lido, lendo, lido). Mudar o status em lote não altera o progresso de leitura salvo.
- A exclusão em lote reaproveita o comportamento da exclusão individual, que já apaga o arquivo local.
- A feature não exige mudança de schema de dados.

## Clarifications

### Sessão 2026-10-12

- Q: Como o usuário entra no modo de seleção? → A: Só por long-press, sem botão "Selecionar" no cabeçalho.
- Q: Como aplicar tags em lote? → A: Tags saem do escopo por enquanto (retiradas pelo usuário).
- Q: Como "adicionar à coleção" se comporta, dado que cada livro tem uma única coleção? → A: Move todos para a coleção escolhida (substitui a atual), com opção "Sem coleção" e criação de coleção nova no próprio fluxo.
- Q: Além de excluir e coleção, o que mais entra? → A: Favoritar em lote e marcar status em lote. "Selecionar todos" fica de fora.
- Q: Como confirmar a exclusão em lote? → A: Diálogo com a contagem e o aviso de perda de dados. Apaga como a exclusão individual (inclui arquivo local). Sem "desfazer".
- Q: Como favoritar com seleção mista? → A: Botão adaptativo: "Remover dos favoritos" se todos já são favoritos, senão "Favoritar" marca todos.
- Q: O que acontece depois de aplicar uma ação? → A: Sai do modo de seleção e mostra um aviso curto com o resultado.
- Q: Como ficam filtro, busca, ordenação e o voltar do Android durante a seleção? → A: Ficam bloqueados (a barra de seleção substitui o cabeçalho). O voltar e o X saem do modo sem fazer nada.
