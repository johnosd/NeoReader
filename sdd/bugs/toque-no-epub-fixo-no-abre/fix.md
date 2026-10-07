# Bug Fix: Toque no EPUB fixo não abre menu contextual

- **Slug**: toque-no-epub-fixo-no-abre
- **Corrigido**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A posição física usa o host FXL e a escala visual do iframe. Durante a verificação real surgiu uma segunda causa: atributos booleanos sem valor no HTML do painel são inválidos no documento XHTML preservado pelo FXL.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/reader/EpubViewer.tsx` | modified | Conversão do toque e compatibilidade XHTML do painel |
| `src/__tests__/components/EpubViewer.test.tsx` | modified | Toque central, bordas físicas e ação de marcador |
| `scripts/verificacao-visual/epub-fxl.check.js` | modified | Reprodução real do toque e persistência do marcador |

## Tests Added or Updated

- `converte o toque físico em EPUB fixo reduzido`: centro abre tradução/marcador; topo e fundo mantêm atalhos.

## Local Verification

- Antes do patch: regressão central falhou, classificada como chrome.
- Após conversão: 127 testes do EpubViewer passaram.
- Browser real: toque passou a entrar na tradução; montagem interrompida por `SyntaxError` de XML.
- Após compatibilidade XHTML: 127 testes passaram; reprodução com renderer real passou 4/4, incluindo toque central, clique físico no marcador e persistência ao reabrir (1 registro). Sem erros de console.

## Deviations from Assessment

O renderer preserva `application/xhtml+xml`; o painel usa `hidden` sem valor, válido em HTML mas inválido em XML. A correção adicional permanece em EpubViewer.tsx, arquivo previsto no assessment, e precisa de teste com parser XHTML e reprodução real. A hipótese de pointer-events não se confirmou.

O harness web não dispõe de voz TTS e exibe um aviso sobre o leitor. O teste dispensa esse aviso e aguarda a animação de rolagem do painel antes do clique físico; clicar durante a animação ou sobre o aviso não exercitava o botão. Não foi necessário alterar a persistência nem a lógica de scroll.

## Follow-ups

- Concluir testes, build e instalação antes de registrar resultado final.
