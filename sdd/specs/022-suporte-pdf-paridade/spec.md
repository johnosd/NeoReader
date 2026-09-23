# Feature Specification: Suporte a PDF com paridade de recursos do EPUB

**Slug**: `022-suporte-pdf-paridade`

**Created**: 2026-09-23

**Status**: Planejada

**Input**: "Validar o suporte a livros em PDF sem perda de qualidade que hoje temos em EPUB" — necessidade real, a maioria dos concorrentes oferece PDF; o objetivo é oferecer também e ser melhor que eles. Origem: assessment `sdd/assessments/suporte-pdf-sem-perda-qualidade-paridade/` (veredito `go`) e relatório de referência `docs/features/pdf_support_report.md` (arquitetura do Readest, usado só como referência conceitual).

## Escopo

### Incluído

- Importar PDF pelos mesmos caminhos do EPUB: seletor de arquivo (web e Android), importação de pasta (Android) e "abrir com" a partir de outros apps (Android).
- Leitura em **modo página fiel**: página original em scroll contínuo, com zoom por pinça, tema claro/escuro aplicado à página, sumário (quando o PDF tiver), progresso e marcadores.
- **Modo texto**: parágrafos reconstruídos a partir do texto do PDF e exibidos refluídos como um EPUB (fonte, tamanho, tema e espaçamento do leitor).
- Paridade de recursos nos dois modos: Word Lens e salvar vocabulário, tradução (inline no modo texto, em balão/sheet na página fiel), TTS incluindo TTS traduzido com acompanhamento visual do trecho lido, highlights de seleção e notas, marcadores e sync de marcadores no Drive (Pro), como já funciona para EPUB.
- Highlights, notas, marcadores e posição de leitura compartilhados entre os dois modos; o último modo usado é lembrado por livro.
- PDF escaneado (sem texto) importa e abre em página fiel; recursos de texto ficam indisponíveis, com aviso claro.
- Capa gerada da primeira página e metadados (título, autor) lidos do PDF, com o mesmo enriquecimento de ficha que o EPUB já tem.
- Biblioteca: PDF aparece junto dos EPUBs, identificado pelo formato, e entra em busca, filtros e ordenação por formato que já existem.
- Catálogos OPDS passam a mostrar e baixar livros disponíveis só em PDF; quando houver EPUB e PDF, o EPUB é o preferido.
- A copy de onboarding/biblioteca vazia que hoje já promete "PDFs e EPUBs" passa a ser verdadeira (e é revisada se algo mudar).

### Fora de Escopo

- OCR de PDFs escaneados (fica para uma feature futura).
- Escrever de volta no arquivo PDF (highlights/notas ficam no NeoReader, não viram anotações nativas do PDF).
- Formulários preenchíveis e anotações nativas do PDF como recurso interativo.
- PDFs protegidos por senha ou DRM.
- Outros formatos que a biblioteca de renderização também suporta (CBZ, MOBI, FB2).
- Sincronizar o arquivo PDF em si pelo Drive (o EPUB também não sincroniza).
- Garantia de funcionamento no Safari/iOS.
- Copiar código do Readest (licença AGPL-3.0) — o relatório é só referência conceitual; a implementação é independente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar e ler PDF em página fiel (Priority: P1)

O usuário importa um PDF (arquivo, pasta ou "abrir com") e ele aparece na biblioteca com capa, título e autor. Ao abrir, lê a página original em scroll contínuo, dá zoom por pinça, navega pelo sumário, cria marcadores e, ao voltar depois, o livro reabre onde parou.

**Why this priority**: Hoje PDF não abre de jeito nenhum. Só isso já tira o NeoReader da desvantagem frente aos concorrentes e é base para todas as outras stories.

**Independent Test**: Importar um PDF nascido digital e um escaneado pelos três caminhos, abrir, rolar, dar zoom, usar sumário, criar marcador, fechar e reabrir.

**Acceptance Scenarios**:

