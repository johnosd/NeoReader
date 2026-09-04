# Assessment Explora: foliate-js não libera capítulos lidos do DOM/memória

- **Slug**: foliate-js-nao-libera-capitulos-lidos-dommemoria
- **Criado**: 2026-09-04
- **Origem**: ideia do backlog (`.planning/backlog.md` → "Ideias Futuras"), originada da investigação do bug `alerta-play-console-uso-memoria-acima` (2026-09-01), explicitamente fora de escopo daquele fix.

## Ideia Bruta

Em modo scroll contínuo (`flow=scrolled`), o `foliate-js` nunca libera capítulos já lidos do DOM/memória durante uma sessão de leitura longa. `#trimDistantViews` só evicta seções à **frente** do capítulo primário, nunca para trás — por design da lib, para não quebrar a posição de scroll. Duas abordagens candidatas levantadas no backlog: (1) patchar `#trimDistantViews` para evictar também pra trás (arriscado), ou (2) chamar `view.book?.destroy?.()` como rede de segurança ao trocar de livro/sair do leitor (mais seguro, mitigação parcial).

## Evidência a Favor

- **Confirmado por leitura direta do vendor code** (`node_modules/foliate-js/paginator.js:1977-1992`): `#trimDistantViews()` itera `this.#sortedViews` e faz `continue` para todo `index <= this.#primaryIndex`, só destruindo views com `offset - viewportEnd > maxDistance` (10 páginas) **depois** do índice primário. O comentário no próprio código confirma a intenção: *"Only removes views AFTER the primary — removing views before would shift scroll position."* Não é uma hipótese — é comportamento documentado e intencional da lib.
- **Achado novo, mais forte que a formulação original do backlog**: `view.close()` (`node_modules/foliate-js/view.js:299-311`, chamado em `EpubViewer.tsx:3257` a cada troca de livro/desmonte do leitor) chama `this.renderer?.destroy()` e `this.renderer?.remove()`, mas **nunca** chama `this.book?.destroy?.()`. O objeto `book` (classe `EPUB`, `node_modules/foliate-js/epub.js:1220-1222`) tem seu próprio `destroy()` que delega a `this.#loader?.destroy()` (`epub.js:1015-1017`), o qual revoga **todos** os `URL.createObjectURL` acumulados em `this.#cache` (imagens, fontes, CSS e outros recursos do EPUB carregados via `loadItem`/`loadBlob` ao longo da sessão).
- Isso significa que o vazamento de blob URLs **não depende de sessão longa em scroll contínuo** — acontece em **toda** troca de livro ou saída do leitor, já que `EpubViewer.tsx` cria um `<foliate-view>` novo por livro (`EpubViewer.tsx:2898-2901`) e nunca reaproveita a instância. É um vazamento incondicional, mais fácil de disparar do que o cenário original ("ler um livro do início ao fim numa sessão só").
- `view.book?.destroy?.()` como chamada extra no cleanup de `EpubViewer.tsx` (perto da linha 3257, antes de `view?.close()`) é uma mudança pequena, isolada, sem tocar em vendor code — usa exatamente o mecanismo de patch de vendor lib sem fork já em uso no projeto (`vite.config.ts`, plugin `harden-foliate-iframe-sandbox`), mas nem precisa de patch: é chamada de API pública já exposta (`view.book`), só não usada hoje.
- O bug de memória do Play Console (`sdd/bugs/alerta-play-console-uso-memoria-acima/`) já documentou 4 mecanismos relacionados e os corrigiu (commit `06ddc5a`, verificado em device real 2026-09-01) — mas excluiu este item explicitamente do escopo, deixando-o pendente no backlog.

## Evidência Contra

- Nenhuma medição local de memória (antes/depois) foi feita para nenhuma das duas abordagens — o tamanho real do vazamento de blob URL por livro (tipicamente poucas imagens por capítulo de EPUB) não foi quantificado. Pode ser pequeno o suficiente para não mover a agulha do P90 do Play Console sozinho.
- O bug original do Play Console já foi marcado `verified`/`Concluído` em 2026-09-01 sem este item — ou seja, o time já decidiu explicitamente que os 4 fixes aplicados eram suficientes para o escopo daquele bug. Isso é sinal de prioridade baixa, não de bug crítico pendente.
- Não há enforcement real do Google até fevereiro de 2027 (ASSUMPTION herdada do assessment original, não re-verificada nesta rodada) — sem pressão de prazo.
- Não há reclamação de usuário associada; a origem é 100% investigação interna/proativa, não sintoma reportado.
- A abordagem 1 (patchar `#trimDistantViews` para evictar pra trás) é, pela leitura do código, genuinamente arriscada — o próprio comentário da lib explica que romperia a posição de scroll. Não há evidência de que valha revisitar essa abordagem; a evidência nova reforça que a abordagem 2 (`book.destroy()`) já é suficiente para o vazamento mais fácil de disparar (blob URLs), deixando a eviction "pra trás" das views DOM como um problema separado e de escopo muito mais estreito (só sessões muito longas em um único livro).

## Perguntas em Aberto

- Vale medir localmente (Chrome DevTools Memory profiler / `dumpsys meminfo`) o tamanho real do vazamento de blob URL por sessão de leitura antes de priorizar, ou o fix é barato/seguro o suficiente para entrar sem essa medição prévia?
- O escopo desta ideia deve cobrir só o `book.destroy()` (fix pequeno, seguro, endereça o vazamento incondicional) ou também tentar mitigar a eviction "pra trás" das views DOM em sessões muito longas (mais arriscado, afeta scroll)?
