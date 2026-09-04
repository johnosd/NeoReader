# Assessment Decision: foliate-js não libera capítulos lidos do DOM/memória

- **Slug**: foliate-js-nao-libera-capitulos-lidos-dommemoria
- **Decidido**: 2026-09-04
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Confirmado por leitura direta do vendor code, não hipótese: `view.close()` (`view.js:299-311`) nunca chama `book.destroy()` (`epub.js:1220-1222`), que existe justamente para revogar blob URLs acumulados (`epub.js:1015-1017`). Reproduzível em toda troca de livro, não só sessão longa. |
| Força da evidência | adequate | Código-fonte da lib e do call site (`EpubViewer.tsx:3255-3259`) confirmam o gap com precisão de linha. `unknown`: nenhuma medição de memória local (antes/depois) quantifica o impacto em MB — mas o fix candidato é barato o suficiente para não depender dessa medição para ser justificado. |
| Valor vs. custo de inação | adequate | Custo de inação é baixo (sem prazo, sem reclamação de usuário, sem regressão visível), mas o custo do fix candidato (chamar `book.destroy()`) é ainda menor — poucas linhas, sem novo padrão, resolve um vazamento incondicional real. Valor > custo mesmo com urgência baixa. |
| Viabilidade / apetite | strong | Sem dependência nova, sem fork de vendor lib, usa API pública já exposta (`view.book`). Escopo do `go` foi deliberadamente restrito à abordagem segura (Non-Goals exclui o patch arriscado de `#trimDistantViews`). |
| Fit estratégico | adequate | Alinhado com o follow-up já registrado no backlog a partir da investigação do bug de memória do Play Console; não é prioridade declarada do usuário, mas é baixo custo e reduz risco técnico já mapeado. |

## Abordagens Candidatas

### 1. Chamar `view.book?.destroy?.()` no cleanup de `EpubViewer.tsx`

- Adicionar a chamada perto de `EpubViewer.tsx:3257`, antes/junto de `view?.close()`, cobrindo troca de livro e desmonte do leitor. Revoga blob URLs acumulados via `EPUB#destroy()` → `Loader#destroy()`.
- **Recomendada**: sim — evidência forte de que fecha um gap real e incondicional da própria lib, custo de implementação e risco mínimos, não toca vendor code.

### 2. Patchar `#trimDistantViews` para evictar views também para trás do capítulo primário

- Mudaria o comportamento intencional da lib para liberar DOM/memória de capítulos já lidos em sessões longas de scroll contínuo.
- **Recomendada**: não, nesta rodada — o próprio comentário no vendor code alerta que isso quebraria a posição de scroll; sem medição que comprove que o ganho de memória supera esse risco de regressão de UX. Fica registrado como Non-Goal explícito em `problem.md`, não descartado para sempre.

### 3. Chamar `view.book?.destroy?.()` **e** adicionar rede de segurança adicional (ex.: `document.body.replaceChildren()` ou reload forçado do WebView em `onTrimMemory` nativo)

- Combinaria o fix da Abordagem 1 com uma mitigação mais agressiva no lado nativo Android.
- **Recomendada**: não — expande escopo sem evidência de que a Abordagem 1 sozinha seja insuficiente; risco de over-engineering para um problema de custo de inação baixo.

## Veredito

`go`, com escopo estreito: apenas a Abordagem 1. O problema é válido e verificado por leitura direta de código (não hipótese), a evidência é suficiente para o tamanho do fix proposto (poucas linhas, sem vendor patch, sem dependência nova), e o valor supera o custo mesmo com prioridade baixa — não há critério central em `weak`/`unknown` que bloqueie o `go`. A Abordagem 2 (patch arriscado) fica fora do escopo do `go` — registrada como Non-Goal, não como parte da entrega.

### Se go — Handoff

- **Problema**: `view.close()` do `foliate-js` nunca chama `book.destroy()`, vazando blob URLs (imagens/fontes/CSS do EPUB) a cada troca de livro ou saída do leitor — incondicional, não depende de sessão longa.
- **Abordagem recomendada**: chamar `view.book?.destroy?.()` no cleanup de `EpubViewer.tsx` (perto da linha 3257), antes/junto de `view?.close()`, cobrindo troca de livro (efeito reexecuta por `bookId`) e desmonte do componente.
- **Escopo sugerido**: só essa chamada + teste cobrindo troca de livro e desmonte. Fora de escopo: patch em `#trimDistantViews` (Non-Goal), qualquer mudança em vendor code (`node_modules/foliate-js`), qualquer mudança nativa Android.
- **Métricas de sucesso**: chamada presente e testada (unit/mock do `View`); validação manual opcional via DevTools Memory/`dumpsys meminfo` mostrando queda de blob URLs retidos após trocas de livro repetidas; suíte completa (`npm run lint && npm test && npm run build`) limpa.
- **Perguntas em aberto pro sdd-specify**: nenhuma bloqueante. Only decidir, na fase de spec/plan, se a validação manual com profiler entra como task obrigatória ou fica como nice-to-have dado o custo de inação baixo.
