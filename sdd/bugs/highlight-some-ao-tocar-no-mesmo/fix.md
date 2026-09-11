# Bug Fix: Highlight some ao tocar no mesmo parágrafo pra abrir tradução

- **Slug**: highlight-some-ao-tocar-no-mesmo
- **Corrigido**: 2026-09-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Causa raiz real (confirmada lendo `node_modules/foliate-js/view.js`, não
só hipótese): `highlightSentenceInParagraph` usa `range.surroundContents(span)`
pra envolver a frase sendo traduzida — isso divide nós de texto e insere
um elemento novo no DOM, o que pode invalidar o caminho que o CFI de
OUTRO highlight da MESMA seção espera encontrar. Quando isso acontece,
`view.addAnnotation()` resolve normalmente (`{index, label}`), mas o
`anchor(doc)` interno (que resolve o CFI pra um Range de verdade) retorna
`null` — e como o código do vendor só emite `'draw-annotation'` dentro de
um `if (range) {...}`, **nada é emitido, sem erro nenhum**. O highlight
simplesmente para de existir visualmente. A correção evita qualquer
mutação de DOM ao traduzir quando a seção já tem highlights, caindo pro
fallback seguro (`.nr-hl`, só uma classe CSS no parágrafo, sem tocar na
árvore).

## Investigação (4 rodadas até a causa raiz real)

Esta foi uma investigação incomum — a 1ª causa raiz do `assessment.md`
(reflow por `padding` no wrapper) e as duas tentativas seguintes
(deduplicação de chamadas concorrentes) pareciam plausíveis e cada uma
foi validada com `npm test` limpo, mas nenhuma resolveu o sintoma real em
device. Documentado aqui por completo porque o raciocínio de cada rodada
(inclusive as erradas) é o que levou à causa raiz de verdade.

**1ª rodada** (`assessment.md`): hipótese de reflow por `padding` em
`.nr-hl-sentence`. Remediação: repintar a seção logo após
`highlightSentenceInParagraph`. **Resultado em device: "deu uma parte a
outra não"** — nem todos os highlights repintavam.

**2ª rodada**: log em device (`/android-debug`) mostrou um highlight
recém-criado falhando na pintura inicial E na retentativa de 300ms
(`handled=false` duas vezes). Hipótese: duas chamadas de `paintHighlight`
pro MESMO cfi, vindas de gatilhos diferentes (efeito `[highlights]` +
repintura da tradução), concorrentes, "roubando" o evento uma da outra.
Remediação: `paintHighlight` virou um wrapper que deduplica/encadeia
chamadas do MESMO cfi. **Resultado: "continua mesmo problema"**.

**3ª rodada**: nova captura de log mostrou 5 highlights da MESMA seção
todos chamando `addAnnotation` em rajada síncrona (o `for` de
`repaintHighlightsForSection` não esperava um terminar pra começar o
próximo) — 3 pintavam, 2 não, mesmo com CFIs DIFERENTES (não é o caso que
o dedupe da 2ª rodada cobria). Remediação: `repaintHighlightsForSection`
virou sequencial (`await` cada highlight antes do próximo), e depois uma
fila GLOBAL em `paintHighlight` (serializa TODAS as pinturas, de
qualquer cfi/seção/chamador). **Resultado: "continua mesmo problema"**
— mesmo com serialização estrita (uma pintura de cada vez, comprovado
pelos timestamps do log), highlights ISOLADOS (sem nenhuma outra pintura
concorrente) ainda falhavam, às vezes até na retentativa.

