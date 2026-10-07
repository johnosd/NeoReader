# Bug Assessment: Toque no EPUB fixo não abre menu contextual

- **Slug**: toque-no-epub-fixo-no-abre
- **Criado**: 2026-10-07
- **Origem**: relato do usuário após teste no Android
- **Veredito**: valid
- **Severidade**: high

## Report

No EPUB de teste “Layout Fixo Sintético”, tocar no meio da página não abre o menu contextual, impedindo criar marcadores. Os demais testes funcionaram segundo o usuário.

## Symptom

O toque central deve abrir o painel inline com a ação de marcador. Em vez disso, alterna o chrome porque é classificado como toque na borda da página.

## Reproduction

1. Importar `debug-books/fxl/layout-fixo.epub` no harness real do ReaderScreen, viewport 412 × 915.
2. Abrir, aguardar cinco segundos e clicar em (206, 450).
3. Repetir após rolar 80 pixels e aguardar a rolagem terminar.
4. Nos dois casos o painel não aparece; diagnóstico: `reader.tap.ignored`, `reason=chrome-zone`, `zone=visible`.

## Suspected Code Paths

- `src/components/reader/EpubViewer.tsx::getRendererScrollContainer`: procura apenas `#container`, ausente no foliate-fxl, cuja viewport de rolagem é o próprio host.
- `src/components/reader/EpubViewer.tsx::getPhysicalTapPosition`: soma clientY ao topo do iframe sem considerar sua escala CSS.
- `src/components/reader/EpubViewer.tsx::isVisibleChromeTapZone`: sem posição física, usa a altura original do documento.

## Root Cause Hypothesis

Confiança alta, com reprodução no renderer real. A página original mede 600 × 800, mas aparece com 412 × 549,33. O toque físico central vira uma coordenada próxima ao fim do documento original e é tratado como borda inferior. O host FXL não tem `#container`, portanto o cálculo físico nem sequer é utilizado. A hipótese inicial de pointer-events foi refutada neste cenário: todos os iframes estavam com `auto` e os eventos foram registrados.

## Proposed Remediation

**Preferida**: usar o host foliate-fxl como viewport quando não existir o container do paginator; converter clientY pela proporção entre altura visual e altura de layout do iframe. Preservar o comportamento do paginator e das bordas físicas.

**Files likely to change**:
- `src/components/reader/EpubViewer.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `scripts/verificacao-visual/epub-fxl.check.js`

**Tests to add or update**:
- Regressão com iframe reduzido por CSS: toque central fora do rect do texto abre o painel e permite acionar o marcador.
- Toque nas bordas físicas continua alternando chrome.
- Verificação com renderer real, clique físico, criação e persistência do marcador no harness isolado.

## Risks & Considerations

- Não alterar sandbox, renderer de PDF ou o algoritmo de rolagem.
- Testes com DOM simulado não substituem a reprodução com iframe realmente escalado.
- A validação no APK deve ser informada separadamente da validação no navegador.

## Open Questions

Nenhuma pendente; usuário confirmou que o livro afetado é o sintético de layout fixo.
