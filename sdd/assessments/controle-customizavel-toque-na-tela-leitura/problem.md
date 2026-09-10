# Assessment Problem: Controle customizável de toque na tela de leitura

- **Slug**: controle-customizavel-toque-na-tela-leitura
- **Criado**: 2026-09-10
- **Explora**: ./explora.md

## Problem Statement

Hoje o toque na tela do leitor tem comportamento fixo e implícito: fora da
zona central (que abre tradução inline / Word Lens), o único efeito
possível de um toque é mostrar/esconder o chrome. Não existe nenhum gesto
de toque para avançar/retroceder capítulo — a API interna já suporta isso
(`next()`/`prev()` em `EpubViewer.tsx`, que navegam seção/capítulo), mas
nenhuma zona de toque ou botão de chrome a aciona hoje. O usuário não tem
como ajustar esse comportamento às próprias preferências, ao contrário de
apps de referência como o Moon Reader.

## Usuários / Partes Afetadas

- **Usuário atual (dev/único usuário real em produção hoje)** — sente a
  falta diretamente ao comparar com Moon Reader; motivador direto do pedido.
- **Leitores que usam TOC/scroll pra navegar entre capítulos** — hoje
  precisam abrir o chrome ou rolar manualmente até o fim/início da seção;
  um gesto de toque rápido reduziria fricção sem mudar o modelo de leitura.
- **Usuários do Word Lens (tradução inline)** — são quem mais tem a perder
  se uma mudança de zonas de toque atropelar o toque em texto, que hoje
  dispara a feature central de aprendizado de inglês do app.

## Goals

- Oferecer navegação pra trás via uma **nova faixa de toque na borda
  esquerda da tela** (hoje sem handler nenhum — confirmado por busca em
  `EpubViewer.tsx`), sem exigir abrir o chrome ou a TOC. Decidido com o
  usuário em 2026-09-10: zona esquerda, não reaproveitar a faixa direita
  existente (que continua só alternando o chrome).
- **Atualizado em 2026-09-10 (2ª rodada de clarificação)**: expor uma
  **visualização read-only do mapa de toques** — todas as zonas ativas
  hoje (topo/rodapé/direita = chrome, centro = tradução Word Lens, nova
  borda esquerda = navegação) visíveis/documentadas em algum lugar
  acessível ao usuário (ex: tela de Settings), sem ainda permitir
  reatribuir ação por zona.
- Preservar 100% do comportamento atual de toque em texto (tradução
  inline) e nas zonas de chrome já existentes (topo/rodapé/direita) —
  essas não são renegociáveis nesta rodada.
- Reaproveitar a lógica de zona geométrica já existente
  (`isVisibleChromeTapZone`/`isRightChromeTapZone`) em vez de criar um
  sistema paralelo, dado o histórico de bugs de coordenada nessa área
  (fix mais recente da branch, `d8c25f2`).
- **Decisão em aberto explícita para o `sdd-specify`**: a semântica do
  gesto (pular capítulo/seção inteira via `prev()` já existente vs. rolar
  ~90% da viewport tipo "página") ficou sem escolha — o usuário pediu pra
  comparar as duas na prática antes de travar. Isso deve virar uma
  comparação rápida (protótipo/spike) no início do `sdd-plan`/`sdd-execute`,
  não mais uma rodada de assessment.

## Non-Goals

- Portar 1:1 o grid de 9 zonas configuráveis do Moon Reader nesta rodada
  — objeto de uma iteração futura, não do MVP.
- Mudar o modelo de leitura de `flow=scrolled` pra paginação real — fora
  de escopo, é uma decisão arquitetural maior (candidata a ADR própria,
  não a essa feature).
- Tela de customização completa (usuário reatribuindo cada zona
  livremente) nesta rodada — nesta primeira versão o mapeamento é fixo
  (só a borda esquerda ganha um gesto novo); a visualização do mapa
  (goal acima) é read-only, **atribuir ações por zona fica pra depois**
  de validar uso real (confirmado explicitamente com o usuário em
  2026-09-10, 2ª rodada).
- Toque na borda direita continua exclusivamente alternando o chrome —
  não vira zona de navegação nesta rodada (decidido com o usuário).
- Ações adicionais tipo "Long Tap" (seleção de texto, TTS) — gesto hoje
  sem handler, mas fora do escopo desta ideia específica.

## Success Metrics

- Navegar pro capítulo seguinte/anterior via toque funciona em pelo menos
  1 zona da tela, sem precisar abrir chrome ou TOC.
- Nenhuma regressão nos testes existentes de tap (tradução inline,
  chrome-zone, bookmark, highlight, TTS-tap) — suite `npm test` some
  verde antes de considerar a mudança pronta.
- Toque em texto legível continua abrindo tradução inline em 100% dos
  casos testados manualmente no device real (RXCX103NMVZ), sem
  navegação acidental de capítulo.

## Cost of Inaction

Baixo a moderado: a leitura funciona hoje sem esse gesto — não é um bug,
é uma lacuna de ergonomia/paridade competitiva. Custo de não fazer é
perder uma pequena melhoria de fluidez de navegação (usuário continua
usando scroll manual + TOC), não uma quebra de experiência. Não há
evidência de demanda de outros usuários além do próprio solicitante —
isso pesa contra tratar como prioridade alta.
