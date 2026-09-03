# Implementation Plan: Redimensionamento e recompressão de capas de EPUB no import

**Slug**: `007-redimensionamento-capas` | **Date**: 2026-09-03 | **Spec**: `sdd/specs/007-redimensionamento-capas/spec.md`

## Summary

Hoje nenhuma capa de EPUB é redimensionada antes de ser salva — nem no
fluxo web (`EpubService.extractCover()`, que só copia os bytes originais
do zip) nem no nativo Android (`NeoReaderLibraryPlugin.java`, que só limita
a 10MB de bytes **comprimidos**, não dimensões). Capas de scan de impressão
em alta resolução viram bitmaps de dezenas de MB **decodificados** cada,
um dos fatores por trás do alerta de memória do Play Console. A feature
introduz `resizeCoverBlob()`, um utilitário baseado em Canvas API nativa
do browser (sem dependência nova), chamado explicitamente antes dos 3
pontos onde uma capa é salva (`saveBookCover()`, em `BookImportService.ts`)
— import automático, "Recriar capa" e "Escolher imagem". Teto de 2000px no
lado mais longo, sem upscale, forward-only (capas já salvas não são
migradas).

## Technical Context

**Language/Version**: TypeScript ~6.0.2 / React 19.2.4 via Vite 8 — sem
mudança.

**Primary Dependencies**: **Nenhuma dependência nova** — usa Canvas API
nativa do browser (`createImageBitmap`, `HTMLCanvasElement`,
`canvas.toBlob`), já disponível na WebView Android (Capacitor) e em
qualquer browser moderno do build Web (ver `research.md` Decisão 1).
Constitution Princípio V fica trivialmente satisfeito.

**Storage**: Dexie — sem alteração de schema, sem nova `version()`. A
tabela `bookCovers` (`BookCover`, `src/types/book.ts`) não muda; só o
conteúdo do `blob` passado pra `saveBookCover()` é redimensionado antes.

**Testing**: Vitest + Testing Library. jsdom não implementa Canvas real
(`getContext('2d')` retorna `null`) nem `createImageBitmap` global —
nenhum polyfill de canvas está instalado no projeto. Testes de
`resizeCoverBlob()` mockam essas APIs via `vi.stubGlobal`/`vi.spyOn`,
testando a lógica de decisão (escala, no-upscale, fallback em erro, pular
SVG), não o resultado pixel-a-pixel (ver `research.md` Decisão 5).

**Target Platform**: Android (Capacitor WebView) + Web — mesma superfície
de código, 100% client-side (JS/Canvas). Nenhum código nativo (Java)
tocado — o limite de 10MB comprimidos em `NeoReaderLibraryPlugin.java`
continua como rede de segurança pré-existente, sem relação com esta
feature (ela limita bytes de entrada antes da extração; esta feature
limita dimensão do bitmap depois).

**Performance Goals**: SC-001 da spec — nenhuma capa salva excede 2000px
no lado mais longo. Custo transitório aceito: um decode completo (`createImageBitmap`)
por capa durante o import de um livro por vez (ver `research.md` Decisão 4).

**Constraints**: O redimensionamento DEVE acontecer antes de qualquer
chamada a `saveBookCover()`, nunca dentro dela — `saveBookCover()` é
chamada de dentro de uma transação Dexie no caminho principal de import
(`BookImportService.importSingleEpubRecord`), e Dexie fecha a transação
automaticamente se uma promise não-Dexie (como `createImageBitmap`/
`canvas.toBlob`) for aguardada dentro dela (ver `research.md` Decisão 2).

**Scale/Scope**: 1 arquivo novo (`src/utils/imageResize.ts`) + 1 arquivo
modificado (`BookImportService.ts`, 3 call sites) + testes
correspondentes. Nenhuma dependência nova, nenhuma rota nova, nenhuma
entidade de dado nova, nenhuma mudança de schema.

## Decisões Invariantes

- `resizeCoverBlob(blob, maxDimension)` é chamado explicitamente nos 3
  call sites de `saveBookCover()` em `BookImportService.ts`
  (`importSingleEpubRecord`, `reextractCover`, `updateManualCover`) —
  **nunca** dentro de `saveBookCover()`/`src/db/bookCovers.ts` (motivo:
  transação Dexie, ver `research.md` Decisão 2).
- No caminho principal de import (`importSingleEpubRecord`), o
  redimensionamento acontece **antes** de `db.transaction(...)` abrir —
  `metadata.coverBlob` já está totalmente resolvido nesse ponto
  (`await parseMetadataWithDiagnostics(...)`, linha anterior à transação).