1. **Given** um PDF no dispositivo, **When** o usuário o importa por qualquer dos três caminhos, **Then** o livro aparece na biblioteca com capa da primeira página, título/autor do PDF (ou nome do arquivo se faltar) e identificado como PDF.
2. **Given** um PDF aberto, **When** o usuário rola, dá pinça e troca o tema para escuro, **Then** as páginas acompanham o scroll, o zoom funciona sem perder nitidez e a página respeita o tema escuro.
3. **Given** um PDF com sumário, **When** o usuário abre o sumário e toca num item, **Then** o leitor vai para a página correspondente.
4. **Given** o usuário leu até a página 120 e fechou, **When** reabre o livro, **Then** o leitor volta para a página 120.
5. **Given** o mesmo PDF já importado, **When** o usuário importa de novo, **Then** o sistema detecta duplicado como faz com EPUB.
6. **Given** um PDF escaneado, **When** o usuário o abre, **Then** o livro é exibido em página fiel e um aviso explica que recursos de texto não estão disponíveis para esse arquivo.

---

### User Story 2 - Modo texto (reflow) (Priority: P2)

Num PDF com texto, o usuário alterna para o modo texto e lê os parágrafos refluídos com a fonte, tamanho e tema do leitor, como num EPUB. Ao alternar de volta, continua no mesmo ponto. O app lembra o último modo usado naquele livro.

**Why this priority**: É o diferencial frente aos concorrentes, que em geral só mostram a página fixa — ruim para ler em celular. Também é onde a tradução inline cabe naturalmente.

**Independent Test**: Abrir um PDF de uma coluna, alternar para modo texto, conferir que frases não quebram no meio nem trazem hifenização de fim de linha, mudar fonte/tema, voltar para página fiel e conferir a posição; fechar e reabrir para conferir que o modo foi lembrado.

**Acceptance Scenarios**:

1. **Given** um PDF com texto aberto em página fiel, **When** o usuário alterna para modo texto, **Then** o conteúdo aparece em parágrafos contínuos, sem quebras no fim de cada linha física e sem hífens de quebra de linha.
2. **Given** o modo texto, **When** o usuário muda fonte, tamanho ou tema, **Then** o texto reflui com as mesmas preferências que valem para EPUB.
3. **Given** o usuário está num parágrafo da página 45 no modo texto, **When** alterna para página fiel, **Then** o leitor mostra a página 45 na região desse parágrafo (e o inverso também vale).
4. **Given** o usuário fechou o livro em modo texto, **When** reabre, **Then** o livro abre em modo texto.
5. **Given** uma página com figura, tabela ou fórmula, **When** exibida no modo texto, **Then** esse conteúdo não some silenciosamente — fica indicado no fluxo e acessível para ver como na página original.
6. **Given** um PDF escaneado, **When** o usuário tenta abrir o modo texto, **Then** a opção fica indisponível com a explicação do motivo.

---

### User Story 3 - Word Lens e tradução em PDF (Priority: P3)

O usuário toca numa palavra para vê-la no Word Lens e salvá-la no vocabulário, e traduz parágrafos — inline no modo texto, em balão/sheet na página fiel — usando os mesmos provedores (gratuito e premium BYOK) do EPUB.

**Why this priority**: Aprendizado de inglês é o pilar do produto; sem isso o PDF seria um leitor genérico.

**Independent Test**: Num PDF em inglês, tocar em palavras e traduzir parágrafos nos dois modos, salvar uma palavra e conferir que ela aparece na tela de Vocabulário.

**Acceptance Scenarios**:

1. **Given** um PDF com texto em qualquer modo, **When** o usuário toca numa palavra, **Then** o Word Lens abre para aquela palavra como no EPUB, e ela pode ser salva no vocabulário com a frase de contexto correta (sem quebras de linha físicas no meio).
2. **Given** o modo texto, **When** o usuário pede a tradução de um parágrafo, **Then** a tradução aparece inline, abaixo do parágrafo, como no EPUB.
3. **Given** a página fiel, **When** o usuário pede a tradução de um parágrafo, **Then** a tradução aparece num balão/sheet ligado ao parágrafo, sem cobrir a página inteira.
4. **Given** um provedor premium configurado, **When** o usuário traduz em PDF, **Then** o mesmo provedor e as mesmas regras de fallback do EPUB são usados.

---

### User Story 4 - TTS e audiobook em PDF (Priority: P3)

O usuário ouve o PDF em voz alta (inclusive TTS traduzido), com o trecho lido destacado e o leitor acompanhando, nos dois modos, também com tela apagada e app em segundo plano.

**Why this priority**: TTS realista é outro pilar do produto; em PDF, a leitura por linha física (pausando a cada quebra) é o defeito mais comum dos concorrentes.

**Independent Test**: Iniciar o TTS num PDF de várias páginas nos dois modos, ouvir a passagem entre páginas, apagar a tela e conferir continuidade e destaque visual.

