# Feature Specification: Liberar recursos do leitor EPUB ao trocar de livro

**Slug**: `009-leitor-libera-recursos-book-destroy`

**Created**: 2026-09-04

**Status**: Convergida

**Input**: Assessment `sdd/assessments/foliate-js-nao-libera-capitulos-lidos-dommemoria/` (veredito `go`). O leitor EPUB nunca libera, ao fechar um livro, os recursos (imagens, fontes, CSS) que foram carregados durante a leitura — eles ficam retidos na memória indefinidamente, mesmo depois de o usuário trocar de livro ou sair do leitor. Isso foi identificado durante a investigação de um alerta de uso de memória do Play Console (`sdd/bugs/alerta-play-console-uso-memoria-acima/`), mas ficou fora do escopo daquele fix.

## Escopo

### Incluído

- Ao trocar de livro ou sair do leitor, liberar os recursos do livro que acabou de ser fechado (imagens, fontes, CSS carregados durante a leitura), para que não fiquem retidos na memória do app indefinidamente.
- Cobertura por teste automatizado que comprove que essa liberação acontece tanto ao trocar de livro quanto ao sair do leitor.

### Fora de Escopo

- Liberar da memória capítulos já lidos que ficaram "para trás" do capítulo atual durante uma sessão de leitura longa em um único livro — investigado na assessment de origem e descartado por risco real de quebrar a posição de scroll do leitor (comportamento intencional da biblioteca de renderização). Fica registrado como ideia futura separada, não como parte desta feature.
- Qualquer mudança em código de terceiros (bibliotecas do leitor) — a correção fica inteiramente do lado do NeoReader.
- Qualquer mudança no lado nativo Android (ex.: resposta a pressão de memória do sistema operacional) — já coberto por outra feature/bug anterior.
- Medição formal de telemetria de campo do Play Console (P90 de memória) — não é observável localmente e está fora do controle desta feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Memória do leitor não acumula ao trocar de livro (Priority: P1)

Como leitor que troca de livro com frequência ou sai e volta ao leitor várias vezes numa mesma sessão de uso do app, quero que o app não acumule memória sem necessidade a cada troca, para que o app continue responsivo e tenha menos chance de ser encerrado pelo sistema operacional por uso excessivo de memória.

**Why this priority**: É a única user story desta feature — sem ela, não há entrega. O vazamento é incondicional (acontece em toda troca de livro, não só em sessões muito longas), então é o cenário mais fácil de disparar e o que mais se beneficia do fix.

**Independent Test**: Pode ser testado abrindo um livro, saindo do leitor (ou trocando para outro livro) repetidas vezes, e confirmando — via teste automatizado com mock e, opcionalmente, via inspeção manual de memória no device — que os recursos do livro fechado não continuam retidos após a troca.

**Acceptance Scenarios**:

1. **Given** um livro aberto no leitor com imagens/recursos carregados, **When** o usuário sai do leitor (volta para a tela anterior), **Then** os recursos daquele livro são liberados como parte do processo de fechamento.
2. **Given** um livro aberto no leitor, **When** o usuário abre um livro diferente (troca de livro sem passar por uma tela intermediária), **Then** os recursos do livro anterior são liberados antes ou durante a abertura do novo livro.
3. **Given** o leitor sendo fechado antes de o carregamento do livro ter terminado (ex.: usuário sai rapidamente), **When** o processo de fechamento roda, **Then** nenhum erro ocorre mesmo que não haja recursos carregados ainda para liberar.

---

### Edge Cases

- Fechar o leitor duas vezes seguidas (ex.: comportamento de dupla invocação em desenvolvimento) não deve gerar erro — a liberação de recursos deve ser seguro para ser chamada mais de uma vez sem efeito colateral negativo.
- Sair do leitor antes de o livro terminar de carregar (objeto de livro ainda não disponível) não deve gerar erro nem travar a navegação.
- Trocar de livro rapidamente várias vezes em sequência (antes da liberação anterior terminar) não deve deixar o app em estado inconsistente nem quebrar a abertura do novo livro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE liberar os recursos do livro atualmente aberto no leitor (imagens, fontes, CSS carregados durante a sessão de leitura) sempre que o usuário sair da tela do leitor.
- **FR-002**: O sistema DEVE liberar os recursos do livro anterior sempre que o usuário abrir um livro diferente enquanto já está no leitor.
- **FR-003**: A liberação de recursos DEVE ser segura mesmo quando o livro ainda não terminou de carregar (nenhum recurso disponível para liberar ainda) — não deve lançar erro nem impedir a navegação.
- **FR-004**: A liberação de recursos DEVE ser segura para ser executada mais de uma vez seguida sem efeito colateral negativo (idempotente).
- **FR-005**: A correção NÃO DEVE alterar nenhum comportamento visível ao usuário durante a leitura ativa (navegação, progresso, aparência) — é uma mudança de limpeza interna, sem impacto funcional na experiência de leitura.

### Key Entities

Não aplicável — esta feature não introduz nem altera entidades de dados persistidas (Dexie/IndexedDB). O "recurso" liberado é estado em memória do processo de renderização do livro (imagens/fontes/CSS carregados durante a leitura), não um dado armazenado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um teste automatizado confirma que, ao sair do leitor, os recursos do livro aberto são liberados.
- **SC-002**: Um teste automatizado confirma que, ao trocar de livro dentro do leitor, os recursos do livro anterior são liberados.
- **SC-003**: A suíte de testes completa, o build de produção e o lint continuam passando sem regressão após a mudança.
- **SC-004** *(opcional, não bloqueante)*: Uma verificação manual em device real (inspeção de memória) mostra que a quantidade de recursos retidos não cresce de forma acumulada após múltiplas trocas de livro em sequência — feita se houver oportunidade, mas não é critério de conclusão da feature.

## Assumptions

- A liberação de recursos não tem efeito colateral visível na experiência de leitura (não há necessidade de feedback visual ao usuário) — é uma correção interna de gestão de memória.
- Não há outro ponto do código, além da tela do leitor, que carregue e mantenha recursos de livro em memória de forma equivalente — o escopo desta feature cobre apenas o fluxo do leitor.
- A validação com profiler de memória em device real (SC-004) fica como validação manual opcional, não como critério obrigatório de aceite, dado que o custo de inação do problema original é baixo (sem prazo de enforcement, sem reclamação de usuário) e o fix é de baixo risco — confirmado com o usuário na fase de clarificação.

## Clarifications

### Sessão 2026-09-04

- Q: Escopo desta spec: só a rede de segurança de liberação de recursos do livro fechado, ou também tentar mitigar capítulos que ficam retidos na memória atrás do capítulo atual em sessões muito longas? → A: Só a rede de segurança (liberação ao fechar/trocar de livro). A mitigação de capítulos retidos "para trás" fica de fora, registrada em Fora de Escopo — risco real de quebrar posição de scroll, sem medição que justifique.
- Q: A validação com profiler de memória em device deve ser critério de aceite obrigatório, ou fica como validação manual opcional? → A: Opcional/nice-to-have (refletido em SC-004) — custo de inação do problema original já é baixo.
- Q: Precisa de teste automatizado explícito garantindo a liberação de recursos (troca de livro e saída do leitor), ou cobertura indireta pelos testes existentes já basta? → A: Teste explícito, cobrindo os dois cenários (refletido em SC-001 e SC-002).