- Teto de dimensão = 2000px no lado mais longo (FR-002). Sem upscale:
  `resizeCoverBlob` retorna o blob **original, sem modificação**, se
  `Math.max(width, height) <= 2000` (FR-003).
- Falha ao decodificar a imagem (`createImageBitmap` rejeita) faz
  `resizeCoverBlob` retornar o blob original sem lançar/propagar erro —
  o import nunca quebra por causa disso (FR-004).
- Blobs com `type === 'image/svg+xml'` são pulados por `resizeCoverBlob`
  sem tentar decodificar — cobre a capa de fallback gerada por
  `EpubService.createFallbackCover()` (FR-006) de forma genérica, sem
  precisar distinguir a origem no call site.
- Formato de saída preserva o `type` original do blob quando reencodável
  via Canvas (`image/png`, `image/jpeg`, `image/webp`); cai pra
  `image/jpeg` pra qualquer outro tipo (ver `research.md` Decisão 3).
- Um único `createImageBitmap` por capa (sem re-decodificar com
  `resizeWidth`/`resizeHeight` como otimização de pico de memória) — ver
  `research.md` Decisão 4, complexidade não justificada sem necessidade
  demonstrada.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | OK | OK | Este plano é a proposta de arquivos afetados. |
| II. Comentários só onde o "porquê" não é óbvio | OK | OK | Comentários necessários: por que o resize acontece antes da transação Dexie (não dentro dela), por que SVG é pulado sem decodificar, por que só um `createImageBitmap` (sem otimização de pico de memória), por que o fallback de formato é JPEG. |
| III. Explícito antes de mágico | OK | OK | Um utilitário puro (`resizeCoverBlob`), sem Worker/`OffscreenCanvas` não-necessário (`research.md` Decisão 1) — nenhuma abstração especulativa. |
| IV. Build limpo é a definição de "pronto" | OK | OK | `npm run build` ao final de cada fase. |
| V. Dependências novas exigem justificativa | OK | OK | Nenhuma dependência nova — Canvas API nativa do browser (`research.md` Decisão 1). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/007-redimensionamento-capas/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── research.md            # Fase 0 — técnica de resize, ponto de inserção (transação Dexie), formato de saída, testabilidade
├── quickstart.md          # Fase 1 — verificação manual (import com capa grande, dimensão salva, exibição sem regressão)
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

(Sem `data-model.md`/`contracts/` — `BookCover` já existe, sem mudança de
schema nem superfície de API nova.)

### Source Code (repository root)

```text
src/
├── utils/
│   └── imageResize.ts               # NOVO — resizeCoverBlob(blob, maxDimension): Promise<Blob>
├── services/
│   └── BookImportService.ts         # MODIFICADO — resizeCoverBlob chamado nos 3 call sites de saveBookCover (importSingleEpubRecord, reextractCover, updateManualCover)
└── __tests__/
    ├── utils/
    │   └── imageResize.test.ts      # NOVO — lógica de decisão (sem upscale, escala, fallback em erro, pula SVG), mockando createImageBitmap/canvas
    └── services/
        └── BookImportService.test.ts # MODIFICADO — resizeCoverBlob chamado nos 3 pontos certos, antes de saveBookCover
```

**Structure Decision**: Projeto único (React + Capacitor), sem separação
backend/frontend. `src/utils/imageResize.ts` segue a convenção já
documentada (funções puras em `src/utils/`) — nenhuma pasta nova.

## Complexity Tracking

> Nenhuma violação do Constitution Check — tabela fica vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário (`imageResize.test.ts` — lógica de decisão, mockando
Canvas/`createImageBitmap` já que jsdom não tem Canvas real) → integração
(`BookImportService.test.ts` — `resizeCoverBlob` é chamado no lugar certo,
antes de `saveBookCover`, nos 3 pontos) → manual (`quickstart.md` — import
real de um EPUB com capa grande, no browser e no device Android,
confirmando dimensão salva e exibição sem regressão visual, incluindo
`HeroBanner`/grid da Biblioteca em viewport largo).

Testes novos cobrem especificamente o que esta feature muda:
- `imageResize.test.ts`: bitmap dentro do teto → retorna o mesmo blob
  original (sem chamar canvas); bitmap acima do teto → calcula a escala
  certa e desenha no canvas com as dimensões esperadas; `createImageBitmap`
  rejeita → retorna o blob original sem lançar; blob `image/svg+xml` →
  retorna original sem tentar decodificar.
