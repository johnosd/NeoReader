# Implementation Plan: TTS Traduzido

**Slug**: `018-tts-traduzido` | **Date**: 2026-09-12 | **Spec**: `sdd/specs/018-tts-traduzido/spec.md`

## Summary

Permitir ouvir o audiobook contínuo (feature `001`) traduzido para um idioma
diferente do original do livro: cada parágrafo é traduzido em lote (1
chamada, com divisão sentence-aware só para parágrafos acima de 500
caracteres) antes de ser sintetizado/tocado frase a frase pelo pipeline de
TTS já existente. Motor de tradução reaproveita `TranslationService.ts`/
`TranslationProviderRegistry.ts` (feature `017`, convergida) — MyMemory por
padrão, ou o provedor BYOK premium já configurado por livro. Toda a
tradução acontece numa camada de orquestração NOVA
(`TranslatedAudiobookService.ts` + `useTranslatedAudiobook.ts`) que prepara
um array de `TtsChunk[]` já traduzido e o entrega a `useTTS.play()` sem
alterar o loop de playback contínuo da feature `001` — o array é mutado
(chunks do próximo parágrafo são adicionados) em segundo plano, disparado
pelo callback `onParagraphChange` que já existe.

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (mesma stack do projeto, sem
mudança).

**Primary Dependencies**: Nenhuma dependência nova. Reaproveita
`src/services/TranslationService.ts` + `TranslationProviderRegistry.ts`
(feature `017`), `src/hooks/useTTS.ts` + `src/components/reader/EpubViewer.tsx`
(feature `001`), `src/utils/ttsChunking.ts` (`splitParagraphIntoTtsChunks`,
já exportado e puro), `src/db/bookSettings.ts`.

**Storage**: Dexie/IndexedDB — extensão de `BookSettings`
(`src/types/book.ts`) com 2 campos booleanos não-indexados; sem nova
`version()` do Dexie (ver `data-model.md`).

**Testing**: Vitest + Testing Library (unitário/componente,
`src/__tests__/`), verificação manual em browser (Playwright MCP, conforme
`feedback_playwright_mcp_web_test` já usado nesta sessão) e em device Android
real (`quickstart.md`).

**Target Platform**: Android (Capacitor) + Web — mesma superfície da feature
`001`/`017`. Nenhuma restrição de plataforma NOVA introduzida por esta
feature (o motor BYOK herda as restrições de CORS já documentadas em
`017`/R-006: DeepL/OpenAI só funcionam no app Android empacotado; Google e
MyMemory funcionam em qualquer plataforma).

**Performance Goals**: Pausa perceptível de tradução no máximo 1x por
parágrafo (SC-001) — "melhor esforço", não uma garantia hard-realtime: uma
tradução que demore mais que a leitura do parágrafo atual ainda causa uma
pausa perceptível na prática (risco aceito, ver R-002 abaixo).

**Constraints**: `useTTS.play()` não é modificado (Decisão Invariante 1);
tradução por parágrafo é síncrona/bloqueante do ponto de vista do pipeline
de chunks (sem streaming); cancelamento via `AbortController` próprio da
sessão de leitura traduzida, independente do `AbortController` de síntese de
TTS já existente em `useTTS.ts`.

**Scale/Scope**: Single-user local-first, sem mudança de escala.

## Decisões Invariantes

1. `useTTS.ts` (loop de `play()`, foco de áudio, wake lock, fallback pra
   native, notificação nativa) **não é alterado**. Toda a lógica de tradução
   vive numa camada de orquestração que PRODUZ `TtsChunk[]` já traduzido
   antes/durante a chamada a `tts.play()` — nunca dentro de `useTTS.ts`.
2. O array de chunks passado a `tts.play(chunks, startIdx)` é mutado em
   memória (chunks do próximo parágrafo são `push`-ados) — `useTTS.ts`
   relê `chunks.length` a cada iteração do loop (`useTTS.ts:845`), então
   isso funciona sem qualquer mudança de contrato. Ver `research.md` R2.
3. O gatilho de prefetch do parágrafo `N+1` é o callback `onParagraphChange`
   já existente (`ReaderScreen.tsx:491`) — quando a leitura traduzida está
   ativa, esse callback também dispara `translateParagraphForAudiobook` do
   parágrafo seguinte, em segundo plano, sem bloquear o parágrafo atual.
4. Texto original por parágrafo vem SEMPRE de
   `viewerRef.current.getParagraphs(): string[]` (`EpubViewer.tsx:3533`, já
   existente) — nunca reconstruído a partir de `TtsChunk.text` (que já são
   frases pós-processadas/normalizadas).
