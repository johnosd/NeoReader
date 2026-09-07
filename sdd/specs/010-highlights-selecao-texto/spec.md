# Feature Specification: Highlights de trecho selecionado no leitor

**Slug**: `010-highlights-selecao-texto`

**Created**: 2026-09-06

**Status**: Em Execução

**Input**: "gostaria de implementar seleção de texto, quando o usuario clicar sobre
o texto por um periodo de tempo selecionando o texto e depois arrastando. isso
deve abrir um novo menu, com inicialmente com opçao de salvar o trecho
selecionado. Esse toque, não pode conflitar com o clique rapido no paragrafo que
hoje abre o menu contextual" — reenquadrado na entrevista para: "uma função de
highlight onde o usuário pode marcar trechos e voltar neles depois; o texto pode
aparecer marcado em cores diferentes também".

**Assessment de origem**: `sdd/assessments/selecao-texto-no-leitor-menu-salvar/decision.md`
(veredito `go`). A entrevista deste spec **ampliou** o escopo aprovado lá:
highlight persistente renderizado no texto e cores eram Non-Goals no assessment e
agora fazem parte da feature, por decisão explícita do usuário. A priorização
abaixo absorve esse crescimento mantendo a P1 pequena.

**Terminologia**: o termo do produto é **highlight** (não "grifo", "trecho salvo"
nem "anotação"), por decisão do usuário. Vale para UI, código, testes e i18n.

## Escopo

### Incluído

- Gesto de seleção de texto no leitor (toque longo para iniciar, arrasto para
  estender), sobre o texto do livro.
- Menu próprio do NeoReader, ancorado na seleção, construído como **lista de
  ações extensível** — nesta rodada com uma ação só (criar highlight, com escolha
  de cor), mas com estrutura preparada para receber outras ações depois sem
  redesenho.
- Highlight persistente: o trecho continua marcado ao rolar, ao trocar de
  capítulo e ao reabrir o livro numa sessão futura.
- Preservação integral do toque curto no parágrafo (fluxo de tradução inline).
- Supressão do menu flutuante do sistema Android (Copiar / Compartilhar /
  Selecionar tudo) enquanto o leitor está ativo.
- Menu de gerenciamento ao tocar num highlight existente: remover, trocar a cor e
  trocar o estilo visual.
- Três estilos visuais de marcação — fundo colorido, sublinhado e risco ondulado
  — escolhíveis tanto ao criar quanto ao editar um highlight.
- **Aba de highlights na tela de detalhes do livro**, listando os highlights
  daquele livro, com volta ao ponto no leitor.

### Fora de Escopo

- **Lista de highlights agregada entre livros** — highlights pertencem ao livro;
  não existe coleção geral (nem na tela de Vocabulário, nem em lugar nenhum).
- **Anotações/notas de texto** presas ao highlight.
- **Favoritar/marcar highlight com estrela**.
- **Busca dentro da lista de highlights** — a lista é por livro e ordenada pela
  posição no texto, o que já a torna navegável nesta rodada.
- **Traduzir, anotar ou ouvir (TTS)** o trecho a partir do menu novo — ficam de
  fora nesta rodada. Fica de fora a **implementação** dessas ações, não a
  possibilidade: o menu continua extensível (FR-003a) justamente para recebê-las
  depois sem redesenho. Enquanto isso, elas permanecem onde já estão (fluxo de
  tradução inline). **Copiar e Compartilhar saíram desta lista** (revisão
  registrada nas Clarificações) — entraram no escopo desta mesma rodada,
  aproveitando exatamente a extensibilidade que o menu já tinha.
- **Seleção atravessando capítulos** — cada seção do EPUB é um documento próprio;
  uma seleção fica contida em uma seção.
- **Modo paginado** — o leitor roda em rolagem contínua; nada de virar página
  automaticamente durante a seleção.
- **Sincronização dos highlights na nuvem** (Google Drive) — highlights ficam
  locais nesta rodada, diferente de marcadores, progresso e vocabulário.