**Acceptance Scenarios**:

1. **Given** um PDF com texto, **When** o usuário inicia o TTS, **Then** a leitura segue por parágrafos inteiros, sem pausas nas quebras de linha físicas nem leitura de hífens de quebra.
2. **Given** o TTS tocando na página fiel, **When** o trecho lido muda, **Then** ele é destacado sobre a página e o leitor rola para acompanhá-lo; no modo texto, o comportamento é o do EPUB.
3. **Given** um parágrafo que continua na página seguinte, **When** o TTS chega ao fim da página, **Then** a frase é lida inteira, sem corte na virada.
4. **Given** o TTS traduzido ativo, **When** o usuário ouve um PDF, **Then** funciona como no EPUB (tradução por parágrafo reconstruído).
5. **Given** tela apagada ou app em segundo plano, **When** o TTS está tocando, **Then** a leitura continua como no EPUB.

---

### User Story 5 - Highlights e notas em PDF (Priority: P3)

O usuário seleciona um trecho, destaca com cor/estilo, anota, e vê esses highlights nos dois modos e na lista de destaques do livro.

**Why this priority**: Completa a paridade com o EPUB; depende da mesma base de texto das stories anteriores.

**Independent Test**: Criar highlights com nota nos dois modos, alternar de modo, fechar/reabrir e conferir a lista de destaques na tela de detalhes do livro.

**Acceptance Scenarios**:

1. **Given** um PDF com texto em qualquer modo, **When** o usuário seleciona um trecho e escolhe cor/estilo e nota, **Then** o highlight é criado como no EPUB.
2. **Given** um highlight criado no modo texto, **When** o usuário alterna para página fiel, **Then** o mesmo trecho aparece destacado sobre a página (e vice-versa).
3. **Given** highlights em PDF, **When** o usuário abre os detalhes do livro, **Then** eles aparecem na lista de destaques com trecho e nota, e tocar num deles leva ao ponto no leitor.
4. **Given** uma seleção que atravessa duas páginas, **When** vira highlight, **Then** o trecho inteiro fica destacado nos dois modos.

---

### User Story 6 - PDF em catálogos OPDS (Priority: P3)

Ao navegar num catálogo OPDS, o usuário vê e baixa livros disponíveis só em PDF; quando existe EPUB e PDF, o app baixa o EPUB.

**Why this priority**: Aproveita a feature 003 existente com pouco escopo extra, mas não é essencial para ler PDF.

**Independent Test**: Num catálogo com entradas só-PDF, só-EPUB e mistas, conferir o que aparece e o formato baixado.

**Acceptance Scenarios**:

1. **Given** uma entrada OPDS só com PDF, **When** o usuário navega no catálogo, **Then** ela aparece e pode ser baixada para a biblioteca.
2. **Given** uma entrada com EPUB e PDF, **When** o usuário baixa, **Then** o EPUB é baixado.

---

### Edge Cases

