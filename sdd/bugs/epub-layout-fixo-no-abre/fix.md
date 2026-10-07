# Bug Fix: EPUB de layout fixo não abre

- **Slug**: epub-layout-fixo-no-abre
- **Corrigido**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

O registro de seções preserva um documento cujo iframe continua conectado, mesmo quando o FXL ainda não o publicou em `getContents()`. A navegação reconcilia os documentos carregados e a abertura usa o índice de `relocate` quando não existe `primaryIndex`, permitindo finalizar a primeira página sem remover o watchdog.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/reader/EpubViewer.tsx` | modified | Poda preserva iframe conectado com o mesmo Document; reconciliação em relocate e depois de init; fallback de índice para FXL. |
| `src/__tests__/components/EpubViewer.test.tsx` | modified | Dois testes de regressão: load antes de getContents sem primaryIndex; reconciliação por section.current e novo documento ao revisitar página. |
| `scripts/verificacao-visual/epub-fxl.check.js` | modified | Comentário atualizado com o resultado pós-fix. |

## Tests Added or Updated

- `FXL: preserva a pagina conectada quando load antecede getContents e nao existe primaryIndex` — reproduz a ordem real do renderer, finaliza e cancela o watchdog.
- `FXL: reconcilia a pagina publicada depois do load pelo indice de relocate` — recupera registro ausente e aceita outro Document ao revisitar o mesmo índice, sem repetir onLoad.
- O teste existente `encerra com erro quando init resolve sem uma seção interativa` continua passando: abrir um arquivo sem documento utilizável não foi transformado em sucesso.

## Local Verification

- Antes do patch, `npx vitest run src/__tests__/components/EpubViewer.test.tsx -t 'FXL:'`: os **2 testes novos falharam**, porque onLoad não era chamado.
- Depois do patch, arquivo completo: **124/124 aprovados**.
- Reprodução real no navegador durante o Fix: `epub-fxl.check.js`, **3/3 aprovados**, sem erros; abertura/fim/retorno com títulos corretos e até 8 iframes vivos.
- Gates gerais e reprodução final registrados em `test.md` pela fase Test.

## Deviations from Assessment

Nenhuma expansão de arquivos. A preservação usa conexão do iframe e identidade do Document, em vez de prazo artificial: páginas realmente descartadas continuam sendo podadas.

## Follow-ups

- Smoke test Android é uma cobertura adicional; nesta sessão o usuário pediu validação local e deixou o aparelho pendente.
- Ponto de commit sugerido após gates: `fix: corrige abertura de EPUB com layout fixo`.
