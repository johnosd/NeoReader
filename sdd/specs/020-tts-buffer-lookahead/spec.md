# Feature Specification: Buffer e Lookahead de TTS na língua nativa

**Slug**: `020-tts-buffer-lookahead`

**Created**: 2026-09-21

**Status**: Em Execução

**Input**: Leitura TTS com gaps entre frases (Buffer/Lookahead): Verificar se na leitura normal do livro, quando está na língua nativa, é possível adiantar e guardar em buffer duas ou três frases. O objetivo é reduzir pausas (gaps) desnecessárias causadas pela comunicação com a API.

## Escopo

### Incluído

- Fila/buffer em memória que pré-carrega (prefetch) o áudio das próximas 2 a 3 frases enquanto o TTS da frase atual está em reprodução.
- Manutenção do buffer em memória durante pausas normais de reprodução.
- Limpeza imediata do buffer ao ocorrer navegação manual (seek/pulos de capítulo ou parágrafo).
- Tratamento de erros silencioso em background (retries de downloads falhos) com graceful degradation caso chegue a vez de tocar uma frase que ainda não carregou (parando a reprodução e indicando o erro).

### Fora de Escopo

- Suporte a reprodução de TTS totalmente offline.
- Mudança do motor (engine) ou provider de TTS utilizado atualmente no app.
- Feedback visual constante do preenchimento de buffer (a feature será intencionalmente 100% invisível/transparente na interface).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leitura sem gaps (Priority: P1)

Como usuário ouvindo TTS na língua nativa, quero que as frases seguintes sejam pré-carregadas para que eu não ouça gaps (pausas) de silêncio entre o final de uma frase e o começo da próxima.

**Why this priority**: É a essência do problema levantado. Reduzir a latência do "aguardando API" resolve a experiência robótica e degradada.

**Independent Test**: Pode ser testado ativando o modo de leitura TTS online; inspecionando visual/auditivamente se a transição entre frases fica contínua, sem intervalos de 500ms-1s que ocorrem atualmente.

**Acceptance Scenarios**:

1. **Given** que estou escutando a frase 1 em TTS, **When** a reprodução dela terminar, **Then** o áudio da frase 2 deve começar imediatamente, sem pausas perceptíveis.
2. **Given** que o usuário pausa a reprodução, **When** ele apertar Play novamente alguns minutos depois, **Then** a reprodução deve ser retomada instantaneamente, utilizando as frases que já estavam pré-carregadas no buffer de memória.

### User Story 2 - Comportamento de Falha Silenciosa (Priority: P2)

Como usuário, quero que falhas temporárias na rede ao carregar a próxima frase sejam mitigadas em background, sem travar o aplicativo ou pular trechos.

**Why this priority**: Mantém a estabilidade da experiência. Uma funcionalidade que faz requisições prematuras precisa lidar bem com falhas nessas requisições.

**Independent Test**: Pode ser testado simulando interrupção de rede momentânea (ex: 2 segundos) enquanto o buffer tenta carregar a frase seguinte.

**Acceptance Scenarios**:

1. **Given** uma falha no prefetch da frase N+1 em background, **When** o player continua reproduzindo N, **Then** ele tenta baixar N+1 novamente.
2. **Given** que a reprodução da frase N termina e a frase N+1 ainda não conseguiu ser baixada devido à rede, **When** for o momento de tocar N+1, **Then** a reprodução deve pausar, exibir um indicativo de erro de conexão na tela, não pulando o texto correspondente.

### User Story 3 - Pulos de Navegação (Priority: P2)

Como usuário, se eu pular de parágrafo (seek), quero que o TTS recomece rapidamente no novo ponto sem reproduzir trechos desnecessários antigos.

**Why this priority**: Garante que o buffer obedeça a navegação do usuário de forma ágil, sem travamentos e sem tocar áudio fantasma de posições antigas.

**Independent Test**: Pular para um parágrafo diferente enquanto o TTS toca, confirmando se o áudio não engasga com restos das requisições anteriores.

**Acceptance Scenarios**:

1. **Given** que estou escutando TTS, **When** eu pular para 3 parágrafos a frente, **Then** o player deve limpar o buffer de áudios pendentes e recomeçar imediatamente o prefetch a partir do novo parágrafo.

### Edge Cases

- **Troca de livro/fechamento do app durante prefetch:** Cancelar os downloads ativos e descartar o buffer imediatamente para não vazar recursos.
- **Transição de capítulo:** O prefetch deve ser capaz de buscar as primeiras frases do próximo capítulo se já tiver chegado ao fim do capítulo atual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE enfileirar até 3 requisições de TTS sequenciais, mantendo os recursos em memória.
- **FR-002**: O sistema DEVE iniciar o request do próximo áudio assim que houver espaço no buffer.
- **FR-003**: O sistema DEVE parar a reprodução e indicar o estado de erro caso o áudio não consiga ser entregue pela rede a tempo e as retentativas esgotem.
- **FR-004**: O sistema DEVE abortar requests de prefetch ativos e limpar o buffer se ocorrer um "seek" (pulo manual na leitura).
- **FR-005**: O sistema NÃO DEVE alterar ou poluir a interface gráfica com feedbacks de carregamento de prefetch em condições normais, devendo ser 100% invisível.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O tempo (gap) medido entre a reprodução consecutiva de duas frases cai para menos de 50ms (transição praticamente imperceptível) em redes com estabilidade mínima.
- **SC-002**: Consumo de memória para armazenar o buffer de 3 frases não deve inflar drasticamente o uso geral de RAM (a se verificar nos testes pós-implementação).

## Assumptions

- O engine ou provider do TTS já retorna URLs ou áudios que podem ser mantidos e invalidados facilmente.
- Arquivos de áudio correspondentes a curtos trechos (2-3 frases) não consumiriam espaço ou memória significativos que causem Out Of Memory (OOM) no dispositivo.

## Clarifications

### Sessão 2026-09-21

- Q: Gerenciamento de memória ao pausar: o que fazemos com o buffer? → A: (Recomendado) Manter o buffer em memória; os arquivos de áudio de 2-3 frases são leves e isso economiza banda/latência ao dar "Play" novamente.
- Q: Falha de rede no prefetch: como devemos tratar? → A: (Recomendado) Retentar em background silenciosamente. Se na hora de tocar ainda não tiver baixado, parar a reprodução e indicar estado de erro.
- Q: Pulo de capítulo ou parágrafo (Seek/Skip): O que acontece com o buffer? → A: (Recomendado) Esvaziar o buffer atual imediatamente e iniciar o prefetch a partir do novo ponto de leitura.
- Q: Feedback visual: Você deseja que o usuário saiba que há um buffer sendo preenchido? → A: (Recomendado) 100% invisível/transparente.
