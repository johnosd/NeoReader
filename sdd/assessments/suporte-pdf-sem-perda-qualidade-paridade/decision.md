# Assessment Decision: Suporte a PDF sem Perda de Qualidade (Paridade com EPUB)

- **Slug**: suporte-pdf-sem-perda-qualidade-paridade
- **Decidido**: 2026-09-23 (revisado após evidência adicional — ver `problem.md` § Evidência Adicional)
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | PDF literalmente não abre hoje (import bloqueado em 5+ pontos) e a copy de onboarding promete o contrário. Reforçado agora por racional competitivo explícito do usuário ("a maioria dos players oferece suporte"). |
| Força da evidência | strong | Levantamento de código (file:line) + relatório técnico externo (`docs/features/pdf_support_report.md`) descrevendo, com riqueza de detalhe, uma implementação de produção do mesmo problema sobre a mesma dependência de baixo nível (`foliate-js` fork `readest`). |
| Valor vs. custo de inação | adequate | Antes `unknown` por falta de dado de demanda. Resolvido pela decisão de produto do usuário (necessidade real + ambição de superar concorrentes) — é julgamento qualitativo legítimo do dono do projeto, não inflação artificial do critério. |
| Viabilidade / apetite | adequate | Antes `weak` porque a reconstrução de parágrafo a partir do PDF era território não mapeado no codebase. Agora existe prior art direto e aplicável: o algoritmo de reconstrução semântica (`pdfText.ts` do Readest) resolve exatamente esse gap, sobre a mesma base de renderização que o NeoReader já vendoriza. Ainda é esforço real e não trivial — portar/adaptar a heurística, construir fast path nativo Android (Java/Kotlin, sem reuso direto do código Rust), e integrar tudo em `EpubViewer.tsx` sem quebrar o fluxo EPUB — mas deixou de ser "pode não ser possível" pra "é um projeto de engenharia com caminho conhecido". |
| Fit estratégico | adequate | Amplia o TAM de livros suportados e passa a ser posicionamento competitivo deliberado, não só "nice to have". Ainda adiciona uma segunda modalidade de renderização (fixed-layout) que o produto precisa passar a tratar de forma consistente (busca, tags, capas, settings por formato) — custo de manutenção permanente, não pontual. |

Todos os critérios centrais em `adequate` ou `strong` — nenhum `weak`/`unknown` remanescente. Barra de `go` atingida.

## Abordagens Candidatas

### 1. PDF com reconstrução semântica portada do Readest (recomendada)

- Import de `.pdf` nos 3 caminhos existentes (picker web, pasta nativa
  Android, intent externo "abrir com") + extensão do `BookFormat`
  (`src/types/book.ts`) e nova `version()` no schema Dexie.
- Renderização via `foliate-js` já vendorizado (`makePDF`/`makeBook`,
  hoje código morto) — paginação/scroll fixed-layout, TOC via outline,
  metadata, progresso via CFI.
- Camada de reconstrução de parágrafo adaptada da heurística documentada
  em `pdfText.ts` do Readest (classificação de quebra de linha por
  posição/fonte/indentação, de-hifenização) — desbloqueia Word Lens,
  tradução inline, TTS por parágrafo e highlight de trecho em PDF
  usando a MESMA lógica que já existe pra EPUB (`BLOCK` selector,
  `getParagraphsFromDocument()` etc.), desde que a reconstrução alimente
  o DOM com as mesmas tags semânticas (`p`, etc.) que esse código espera.
- Capa: fast path nativo Android (`PdfRenderer`) no plugin já existente,
  com fallback client-side (graceful degradation, análogo ao
  `tauriPdfBridge.ts` do relatório) se o nativo falhar.
- **Recomendada**: sim — único caminho que atinge a ambição "sem perda
  de qualidade / melhor que os concorrentes" reaproveitando prior art
  real em vez de pesquisa às cegas.

### 2. PDF básico primeiro, paridade depois (faseamento dentro da abordagem 1)

- Mesmo caminho técnico da abordagem 1, mas dividido em fases de entrega:
  fase A = import + leitura + TOC + progresso (sem Word Lens/TTS/tradução
  em PDF); fase B = reconstrução semântica + paridade de features.