5. Parágrafos acima de 500 caracteres (`MAX_CHARS` de `TranslationService.ts`)
   são divididos em pedaços sentence-aware ≤500 chars
   (`splitParagraphIntoTtsChunks(text, minLen, locale, maxLen=480)`),
   traduzidos individualmente e concatenados — ver `research.md` R1. Exceção
   documentada à regra geral de "1 chamada por parágrafo" (FR-002), só para
   parágrafos genuinamente longos.
6. Chunking do texto JÁ TRADUZIDO reusa a mesma função pura
   `splitParagraphIntoTtsChunks` (`utils/ttsChunking.ts`) já usada para o
   texto original — nenhuma lógica de segmentação de frases nova.
7. Destaque degradado (FR-010): durante sessão de leitura traduzida, o
   callback `onWordHighlight` repassado a `useTTS` ignora os offsets
   recebidos (relativos ao texto TRADUZIDO, não ao DOM original) e chama
   `viewerRef.current.highlightTts(paraIdx, 0, 0)` — o modo "só muda o
   parágrafo" que `highlightTts` já suporta nativamente
   (`EpubViewer.tsx:3601-3602`). Nenhum código novo de destaque.
8. Sticky fallback (FR-007 desta spec) é uma camada NOVA sobre
   `TranslationService.translate()` — um ref por sessão que lembra o
   provider efetivamente usado na última tradução bem-sucedida; uma vez que
   `result.provider` diverge do provider solicitado (= houve fallback), as
   chamadas seguintes da MESMA sessão já passam esse provider resolvido
   direto, sem tentar de novo o provider original.
   `TranslationService.translate()` em si não é alterado.
9. Progresso de leitura (FR-009) continua vindo do `paraIdx`/CFI do
   parágrafo ORIGINAL, via o mesmo `onParagraphChange`/mecanismo de save de
   progresso já existente — nada muda aqui, é uma decisão travada, não uma
   task de implementação.
10. A estimativa de consumo (FR-013) é aproximada, derivada de
    `book.fileSize` com um fator fixo documentado — não uma contagem exata
    (ver `research.md` R3). Rótulo da UI deixa claro que é uma estimativa.
11. Uma sessão de leitura traduzida é descartada (não serializada/pausada)
    em qualquer troca de capítulo/livro/idioma-alvo/provedor — o
    `AbortController` da sessão é substituído por uma instância nova, nunca
    reaproveitado.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | Compliant | Compliant | Este plano é o artefato de aprovação; nenhuma implementação começou antes dele. |
| II. Comentários só onde o "porquê" não é óbvio | Compliant | Compliant | Decisões não óbvias já identificadas para comentar no código: por que o array de chunks é mutado em vez de reconstruído (Decisão 2), por que `highlightTts(paraIdx,0,0)` em vez de offsets (Decisão 7), por que dividir parágrafos >500 chars (Decisão 5). |
| III. Explícito antes de mágico | Compliant | Compliant | Nenhuma abstração nova de streaming/fila — reaproveita mutação de array simples (Decisão 2) e funções puras já existentes (`splitParagraphIntoTtsChunks`, `getParagraphs`). Rejeitado explicitamente: modificar `useTTS.play()` para aceitar iterador assíncrono (research.md R2, alternativa rejeitada). |
| IV. Build limpo é a definição de "pronto" | N/A (ainda não implementado) | A validar em `sdd-execute` | `npm run build` deve passar sem erros ao final de cada fase. |
| V. Dependências novas exigem justificativa | Compliant | Compliant | Nenhuma dependência nova — tudo reaproveita módulos já presentes no projeto. |

