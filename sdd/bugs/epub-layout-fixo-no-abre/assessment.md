# Bug Assessment: EPUB de layout fixo não abre

- **Slug**: epub-layout-fixo-no-abre
- **Criado**: 2026-10-07
- **Origem**: entrada `[Bug]` de `.planning/backlog.md`, feature 022, T038r/R-041 (2026-10-06)
- **Veredito**: valid
- **Severidade**: high

## Report

EPUB com `rendition:layout = pre-paginated` (quadrinhos/livros ilustrados) não abre: o watchdog `INITIAL_INTERACTIVE_TIMEOUT_MS` mostra erro após 8 segundos. Relatado também no `main` em 6c1acb9; esta avaliação reproduziu na árvore atual, sem repetir a comparação com aquele commit.

## Symptom

O arquivo é importado e suas páginas carregam em `foliate-fxl`, mas o leitor não sai do estado de abertura e mostra a mensagem de erro. Esperado: concluir a abertura quando a primeira página utilizável estiver pronta.

## Reproduction

1. Usar `debug-books/fxl/layout-fixo.epub` (24 páginas, já existente e ignorado pelo Git). Se ausente: `python -I scripts/verificacao-visual/gerar-epub-fxl.py debug-books/fxl/layout-fixo.epub 24`.
2. Iniciar `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199 --strictPort`.
3. Executar `scripts/verificacao-visual/epub-fxl.check.js` pela ferramenta Playwright, que abre um contexto isolado de 412 × 915 e usa o harness real de importação/leitura.
4. Resultado em 2026-10-07: `FALHOU (4)`. Títulos das páginas corretos e até 8 iframes vivos, mas conteúdo encoberto e evento `reader.open.failure` em 8.134 ms.
5. Reprodução focada em novo contexto: aguardar o texto `Could not open this book. The file may be corrupted or in an unsupported format.`. O erro apareceu; `renderer = FOLIATE-FXL`, `isFixedLayout = true`, `typeof renderer.primaryIndex = undefined`, `getContents()` continha páginas 0, 1 e 2 com seus títulos.
6. Instrumentação temporária de eventos, restrita a outro contexto de teste (sem editar arquivos da aplicação), confirmou a ordem abaixo. O erro também reproduziu sem instrumentação nos passos anteriores.

```text
evento load (foliate-fxl e foliate-view) / índice / getContents() naquele instante
load / 0 / []
load / 1 / [0]
load / 2 / [0, 1]
depois dos loads: getContents() = [0, 1, 2]
```

O check visual também registrou um 404; ele não é necessário para provar o bug: a reprodução focada confirma o timeout apesar das páginas carregadas. Não houve teste Android nesta rodada.

## Suspected Code Paths

- `src/components/reader/EpubViewer.tsx:1725` — `pruneLoadedSections` remove registros que ainda não aparecem em `renderer.getContents()`.
- `src/components/reader/EpubViewer.tsx:1758` — `registerLoadedSection` insere o registro ao receber `load`.
- `src/components/reader/EpubViewer.tsx:1834` — `activateSection` consulta `getLoadedSection`, que executa a poda imediatamente.
- `src/components/reader/EpubViewer.tsx:3884` — handler de `load` registra e tenta ativar a página na mesma chamada.
- `src/components/reader/EpubViewer.tsx:3325` — `finalizePendingSection` precisa de seção pendente válida para chamar `onLoad`.
- `src/components/reader/EpubViewer.tsx:4354` — watchdog de abertura de 8 segundos.
- `src/components/reader/EpubViewer.tsx:4428` — reconciliação após `init` depende de `primaryIndex`, ausente no FXL instalado.
- `node_modules/foliate-js/fixed-layout.js:539` — emite `load` antes de a página receber `frame` e estado `loaded` (atribuídos após `await #createScrollFrame`).
- `node_modules/foliate-js/fixed-layout.js:1137` — `getContents()` só inclui páginas com estado `loaded` e iframe disponível.

## Root Cause Hypothesis

**Confiança: high.** Há incompatibilidade entre o ciclo de carregamento do renderer FXL e a poda imediata do registro de seções do `EpubViewer`: durante `load`, o documento recebido ainda não consta em `getContents()`, portanto pode ser removido ao tentar ativá-lo. As tentativas posteriores de ativação não recriam o registro a partir das páginas já carregadas; além disso, a reconciliação por `primaryIndex` não se aplica ao FXL. Sem seção pendente, `finalizePendingSection` nunca chama `onLoad`, e o watchdog dispara. O relato antigo de que o FXL não emite `load` é impreciso: os dois elementos emitem o evento, como demonstrado acima.

## Proposed Remediation

**Preferida**: compatibilizar o registro/ativação com o ciclo do FXL: preservar o documento recém-recebido durante `load`, reconciliar os documentos efetivamente carregados e usar o índice disponível em `relocate`/`section.current` quando não houver `primaryIndex`. Concluir a abertura somente depois de registrar e ativar uma página utilizável; manter o watchdog para arquivos que realmente não carregam.

**Files likely to change**:
- `src/components/reader/EpubViewer.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `scripts/verificacao-visual/epub-fxl.check.js` — atualizar o comentário de estado após corrigir.

**Tests to add or update**:
- Renderer sem `primaryIndex`, com `load` emitido antes de a página aparecer em `getContents()`: a abertura deve concluir sem timeout.
- Reconciliação após a primeira página se tornar disponível e após descarte/recarregamento de páginas.
- Arquivo sem documento utilizável continua falhando pelo watchdog.
- Rerrodar o check visual de 24 páginas: abertura, fim e retorno ao início; verificar títulos e teto de iframes.
- Regressão de EPUB reflowable, highlights, tradução e TTS.

## Risks & Considerations

- Não remover a poda indiscriminadamente: ela libera documentos de páginas descartadas pelo renderer.
- Não chamar `onLoad` só porque `open()`/`init()` resolveu: isso esconderia falhas reais.
- O FXL compartilha o renderer com caminhos de PDF; qualquer alteração no vendor/patch Vite ampliaria o escopo. A remediação proposta fica no `EpubViewer`.

## Open Questions

Nenhuma bloqueante para o Fix. O pedido atual foi apenas avaliar; nenhuma correção foi aplicada.
