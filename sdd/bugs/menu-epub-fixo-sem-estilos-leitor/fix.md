# Bug Fix: Menu do EPUB fixo sem estilos do leitor

- **Slug**: menu-epub-fixo-sem-estilos-leitor
- **Corrigido**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O FXL agora recebe diretamente o CSS da UI NeoReader, com cartão, grid de quatro ações, ícones e cores da paleta do leitor. Os overrides globais de fonte, imagens e cores do livro são omitidos.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/reader/EpubViewer.tsx` | modified | CSS sem overrides do livro, style XHTML por documento FXL e atualização de tema |
| `src/__tests__/components/EpubViewer.test.tsx` | modified | Ausência de setStyles, tema atual em páginas posteriores e ausência de duplicação |
| `scripts/verificacao-visual/epub-fxl.check.js` | modified | Estilos computados do menu e preservação da página |

## Tests Added or Updated

- Teste de design FXL falhou antes do patch (style ausente) e passou depois.
- Renderer real: radius 18px, Inter/system-ui, grid, tiles 40px, ícones 17px; fonte original 28px e fundo branco preservados.

## Local Verification

- EpubViewer: 128 testes passaram.
- Cinco verificações funcionais/visuais passaram, incluindo marcador persistido após reabrir.
- Captura visual inspecionada: cartão e ações do leitor presentes.
- Console emite seis bloqueios de execução pelo sandbox durante o fluxo de marcador. O teste visual continua sinalizando essa restrição (não ocultada); função de marcador concluiu com 1 registro. Retirar captura e desativar animações somente no diagnóstico não removeu os avisos. Não foi permitido allow-scripts.

## Deviations from Assessment

Nenhum arquivo adicional. Surgiram avisos de sandbox durante a validação; a causa específica permanece inconclusiva e será registrada como ressalva.

## Follow-ups

- Instalar release e conferir o menu no S23.
- Investigar separadamente os avisos de sandbox se apresentarem impacto funcional.