- **Recomendada**: como sequenciamento de execução dentro da abordagem 1,
  não como abordagem concorrente — reduz risco de entrega ao validar a
  parte "abrir e mostrar" antes de investir na parte mais incerta
  (heurística de parágrafo), mas ambas continuam fazendo parte do mesmo
  objetivo de produto. Decisão de fasear ou não fica pro `sdd-plan`.

### 3. Converter PDF → EPUB no import

- Descartada — qualidade de conversão de PDF complexo/scaneado costuma
  ser ruim, e adiciona dependência nova sem justificativa clara sobre a
  abordagem 1, que já reaproveita infraestrutura existente.

## Veredito

**go.** O problema é válido (PDF não abre hoje, concorrentes oferecem,
usuário confirma necessidade real e ambição de superá-los), e o gap que
antes deixava a viabilidade em `weak` — reconstrução semântica de
parágrafo a partir do PDF, sem a qual Word Lens/tradução/TTS/highlight
não funcionariam — deixou de ser incógnita: o relatório técnico mostra
uma implementação de produção resolvendo exatamente isso sobre a mesma
base de renderização (`foliate-js` fork `readest`) que o NeoReader já
usa. Nenhum critério central ficou em `weak`/`unknown`, então o veredito
não precisa ser rebaixado.

### Se go — Handoff

- **Problema**: NeoReader não importa nem lê PDF hoje (bloqueado em
  import, sem branch de formato no `EpubViewer.tsx`, `BookFormat` só
  tem `'EPUB'`), apesar de concorrentes oferecerem e a copy de
  onboarding já prometer PDF sem entregar.
- **Abordagem recomendada**: Abordagem 1 (reconstrução semântica portada
  do Readest sobre o `foliate-js` já vendorizado), possivelmente faseada
  internamente (leitura básica → paridade de features) por decisão do
  `sdd-plan`.
- **Escopo sugerido**:
  - **Entra**: import de `.pdf` (web + Android + intent externo);
    render via foliate-js (paginação/scroll fixed-layout, TOC, CFI);
    reconstrução de parágrafo adaptada de `pdfText.ts`; Word Lens,
    tradução inline, TTS por parágrafo e highlight funcionando sobre
    PDF "nascido digital" (texto selecionável); capa via fast path
    nativo Android (`PdfRenderer`) com fallback client-side; dark mode
    via `renderer.pageColors`; `BookFormat` estendido + nova
    `version()` Dexie.
  - **Não entra (v1)**: OCR de PDF escaneado sem camada de texto
    (limitação declarada na UI, não falha silenciosa); fast path nativo
    com as proteções avançadas de zip-bomb/OOM do relatório (Rust/mmap)
    — pode começar client-side via pdf.js já vendorizado e evoluir se
    performance de import for um problema medido; workaround de WebKit
    (só entra se o alvo Web precisar suportar Safari — a confirmar).
  - Manutenção de duas modalidades de renderização (reflow EPUB +
    fixed-layout PDF) passa a ser custo permanente — `sdd-plan` deve
    mapear onde mais no produto isso aparece além do leitor (busca,
    tags, filtros de biblioteca, settings por formato).
- **Métricas de sucesso**: usuário importa e abre PDF "bem comportado"
  (nascido digital, 1 coluna) pelos 3 caminhos de import existentes;
  Word Lens/tradução/TTS/highlight funcionam nesse PDF com qualidade
  comparável ao EPUB; TOC e progresso funcionam nativamente via
  foliate-js; limitações conhecidas (PDF escaneado, multi-coluna
  complexo) comunicadas na UI, não silenciosas.
- **Perguntas em aberto pro sdd-specify**:
  - O alvo Web do NeoReader precisa suportar Safari/WebKit? (define se
    o workaround de `ArrayBuffer` do relatório é necessário)
  - Onde fica o corte de "PDF bem comportado" vs "fora de escopo" pra
    QA (colunas, tabelas, formulários)?
  - Builda fast path nativo (Android `PdfRenderer`) já na v1, ou começa
    100% client-side e mede performance real antes de investir nisso?
  - Prioridade relativa frente ao backlog em andamento (features
    019/020/021)?
  - Vale corrigir agora, à parte, a copy de onboarding que já promete
    PDF sem entregar?