- **Exportar highlights** (arquivo, compartilhamento, integração externa).
- **Reaproveitar o destaque de vocabulário existente** — o destaque de vocabulário
  marca *toda ocorrência* de um texto no documento; o highlight marca exatamente
  o intervalo selecionado. São comportamentos distintos e a feature não altera o
  de vocabulário.
- **Gamificação sobre highlights** (metas, sequências, rankings) — um contador
  simples na tela de detalhes não é gamificação e está incluído (FR-027).
- Refatoração do roteamento de toque do leitor — a feature entra no fluxo
  existente sem reescrevê-lo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar um highlight e reencontrá-lo marcado (Priority: P1)

Lendo um livro, o usuário mantém o dedo sobre uma frase até o texto ficar
selecionado, arrasta para ajustar onde a seleção termina e solta. Um menu pequeno
aparece ancorado na seleção com a ação de highlight e suas cores. Ele toca numa
cor; o menu fecha, a seleção some e o trecho fica marcado naquela cor. Ele
continua lendo, rola o capítulo, volta — o highlight continua lá. Fecha o app,
reabre o livro no dia seguinte e o highlight continua no mesmo lugar.

**Why this priority**: É o loop completo da feature — sem ele nada mais existe. E
carrega a restrição central do pedido: o toque curto no parágrafo tem que
continuar funcionando exatamente como hoje.

**Independent Test**: Pode ser testada sozinha criando um highlight, rolando para
longe, voltando, e reabrindo o livro depois de fechar o app — entrega o valor de
marcar e reencontrar passagens sem depender de nenhuma outra story.

**Acceptance Scenarios**:

1. **Given** o leitor aberto num capítulo com texto, **When** o usuário mantém o
   dedo sobre uma palavra e arrasta até o fim de uma frase, **Then** o texto
   aparece selecionado e o menu de ações abre ancorado à seleção, exibindo a ação
   de highlight (um único item "Destacar"), além de Copiar e Compartilhar.
2. **Given** um trecho selecionado com o menu aberto, **When** o usuário toca em
   "Destacar", **Then** o menu troca para um submenu com os 3 estilos (fundo,
   sublinhado, ondulado) e as 8 cores, sem fechar nem perder a seleção.
2a. **Given** o submenu de destacar aberto, **When** o usuário toca num estilo,
    **Then** o estilo fica marcado como ativo (visualmente destacado) e o
    submenu permanece aberto — o estilo é só um estado pendente até a cor
    confirmar.
2b. **Given** o submenu de destacar aberto, **When** o usuário toca numa cor,
   **Then** o menu fecha, a seleção é desfeita e o trecho fica marcado naquela
   cor com o estilo pendente (fundo, se nenhum estilo foi tocado antes).
2a. **Given** um trecho selecionado com o menu aberto, **When** o usuário toca em
    Copiar, **Then** o texto selecionado vai para a área de transferência, o
    menu fecha e a seleção é desfeita — sem highlight criado.
2b. **Given** um trecho selecionado com o menu aberto, **When** o usuário toca em
    Compartilhar, **Then** o mecanismo de compartilhamento do sistema abre com o
    texto selecionado; ao concluir ou cancelar, o menu fecha e a seleção é
    desfeita — sem highlight criado.
3. **Given** um highlight criado, **When** o usuário rola para fora do trecho e
   volta, **Then** o highlight continua visível na mesma posição e cor.
4. **Given** um highlight criado numa sessão anterior, **When** o usuário fecha o
   app e reabre o mesmo livro, **Then** o highlight é exibido no mesmo trecho.
5. **Given** o leitor aberto, **When** o usuário dá um toque curto num parágrafo,
   **Then** o fluxo de tradução inline abre como antes, sem nenhum atraso
   perceptível e sem o menu de seleção aparecer.
6. **Given** um trecho selecionado com o menu aberto, **When** o usuário toca
   fora da seleção, **Then** o menu fecha, a seleção é desfeita e nenhum
   highlight é criado.
7. **Given** o usuário rolando o capítulo com o dedo sobre o texto, **When** o
   gesto termina, **Then** nenhuma seleção é criada e nenhum menu abre.

---

### User Story 2 - Menu do NeoReader sem o menu do sistema por cima (Priority: P2)

