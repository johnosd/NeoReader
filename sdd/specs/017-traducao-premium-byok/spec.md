# Feature Specification: Tradução Premium BYOK (DeepL, OpenAI, Google)

**Slug**: `017-traducao-premium-byok`

**Created**: 2026-09-11

**Status**: Em Execução

**Input**: Assessment `sdd/assessments/traduo-multi-provedor-byok-deepl-openai-google/` (veredito `go`, 2026-09-10) — adicionar tradução premium ao leitor via três provedores configuráveis por BYOK (DeepL, OpenAI, Google Cloud Translation), com botão "Testar chave" (7 categorias de resultado) e um modelo de seleção/fallback refinado durante a entrevista deste `sdd-specify` (ver `## Clarifications`).

## Escopo

<!--
  Não-objetivos explícitos. Preencher com o que a entrevista do sdd-specify
  levantou. Evita expansão de escopo não solicitada durante o sdd-execute.
-->

### Incluído

- Nova seção "Tradução" em Configurações, com um campo de API key por
  provedor (DeepL, OpenAI, Google Cloud Translation), botão "Testar chave"
  com validação real classificada em 7 categorias, e persistência local só
  após validação bem-sucedida — mesmo padrão de UI já usado hoje pra chaves
  de TTS premium (`SettingsNarrationScreen`).
- Seleção de um único provedor de tradução ativo por livro (MyMemory,
  DeepL, OpenAI ou Google), na tela de detalhes do livro — mesmo padrão já
  usado hoje pro seletor de provedor de TTS (`BookDetailsScreen`).
- Fallback automático e transparente pro MyMemory quando o provedor
  selecionado de um livro falhar, com regras de retry/no-retry por tipo de
  erro (timeout/429/5xx, quota/billing, idioma não suportado, chave
  inválida, erro de requisição/bug interno, cancelamento do usuário).
- Indicação, na tela de detalhes do livro, de quando o provedor
  efetivamente em uso difere do selecionado (mesmo padrão do aviso de
  fallback de TTS).
- Isolamento do cache local de tradução por provedor (`src/db/translations.ts`),
  pra não misturar resultados de provedores diferentes pro mesmo texto.
- Disponibilidade pra qualquer usuário (Free ou Pro) — não é feature
  Pro-gated.

### Fora de Escopo

- Backend ou vault próprio pra proxear chamadas ou guardar chaves —
  chamadas são diretas do app pro provedor, como já acontece com TTS
  premium (`constitution.md`: local-first, sem backend próprio).
- Sincronizar chaves de tradução entre dispositivos.
- Suportar provedores de tradução além dos 3 especificados (DeepL, OpenAI,
  Google) nesta iteração.
- Subir o armazenamento de chave pra Keychain/Keystore nativo nesta
  entrega — aceita-se o mesmo nível de risco já em produção pras chaves de
  TTS premium (IndexedDB local), registrado como risco conhecido.
- Cadeia automática de fallback entre os 3 provedores premium
  (DeepL→OpenAI→Google) — o pedido original descrevia essa cadeia, mas foi
  substituída nesta spec por seleção única por livro + fallback só pro
  MyMemory (ver `## Clarifications`). Se o padrão de seleção única se
  mostrar insuficiente em uso real, uma cadeia multi-provedor pode ser
  reavaliada como feature própria depois.
- Qualquer forma de consentimento/toggle pra fallback automático entre
  provedores pagos — sem objeto, já que o único fallback automático desta
  spec é pro MyMemory gratuito (sem risco de cobrança surpresa).
- ~~Indicador visível, durante a leitura, de qual provedor gerou uma
  tradução específica~~ — **revertido em 2026-09-11, ver Clarifications**:
  agora existe um selo discreto ("via {provedor}") no próprio painel de
  tradução, só quando o provedor efetivo não for o MyMemory.
- Indicador persistente/ambiente no chrome do leitor (fora do painel de
  tradução) — descartado a favor do selo por trecho (única opção
  escolhida).
- Aumentar o limite de ~500 caracteres por chamada pra provedores premium —
  mantém o mesmo limite já usado hoje pelo MyMemory pra todos os
  provedores.
