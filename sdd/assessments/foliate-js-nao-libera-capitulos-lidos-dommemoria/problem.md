# Assessment Problem: foliate-js não libera capítulos lidos do DOM/memória

- **Slug**: foliate-js-nao-libera-capitulos-lidos-dommemoria
- **Criado**: 2026-09-04
- **Explora**: ./explora.md

## Problem Statement

O leitor EPUB (`EpubViewer.tsx`) nunca libera recursos do `foliate-js` que ficam retidos além do necessário: (1) `view.close()` nunca chama `book.destroy()`, então todo blob URL de imagem/fonte/CSS carregado durante a leitura vaza a cada troca de livro ou saída do leitor; (2) em modo scroll contínuo, `#trimDistantViews` (comportamento intencional da lib) nunca evicta views de capítulos já lidos que ficaram para trás do capítulo atual, então sessões de leitura muito longas em um único livro acumulam DOM/memória sem limite superior.

## Usuários / Partes Afetadas

- **Usuários Android** com sessões de leitura longas ou que trocam de livro com frequência — memória do processo cresce mais do que o necessário, aumentando risco de o SO matar o processo (perda de estado) e contribuindo para o bucket "Memory usage" do Play Console.
- **Time/projeto** (indireto) — o bucket "Memory usage / Bad behavior" do Play Console já está em 0%/"bad behavior"; este item é um dos mecanismos identificados mas deixado fora do fix já aplicado em 2026-09-01.

## Goals

- Eliminar o vazamento incondicional de blob URLs (`book.destroy()` nunca chamado) a cada troca de livro/saída do leitor.
- Registrar formalmente, com evidência de código, o limite conhecido de `#trimDistantViews` (não evictar pra trás) como comportamento intencional da lib, não um bug do NeoReader — decidir se vale mitigar e como.

## Non-Goals

- Não implementar patch em `#trimDistantViews` para evictar views pra trás nesta rodada — evidência aponta risco real de quebrar posição de scroll, sem medição que justifique o risco agora.
- Não introduzir fork ou dependência nova do `foliate-js` — qualquer mudança fica no lado NeoReader (`EpubViewer.tsx`) ou usa a infra de patch de vendor lib sem fork já existente (`vite.config.ts`), se necessário.
- Não medir/perseguir o P90 real do Play Console diretamente — esse dado só volta em 28 dias após release e está fora do controle desta assessment.
- Não reabrir os 4 mecanismos já corrigidos em `sdd/bugs/alerta-play-console-uso-memoria-acima/` (bitmap TTS, lazy-loading, rows sem limite, onTrimMemory) — já `verified`/`Concluído`.

## Success Metrics

- `view.book?.destroy?.()` (ou equivalente) é chamado no cleanup de `EpubViewer.tsx` antes/junto de `view.close()`, e um teste (unitário ou via mock do `View`) confirma a chamada em troca de livro e em desmonte do componente.
- Validação manual/profiler (Chrome DevTools Memory ou `dumpsys meminfo`) mostra queda mensurável de blob URLs/heap retido após trocar de livro repetidamente, comparado ao comportamento atual.
- Nenhuma regressão nos testes existentes de `EpubViewer` (`npm test`), `npm run build` e `npm run lint` limpos.

## Cost of Inaction

Baixo a curto prazo — não há enforcement real do Google até fev/2027, não há reclamação de usuário, e os 4 fixes já aplicados (2026-09-01) provavelmente já reduziram a maior parte do problema de memória reportado. O custo de não agir é vazamento de memória incremental e silencioso que persiste indefinidamente (cresce um pouco a cada troca de livro), tornando o app mais vulnerável a ser morto pelo SO em sessões longas de uso — mas sem prazo ou pressão externa que torne isso urgente. O fix candidato (`book.destroy()`) é barato e de baixo risco, então mesmo com custo de inação baixo, o custo de correção também é baixo — favorece fazer, não corrida.