Ao selecionar texto no Android, o usuário vê apenas o menu do NeoReader. A barra
flutuante do sistema (Copiar / Compartilhar / Selecionar tudo) não aparece e não
cobre as cores de highlight.

**Why this priority**: A P1 é demonstrável sem isso, mas no Android — a
plataforma alvo — ela chega degradada: a barra do sistema pode cobrir o menu de
cores e confunde quem não sabe qual dos dois menus é do app. É polimento
obrigatório antes de considerar a feature entregue no Android, não um extra
opcional.

**Independent Test**: Pode ser testada sozinha no device, selecionando texto e
verificando que só o menu do NeoReader aparece — o highlight em si já funcionava
na P1.

**Acceptance Scenarios**:

1. **Given** o leitor aberto no Android, **When** o usuário seleciona um trecho,
   **Then** apenas o menu do NeoReader é exibido, sem a barra flutuante do
   sistema.
2. **Given** o usuário saiu do leitor e está numa tela com campo de texto (ex:
   busca da biblioteca), **When** ele seleciona texto nesse campo, **Then** o
   menu do sistema volta a funcionar normalmente.

---

### User Story 3 - Remover ou trocar a cor de um highlight pelo próprio texto (Priority: P3)

O usuário toca num trecho já marcado. Em vez do fluxo de tradução, abre um menu
do highlight, com a opção de removê-lo, trocar sua cor ou trocar seu estilo
visual. Ao remover, a marcação some do texto na hora.

**Why this priority**: Sem isso um highlight errado é irreversível dentro do
leitor — o que torna a P1 arriscada de usar. Vem antes da lista porque o erro
acontece no exato lugar onde o usuário está lendo.

**Independent Test**: Pode ser testada sozinha criando um highlight, tocando
nele, trocando a cor e depois removendo — entrega controle sobre o que já foi
marcado sem depender da tela de detalhes.

**Acceptance Scenarios**:

1. **Given** um highlight existente, **When** o usuário toca sobre ele, **Then**
   abre o menu do highlight com remover, os 3 estilos (o atual marcado como
   ativo) e trocar cor, e o fluxo de tradução inline **não** abre.
2. **Given** o menu do highlight aberto, **When** o usuário escolhe outra cor,
   **Then** o trecho é remarcado na cor nova, o menu fecha, e a mudança
   sobrevive a reabrir o livro.
2a. **Given** o menu do highlight aberto, **When** o usuário escolhe outro
    estilo, **Then** o trecho é remarcado nesse estilo imediatamente, o menu
    **permanece aberto** com o novo estilo marcado como ativo, e a mudança
    sobrevive a reabrir o livro.
3. **Given** o menu do highlight aberto, **When** o usuário escolhe remover,
   **Then** a marcação some imediatamente e o trecho não volta ao reabrir o
   livro.
4. **Given** um parágrafo com um highlight no meio, **When** o usuário toca numa
   parte **sem** highlight do mesmo parágrafo, **Then** o fluxo de tradução
   inline abre normalmente.

---

### User Story 4 - Ver os highlights do livro na tela de detalhes (Priority: P4)

Fora do leitor, o usuário abre a tela de detalhes de um livro e encontra uma
aba de highlights daquele livro, na ordem em que aparecem no texto: o trecho
marcado, a cor, a posição e a data. Ele toca num deles e o livro abre exatamente
naquele ponto. Se quiser, remove um highlight direto dali.

**Why this priority**: O highlight visível no próprio texto já entrega o "voltar
nele depois" desde a P1; esta story dá a visão consolidada do livro. É a última
porque é a única parte que não fica no caminho da leitura.

**Independent Test**: Pode ser testada sozinha criando alguns highlights num
livro, saindo do leitor, abrindo a tela de detalhes desse livro e navegando de
volta a um deles.

**Acceptance Scenarios**:

1. **Given** um livro com highlights, **When** o usuário abre a tela de detalhes
   desse livro, **Then** vê a aba de highlights listando todos os do livro, na
   ordem em que aparecem no texto, cada um com trecho, cor, posição e data.
2. **Given** a aba de highlights, **When** o usuário toca num item, **Then** o
   livro abre posicionado nesse trecho, com o highlight visível.
