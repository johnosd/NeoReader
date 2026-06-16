# Plano: beneficios Pro e quotas Free

## Resumo

Alinhar a estrategia Pro para cobrar por cloud sync, falar com o livro,
remocao de ads e uso ilimitado de Review/Author/Descubra. O Free continua
forte: leitura, biblioteca, bookmarks locais, notas/highlights futuros,
exportacao e estatisticas avancadas continuam no roadmap gratuito.

## Fase 0 - Planned Benefits no app

- [x] Atualizar a lista `Planned benefits` do paywall.
- [x] Manter `Sem anuncios` como beneficio Pro.
- [x] Manter `Bookmarks na nuvem` como beneficio Pro.
- [x] Manter `Falar com o livro` como beneficio Pro futuro.
- [x] Adicionar `Reviews, autores e Descubra sem limites` como beneficio Pro futuro.
- [x] Atualizar traducoes PT-BR, EN e ES.
- [x] Garantir que beneficios ainda nao implementados aparecam como `Em breve`.
- [x] Nao ativar compra nem fluxo RevenueCat nesta fase.

## Fase 1 - Documentacao de estrategia

- [x] Atualizar `README.md` com proximos passos Free: notas/highlights avancados,
  exportacao Markdown/CSV e estatisticas avancadas de leitura.
- [x] Registrar que busca em todos os livros nao entra no roadmap.
- [x] Registrar que colecoes inteligentes nao entram no roadmap.
- [x] Atualizar `docs/monetization-status.md` para refletir a nova estrategia Pro.
- [x] Documentar que Review/Author/NYT deixam de ser totalmente free no futuro,
  mas continuam acessiveis com limite mensal.

## Fase 2 - Modelo de quota Free

- [x] Criar modelo de quota mensal para usuarios Free.
- [x] Definir quota `book-intelligence`: 5 livros/mes para Review + Author.
- [x] Definir quota `nyt-discovery`: 5 atualizacoes/mes para Descubra/NYT.
- [x] Garantir que usuario Pro nao consome quota.
- [x] Garantir que cache valido nao consome quota.
- [x] Persistir quota localmente na primeira versao.
- [x] Documentar no codigo que enforcement local pode ser contornado.
- [x] Planejar backend/Firebase apenas se abuso virar problema real.

## Fase 3 - Gate de Review/Author

- [x] Antes de buscar dados externos de Review/Author, verificar se existe cache local.
- [x] Se houver cache, liberar visualizacao sem consumir quota.
- [x] Se nao houver cache e o usuario for Free, consumir 1 uso de `book-intelligence`.
- [x] Se a quota Free acabou, mostrar estado bloqueado com CTA para Pro.
- [x] Usuario Pro acessa sem limite.
- [x] Nao apagar dados ja cacheados ao usuario perder Pro.

## Fase 4 - Gate de Descubra/NYT

- [x] Antes de chamar NYT API, verificar cache local valido.
- [x] Se houver cache, liberar sem consumir quota.
- [x] Se nao houver cache e o usuario for Free, consumir 1 uso de `nyt-discovery`.
- [x] Uma atualizacao da tela Descubra deve contar como 1 uso, mesmo carregando
  multiplas listas internas.
- [x] Se a quota Free acabou, mostrar dados cacheados quando existirem ou CTA
  para Pro quando nao existirem.
- [x] Usuario Pro atualiza sem limite.

## Fase 5 - UX e mensagens

- [x] Mostrar contador discreto: usos restantes no mes.
- [x] Explicar que dados ja carregados continuam disponiveis.
- [x] Evitar linguagem punitiva no bloqueio.
- [x] Paywall deve vender uso ilimitado, nao acesso basico.
- [x] Settings deve mostrar status Pro/Free e, se util, quotas restantes.

## Fase 6 - Testes

- [x] Testar que cache de Review/Author nao consome quota.
- [x] Testar que livro novo consome 1 quota de `book-intelligence`.
- [x] Testar bloqueio apos 5 livros no mes.
- [x] Testar que Pro ignora quota.
- [x] Testar que NYT em cache nao consome quota.
- [x] Testar que atualizacao NYT sem cache consome 1 quota.
- [x] Testar reset mensal da quota.
- [x] Testar regressao: notas, bookmarks locais, leitura e biblioteca continuam Free.

## Assumptions

- A primeira versao da quota sera local-first.
- Compra Pro continua desativada ate o fluxo RevenueCat ser reativado.
- Recursos ja cacheados continuam visiveis para Free.
- Notas/highlights, exportacao Markdown/CSV e estatisticas avancadas serao
  planejados como Free.