- PDF misto (algumas páginas com texto, outras escaneadas): recursos de texto funcionam só nas páginas com texto; no modo texto, páginas sem texto ficam indicadas e acessíveis como imagem.
- PDF com múltiplas colunas: o modo texto deve seguir a ordem de leitura das colunas; se a ordem não puder ser determinada com confiança, a página é mostrada como na original naquele trecho, em vez de misturar colunas.
- Cabeçalhos, rodapés e números de página repetidos não devem virar parte dos parágrafos no modo texto nem ser lidos pelo TTS no meio de uma frase.
- PDF protegido por senha, corrompido ou que não é PDF de verdade: importação recusada com mensagem clara, sem entrar na biblioteca.
- PDF acima de 1000 páginas ou 200 MB: abre com aviso de possível lentidão; não pode derrubar o app.
- Arquivo "abrir com" externo que some depois (URI externo revogado): mesmo tratamento de arquivo ausente que o EPUB já tem.
- PDF sem metadados de título/autor: usa nome do arquivo, como no EPUB.
- PDF sem sumário: a opção de sumário fica vazia/indisponível, sem erro.
- Palavra hifenizada no fim de linha: Word Lens, tradução, TTS e busca tratam como palavra única.
- PDF em idioma da direita para a esquerda ou com texto vertical: melhor esforço; não pode quebrar a página fiel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema DEVE aceitar arquivos PDF nos três caminhos de importação existentes (seletor de arquivo web/Android, pasta no Android, "abrir com" no Android), identificando o formato pelo conteúdo do arquivo e não só pela extensão.
- **FR-002**: Sistema DEVE aplicar ao PDF a mesma detecção de duplicados, gravação local e tratamento de arquivo ausente que já aplica ao EPUB.
- **FR-003**: Sistema DEVE gerar a capa a partir da primeira página e ler título/autor dos metadados do PDF, com fallback para o nome do arquivo.
- **FR-004**: Sistema DEVE identificar o formato do livro na biblioteca e incluir PDF em busca, filtros e ordenação por formato.
- **FR-005**: Sistema DEVE exibir o PDF em modo página fiel com scroll contínuo, zoom por pinça sem perda de nitidez, tema claro/escuro aplicado à página e sumário quando existir.
- **FR-006**: Sistema DEVE salvar e restaurar a posição de leitura e permitir marcadores em PDF, incluindo o sync de marcadores no Drive nas mesmas condições do EPUB.
- **FR-007**: Sistema DEVE oferecer um modo texto em PDFs com texto, exibindo parágrafos reconstruídos (sem quebras de linha físicas, sem hifenização de quebra, sem cabeçalhos/rodapés/números de página no meio do texto) com as preferências de leitura do EPUB.
- **FR-008**: Sistema DEVE preservar o ponto de leitura ao alternar entre página fiel e modo texto, e lembrar por livro o último modo usado (padrão inicial: página fiel).
- **FR-009**: Sistema NÃO DEVE omitir silenciosamente figuras, tabelas, fórmulas ou páginas sem texto no modo texto; esse conteúdo DEVE ficar indicado e visualizável como na página original.
- **FR-010**: Sistema DEVE oferecer Word Lens e salvar vocabulário em PDF nos dois modos, com frase de contexto reconstruída.
- **FR-011**: Sistema DEVE oferecer tradução de parágrafo em PDF — inline no modo texto e em balão/sheet na página fiel — com os mesmos provedores e fallback do EPUB.
- **FR-012**: Sistema DEVE oferecer TTS (incluindo TTS traduzido e reprodução em segundo plano) em PDF nos dois modos, lendo por parágrafo reconstruído, sem cortar frases na virada de página, com destaque do trecho lido e acompanhamento automático.
- **FR-013**: Sistema DEVE permitir criar, editar e remover highlights com cor/estilo e nota em PDF nos dois modos, exibindo cada highlight nos dois modos e na lista de destaques do livro.
- **FR-014**: Sistema DEVE detectar PDFs (ou páginas) sem texto, mantê-los legíveis em página fiel e mostrar aviso de que os recursos de texto não estão disponíveis, sem falha silenciosa.
- **FR-015**: Sistema DEVE recusar com mensagem clara PDFs protegidos por senha, corrompidos ou inválidos, sem criar entrada na biblioteca.
- **FR-016**: Sistema DEVE abrir PDFs de até 1000 páginas / 200 MB sem travar ou encerrar por falta de memória; acima disso, DEVE abrir com aviso de possível lentidão.
- **FR-017**: Sistema DEVE listar e permitir baixar entradas OPDS disponíveis só em PDF, preferindo EPUB quando ambos existirem.
- **FR-018**: Sistema NÃO DEVE alterar o comportamento de leitura de EPUB existente.
- **FR-019**: A implementação NÃO DEVE incluir código copiado do Readest (AGPL-3.0); só referência conceitual.
- **FR-020**: Sistema DEVE determinar o idioma de um PDF pela escolha manual do usuário, pelos metadados do PDF ou por detecção a partir do texto, nessa ordem; quando não conseguir determinar com confiança, DEVE tratar o idioma como indefinido e avisar o usuário uma vez, com atalho para escolhê-lo — nunca assumir um idioma em silêncio.
- **FR-021**: Sistema DEVE enriquecer a ficha de um PDF com as mesmas fontes online do EPUB, usando título/autor dos metadados e, quando existir, o ISBN encontrado no texto do livro.

### Key Entities *(include if feature involves data)*