Nenhuma violação não-justificável identificada. `Complexity Tracking` fica
vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/018-tts-traduzido/
├── spec.md
├── plan.md               # este arquivo
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── hooks/
│   ├── useTTS.ts                      # feature 001 — NÃO alterado (Decisão 1)
│   ├── useReaderAppearance.ts         # já expõe bookLanguage/translationTargetLang/translationProvider — lido, não alterado na forma
│   └── useTranslatedAudiobook.ts      # NOVO — orquestra a sessão de leitura traduzida, wireia useTTS + TranslatedAudiobookService
├── services/
│   ├── TranslationService.ts          # feature 017 — NÃO alterado
│   ├── TranslationProviderRegistry.ts # feature 017 — NÃO alterado
│   └── TranslatedAudiobookService.ts  # NOVO — translateParagraphForAudiobook (R1), sticky fallback (Decisão 8), cache de chunks traduzidos por sessão
├── components/reader/
│   └── EpubViewer.tsx                 # getParagraphs()/getSentenceChunks()/highlightTts() já existentes — lidos, não alterados
├── screens/
│   ├── BookDetailsScreen.tsx          # + toggle "Ouvir traduzido", aviso de consumo, guarda de mesmo idioma (FR-015)
│   └── ReaderScreen.tsx               # + wiring de useTranslatedAudiobook, pausa-com-erro (FR-008), cancelamento em troca de capítulo/livro/idioma/provedor
├── db/
│   └── bookSettings.ts                # sem mudança de código — só os novos campos em BookSettings (types/book.ts)
├── types/
│   ├── book.ts                        # + audiobookTranslationEnabled, audiobookTranslationWarningDismissed em BookSettings
│   └── translation.ts                 # possível adição de tipos da sessão (TranslatedAudiobookSession), se necessário
├── utils/
│   └── ttsChunking.ts                 # splitParagraphIntoTtsChunks já exportado — reusado, não alterado
└── i18n/
    └── messages.ts                    # + strings do toggle, aviso de consumo, motivo de desabilitado (FR-015), erro de pausa (FR-008)