3. **Given** a aba de highlights, **When** o usuário remove um item, **Then**
   ele some da lista e também deixa de aparecer no texto ao abrir o livro.
4. **Given** um livro sem nenhum highlight, **When** o usuário abre a tela de
   detalhes, **Then** vê um estado vazio explicando como criar um highlight.
5. **Given** um livro com highlights, **When** o usuário abre a tela de detalhes,
   **Then** o contador de highlights aparece junto dos contadores já existentes
   (marcadores, vocabulário).
6. **Given** um highlight cujo trecho não é mais localizável no arquivo do livro,
   **When** o usuário abre a tela de detalhes, **Then** o item continua listado
   com seu texto e a lista carrega normalmente.

---

### Edge Cases

- **Seleção que atravessa dois parágrafos da mesma seção**: permitida — vira um
  highlight só, cobrindo o intervalo inteiro.
- **Seleção que atravessa capítulos** (seções diferentes do EPUB): o menu não
  abre; nada é marcado. Fora de escopo declarado.
- **Seleção colapsada ou só de espaços**: o menu não abre.
- **Seleção que se sobrepõe a um highlight existente**: cria um highlight novo e
  independente; nenhum merge, nenhum bloqueio. Trechos sobrepostos são exibidos
  sobrepostos.
- **Trecho muito longo** (ex: seleção de um capítulo inteiro): é marcado
  normalmente; a lista exibe o texto truncado, sem truncar o que foi gravado.
- **Seleção contendo imagem, nota de rodapé ou link**: o intervalo é marcado; a
  cor cobre o texto, e elementos não textuais dentro do intervalo continuam
  funcionando (o toque neles mantém o comportamento atual).
- **Seleção dentro do bloco de tradução inline**: o menu de seleção não abre —
  highlight existe só sobre o texto do livro.
- **Leitura contínua (TTS) ativa**: a seleção e o menu funcionam; enquanto houver
  seleção ativa, o toque não navega o TTS.
- **Mudança de fonte, tamanho de fonte, tema ou rotação de tela**: os highlights
  continuam cobrindo o texto certo depois do reflow.
- **Highlight cujo trecho não é mais localizável** (arquivo do EPUB substituído,
  estrutura alterada): não é marcado no texto, o app não quebra, e o registro
  continua na lista da tela de detalhes.
- **Livro removido da biblioteca**: seus highlights vão junto — não sobra
  registro órfão em nenhuma lista.
- **Tema escuro e claro**: as cores de highlight mantêm o texto legível nos dois.
- **Highlight criado no Android e livro aberto na web** (ou vice-versa): cada
  dispositivo tem os seus; ausência no outro dispositivo é esperada, não erro.

## Requirements *(mandatory)*

### Functional Requirements

**Gesto e menu de seleção**

- **FR-001**: O sistema DEVE permitir que o usuário selecione texto do livro por
  toque prolongado seguido de arrasto, com a seleção permanecendo visível até ser
  desfeita.
- **FR-002**: O sistema DEVE abrir um menu próprio do NeoReader, ancorado à
  região da seleção, quando uma seleção não vazia de texto do livro termina.
- **FR-003**: O menu de seleção DEVE conter a ação de criar highlight — com as
  cores e estilos disponíveis alcançáveis a partir dela; escolher uma cor DEVE
  aplicar o highlight e fechar o menu num único toque.
- **FR-003e**: A ação de highlight DEVE aparecer no menu raiz como um único
  item (não como a fileira de cores exposta diretamente); tocar nele DEVE abrir
  um submenu com os estilos e as cores, para não ocupar mais espaço de tela do
  que o necessário (FR-003b).
- **FR-003f**: O submenu de highlight DEVE oferecer 3 estilos visuais — fundo
  colorido, sublinhado, risco ondulado. Tocar num estilo DEVE marcá-lo como
  ativo e manter o submenu aberto (estado pendente); só tocar numa cor DEVE
  confirmar e fechar, aplicando o estilo pendente (fundo, se nenhum foi
  tocado).