- Implementar a feature "TTS Traduzido" do backlog (usar tradução como
  insumo pro TTS ler em outro idioma) — pode reusar o serviço de tradução
  resultante desta feature, mas é escopo distinto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Traduzir com DeepL via chave própria (Priority: P1)

Como leitor com uma chave de API da DeepL, quero configurá-la em
Configurações, testá-la, selecioná-la como provedor de tradução de um
livro específico, e receber traduções inline (tap-to-translate) geradas
pela DeepL nesse livro — com fallback automático pro MyMemory se a DeepL
falhar.

**Why this priority**: É a menor fatia vertical completa que prova o
modelo inteiro (configurar → validar → selecionar por livro → traduzir →
fallback) com um único provedor. Sem isso, nenhuma outra parte da feature
tem valor demonstrável.

**Independent Test**: Pode ser totalmente testado configurando uma chave
DeepL real, selecionando DeepL como provedor de um livro de teste, e
comparando o texto traduzido no tap-to-translate contra o resultado atual
do MyMemory — entrega valor mensurável (qualidade de tradução) mesmo sem
OpenAI/Google implementados.

**Acceptance Scenarios**:

1. **Given** nenhuma chave de tradução configurada, **When** o usuário abre
   Configurações > Tradução e insere uma chave DeepL válida e toca em
   "Testar chave", **Then** o sistema chama a API da DeepL, classifica o
   resultado como "válida" e salva a chave localmente.
2. **Given** uma chave DeepL inválida, **When** o usuário toca em "Testar
   chave", **Then** o sistema classifica o resultado como "inválida", exibe
   essa mensagem e não salva a chave.
3. **Given** uma chave DeepL válida e salva, **When** o usuário abre a tela
   de detalhes de um livro e seleciona "DeepL" no seletor de provedor de
   tradução, **Then** essa seleção é salva pra aquele livro.
4. **Given** um livro com DeepL selecionado, **When** o usuário toca pra
   traduzir um trecho no leitor, **Then** o texto traduzido vem da DeepL.
5. **Given** um livro com DeepL selecionado e a chamada à DeepL retorna
   timeout, **When** o sistema esgota o retry limitado configurado,
   **Then** a tradução cai automaticamente pro MyMemory, sem interromper a
   leitura nem exigir ação do usuário.
6. **Given** um livro com DeepL selecionado e a chave é removida/invalidada
   depois, **When** o usuário abre a tela de detalhes do livro, **Then** o
   sistema mostra que o provedor efetivamente em uso é o MyMemory, mesmo
   com "DeepL" ainda marcado como selecionado.

---

### User Story 2 - Traduzir com OpenAI via chave própria (Priority: P2)

Como leitor com uma chave de API da OpenAI, quero o mesmo fluxo da User
Story 1 (configurar, testar, selecionar por livro, traduzir, fallback),
mas usando a OpenAI como provedor — que aplica instruções de tom, diálogo e
estilo literário na tradução.

**Why this priority**: Estende o modelo já provado no P1 pro segundo
provedor, com o maior potencial de qualidade literária (tom/diálogo) entre
os 3. Depende do modelo genérico validado no P1, mas é entregável e
testável de forma independente.

**Independent Test**: Pode ser testado configurando uma chave OpenAI real,
selecionando-a pra um livro de teste, e comparando o resultado (deve
preservar tom/diálogo melhor que MyMemory ou DeepL num trecho com fala
direta) — sem depender de Google estar implementado.

**Acceptance Scenarios**:

1. Mesmos cenários da User Story 1, com "OpenAI" no lugar de "DeepL" em
   cada passo (configurar chave, testar, selecionar por livro, traduzir,
   fallback em timeout, aviso de fallback quando chave for invalidada).

---

### User Story 3 - Traduzir com Google Cloud Translation via chave própria (Priority: P3)

Como leitor com uma chave de API do Google Cloud Translation, quero o
mesmo fluxo das User Stories 1 e 2, usando o Google como provedor — com a
maior cobertura de pares de idiomas entre os 3.

**Why this priority**: Completa o conjunto de 3 provedores pedido
originalmente. Prioridade mais baixa porque hoje o app só expõe 7 idiomas
na UI — o benefício de cobertura ampla do Google é menos urgente que a
qualidade literária de DeepL/OpenAI.