src/__tests__/
├── services/TranslatedAudiobookService.test.ts   # NOVO
├── hooks/useTranslatedAudiobook.test.ts          # NOVO (se a lógica não couber só nos testes de tela)
├── screens/BookDetailsScreen.test.tsx            # + testes do toggle/aviso/guarda de idioma
└── screens/ReaderScreen.test.tsx                 # + testes de integração da sessão traduzida
```

**Structure Decision**: Projeto único (sem separação backend/frontend) — já
estabelecido pelo repositório. Esta feature só adiciona 2 arquivos novos
(`TranslatedAudiobookService.ts`, `useTranslatedAudiobook.ts`) e estende
arquivos existentes nos mesmos diretórios já usados pelas features `001`
(TTS) e `017` (tradução BYOK).

## Complexity Tracking

*Vazio — nenhuma violação de constitution a justificar.*

## Estratégia de Testes

Prioridade: unitário → integração/componente → manual em browser real
(Playwright) → manual em device Android (último recurso, mas obrigatório
pra esta feature por tocar playback contínuo em segundo plano).

Comandos-base:

```powershell
npm run lint
npx vitest run src/__tests__/services/TranslatedAudiobookService.test.ts
npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx
npx vitest run src/__tests__/screens/ReaderScreen.test.tsx
npm test
npm run build
```

Foco por camada:
- **Unitário** (`TranslatedAudiobookService.test.ts`): divisão de parágrafo
  >500 chars preservando todo o texto (R1); sticky fallback (uma vez que o
  provider configurado falha, chamadas seguintes não tentam de novo);
  reconstrução de `TtsChunk[]` a partir do texto traduzido preservando
  `paraIdx` original.
- **Integração/componente** (`ReaderScreen.test.tsx`): `onParagraphChange`
  dispara prefetch de tradução do próximo parágrafo; cancelamento ao trocar
  capítulo/livro/idioma/provedor; pausa-com-erro quando a tradução falha sem
  fallback restante (FR-008); destaque degradado (paraIdx-only, sem offsets
  de palavra) durante sessão traduzida.
- **Componente** (`BookDetailsScreen.test.tsx`): toggle liga/desliga,
  persiste via `updateBookSettings`; aviso de consumo aparece só na primeira
  ativação por livro; toggle desabilitado quando idioma-alvo == idioma do
  livro ou idioma do livro indefinido (FR-015).
- **Manual** (`quickstart.md`): cenário ponta a ponta completo em browser
  (Playwright) e em device Android real — obrigatório antes de reportar a
  feature concluída, por envolver áudio contínuo em segundo plano
  (Constitution: testes automatizados não substituem verificação de feature
  real).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Concluído — `BookSettings` estendido, tipo de sessão definido (movido pra dentro do serviço, ver T002). |
| Foundational | Concluído — `TranslatedAudiobookService.ts` + `useTranslatedAudiobook.ts` prontos e testados isoladamente (8 testes). |
| US1 (P1) — pipeline básico | Concluído — toggle, playback traduzido, prefetch, cancelamento, destaque degradado, pausa-com-erro. |
| US2 (P2) — motor BYOK premium | Concluído — funcionava por construção (T012/T006 já usavam `translationProvider` real); 3 testes de integração confirmam BYOK/MyMemory/sticky fallback ponta a ponta. |
| US3 (P3) — aviso de consumo | Concluído (adiantado junto de US1/T011). |
| Polish | Concluído, com 1 pendência explícita: validação em device Android real não executada nesta sessão (sem device conectado). `npm run lint && npm test && npm run build` todos limpos (1056 testes). |
| Feature 018 (geral) | **Implementada** — todas as 44 tasks concluídas; falta só a verificação manual em device Android antes de considerar pronta pra produção. |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Tradução de um parágrafo pode demorar mais que a leitura do parágrafo atual (rede lenta, provider premium com latência maior — ex.: OpenAI LLM), causando pausa perceptível mesmo com prefetch de 1 parágrafo. | Médio — pausa ocasional, não sistemática; não quebra a feature, só o SC-001 num caso de rede ruim. | Aceito como "melhor esforço" (Technical Context → Performance Goals). Sem buffer multi-parágrafo por decisão do assessment (Non-Goal). Revisitar só se virar reclamação recorrente de usuário real. |
| R-002 | `MAX_CHARS` (500) de `TranslationService.ts` trunca silenciosamente parágrafos longos se chamado sem a divisão sentence-aware desta feature. | Alto se ignorado — perderia texto do audiobook. | Resolvido: `TranslatedAudiobookService.translateParagraphForAudiobook` SEMPRE divide antes de chamar `translate()` quando o parágrafo excede 500 chars (research.md R1, Decisão Invariante 5), testado em `TranslatedAudiobookService.test.ts`. |
| R-003 | Estimativa de consumo (FR-013) baseada em `book.fileSize` é aproximada, não uma contagem exata de caracteres — pode subestimar/superestimar dependendo da proporção de marcação/imagens do EPUB. | Baixo — é um aviso informativo, não um limite hard; a spec já usa a palavra "estimativa". | Resolvido: aceito por design (research.md R3), rótulo da UI (`bookDetails.audiobookTranslation.warning.description`) já comunica "estimativa". |
| R-004 | Sticky fallback (Decisão 8) introduz estado de sessão que precisa ser corretamente descartado em toda troca de capítulo/livro/idioma/provedor — se vazar entre sessões, um provider já "queimado" numa sessão anterior seria injustamente pulado numa sessão nova. | Médio — bug sutil, difícil de notar manualmente (só apareceria como "nunca tenta o provider premium de novo mesmo num livro novo"). | Resolvido: sessão inteira (incluindo `stickyProvider`) é recriada do zero a cada `play()`/troca de contexto (Decisão Invariante 11) — nunca um singleton global. Testado em `TranslatedAudiobookService.test.ts`. |
| R-005 | **[Descoberto durante T012-T015, US1]** Controles de navegação fina (prev/next sentença, prev/next parágrafo) do mini player operam sobre o array de chunks via um chokepoint único (`getTtsChunks()`), que retorna o array TRADUZIDO (progressivamente montado) quando uma sessão está ativa. Como o array só contém o parágrafo atual + o próximo (prefetch), pular MUITOS parágrafos à frente mais rápido do que o prefetch consegue traduzir excede o array disponível. | Médio — UX: em uso normal (avançar 1 parágrafo por vez, esperando a fala) nunca acontece; só aparece se o usuário martelar "próximo" repetidamente mais rápido que a tradução responde. | Mitigado, não eliminado: `hasPendingTranslation()` faz os controles NÃO avançarem de seção por engano quando a tradução do próximo parágrafo ainda está em voo (evita pular capítulo errado) — mas também não pula pra frente enquanto isso, fica "esperando" silenciosamente. Considerado aceitável (não testado automaticamente); reavaliar se usuários reportarem confusão. |
| R-006 | **[Descoberto durante T012-T015, US1]** `translationTargetLang`/`translationProvider`/`audiobookTranslationEnabled` são lidos UMA VEZ por `useReaderAppearance` ao montar `ReaderScreen` (mesmo padrão já usado por `bookLanguage`/`ttsConfig` — não é uma limitação nova desta feature). Uma mudança feita em `BookDetailsScreen` enquanto um `ReaderScreen` do mesmo livro já está montado (ex.: pilha de rotas com o leitor por baixo) não é vista ao vivo. | Baixo — mesma limitação estrutural de TODO outro setting por livro nesta tela; não é regressão. | Aceito, documentado. O Edge Case "desativar ouvir traduzido no meio da leitura" (spec.md) funciona ao reabrir o livro após desativar, não instantaneamente entre telas empilhadas. Corrigir de verdade exigiria tornar `useReaderAppearance` live-reativo (`useLiveQuery`) pra TODOS os campos — fora do escopo desta feature (Constitution III). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-12 | Setup + Foundational | `BookSettings` estendido; `TranslatedAudiobookService.ts` (divisão >500 chars, sticky fallback, cache por sessão, estimativa de consumo) + `useTranslatedAudiobook.ts` criados e testados (8 testes). | Nenhuma. |
| 2026-09-12 | US1 (P1) | Toggle "ouvir traduzido" em `BookDetailsScreen` (com aviso de consumo e guard FR-015 adiantados); pipeline completo em `ReaderScreen` via chokepoint em `getTtsChunks()`; destaque degradado; pausa-com-erro; cancelamento. 1053 testes totais passando, build limpo. | T021 (pausa-com-erro) só verificado por leitura de código, não por teste automatizado — pendente confirmação manual no quickstart. R-005/R-006 documentados como limitações aceitas. |
| 2026-09-12 | US2 (P2) | Confirmado por teste que o motor BYOK premium já era usado corretamente (nenhuma mudança de código — só testes de integração novos). Sticky fallback verificado ponta a ponta entre 2 parágrafos. | Verificação manual com chave BYOK real em device (quickstart passos 11-12) ainda não feita. |
| 2026-09-12 | Polish | Guard FR-015 confirmado; verificação manual em browser real via Playwright (toggle, persistência, aviso único por livro, estimativa real de um EPUB de ~13MB); fix de lint `react-hooks/refs`; `npm run lint && npm test && npm run build` limpos (1056 testes). Feature marcada Implementada. | Validação em device Android (playback contínuo em segundo plano) não executada — sem device conectado nesta sessão. |

**PRÓXIMO**: Validação manual em device Android real (quickstart.md, passos 3-8, 11-14 e a seção "Validação em device Android") antes de considerar a feature pronta pra produção — depois disso, rodar `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/TranslatedAudiobookService.ts` (novo)
- `src/hooks/useTranslatedAudiobook.ts` (novo)
- `src/screens/ReaderScreen.tsx` (wiring da sessão traduzida)
- `src/screens/BookDetailsScreen.tsx` (toggle + aviso de consumo)
- `src/hooks/useReaderAppearance.ts` (+ `audiobookTranslationEnabled`)
- `src/types/book.ts` (+ 2 campos em `BookSettings`)
- `src/services/TranslationService.ts` (`MAX_CHARS` agora exportado)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `useTTS.ts` (feature 001) nunca deve ser modificado por esta feature — toda
  tradução acontece ANTES de `tts.play()` receber o array de chunks
  (Decisão Invariante 1). Se sentir necessidade de mexer em `useTTS.ts` pra
  algo desta feature, é sinal de que o design está sendo violado.
- O chokepoint `getTtsChunks()` em `ReaderScreen.tsx` é o único lugar que
  decide "original vs. traduzido" — qualquer novo controle de playback deve
  chamar essa função, nunca `viewerRef.current?.getSentenceChunks()`
  diretamente.
- Nos testes de `ReaderScreen.test.tsx`, o mock de `@/services/TranslationService`
  precisa exportar `MAX_CHARS` além de `translate` — sem isso, qualquer
  teste que exercite a leitura traduzida falha com "No MAX_CHARS export is
  defined on the mock" (achado durante T018-T022).
- `BottomSheet` (`components/ui/BottomSheet.tsx`) SEMPRE renderiza seu
  conteúdo no DOM — `open=false` só o translada pra fora da tela via CSS
  (`translate-y-full`), nunca desmonta. `screen.queryByText(...)` (Vitest) e
  `locator.isVisible()` (Playwright) **não** detectam isso — ambos retornam
  "encontrado"/"visível" mesmo com o sheet fechado. Pra checar
  fechado/aberto de verdade, use `boundingBox()` (Playwright) ou não teste
  visibilidade de sheet por texto, teste o efeito colateral (ex.: se
  `updateBookSettings` foi chamado).
- Escrever em `ref.current` DIRETO no corpo de um hook (fora de
  `useEffect`/callback) dispara `react-hooks/refs` no ESLint deste projeto
  (regra nova do React 19) — sempre sincronizar refs de "options mais
  recentes" via `useEffect`, nunca durante o render (ver
  `useTranslatedAudiobook.ts`).