- **FR-003a**: O menu de seleção DEVE ser estruturado como **lista de ações**,
  não como controle dedicado a highlight: acrescentar uma ação futura (traduzir,
  anotar, ouvir) DEVE ser questão de declarar mais um item, sem reescrever o
  menu, seu posicionamento ou o gesto que o abre.
- **FR-003c**: O menu de seleção DEVE conter, além do highlight, as ações
  **Copiar** e **Compartilhar** sobre o trecho selecionado. Copiar DEVE colocar
  o texto selecionado na área de transferência do sistema; Compartilhar DEVE
  abrir o mecanismo de compartilhamento do sistema operacional com o texto
  selecionado. As duas fecham o menu e desfazem a seleção ao concluir, no mesmo
  padrão do highlight (um toque, uma ação).
- **FR-003d**: Se o mecanismo de compartilhamento do sistema não estiver
  disponível na plataforma (ex: navegador sem suporte a compartilhamento) ou o
  usuário cancelar o compartilhamento, o sistema NÃO DEVE mostrar erro — apenas
  não conclui a ação, e o menu permanece como estava antes do toque.
- **FR-003b**: O menu DEVE permanecer utilizável quando tiver mais ações do que
  cabem na largura da tela, sem cortar itens de forma inacessível nem cobrir o
  trecho selecionado.
- **FR-004**: O menu DEVE fechar sem criar highlight quando o usuário tocar fora
  dele ou desfizer a seleção.
- **FR-005**: O sistema DEVE manter o menu visível e ancorado enquanto a seleção
  existir, reposicionando-o se a seleção mudar de tamanho ou posição.
- **FR-006**: O sistema NÃO DEVE abrir o menu de seleção quando a seleção estiver
  vazia, contiver apenas espaços, atravessar capítulos, ou pertencer ao bloco de
  tradução inline.

**Convivência com o toque atual**

- **FR-007**: O toque curto num parágrafo DEVE continuar abrindo o fluxo de
  tradução inline exatamente como hoje, sem atraso adicional perceptível
  introduzido pela detecção de seleção.
- **FR-008**: Enquanto existir uma seleção ativa de texto, o sistema NÃO DEVE
  disparar as ações do toque curto (tradução inline, navegação de TTS, alternar
  os controles do leitor).
- **FR-009**: O gesto de rolagem sobre o texto NÃO DEVE criar seleção nem abrir o
  menu.
- **FR-010**: No Android, o sistema DEVE impedir que o menu flutuante de seleção
  do sistema apareça enquanto o leitor estiver ativo, e DEVE restaurar o
  comportamento padrão do sistema fora do leitor.

**Highlight e persistência**

- **FR-011**: O sistema DEVE registrar cada highlight com posição exata de início
  e fim dentro do livro, o texto marcado, a cor escolhida, o livro de origem e a
  data de criação.
- **FR-011a**: O sistema DEVE registrar o estilo visual do highlight (fundo,
  sublinhado ou ondulado). Highlights gravados antes deste campo existir DEVEM
  continuar sendo exibidos normalmente, tratados como estilo "fundo".
- **FR-012**: O highlight DEVE marcar exatamente o intervalo selecionado — nunca
  outras ocorrências do mesmo texto no livro.
- **FR-013**: O sistema DEVE exibir os highlights de um livro sempre que o trecho
  correspondente estiver visível, incluindo após rolagem, troca de capítulo e
  reabertura do livro numa nova sessão.
- **FR-014**: Os highlights DEVEM continuar cobrindo o texto correto após
  mudanças de aparência do leitor (fonte, tamanho, tema) e rotação de tela.
- **FR-015**: O sistema DEVE oferecer mais de uma cor de highlight, reaproveitando
  a paleta de cores já usada para marcadores.
- **FR-016**: O sistema DEVE manter highlights sobrepostos como registros
  independentes, sem fundir nem recusar a criação.
- **FR-017**: O sistema DEVE tolerar um highlight cuja posição não seja mais
  localizável no livro: não o marca no texto, não interrompe a leitura, e o
  mantém na lista da tela de detalhes.
- **FR-018**: Os highlights DEVEM ser mantidos apenas no dispositivo, sem
  sincronização na nuvem nesta rodada.
