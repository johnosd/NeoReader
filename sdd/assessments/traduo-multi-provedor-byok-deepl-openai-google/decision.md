# Assessment Decision: Tradução Multi-Provedor BYOK (DeepL, OpenAI, Google)

- **Slug**: traduo-multi-provedor-byok-deepl-openai-google
- **Decidido**: 2026-09-10
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Confirmado por leitura direta do código: `TranslationService.ts` usa só MyMemory gratuita, sem contexto/tom/glossário. Alinhado ao objetivo de produto explícito em CLAUDE.md ("facilitar o aprendizado de inglês"). |
| Força da evidência | adequate | Evidência de limitação técnica atual e de precedente arquitetural (BYOK de TTS) é real, não suposição. Falta sinal de demanda de usuário — nenhum bug/backlog pedindo isso; é proposta do próprio dono do produto, marcado como `ASSUMPTION` em `explora.md`. |
| Valor vs. custo de inação | adequate | Valor é claro para o diferencial do produto, mas não medido (sem métrica de qualidade de tradução hoje); custo de inação é "oportunidade perdida", não uma dor ativa reportada. |
| Viabilidade / apetite | adequate | Precedente de BYOK pra TTS premium (`TtsProviderRegistry.ts`) prova que o padrão funciona tecnicamente e na UX do app. Ponto de atenção real: chaves de TTS hoje ficam em IndexedDB puro (sem Keychain/Keystore) — gap de segurança já existente que esta feature herda ou precisa resolver. Backend/vault fica descartado por `constitution.md` ("local-first, sem backend próprio"), o que simplifica a decisão em vez de bloquear. |
| Fit estratégico | strong | Serve diretamente o objetivo central do produto, estende um padrão já aceito em produção (BYOK de TTS), e a abordagem de chamadas diretas é consistente com a restrição "local-first" da constitution. |

Nenhum critério central ficou `weak`/`unknown` — o único ponto de incerteza
(demanda de usuário) foi reconhecido explicitamente, não escondido, e não é
um critério bloqueante dado o fit estratégico forte com metas já declaradas
do produto.

## Abordagens Candidatas

### 1. BYOK direto do app, chamadas client → provedor (recomendada)

- Replica o padrão já usado pro TTS premium: chave guardada localmente
  (Settings/IndexedDB, mesmo nível de risco hoje aceito pra TTS, com
  upgrade pra Keystore/Keychain citado como risco conhecido a decidir no
  `sdd-plan`), chamadas HTTP diretas do app pros 3 provedores via
  `TranslationProvider` comum. MyMemory permanece como fallback gratuito
  final quando nenhuma chave está configurada ou todos os provedores
  premium falham. Consistente com "local-first, sem backend próprio".
- **Recomendada**: sim — menor risco arquitetural (reusa padrão validado),
  não exige mudança de stack, e é a única opção compatível com a
  constitution sem precisar de ADR.

### 2. Backend/vault intermediário (proxy de chamadas)

- App nunca vê a chave diretamente, ou as chamadas passam por um serviço
  próprio antes de ir pro provedor.
- **Recomendada**: não — contradiz a restrição de projeto "sem backend
  próprio de dados de leitura", exige infraestrutura nova, custo operacional
  e cria uma nova superfície de ataque (o vault vira alvo). Só faria sentido
  se o projeto decidisse abandonar o modelo local-first — isso é decisão de
  arquitetura de projeto via `sdd-adr`, não desta feature.

### 3. Entregar só 1 provedor premium primeiro (ex.: DeepL) antes de expandir

- Reduz risco/escopo da primeira entrega, adia a máquina de fallback
  completa pros 3 provedores.
- **Recomendada**: não como mudança de escopo do assessment — o pedido já é
  explícito sobre os 3 provedores e a ordem de fallback ser parte do valor
  central (literário via OpenAI, cobertura via Google). Mas vale considerar
  como fatiamento de fases/tasks dentro do `sdd-plan` (ex.: DeepL completo
  primeiro, depois OpenAI, depois Google), não como decisão deste
  assessment.

## Veredito

