# Research: Tradução Premium BYOK (DeepL, OpenAI, Google)

## R1. Contratos reais dos 3 provedores

Verificados contra documentação oficial (DeepL API Reference, OpenAI API
Reference via Context7, Google Cloud Translation REST v2) em 2026-09-11.
Detalhe completo de cada um em `contracts/`.

**Decisão**: cada provedor é um módulo de serviço próprio
(`DeepLService.ts`, `OpenAiTranslationService.ts`, `GoogleTranslateService.ts`),
seguindo exatamente o mesmo formato já usado por `SpeechifyService.ts` —
objeto exportado com `getApiKey`/`isConfigured`/`validateApiKey`/método de
ação principal (`translate` em vez de `synthesize`), `AbortController` +
`setTimeout` pra timeout, erro classificado por status HTTP.

**Justificativa**: é o padrão já validado em produção neste repositório
pros 3 provedores de TTS premium — reusar em vez de inventar uma
abstração nova (constitution III).

**Alternativas consideradas**: um único módulo genérico
parametrizado por provedor — rejeitado porque os 3 contratos são
suficientemente diferentes (headers de auth, forma de request/response,
mapeamento de erro) que a "genericidade" seria só um `switch` disfarçado;
manter 3 arquivos curtos e explícitos é mais fácil de auditar que uma
abstração prematura.

## R2. Mapeamento de erro → 7 categorias

| Categoria (spec FR-002) | DeepL | OpenAI | Google Basic v2 |
| --- | --- | --- | --- |
| válida | 200 com `translations[0].text` | 200 com `output[0].content[0].text` parseável no schema esperado | 200 com `data.translations[0].translatedText` |
| inválida | 400 (requisição malformada) | 400 `invalid_request_error` | 400 `INVALID_ARGUMENT` |
| sem permissão | 403 | 401 `invalid_api_key` / 403 `permission_denied` | 403 `PERMISSION_DENIED` (inclui API não habilitada no projeto Google Cloud) |
| quota excedida | 429 | 429 `rate_limit_exceeded` (cobre tanto RPM/TPM quanto quota de billing) | 429 `RESOURCE_EXHAUSTED`/quota |
| billing necessário | 456 (limite de caracteres do plano atingido) | `insufficient_quota` — reportado também como 429 pela OpenAI, distinguido pelo campo `error.code` do corpo, não pelo HTTP status | Google não distingue billing de quota no v2 Basic — cai em "quota excedida" |
| erro de rede | timeout local (`AbortController`), falha de conexão (`fetch` rejeita antes de qualquer resposta) | idem | idem |
| indisponibilidade | 5xx (500/503/504/529) | 500/503 `InternalServerError` | 5xx |

**Decisão**: cada `validateApiKey`/`translate` de provedor faz esse
mapeamento localmente (se/senão sobre `response.status` + corpo do erro
quando necessário pra distinguir quota de billing na OpenAI) e devolve um
`TranslationApiKeyValidationResult`/lança um erro tipado com o código já
classificado — a camada de fallback (FR-007) só reage ao código
classificado, nunca ao HTTP status bruto.

**Risco aceito**: OpenAI e Google não expõem "billing necessário" como
categoria HTTP própria e distinta de "quota excedida" — nesses 2
provedores, billing necessário é inferido do corpo do erro (`error.code
=== 'insufficient_quota'` na OpenAI) quando disponível, e cai em "quota
excedida" quando não for possível diferenciar. Não bloqueia a spec (FR-002
pede a classificação correta "verificado contra chamadas reais", e o
comportamento de fallback pra quota e billing já é o mesmo — FR-007 trata
os dois de forma idêntica: sem retry, cai pro MyMemory).

## R3. Auth de cada provedor

- **DeepL**: header `Authorization: DeepL-Auth-Key <chave>`.
- **OpenAI**: header `Authorization: Bearer <chave>`.
- **Google Basic v2**: query param `?key=<chave>` na própria URL (sem
  header) — ver R4 pra risco de log.

## R4. Chave da Google no query string × `DiagnosticsLogger`

**Achado**: `src/services/http.ts` (`fetchWithTimeout`) loga a `url` da
requisição em `network.request`/`network.timeout`. Se a chave da Google
Translation for embutida na URL (`?key=...`, único jeito de autenticar no
Basic v2 REST), essa URL passaria pelo logger.

**Verificado, não é um gap novo**: `DiagnosticsLogger.ts` já sanitiza
qualquer string reconhecida como URL (`sanitizeString` → `looksLikeUrl` →
`sanitizeUrl`) substituindo o **valor** de every query param por
`[redacted]`, mantendo só as chaves — isso cobre `?key=...` genericamente,
sem depender do nome do parâmetro ser "key". Também há `isSensitiveKey`
(campo nomeado `key`/`apikey`/`token`/`secret`/`authorization`/... vira
`[redacted]` inteiro) e um regex em `sanitizeString` pra `Bearer <token>`
e `key=valor` dentro de qualquer string livre (não só URLs).

**Decisão**: não construir nenhum mecanismo de redação novo — usar
`fetchWithTimeout`/`logEvent`/`logWarn`/`logError` exatamente como estão
pros 3 provedores. A tarefa de verificação (SC-004) é **auditar**, não
implementar: confirmar com um teste que uma URL do Google contendo uma
chave fake, passada por `sanitizeDiagnosticsDetails`, não expõe o valor da
chave — não deveria exigir nenhuma mudança em `DiagnosticsLogger.ts`.

**Risco residual**: se algum código novo desta feature logar a chave fora
de `url`/de um campo com nome reconhecido (ex: interpolar a chave dentro
de uma mensagem de erro customizada tipo ``new Error(`Falha com a chave
${apiKey}`)``), o texto passaria pelo regex genérico de `sanitizeString`
só se casar com o padrão `key=valor` — uma chave solta no meio de uma
frase, sem esse formato, **não seria pega**. Mitigação: nunca interpolar
`apiKey`/`trimmedKey` em mensagens de erro ou `details` — só usar em
headers/query params reais (auditado no code review da fase Fix/PR, não
automatizável de forma barata).

## R5. Retry/backoff (FR-007)

**Decisão**: número de tentativas limitado (2 tentativas totais: 1
original + 1 retry) com backoff fixo curto (ex: 500ms) pra
timeout/429/5xx — suficiente pra absorver falhas transitórias sem
atrasar perceptivelmente o tap-to-translate (que já tem um estado de
"carregando" visível, `showTranslationLoading()`). Não é uma escolha
sensível o bastante pra virar `[NEEDS CLARIFICATION]` — qualquer número
pequeno (1-3) atende o FR; 2 tentativas é o padrão mais simples que ainda
distingue "falha transitória" de "falha persistente".

## R6. Cancelamento (FR-007, edge case de troca de trecho)

**Decisão**: `translate()` (`TranslationService.ts`) ganha um parâmetro
`signal?: AbortSignal` opcional, propagado pro `fetch` de qualquer
provedor (mesmo padrão já usado em `SpeechifyService.synthesize`). Quem
chama (`ReaderScreen.handleTranslate`) mantém um `AbortController` num
`ref`, abortando o anterior sempre que uma nova tradução for solicitada
antes da anterior terminar — mesmo padrão de sessão incremental já usado
em `ttsVoicePreviewSessionRef`/`ttsValidationSeqRef` no próprio projeto,
só que via `AbortController` em vez de um contador de sequência (porque
aqui precisamos cancelar o `fetch` de verdade, não só ignorar uma resposta
tardia).