**4ª rodada (causa raiz real)**: como a serialização total não resolveu,
a hipótese de concorrência estava desde o início errada — o log mostrava
`addAnnotation resolveu` com `handled:false` mesmo em isolamento total.
Fui direto ao código-fonte do `foliate-js` (`node_modules/foliate-js/view.js`,
método `addAnnotation`, linhas ~415-427) em vez de continuar
hipotetizando a partir dos logs, e encontrei a causa exata: `anchor(doc)`
(a resolução do CFI contra o DOM ao vivo, via `CFI.toRange`) pode
retornar `null` sem lançar erro, e nesse caso o `'draw-annotation'`
simplesmente não é emitido. `surroundContents` (chamado pela tradução,
não relacionado a highlights) é exatamente o tipo de mutação que invalida
essa resolução — confirmando a hipótese original do `assessment.md`
sobre `surroundContents` "mutilar" CFIs vizinhos, só que o MECANISMO
(reflow visual) estava errado — o mecanismo real é resolução de CFI
falhando silenciosamente contra um DOM restruturado.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/reader/EpubViewer.tsx` | modified | `highlightSentenceInParagraph` ganhou um parâmetro `avoidDomMutation: boolean` — quando `true`, pula direto pro fallback `.nr-hl` (classe CSS, sem `surroundContents`), mesmo que a frase pudesse ser envolvida com segurança em outras circunstâncias. |
| `src/components/reader/EpubViewer.tsx` | modified | `selectTextForInlineTranslation` calcula `sectionHasHighlights` (`highlightsRef.current.some(h => h.sectionIndex === sectionIdx)`) e passa como `avoidDomMutation` — evita a mutação de DOM sempre que a seção atual já tem algum highlight, não só quando o parágrafo específico tem um. |
| `src/components/reader/EpubViewer.tsx` | revertido | As 3 tentativas de correção por concorrência (dedupe por cfi, `repaintHighlightsForSection` sequencial, fila global `paintQueueRef`) foram REVERTIDAS — não eram a causa raiz, só adicionavam complexidade sem resolver o sintoma. Código de volta ao estado original (pré-bugfix) nesse aspecto. |
| `src/components/reader/EpubViewer.tsx` | revertido | A chamada de `repaintHighlightsForSection` após `highlightSentenceInParagraph` (1ª rodada) foi REMOVIDA — não é mais necessária: evitando a mutação de DOM, não há mais nada pra "curar" via repintura. |

## Tests Added or Updated

- `src/__tests__/components/EpubViewer.test.tsx::T044` (reescrito) —
  com highlight existente na seção, tocar noutra parte do parágrafo pra
  traduzir NÃO cria um `<span class="nr-hl-sentence">` no DOM (usa
  `.nr-hl` no parágrafo em vez disso) — prova que a mutação de DOM é
  evitada quando há highlights.
- `T044b` (novo) — SEM highlight na seção, o mesmo toque AINDA usa
  `.nr-hl-sentence` (comportamento original preservado quando é seguro).
- `T032` (já existente) pegou uma regressão real durante a 2ª rodada
  (dedupe ingênuo ignorava cor nova do pedido seguinte) — ficou como
  timestamp histórico de que aquela tentativa tinha um bug próprio, além
  de não resolver a causa raiz.

## Local Verification

- `npx tsc --noEmit` → limpo.
- `npx vitest run src/__tests__/components/EpubViewer.test.tsx` → 122/122
  passando.
- `npm run lint` → limpo.
- `npm run build` → limpo.
- `npm test` (suíte completa) → 910 passando, 2 skipped pré-existentes
  (confirmado antes da 4ª rodada; rodando de novo agora).
- Checagem manual em device real (SM-S911B): as 3 primeiras rodadas
  foram testadas em device e reproduziram o sintoma de novo, cada uma
  com uma captura de log (`/android-debug`) que gerou a hipótese da
  rodada seguinte. A 4ª rodada (causa raiz real) ainda não foi validada
  em device — ver `test.md`.

## Deviations from Assessment

O `assessment.md` original já apontava `surroundContents`/mutilação de
CFI como um "fator agravante" possível, mas a remediação preferida
escolhida (repintar pra curar o reflow) mirava o fator ERRADO (reflow por
padding). A causa raiz real — `anchor(doc)` retornando `null`
silenciosamente — só foi confirmada lendo o código-fonte do vendor
diretamente (`foliate-js/view.js`), não só pelos logs da aplicação. A
correção final é BEM mais simples que as 3 tentativas anteriores: evitar
a mutação de DOM na origem, em vez de tentar detectar/curar o dano depois
que ele já aconteceu.

## Follow-ups

- Validação em device da 4ª rodada (causa raiz real) pendente — ver
  `test.md`.
- Efeito colateral aceito conscientemente: ao traduzir um parágrafo numa
  seção que JÁ TEM QUALQUER highlight (não necessariamente no MESMO
  parágrafo sendo traduzido), a tradução perde a precisão de destacar só
  a frase específica e usa o parágrafo inteiro (`.nr-hl`) — troca
  deliberada de uma UX levemente menos precisa por confiabilidade dos
  highlights existentes. Não registrado como bug novo; é a escolha de
  design desta correção.