- `BookImportService.test.ts`: `resizeCoverBlob` (mockado) é chamado com
  o `coverBlob` correto antes de `saveBookCover` em `importSingleEpubRecord`,
  `reextractCover` e `updateManualCover`; o resultado de `resizeCoverBlob`
  (não o blob original) é o que chega em `saveBookCover`.

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Arquivo único: `npx vitest run src/__tests__/utils/imageResize.test.ts`
(ou o arquivo relevante da fase em andamento).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluído — baseline confirmado (790 testes, lint/tsc/build limpos antes da feature). Nenhuma dependência nova pra instalar. |
| Foundational (Fase 2) | Concluído — `src/utils/imageResize.ts` (`resizeCoverBlob`) criado e testado isoladamente (5 testes novos). |
| US1 — Import automático (Fase 3) | Concluído — `resizeCoverBlob` plugado em `importSingleEpubRecord`, antes da transação Dexie (R-001 mitigado). 3 testes novos, 22/22 em `BookImportService.test.ts`. |
| US2 — Recriar capa / Escolher imagem (Fase 4) | Concluído — `reextractCover` e `updateManualCover` também chamam `resizeCoverBlob` antes de `saveBookCover`. Mesma suíte, mesmos 22 testes (2 desta fase). |
| Polish (Fase 5) | Concluído — comentários revisados (T011), checagens automatizadas finais verdes (T012). `quickstart.md` (T010) validado via Playwright MCP: import real de EPUB (corpus `debug-books/`, capa 567×787px, dentro do teto), e `resizeCoverBlob` testado diretamente com Canvas real (imagem sintética 4000×6000 → 1333×2000, ~89% menos memória decodificada; sem-upscale, SVG pulado e blob corrompido também confirmados em ambiente real). Feature completa. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `saveBookCover()` é chamada de dentro de uma transação Dexie (`importSingleEpubRecord`). Se o redimensionamento fosse inserido dentro dela (ou dentro de `saveBookCover()` em si), a promise não-Dexie do Canvas (`createImageBitmap`/`toBlob`) faria a transação fechar prematuramente, quebrando o import de forma intermitente. | Alto se não tratado — bug sutil, intermitente, difícil de depurar (só apareceria sob timing específico). | Resolvido: `resizeCoverBlob` é chamado explicitamente nos 3 call sites, sempre antes de `saveBookCover()` — no caminho principal, antes de `db.transaction(...)` abrir. Confirmado com import real de um EPUB via Playwright (device real do browser, transação completou normalmente, capa salva corretamente). |
| R-002 | jsdom não implementa Canvas real (`getContext('2d')` retorna `null`) nem `createImageBitmap` global — qualquer teste que chame `resizeCoverBlob()` sem mockar essas APIs quebraria ou testaria um comportamento inexistente. | Médio — mesmo tipo de lacuna já enfrentada na feature 006 (ResizeObserver/offsetHeight ausentes em jsdom). | Resolvido: `imageResize.test.ts` mocka `createImageBitmap`/`HTMLCanvasElement` via `vi.stubGlobal`/`vi.spyOn` pra lógica de decisão determinística; resultado real confirmado à parte, testando `resizeCoverBlob` direto no console do browser via Playwright com Canvas de verdade (imagem sintética 4000×6000 → 1333×2000, ~89% menos memória decodificada) — validação que o jsdom não conseguiria fazer. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-03 | Setup + Foundational (Fases 1-2) | Baseline confirmado (790 testes). `src/utils/imageResize.ts` criado com `resizeCoverBlob`, 5 testes novos passando (dentro do teto sem upscale, redimensiona com proporção correta, fallback de formato JPEG, `createImageBitmap` rejeita sem lançar, SVG não decodificado). Lint/tsc limpos. | Nenhuma. |

| 2026-09-03 | US1 + US2 (Fases 3-4) | `resizeCoverBlob` plugado nos 3 call sites de `saveBookCover` em `BookImportService.ts`: `importSingleEpubRecord` (antes da transação Dexie — R-001 mitigado), `reextractCover` e `updateManualCover`. 5 testes novos em `BookImportService.test.ts` (22/22 no total), lint/tsc limpos. | Nenhuma — MVP (US1) + feature completa (US2) prontas. |

