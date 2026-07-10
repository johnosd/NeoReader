# Plano: Footer Fixo De Progresso Na Leitura

## Contexto

Pedido original em `docs/backlog.md`: adicionar uma barra bem fina e fixa no footer da tela de leitura do livro contendo informacoes como nome do capitulo e percentual lido.

Decisoes ja tomadas:

- O percentual exibido representa o progresso do capitulo atual.
- Quando o TOC apontar para um subcapitulo, a barra exibe o capitulo pai para manter o texto coerente com o percentual do capitulo.
- A barra fica fixa no rodape e abaixo do mini player de TTS quando ele estiver ativo.
- A nova barra substitui a faixa atual de progresso global de `2px`.
- Nao havera configuracao para ocultar a barra nesta primeira versao.

Arquivos principais:

- `src/screens/ReaderScreen.tsx`
- `src/components/reader/ReaderProgressFooter.tsx`
- `src/components/reader/TtsMiniPlayer.tsx`
- `src/components/reader/ReaderChrome.tsx`
- `src/store/readerStore.ts`
- `src/i18n/messages.ts`

## Fase 1: Documento De Retomada

Checklist:

- [x] Criar este arquivo em `docs/plano-footer-progresso-leitura.md`.
- [x] Registrar o contexto do backlog.
- [x] Registrar decisoes de produto e comportamento.
- [x] Citar os arquivos principais para retomada.

Testes:

- [x] Revisao manual do Markdown.

## Fase 2: Footer Informativo

Checklist:

- [x] Criar `ReaderProgressFooter`.
- [x] Receber `sectionLabel?: string | null` e `chapterPercentage?: number | null`.
- [x] Exibir o nome do capitulo truncado no lado esquerdo.
- [x] Resolver o capitulo pai quando o item atual do TOC for um subcapitulo.
- [x] Exibir o progresso do capitulo no lado direito.
- [x] Usar fallback `Capitulo atual` quando nao houver nome.
- [x] Usar fallback `--%` quando nao houver percentual.
- [x] Substituir a faixa global de `2px` em `ReaderScreen`.

Testes:

- [x] Renderiza capitulo e percentual.
- [x] Renderiza o capitulo pai quando o TOC atual esta em um subcapitulo.
- [x] Renderiza fallback de capitulo.
- [x] Renderiza `--%` quando `chapterPercentage` nao existe.

## Fase 3: Integracao Com TTS

Checklist:

- [x] Adicionar `bottomOffsetPx?: number` ao `TtsMiniPlayer`.
- [x] Passar o offset do footer quando o mini player estiver aberto.
- [x] Ajustar a posicao do mini player sem alterar seus controles.
- [x] Manter o footer visivel abaixo do TTS.

Testes:

- [x] Teste de `ReaderScreen` valida que o TTS recebe o offset.
- [x] Teste de `TtsMiniPlayer` valida que o offset altera o `bottom`.

## Fase 4: i18n E Acabamento Visual

Checklist:

- [x] Adicionar chaves em `pt-BR`, `en` e `es`.
- [x] Manter os catalogos com o mesmo conjunto de chaves.
- [x] Garantir texto curto e truncado para telas estreitas.
- [x] Manter a barra sem botao e sem interacao.

Testes:

- [x] `src/__tests__/i18n/messages.test.ts`.
- [ ] Smoke visual manual em viewport mobile estreita.

## Fase 5: Verificacao Final

Checklist:

- [x] Rodar testes focados do footer, TTS, ReaderScreen e i18n.
- [x] Rodar suite completa com `npm test -- --hookTimeout=30000`.
- [x] Rodar `npm run lint`.
- [x] Rodar `npm run build`.
- [ ] Smoke manual da tela de leitura:
  - leitura normal;
  - capitulo sem TOC confiavel;
  - chrome aberto/fechado;
  - TTS aberto;
  - fim do capitulo/livro.

Notas para retomada:

- `chapterPercentage` ja vem do `EpubViewer` via `ReaderRelocatePayload` e e armazenado em `useReaderStore`.
- `currentTocLabel` em `ReaderScreen` resolve `tocLabel` atual ou o label salvo no progresso.
- `findTopLevelTocLabel` em `src/utils/toc.ts` evita misturar subcapitulo no texto com percentual do capitulo.
- A altura do footer e centralizada em uma constante para evitar divergencia entre footer e offset do TTS.
- Em 2026-07-08, `npm test` completo falhou uma vez com o timeout padrao de 10s no `beforeAll` de `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts`; o mesmo arquivo passou isoladamente, e a suite completa passou com `npm test -- --hookTimeout=30000`.