- **FR-018a**: Remover um livro da biblioteca DEVE remover também os highlights
  daquele livro, sem deixar registro órfão.

**Gerenciar highlight existente**

- **FR-019**: O toque curto sobre um highlight DEVE abrir o menu do highlight,
  com remover, trocar cor e trocar estilo, em vez do fluxo de tradução inline. O
  menu DEVE abrir já com o estilo atual do highlight marcado como ativo.
- **FR-020**: O toque curto numa parte sem highlight de um parágrafo que contém
  highlight DEVE continuar abrindo o fluxo de tradução inline.
- **FR-021**: Remover um highlight DEVE apagar a marcação imediatamente e impedir
  que ele reapareça em sessões futuras.
- **FR-022**: Trocar a cor de um highlight DEVE remarcá-lo imediatamente,
  persistir a nova cor e fechar o menu. Trocar o estilo DEVE remarcá-lo
  imediatamente e persistir o novo estilo, **sem fechar o menu** — diferente do
  menu de criação, aqui não há confirmação pendente: o highlight já existe, e
  cada toque (cor OU estilo) já é a ação final.

**Lista de highlights do livro**

- **FR-023**: A tela de detalhes do livro DEVE oferecer uma **aba** de
  highlights, no mesmo sistema de abas que a tela já usa (Capítulos, Marcadores,
  Configurações...), listando apenas os highlights daquele livro.
- **FR-024**: A lista DEVE ordenar os highlights pela posição em que aparecem no
  texto do livro, exibindo trecho, cor, posição e data de criação.
- **FR-025**: Tocar num highlight da lista DEVE abrir o livro posicionado nesse
  trecho.
- **FR-026**: A lista DEVE permitir remover um highlight, com o mesmo efeito da
  remoção feita pelo leitor.
- **FR-027**: A tela de detalhes DEVE exibir a contagem de highlights do livro
  junto dos contadores já existentes (marcadores, vocabulário).
- **FR-028**: A lista DEVE exibir estado vazio quando o livro não tiver nenhum
  highlight.
- **FR-028a**: O sistema NÃO DEVE oferecer nenhuma lista de highlights agregada
  entre livros — highlights são sempre apresentados no contexto do seu livro.

**Plataforma**

- **FR-029**: A feature DEVE funcionar no Android como plataforma alvo de
  qualidade, e DEVE funcionar de forma básica na web quando a seleção for feita
  com o mouse, sem meta de polimento equivalente.

### Key Entities

- **Highlight**: um trecho que o usuário marcou dentro de um livro. Guarda o
  livro a que pertence, a posição de início e fim dentro dele, o texto marcado
  como o usuário o selecionou, a cor escolhida, o estilo visual (fundo,
  sublinhado ou ondulado — opcional, ausência tratada como "fundo"), a posição
  relativa no livro (para ordenar a lista e exibir progresso) e a data de
  criação. Existe sempre atrelado a um livro — não há highlight sem livro, nem
  visão agregada entre livros. É independente de **Marcador** (que aponta para
  um ponto, não um intervalo, e sincroniza na nuvem) e de **Item de
  Vocabulário** (que é um par texto original + tradução).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 10 tentativas no aparelho de teste, o gesto de toque longo +
  arrasto produz seleção e abre o menu do NeoReader em pelo menos 9, sem que o
  menu do sistema apareça sobre ele.
- **SC-002**: Em 10 toques curtos em parágrafos, o fluxo de tradução inline abre
  nas 10 — nenhuma regressão em relação ao comportamento atual.
- **SC-003**: Em 10 gestos de rolagem com o dedo sobre o texto, nenhum cria
  seleção ou abre o menu.
- **SC-004**: Um highlight é reexibido corretamente em 100% dos casos após rolar
  para fora e voltar, trocar de capítulo e reabrir o livro numa nova sessão.
- **SC-005**: Criar um highlight leva no máximo um toque após a seleção terminar
  (escolher a cor marca e fecha o menu).
- **SC-006**: Um highlight criado aparece na aba de highlights do seu livro, na
  posição correta da ordem de leitura, e tocar nele reabre o livro no trecho
  certo.