| 2026-09-03 | Polish (Fase 5) | Comentários revisados. Checagens automatizadas finais verdes (798 testes, lint/tsc/build limpos). `quickstart.md` validado via Playwright MCP: import real de um EPUB do corpus `debug-books/` (capa 567×787px, dentro do teto, sem regressão visual em Home) e `resizeCoverBlob` exercitado diretamente com Canvas real do browser — imagem sintética de 4000×6000px (15.75MB) redimensionada corretamente pra 1333×2000px (1.04MB, formato PNG preservado), mais os casos de sem-upscale, SVG pulado e blob corrompido, todos confirmados sem lançar erro. | Nenhuma — feature completa. |

**PRÓXIMO**: Rodar `sdd-converge` quando o usuário quiser auditar a implementação final contra spec/plan/tasks, ou seguir direto pro commit.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/utils/imageResize.ts` — `resizeCoverBlob(blob, maxDimension)`
- `src/__tests__/utils/imageResize.test.ts` — 5 testes novos
- `src/services/BookImportService.ts` — `resizeCoverBlob` chamado nos 3 call sites de `saveBookCover` (`importSingleEpubRecord`, `reextractCover`, `updateManualCover`)
- `src/__tests__/services/BookImportService.test.ts` — 5 testes novos (22 no total)
- (Fase 5) Sem arquivo novo — validação manual via Playwright MCP (`quickstart.md`)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar como Convergida. -->

Convergência auditada em 2026-09-03: nenhuma lacuna `missing`/`contradicts`/
`unrequested` entre `spec.md` (7 FRs, 5 SCs, 2 user stories, 5 edge cases) e
o código final. Um achado `partial` de severidade LOW (F1) foi identificado
e fechado na própria sessão de convergência (ver abaixo). Os 4 arquivos
listados em `Arquivos Principais` são exatamente os modificados/criados no
working tree — sem escopo extra, sem sobra.

O que foi construído, resumido:

- **US1 (import automático, P1/MVP)**: `resizeCoverBlob` (`src/utils/imageResize.ts`,
  Canvas API nativa, sem dependência nova) é chamado em
  `BookImportService.importSingleEpubRecord` logo após `metadata` ser
  resolvido e **antes** de `db.transaction(...)` abrir — evita o
  `TransactionInactiveError` que aconteceria se uma promise não-Dexie
  (`createImageBitmap`/`canvas.toBlob`) fosse aguardada dentro da transação
  (R-001). Cobre tanto import web quanto nativo Android, já que os dois
  convergem pra `metadata.coverBlob` nesse ponto.
- **US2 (recriar capa / escolher imagem, P2)**: `reextractCover` e
  `updateManualCover` aplicam o mesmo `resizeCoverBlob` antes de
  `saveBookCover`, cobrindo fotos de celular vindas da galeria com o mesmo
  teto.
- **Teto de 2000px, sem upscale, forward-only**: capas já salvas não são
  tocadas (nenhum código de migração foi adicionado — FR-005 satisfeito
  pela ausência, não por uma checagem ativa). Capa de fallback SVG é
  pulada por `type` (FR-006). Falha de decodificação nunca quebra o
  import — cai pro blob original (FR-004).

**F1 (achado de convergência, fechado nesta sessão)**: a auditoria notou
que `tasks.md` já marcava T010 (`quickstart.md`) como concluído, mas a
verificação original (feita durante o `sdd-execute`) cobriu só uma parte —
`resizeCoverBlob` testado direto no console com Canvas real e um import
simples — sem exercitar literalmente os passos de "Escolher imagem"/
"Recriar capa" via clique real na UI nem o cenário de viewport largo
(`HeroBanner`/grid da Biblioteca) que motivou o teto de 2000px na spec.
Rodado agora, via Playwright MCP: "Escolher imagem" com um PNG real de
4000×6000 gerado localmente (`System.Drawing`) → salvo corretamente como
1333×2000 (`manual-upload`, confirmado no Dexie); "Recriar capa" reverte
pra `epub-extracted`/567×787 (capa original do EPUB, já dentro do teto);
`HeroBanner` (full-width) e o grid da Biblioteca renderizados num
viewport de 1024px (simulando tablet) com a capa de 1333×2000 — nítidos,
sem pixelização perceptível em nenhum dos dois. Zero erros de console em
todas as etapas. `tasks.md` não foi alterado por esta convergência (fica
byte-idêntico ao que o `sdd-execute` deixou) — este parágrafo é o registro
da evidência adicional coletada.

Nenhuma decisão técnica do plano original foi revertida — a escolha de não
usar dependência nova (Canvas API), o ponto de inserção antes da transação
Dexie, e o teto de 2000px permanecem como planejados. 798 testes passando,
lint/tsc/build limpos na última checagem.
