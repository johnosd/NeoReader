# Performance and Bugfix Priority Checklist

Data: 2026-06-14

Objetivo: organizar as proximas frentes de melhoria do NeoReader por prioridade, com criterios objetivos de aceite e verificacao.

## Prioridade alta

| ID | Frente | Problema / oportunidade | Acao proposta | Criterio de aceite | Validacao |
| --- | --- | --- | --- | --- | --- |
| PBF-01 | Logs para toques ignorados no leitor | Quando o usuario toca e nada acontece, hoje o log nem sempre explica o motivo. | Adicionar `reader.tap.ignored` com `reason`: `chrome-zone`, `translation-loading`, `tts-active`, `no-readable-paragraph`, `translation-block`, `bookmark-icon` quando aplicavel. | Todo toque descartado por regra interna relevante gera evento sem expor texto do livro. | Teste unitario no `EpubViewer`; teste Android tocando topo vazio, lateral direita, durante loading e durante TTS. |
| PBF-02 | Zona lateral direita de toque | A lateral direita ainda tem prioridade para abrir chrome; pode parecer que o paragrafo nao responde se o usuario tocar texto perto da margem. | Revisar regra da lateral direita: priorizar texto quando o toque cair dentro de um paragrafo legivel, ou reduzir a zona lateral. | Toque em texto perto da margem direita seleciona/traduz; toque em area vazia perto da margem ainda alterna chrome. | Teste unitario similar ao AQA-20; teste Android dedicado. |
| PBF-03 | Cache de TTS premium | Fluxos de TTS podem sintetizar o mesmo texto repetidamente, gerando custo/latencia. | Criar cache por `provider + voiceId + language + rate + textHash`, com expiração e invalidação simples. | Repetir a mesma frase/paragrafo usa cache e nao chama rede novamente. | Testes unitarios do hook/servico TTS; teste Android com dois plays do mesmo trecho e logs comparando cache hit. |

## Prioridade media

| ID | Frente | Problema / oportunidade | Acao proposta | Criterio de aceite | Validacao |
| --- | --- | --- | --- | --- | --- |
| PBF-04 | Logs de playback TTS | Existem logs de sintese, mas pouca visibilidade de play/pause/resume/stop. | Adicionar `tts.playback.start`, `tts.playback.pause`, `tts.playback.resume`, `tts.playback.stop`, `tts.playback.error`. | AQA de TTS permite confirmar estado do player sem depender apenas da UI. | Reexecutar AQA-09, AQA-16, AQA-17 e AQA-18 com log filtrado. |
| PBF-05 | Logs de aparencia do leitor | AQA-10 dependeu de observacao visual. | Adicionar eventos `reader.appearance.fontSize.change`, `reader.appearance.theme.change`, `reader.appearance.lineHeight.change`, `reader.appearance.fontFamily.change`. | Toda mudanca de aparencia relevante gera evento com valor anterior/novo, sem dados sensiveis. | Teste unitario do painel/estado e reexecucao AQA-10. |
| PBF-06 | Otimizacao do bundle inicial | Build indica chunk principal grande e assets pesados. | Auditar assets grandes, reduzir SVG/logo, lazy-load de modulos pesados quando possivel. | Reduzir tamanho do chunk principal e/ou gzip sem regressao visual. | `npm run build`, comparacao de tamanhos antes/depois e smoke test Android. |

## Prioridade baixa

| ID | Frente | Problema / oportunidade | Acao proposta | Criterio de aceite | Validacao |
| --- | --- | --- | --- | --- | --- |
| PBF-07 | Ruido de EPUB sandboxado | Logs mostram `Blocked script execution` em `about:srcdoc`; esperado, mas polui leitura. | Classificar/filtrar esse aviso nos relatorios de diagnostico ou documentar como benigno quando vier de iframe sandboxado. | Relatorios deixam claro que o evento e benigno e nao falha do app. | Reexecutar abertura de livro que gera o aviso e revisar relatorio filtrado. |
| PBF-08 | Warnings de XML em TOC de EPUBs | Alguns EPUBs tem HTML/XML invalido no indice. | Melhorar tolerancia/sanitizacao se houver impacto real; caso contrario, classificar como warning benigno. | EPUB com TOC invalido continua abrindo e o warning fica contextualizado. | Teste com livro que gera `XML parsing error: OEBPS/toc01.html`. |
| PBF-09 | Checklist de regressao Android enxuto | A rodada longa validou muitos fluxos, mas repetir tudo sempre custa tempo. | Criar subconjunto smoke: abrir livro, indice, traducao, TTS nativo/premium, importacao, rotacao. | Smoke suite manual em 10-15 min com logs padronizados. | Novo checklist `android-smoke-checklist.md` ou secao no checklist atual. |

## Ordem recomendada de execucao

1. PBF-01 - logs para toques ignorados.
2. PBF-02 - revisar zona lateral direita.
3. PBF-03 - cache de TTS premium.
4. PBF-04 - logs de playback TTS.
5. PBF-05 - logs de aparencia.
6. PBF-06 - otimizacao de bundle/assets.
7. PBF-07/PBF-08 - classificacao de warnings benignos.
8. PBF-09 - checklist smoke Android.

## Notas de implementacao

- Nao registrar texto do livro, traducao, payloads brutos ou audio em logs.
- Preferir detalhes como tamanho do texto, indices, provider, status, duracao e motivo.
- Cada frente deve ter teste unitario quando tocar logica compartilhada.
- Reexecutar somente os AQAs afetados por cada frente para manter a rodada curta.