**Independent Test**: Pode ser testado configurando uma chave Google real,
selecionando-a pra um livro de teste, e confirmando que a tradução funciona
e cai pro MyMemory nos mesmos cenários de erro das stories anteriores.

**Acceptance Scenarios**:

1. Mesmos cenários da User Story 1, com "Google" no lugar de "DeepL" em
   cada passo.

---

### Edge Cases

- Livro sem seleção explícita de provedor de tradução → usa MyMemory
  (comportamento atual do app, preservado como padrão).
- Usuário seleciona, na tela de detalhes do livro, um provedor premium sem
  chave configurada/validada → seleção não é permitida (mesmo
  comportamento hoje do seletor de provedor de TTS: a tentativa não tem
  efeito, o provedor continua sem chave).
- Usuário remove ou invalida a chave de um provedor que está selecionado
  em um ou mais livros → a próxima tradução desses livros cai
  automaticamente pro MyMemory, e a tela de detalhes de cada livro afetado
  passa a indicar o fallback.
- Provedor selecionado não suporta o par de idiomas configurado no app →
  cai pro MyMemory, sem retry.
- Usuário sai da tela ou troca de trecho antes da resposta de uma chamada
  de tradução pendente → a chamada é cancelada, sem cair pro MyMemory (não
  havia erro real do provedor, é cancelamento do usuário).
- Erro de requisição inválida ou falha interna do app na chamada ao
  provedor selecionado → não cai automaticamente pro MyMemory (evita
  mascarar um bug real); o usuário vê uma mensagem de erro.
- Dois livros diferentes selecionam provedores diferentes pro mesmo texto
  (ex: mesma frase comum em dois livros) → o cache local de tradução não
  mistura os resultados entre provedores.
- Texto selecionado maior que o limite de ~500 caracteres → truncado, igual
  ao comportamento atual do MyMemory, pra qualquer provedor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir configurar, numa nova seção
  "Tradução" em Configurações, uma chave de API por provedor (DeepL,
  OpenAI, Google Cloud Translation) — mesmo padrão de UI já usado hoje pras
  chaves de TTS premium (campo de chave, botão de teste, indicador de chave
  salva/pendente).
- **FR-002**: O sistema DEVE validar cada chave configurada com uma chamada
  real ao provedor correspondente antes de salvá-la, classificando o
  resultado numa das 7 categorias: válida, inválida, sem permissão, quota
  excedida, billing necessário, erro de rede, indisponibilidade.
- **FR-003**: O sistema DEVE persistir a chave localmente (mesmo nível de
  risco de armazenamento já aceito hoje pras chaves de TTS premium —
  IndexedDB local, sem Keychain/Keystore nativo) somente após validação
  bem-sucedida.
- **FR-004**: O sistema DEVE permitir, na tela de detalhes de cada livro,
  selecionar um único provedor de tradução ativo entre MyMemory (gratuito,
  padrão) e qualquer provedor premium já configurado e validado — mesmo
  padrão de seleção já usado hoje pro provedor de TTS.
- **FR-005**: Selecionar, na tela de detalhes do livro, um provedor premium
  sem chave configurada/validada NÃO DEVE ter efeito (mesmo comportamento
  hoje do seletor de provedor de TTS).
- **FR-006**: A tradução inline (tap-to-translate) de um livro DEVE usar o
  provedor selecionado pra aquele livro; livros sem seleção explícita
  DEVEM usar MyMemory por padrão.
- **FR-007**: Quando uma chamada de tradução ao provedor selecionado
  falhar, o sistema DEVE decidir entre repetir, cair pro MyMemory ou exibir
  erro, segundo o tipo de falha:
  - Timeout, HTTP 429 ou 5xx: repetir um número limitado de vezes; se
    persistir, cair pro MyMemory.
  - Quota excedida, billing necessário, ou idioma não suportado pelo
    provedor selecionado: sem repetição, cai direto pro MyMemory.
  - Chave inválida ou sem permissão: sem repetição, cai direto pro
    MyMemory.
  - Erro de requisição inválida ou falha interna do app: NÃO cai pro
    MyMemory automaticamente — exibe erro ao usuário.
  - Cancelamento explícito do usuário (ex: sair da tela ou trocar de trecho
    antes da resposta): aborta a chamada sem cair pro MyMemory.