- **Livro**: passa a ter formato EPUB ou PDF; para PDF, guarda se tem camada de texto (total, parcial ou nenhuma) e o modo de leitura preferido (página fiel / texto).
- **Posição de leitura**: identifica um ponto do PDF de forma que valha nos dois modos (página + ponto no texto), permitindo alternar sem perder o lugar.
- **Highlight / nota / marcador**: ancorados no texto do PDF, de forma independente do modo em que foram criados.
- **Parágrafo reconstruído**: unidade de texto derivada das linhas da página, usada por modo texto, Word Lens, tradução, TTS e highlights.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos PDFs do corpus de teste (nascidos digitais e escaneados) importam pelos três caminhos e abrem sem erro.
- **SC-002**: A primeira página de um PDF de até 1000 páginas / 200 MB fica visível em até 3 segundos num aparelho Android intermediário, sem encerramento por falta de memória durante 30 minutos de leitura contínua.
- **SC-003**: Em PDFs de uma coluna do corpus, pelo menos 95% dos parágrafos no modo texto saem sem quebra falsa no meio de frase e sem hifenização residual (conferência amostral).
- **SC-004**: O TTS lê parágrafos inteiros sem pausa em quebras de linha físicas nem em viradas de página em 100% dos casos do corpus de uma coluna.
- **SC-005**: Alternar entre página fiel e modo texto mantém o mesmo trecho visível em 100% dos testes.
- **SC-006**: 100% dos highlights criados num modo aparecem no outro e na lista de destaques.
- **SC-007**: 100% dos PDFs escaneados mostram o aviso de recursos de texto indisponíveis (zero falhas silenciosas).
- **SC-008**: Suíte de testes e corpus EPUB existentes continuam passando sem regressão.
- **SC-009**: Nos PDFs de texto do corpus, o idioma é identificado corretamente em pelo menos 90% dos casos e fica "indefinido" (com aviso) no restante — zero idiomas errados assumidos em silêncio.

## Assumptions

- Os principais concorrentes mostram PDF só como página fixa e não oferecem tradução inline nem Word Lens em PDF — `ASSUMPTION` não verificada; é a base do "ser melhor que eles" via modo texto + recursos de aprendizado.
- A biblioteca de renderização já usada (fork do `foliate-js`, MIT) cobre abrir, paginar, sumário e metadados de PDF; o relatório do Readest serve só como referência conceitual para reconstrução de parágrafos e capa nativa.
- O alvo Web é Chromium; Safari/iOS não é garantido.
- "Aparelho intermediário" = o device de teste já usado pelo projeto (RXCX103NMVZ) ou equivalente.
- O corpus de teste de PDFs (nascidos digitais de 1 coluna, multi-coluna, escaneados, mistos, grandes) será montado durante o plano, análogo ao corpus EPUB existente.
- A entrega pode ser faseada por story (P1 primeiro); cada story é implantável sozinha.

## Clarifications

### Sessão 2026-09-23

- Q: Como o usuário lê um PDF? → A: Página fiel (padrão) + modo texto refluído alternável.
- Q: Quais recursos do EPUB precisam funcionar em PDF na primeira entrega? → A: Todos — Word Lens + tradução, TTS, highlights + notas, marcadores + sync.
- Q: O que fazer com PDF escaneado? → A: Abre só leitura em página fiel com aviso; OCR fora de escopo.
- Q: Como tratar o código do Readest (AGPL-3.0)? → A: Reimplementar do zero, usando só o conceito como referência.
- Q: Na página fiel, os recursos de texto funcionam direto sobre a página? → A: Sim, todos; tradução de parágrafo em balão/sheet (inline só no modo texto).
- Q: Highlights, notas, marcadores e posição são compartilhados entre modos? → A: Sim, compartilhados, e o último modo usado é lembrado por livro (padrão: página fiel).
- Q: Catálogos OPDS passam a mostrar livros só-PDF? → A: Sim, mostrar e baixar; preferir EPUB quando houver ambos.
- Q: Qual teto de tamanho sem travar? → A: 1000 páginas / 200 MB, primeira página em até 3s; acima disso abre com aviso.
- Q (Analyze do sdd-plan, A3): PDF quase nunca traz idioma nos metadados; como definir o idioma usado por Word Lens/tradução/TTS? → A: manual > metadados > detecção pelo texto no import > indefinido com aviso único (FR-020). Decidido pelo assistente a pedido do usuário ("resolva A3").
- Q (Analyze do sdd-plan, A2): como garantir o "mesmo enriquecimento de ficha" do EPUB? → A: provedor de ficha próprio para PDF, com ISBN extraído do texto para destravar o Open Library (FR-021). Decidido pelo assistente a pedido do usuário ("A2 tbm").