**go.** O problema é válido e mensurável (tradução atual sem contexto/tom,
travando o diferencial de aprendizado de inglês do produto), a evidência é
`adequate` ou melhor em todos os critérios centrais, e existe um caminho de
implementação de menor risco (Abordagem 1) que já tem precedente validado em
produção no próprio app (BYOK de TTS) e não conflita com nenhuma restrição
declarada na `constitution.md`. O único `unknown` de fato (demanda de
usuário medida) não é um critério central bloqueante — o fit estratégico com
metas já declaradas do produto é suficiente pra justificar avançar, com as
perguntas de escopo fino (Pro-gating, storage, substituição vs. coexistência)
explicitamente deixadas pro `sdd-specify`.

### Se go — Handoff

- **Problema**: a tradução inline hoje depende só da MyMemory gratuita, sem
  contexto/tom/glossário, travando o diferencial de aprendizado de inglês do
  produto; falta opção BYOK pra usuários dispostos a pagar por qualidade
  melhor.
- **Abordagem recomendada**: BYOK direto do app (sem backend/vault),
  interface comum `TranslationProvider`, DeepL → OpenAI → Google como ordem
  padrão de fallback consentido, MyMemory como fallback gratuito final.
- **Escopo sugerido**:
  - Entra: validação de chave por provedor com as 7 classificações
    (válida/inválida/sem permissão/quota excedida/billing
    necessário/erro de rede/indisponibilidade); tradução via `POST
    /v2/translate` (DeepL, com idioma detectado/contexto/formalidade/
    glossário avaliados), Responses API + Structured Outputs (OpenAI, com
    instruções de tom/diálogo/nomes próprios/estilo literário), `POST
    /language/translate/v2` (Google Basic v2); máquina de fallback com as
    regras de retry/consentimento/"não repetir" especificadas pelo usuário;
    modelo interno comum `TranslationResult`; armazenamento local no mesmo
    nível de risco já aceito hoje pro TTS (decisão explícita sobre subir
    pra Keystore/Keychain fica pro `sdd-plan`).
  - Fica de fora: backend/vault próprio; sincronização de chaves entre
    dispositivos; provedores além dos 3 especificados; a feature "TTS
    Traduzido" do backlog (pode reusar o serviço resultante, mas é escopo
    separado).
- **Métricas de sucesso**: classificação correta das 7 categorias nos 3
  provedores reais; regras de fallback cobertas por teste automatizado;
  auditoria de `DiagnosticsLogger.ts` sem vazamento de chave; gates padrão
  do projeto (`lint`/`test`/`build`) limpos.
- **Perguntas em aberto pro sdd-specify**:
  - Tradução premium substitui a tradução gratuita por padrão ou coexiste
    como opção de "upgrade" (MyMemory permanece disponível/selecionável)?
  - A feature é Pro-gated (parte da assinatura RevenueCat) ou aberta a
    qualquer usuário que traga sua própria chave, independente do tier?
  - Nível de segurança de armazenamento aceito nesta primeira entrega:
    IndexedDB puro (mesmo padrão do TTS hoje) ou já subir pra
    Keystore/Keychain nativo nesta mesma feature?

### Nota de continuidade — assessment `tts-traduzido` (2026-09-10)

O assessment `tts-traduzido` (veredito `go`) é um segundo consumidor
conhecido do `TranslationProvider` além do tap-to-translate, e revelou 3
requisitos técnicos que não mudam o escopo/veredito deste assessment, mas
valem a pena o `sdd-plan` considerar ao desenhar a interface pra não
quebrá-la depois:

- `AbortSignal` no contrato de `translate()` — TTS Traduzido precisa
  cancelar tradução em andamento ao trocar capítulo/livro/idioma/provedor.
- Cache com o provider na chave — `src/db/translations.ts` é compartilhado
  pelos dois; sem essa dimensão, um cache hit pode vir do provider errado.
- Volume de chamadas ordens de grandeza maior num consumo contínuo (um
  livro inteiro ≈ 600 mil caracteres) do que no uso pontual de
  tap-to-translate — relevante pro desenho de rate-limiting/retry budget.