- **FR-008**: A queda automática pro MyMemory (FR-007) DEVE ser transparente
  pro usuário durante a leitura — sem diálogo de confirmação. **Revisado em
  2026-09-11**: o painel de tradução DEVE mostrar um selo discreto
  indicando o provedor que efetivamente gerou aquele texto (ex: "via
  DeepL"), visível só quando esse provedor não for o MyMemory — pedido do
  usuário após testar em device real, por paridade com o indicador já
  existente de engine de TTS. `translate()` (`TranslationService.ts`) DEVE
  reportar ao chamador qual provedor foi efetivamente usado (não só o
  texto), já que a decisão de cair pro MyMemory acontece dentro da própria
  função (FR-007).
- **FR-009**: A tela de detalhes do livro DEVE indicar quando o provedor
  efetivamente em uso for diferente do selecionado (ex: selecionado ficou
  sem chave válida) — mesmo padrão visual já usado hoje pro aviso de
  fallback de TTS.
- **FR-010**: O cache local de traduções DEVE considerar o provedor como
  parte da chave de cache — o mesmo texto/par de idiomas traduzido por
  provedores diferentes não pode compartilhar entrada de cache.
- **FR-011**: Nenhuma chave de API DEVE aparecer em texto plano em eventos
  de diagnóstico/log (`DiagnosticsLogger`), mensagens de erro exibidas ao
  usuário, ou qualquer analytics.
- **FR-012**: A configuração e uso de provedores de tradução premium DEVE
  estar disponível pra qualquer usuário (Free ou Pro) — não é uma feature
  Pro-gated.
- **FR-013**: Textos enviados pra tradução, em qualquer provedor, DEVEM
  respeitar o limite atual de ~500 caracteres por chamada (mesmo limite já
  usado hoje pro MyMemory).

### Key Entities *(include if feature involves data)*

- **Chave de Provedor de Tradução**: por provedor (DeepL/OpenAI/Google) —
  valor da chave, status da última validação (uma das 7 categorias),
  quando foi validada.
- **Provedor de Tradução Selecionado (por livro)**: preferência por livro
  que aponta pro provedor ativo daquele livro (MyMemory por padrão, ou um
  provedor premium configurado e validado).
- **Entrada de Cache de Tradução**: texto original + par de idiomas +
  provedor → texto traduzido (a dimensão "provedor" é nova nesta feature;
  hoje a chave de cache não distingue provedor porque só existe um).
- **Resultado de Tradução**: modelo interno comum devolvido por qualquer
  provedor (texto traduzido, e o que for aplicável de idioma
  detectado/contexto), que abstrai o formato de resposta específico de cada
  API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O botão "Testar chave" retorna a classificação correta entre
  as 7 categorias de resultado pros 3 provedores, verificado contra
  chamadas reais às APIs.
- **SC-002**: Um provedor configurado e validado pode ser selecionado como
  provedor de tradução ativo de um livro, e a tradução inline desse livro
  passa a refletir esse provedor.
- **SC-003**: As regras de retry/fallback especificadas no FR-007 estão
  cobertas por testes automatizados, simulando cada categoria de erro.
- **SC-004**: Auditoria de `DiagnosticsLogger.ts` e demais pontos de
  log/erro confirma que nenhuma chave de API aparece em texto plano em
  eventos de diagnóstico.
- **SC-005**: `npm run lint && npm test && npm run build` passam limpos com
  a feature implementada.

## Assumptions

- Provedores premium (DeepL/OpenAI/Google) produzem tradução sensivelmente
  melhor pro caso de uso literário (tom, diálogo, expressões) do que o
  MyMemory gratuito — plausível dado o propósito dessas APIs, mas não
  medido dentro do projeto (herdado do assessment como `ASSUMPTION`).
- O padrão de UX de BYOK já validado em produção pro TTS (chave em
  Configurações + seleção por livro em `BookDetailsScreen`) se aplica
  igualmente bem à tradução, incluindo comportamentos já aceitos como
  "selecionar provedor sem chave configurada não tem efeito visível"
  (FR-005) sem feedback adicional além do já existente pro TTS.
- Um segundo consumidor futuro do serviço de tradução resultante (a ideia
  de backlog "TTS Traduzido", fora de escopo aqui) pode precisar de
  cancelamento via `AbortSignal`, da dimensão "provedor" no cache
  (já coberta por FR-010) e de um volume de chamadas ordens de grandeza
  maior — registrado aqui só como contexto pro `sdd-plan` desenhar a
  interface `TranslationProvider` sem fechar essa porta, não como requisito
  desta feature.
- A ordem DeepL → OpenAI → Google usada pra priorizar as User Stories
  (P1/P2/P3) reflete o valor relativo de cada provedor (qualidade
  literária primeiro, cobertura de idiomas por último), não uma cadeia de
  fallback em runtime — essa cadeia foi descartada (ver `## Clarifications`).

## Clarifications

### Sessão 2026-09-11

- Q: Quando o usuário configura uma chave premium válida, a tradução
  premium substitui a gratuita (MyMemory) automaticamente, ou o usuário
  precisa optar explicitamente por usar premium? → A: Opção explícita
  separada — resolvido concretamente como a seleção por livro em
  `BookDetailsScreen` (FR-004): configurar/validar a chave não muda nada
  por si só, a ação explícita é selecionar o provedor pra aquele livro.
- Q: A tradução premium via BYOK é exclusiva de assinantes Pro, ou
  disponível pra qualquer usuário? → A: Disponível pra qualquer usuário
  (FR-012) — o custo da chamada é do próprio usuário (BYOK).
- Q: Como deveria funcionar o "fallback automático" do pedido original? →
  A: Igual ao padrão de TTS — chave configurada/testada em Configurações,
  provedor selecionado por livro em `BookDetailsScreen`, fallback só pro
  MyMemory quando o selecionado falhar. Substitui a cadeia automática
  DeepL→OpenAI→Google descrita no pedido original/assessment (ver "Fora de
  Escopo").
- Q: O nível de segurança do armazenamento de chave nesta entrega? → A:
  Mesmo nível já aceito hoje pro TTS (IndexedDB puro, sem Keychain/Keystore
  nativo) — FR-003.
- Q: Com o modelo de seleção única confirmado, cada provedor tem também um
  toggle individual de "habilitado" além da seleção em si? → A: Não se
  aplica mais — só existe UM provedor selecionado por vez por livro (não
  há "múltiplos habilitados simultaneamente" pra alternar entre si).
- Q: A tradução mostra, de forma discreta, qual provedor gerou um texto
  específico? → A: Não — 100% transparente durante a leitura (FR-008). A
  única indicação existe na tela de detalhes do livro, quando o provedor
  efetivamente em uso diverge do selecionado (FR-009), não por tradução
  individual.
- Q: O limite de ~500 caracteres por chamada deve aumentar pra provedores
  premium? → A: Não, mantido igual pra todos os provedores (FR-013).
- Q: Com o fallback automático só indo pro MyMemory gratuito, o toggle de
  consentimento pra fallback entre provedores pagos (pergunta anterior)
  ainda se aplica? → A: Não, fica sem objeto e foi removido do escopo (ver
  "Fora de Escopo") — não há risco de cobrança surpresa nesse fallback.

### Sessão 2026-09-11 (retomada — pós-teste em device real, US1/DeepL)

- Q: Depois de ver a DeepL funcionando no celular, o usuário pediu um
  ícone/indicador de qual provedor está sendo usado, citando o TTS como
  paridade (o usuário sabe qual engine de voz está ativa). Isso reverte a
  decisão original do FR-008 ("100% transparente, sem indicação visível")
  — como conciliar? → A: Selo discreto ("via {provedor}") dentro do
  próprio painel de tradução que já aparece ao tocar pra traduzir, visível
  só quando o provedor efetivo ≠ MyMemory (mesmo padrão condicional já
  usado no chrome do TTS, `ttsEngine !== 'native'`). Descartadas as opções
  de indicador persistente no chrome do leitor e de fazer as duas coisas —
  FR-008 atualizado.
