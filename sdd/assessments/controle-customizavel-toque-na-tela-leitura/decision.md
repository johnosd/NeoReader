# Assessment Decision: Controle customizável de toque na tela de leitura

- **Slug**: controle-customizavel-toque-na-tela-leitura
- **Decidido**: 2026-09-10
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | adequate | Confirmado em código: `next()`/`prev()` (navegação de seção) existem na API imperativa de `EpubViewer.tsx` mas nenhuma zona de toque ou botão de chrome os aciona hoje — lacuna real, não suposição. |
| Força da evidência | adequate | Baseada em leitura direta do código (geometria de zona, dono do tap central, ausência de handler de long-press na borda esquerda), não em opinião. |
| Valor vs. custo de inação | adequate | Custo de inação objetivo é baixo (leitor funciona bem sem o gesto), mas o dono do produto confirmou explicitamente prioridade agora (2026-09-10) — em produto solo/early-stage, apetite confirmado do próprio stakeholder é evidência de valor válida, não precisa esperar demanda externa. |
| Viabilidade / apetite | strong | Escopo reduzido a um mapeamento fixo numa zona hoje livre (borda esquerda), reaproveitando `prev()`/lógica de zona existente — baixo blast radius. Apetite confirmado diretamente pelo usuário. |
| Fit estratégico | adequate | Alinha com "incentivar a leitura" sem competir com Word Lens — zona central e long-press seguem intocados por decisão explícita. |

Nenhum critério ficou `weak`/`unknown` — todos os críticos atingiram
`adequate`+, o que sustenta o `go`.

## Abordagens Candidatas

### 1. Gesto fixo mínimo — nova faixa na borda esquerda (recomendada)

- Nova zona de toque na borda esquerda da tela (hoje sem handler),
  chamando a navegação de seção já exposta em `EpubViewer.tsx`
  (`prev()`/equivalente). Zona central (Word Lens), long-press e a faixa
  direita existente (chrome) ficam intocados.
- Semântica exata do gesto **ainda não decidida** — ver Handoff abaixo.
- **Recomendada**: sim — menor blast radius, reaproveita infra e testes
  existentes, zona escolhida pelo usuário (borda esquerda, não a direita
  já ocupada pelo chrome).

### 2. Painel de customização completo (estilo Moon Reader)

- Réplica mais fiel da ideia original: tela de settings com grid de
  zonas, cada uma reatribuível pelo usuário.
- Descartada nesta rodada — custo/risco alto (geometria frágil de
  `flow=scrolled`, nova UI, semântica de "página" que não existe no modo
  scrolled) pra um valor ainda não comprovado em uso real.
- **Recomendada**: não — candidata a v2 depois que a Abordagem 1 provar
  utilidade.

## Veredito

Com a clarificação do usuário (2026-09-10: priorizar agora + zona =
borda esquerda), os dois pontos que travavam o scorecard em
`needs-clarification` (apetite e valor) resolveram. O único ponto ainda
aberto — qual das duas semânticas de gesto usar — não é mais uma
pergunta de *assessment* (não precisa de mais evidência/pesquisa): o
próprio usuário pediu pra decidir vendo as duas funcionando, o que é
trabalho de spec/protótipo, não de mais uma rodada de Discovery. Por
isso o veredito sobe pra `go`, carregando essa decisão explicitamente
no handoff.

### Se go — Handoff

- **Problema**: Não existe hoje nenhum gesto de toque pra navegar entre
  capítulos/seções no leitor — só scroll manual ou abrir a TOC. A API
  interna já suporta navegação de seção (`next()`/`prev()` em
  `EpubViewer.tsx`), só não está ligada a nenhum toque.
- **Abordagem recomendada**: Abordagem 1 — nova faixa de toque na borda
  esquerda da tela do leitor, reaproveitando a navegação de seção já
  existente e o padrão de zona geométrica já usado em
  `isVisibleChromeTapZone`/`isRightChromeTapZone`.
- **Escopo sugerido** (atualizado 2026-09-10, 2ª rodada de
  clarificação):
  - Entra: 1 zona nova (borda esquerda), mapeamento fixo (não
    customizável pelo usuário ainda), preservação total do toque em
    texto/tradução, chrome (topo/rodapé/direita), highlight, bookmark e
    tap durante TTS exatamente como hoje. **+ visualização read-only do
    mapa de zonas** (mostrar ao usuário, em algum lugar de Settings, o
    que cada zona faz hoje — sem editar).
  - Não entra: grid de 9 zonas, tela de **customização** (atribuir ação
    por zona), mudar a faixa direita, mudar `flow=scrolled` pra
    paginação, "Long Tap". O comportamento de auto-hide do chrome (menu
    sumindo sozinho após 2.5s) **saiu deste escopo** — está sendo
    tratado à parte via `sdd-bugfix` (correção rápida, não faz parte
    desta feature).
- **Decisão pendente para o `sdd-specify`/`sdd-plan`** (não é mais
  pergunta de Discovery): qual semântica a zona esquerda deve ter —
  (a) pular pro início do capítulo/seção anterior (`prev()` como já
  existe) ou (b) rolar ~90% da viewport pra trás, tipo "página" do Moon
  Reader. O usuário quer ver as duas funcionando antes de escolher —
  recomendo tratar isso como uma tarefa bem cedo em `sdd-plan`/
  `sdd-execute` (protótipo comparativo rápido no device real), não como
  decisão travada só no papel da spec.
- **Métricas de sucesso**: navegação funciona via toque na borda
  esquerda sem abrir chrome/TOC; suite `npm test` inteira segue verde
  (cobertura existente de tap: tradução inline, chrome-zone, bookmark,
  highlight, TTS-tap); toque em texto legível continua abrindo tradução
  inline em 100% dos casos testados manualmente no device real
  (RXCX103NMVZ), sem navegação acidental.
- **Perguntas em aberto pro sdd-specify**: além da semântica do gesto
  (acima), vale já perguntar ao usuário durante a entrevista se ele quer
  algum feedback visual momentâneo no toque da borda (ex: leve flash/
  indicador), já que o Moon Reader mostra um overlay durante a
  configuração — aqui seria só durante o uso real, não configuração.