- **SC-007**: Remover um highlight — pelo texto ou pela lista — o faz desaparecer
  dos dois lugares, sem reaparecer ao reabrir o livro.
- **SC-008**: Nenhum highlight deixa o leitor em estado quebrado quando seu
  trecho não é mais localizável — a leitura continua normalmente.
- **SC-009**: Os highlights permanecem alinhados ao texto correto após alterar
  fonte, tamanho de fonte, tema e girar a tela.
- **SC-010**: A suíte do projeto (`lint`, testes e build) passa sem erros.
- **SC-011**: Acrescentar uma ação nova ao menu de seleção é demonstrável como
  declaração de mais um item, sem alterar o gesto de seleção, o posicionamento do
  menu nem o fluxo de highlight — verificável com uma ação de exemplo adicionada
  e removida durante a revisão.

## Assumptions

- O leitor continua operando em rolagem contínua; nenhuma parte desta feature
  pressupõe modo paginado.
- O comportamento nativo de seleção do WebView (toque longo seleciona palavra,
  alças arrastam para estender) está disponível e é a base do gesto — não será
  reimplementado. **Premissa a validar no aparelho antes de implementar o gesto**;
  se cair, a alternativa registrada no assessment é um modo de seleção explícito
  acionado por botão, o que mudaria a User Story 1.
- A paleta de cores de highlight é a mesma já definida para marcadores (8 cores),
  sem criar tokens de cor novos.
- A aba de highlights segue o padrão visual das abas que a tela de detalhes do
  livro já usa (incluindo a lista de marcadores e seu estado vazio).
- O texto do highlight é gravado integralmente; truncamento é só de exibição na
  lista.
- Highlights não entram na sincronização com o Google Drive nesta rodada, mesmo
  que marcadores, progresso e vocabulário sincronizem — a decisão de sincronizar
  fica para uma rodada futura.
- O aparelho de teste é o já usado no projeto (RXCX103NMVZ), com o fluxo de
  captura de logs existente.
- O destaque de vocabulário (que marca todas as ocorrências de frases salvas)
  continua existindo e inalterado, convivendo visualmente com os highlights.

## Clarifications

### Sessão 2026-09-06

- Q: Onde o usuário lê depois os trechos que salvou? → A: **Superada pela revisão
  no fim desta sessão.** A resposta inicial foi "como item na tela de
  Vocabulário, agregando entre livros".
- Q: Como o trecho é persistido? → A: Tabela nova e separada, não estendendo
  marcadores nem itens de vocabulário.
- Q: O que acontece quando o usuário salva um trecho sobreposto a outro? → A:
  Salva como registro novo e independente; sem merge e sem bloqueio.
- Q: O gesto precisa funcionar no navegador ou só no Android? → A: Android como
  alvo de qualidade; web funciona de forma básica com seleção por mouse, sem meta
  de polimento.
- Q: O trecho salvo entra no vocabulário com ou sem tradução? → A: Reenquadramento
  do usuário — não é salvar no vocabulário, é uma **função de highlight**: o
  usuário marca trechos, volta neles depois, e o texto pode aparecer marcado em
  cores diferentes. A entidade passa a ser "highlight", sem lado de tradução.
- Q: O trecho marcado deve continuar marcado ao reabrir o livro? → A: Sim, o
  highlight é persistente e visível no texto. **Nota registrada ao usuário**: o
  mecanismo do destaque de vocabulário (casamento por texto, marcando todas as
  ocorrências) não serve aqui — o highlight marca exatamente o intervalo
  selecionado (FR-012); a escolha do mecanismo fica para o `sdd-plan`.
- Q: Quando o usuário escolhe a cor? → A: No próprio menu que abre ao soltar a
  seleção — tocar numa cor marca e fecha, num toque só.
- Q: O que acontece ao tocar num highlight existente? → A: Abre um menu do
  highlight com remover e trocar cor, em vez do fluxo de tradução inline.
- Q: (revisão do usuário, com o Kindle como referência visual) O menu que abre na
  seleção precisa comportar outras opções além de marcar? → A: Sim — "um menu que
  poderá ter outras opções". O menu passa a ser especificado como **lista de
  ações extensível** (FR-003a/FR-003b, SC-011); o conteúdo desta rodada continua
  sendo só o highlight. Antes desta revisão o menu estava especificado como
  controle dedicado a cores, o que exigiria redesenho para receber a segunda ação.
- Q: Onde fica a lista, afinal? → A: **Reversão explícita da resposta inicial** —
  "os highlights devem ser item relacionado ao livro, não faz sentido ter de forma
  geral". A lista sai da tela de Vocabulário e vira uma seção na **tela de
  detalhes do livro** (US4, FR-023 a FR-028a); a coleção agregada entre livros
  passa a ser Fora de Escopo explícito.
- D: (revisão pós-plano, achado A8 do Analyze) FR-023 dizia "seção"; a tela de
  detalhes do livro é organizada por **abas** (`Tab`/`TABS` em
  `BookDetailsScreen.tsx`), então o texto foi alinhado para "aba" — mudança de
  vocabulário, não de escopo.
- Q: Como chamar a feature? → A: **highlights**, não "grifos". Terminologia
  aplicada a toda a spec, ao slug da feature e valendo para UI, código, testes e
  i18n.
- D: (decisão registrada, não perguntada) Com a lista passando a ser por livro,
  a **busca dentro da lista** foi retirada do escopo — ela existia para servir a
  coleção entre livros. Ordenação pela posição no texto substitui essa navegação.

### Sessão 2026-09-06 (revisão durante a implementação da US1)

- Q: Testando o gesto no device, o usuário observou o menu de cores funcionando
  e comentou que "deveria aparecer um menu também, com opções de copiar,
  compartilhar" e decidiu trazer isso pra esta rodada em vez de deixar para
  depois. → A: **Copiar e Compartilhar entram no escopo agora** (FR-003c/
  FR-003d), no mesmo menu de seleção, ao lado das cores de highlight — exatamente
  o uso pretendido da extensibilidade do FR-003a. Traduzir, anotar e ouvir (TTS)
  continuam fora. Copiar usa a Clipboard API do browser (`navigator.clipboard`).
  **Correção pós-instalação em device**: Compartilhar via Web Share API
  (`navigator.share`) não funcionava de forma confiável no WebView Android
  (diferente do Chrome mobile) — o botão não fazia nada. Corrigido com um método
  nativo novo (`shareText`, `Intent.ACTION_SEND`) no plugin Capacitor **já
  existente** (`NeoReaderLibraryPlugin.java`), mesmo padrão de
  `setReaderImmersiveMode`/`setSelectionMenuSuppressed` — nenhum plugin novo foi
  criado.
- Q: (revisão do usuário, testando em device, com referência visual de outro
  app leitor mostrando fundo/sublinhado/ondulado e uma barra de ações mais
  rica) A fileira de 8 cores exposta direto no menu de seleção "deveria ser um
  único item, que quando clicado abrisse outras cores... tipo um submenu"; e
  "podemos ter os menus e submenus como ícones... também podemos colocar
  outras formas de grifar... acredita que precisa ter um pouco mais de
  polimento". Entrevista de acompanhamento (4 perguntas via AskUserQuestion) → A:
  1) Estilos: **fundo + sublinhado + risco ondulado** (3, como na referência) —
     nenhuma ação extra (Traduzir/Ouvir/Anotar/Dicionário) entra nesta rodada.
  2) Layout: **modelo compacto com submenu** (não o layout "tudo visível" da
     referência) — a ação de highlight vira um único item que abre um submenu
     com estilos + cores (FR-003e/FR-003f), em vez de expor 8 cores direto no
     menu raiz.
  3) O menu de **gerenciar** um highlight já criado recebe o mesmo tratamento:
     ganha os 3 estilos ao lado de remover/cor (FR-019, FR-022), mas sem
     submenu — como o highlight já existe, cada toque (cor OU estilo) já é a
     ação final, sem estado pendente.
  Decisão técnica que dispensou nova `version()` do Dexie: `Highlight.style` é
  campo opcional não-indexado (FR-011a); os 3 estilos usam as draw functions
  prontas do foliate-js (`Overlayer.highlight`/`.underline`/`.squiggly`), sem
  desenho customizado.
