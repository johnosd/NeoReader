# Assessment Explora: Controle customizável de toque na tela de leitura

- **Slug**: controle-customizavel-toque-na-tela-leitura
- **Criado**: 2026-09-10
- **Origem**: usuário trouxe 2 screenshots do Moon Reader ("Screen Touch Control")

## Ideia Bruta

Moon Reader tem uma tela de configuração ("Screen Touch Control") que mapeia
zonas de toque da tela pra ações do leitor:
- "Tap Screen Left" → Page Up, "Tap Screen Right" → Page Down (dropdowns
  configuráveis)
- Um seletor de layout de zonas (grid 9 quadrados, várias variações
  pré-definidas: 3 colunas, T invertido, cruz, etc.)
- "Long Tap On Screen" → ação separada (no exemplo, "Text Selection")
- Overlay visual mostra as zonas ativas sobre a página real durante a
  configuração (`Page Up` / `Options` / `Page Down` sobre a capa do livro)

O usuário quer avaliar se dá pra trazer esse nível de controle pro NeoReader
sem quebrar a experiência de leitura atual.

## Evidência a Favor

- O padrão de "tap zones" configuráveis é comprovado no mercado — Moon
  Reader é um leitor EPUB maduro e essa tela existe há anos nele
  (precedente direto, é o próprio exemplo trazido pelo usuário).
- NeoReader já tem uma *lógica* de zonas de toque, só que fixa e não
  exposta ao usuário: `isVisibleChromeTapZone` / `isRightChromeTapZone`
  em `src/components/reader/EpubViewer.tsx:346-386` reservam margem
  superior/inferior (`TOP_CHROME_TAP_ZONE_PX` / `BOTTOM_CHROME_TAP_ZONE_PX`,
  limitadas por `CHROME_TAP_ZONE_MAX_VIEWPORT_RATIO`) e uma faixa direita
  (~14% da largura, entre `RIGHT_CHROME_TAP_ZONE_MIN_PX` e `_MAX_PX`) pra
  alternar o chrome (barra de topo/rodapé). Ou seja, o conceito de "zona
  geométrica com comportamento próprio" já existe na engine — não seria
  construído do zero.
- Existe tela de Settings dedicada à aparência do leitor
  (`src/screens/SettingsAppearanceScreen.tsx`), então já há um lugar
  natural na arquitetura pra hospedar preferências de leitura — o padrão
  de "settings screen dedicada" é conhecido no projeto.
- "Long tap" hoje **não tem nenhum handler** no leitor (busquei
  `longpress`/`touchstart+setTimeout` em `EpubViewer.tsx` e não encontrei
  nada) — é gesto livre, sem conflito com comportamento existente.

## Evidência Contra

- **Conflito de paradigma central**: Moon Reader (e o modelo "Page
  Up/Page Down") assume paginação discreta. NeoReader roda o leitor
  **exclusivamente em `flow=scrolled`** (`EpubViewer.tsx:4040`,
  confirmado também no `CLAUDE.md`) — rolagem contínua, sem conceito de
  "página". Portar a ideia 1:1 (setas Page Up/Down mapeadas em zonas)
  não faz sentido semântico aqui; teria que ser reinterpretado como
  scroll/avanço de seção, não paginação.
- **A zona central já tem dono, e é o coração do produto**: tap num
  parágrafo hoje dispara o fluxo de tradução inline / Word Lens
  (`EpubViewer.tsx:3976-3999`, toggle de `data-nr-active` e
  `selectTextForInlineTranslation`) — a feature que sustenta o
  posicionamento "facilitar aprendizado de inglês" do app. Qualquer
  grid de zonas customizável precisa decidir explicitamente: o toque no
  texto continua abrindo tradução (não pode virar "page down" por
  engano), ou o usuário perde a feature de tradução ao customizar
  zonas. Isso não é um detalhe de UI, é uma decisão de produto.
- **Geometria de zona já é uma área frágil e foi mexida ontem**: o
  commit mais recente da branch atual (`d8c25f2`, HEAD) é justamente
  "fix: corrige zona de chrome usando altura errada do iframe da
  seção" — o comentário em `EpubViewer.tsx:355-361` explica que em
  `flow=scrolled` cada seção é um iframe do tamanho do próprio
  conteúdo, então `clientY` de um clique é relativo ao documento inteiro
  (milhares de px), não à tela física, exigindo conversão via posição do
  iframe no container. Qualquer sistema de zonas customizável herda essa
  mesma armadilha de coordenadas — não é geometria trivial de portar, e
  memória de sessões anteriores já registra isso como ponto sensível
  (`feedback_reader_tap_zone_coordinates`).
- **Outros comportamentos já competem pelo toque na tela hoje**: highlight
  de Word Lens abre menu próprio, toque em imagem abre viewer, toque em
  ícone de bookmark, TTS ativo redireciona tap pra navegação de
  parágrafo do áudio, chrome aberto fecha no toque. Um grid de zonas
  configurável pelo usuário teria que respeitar (ou explicitamente
  substituir) todos esses casos — superfície de regressão real, não só
  teórica.
- ASSUMPTION: não há sinal de demanda de usuários reais do NeoReader
  pedindo isso — a ideia partiu de comparação com outro app, não de
  feedback direto coletado. Vale validar se isso é uma dor sentida hoje
  ou uma feature "nice to have por paridade".

## Perguntas em Aberto

- Em `flow=scrolled`, o que "Page Up"/"Page Down" deveriam significar de
  fato — scroll de N% da viewport? Pular pra seção anterior/próxima?
  Repetir o comportamento do botão de navegação já existente (se houver)?
- O toque no texto (tradução inline) fica **fora** do grid customizável
  por padrão (zona reservada, não sobrescrevível), ou o usuário pode
  remapear até isso?
- Existe algum atalho/gesto físico já pedido por usuários (ex: volume
  buttons, edge swipe) que resolveria parte da dor sem mexer em toque
  na área de texto?
- Qual o menor subconjunto da ideia do Moon Reader que já resolveria a
  dor do usuário sem precisar de UI de customização completa (ex: só
  expor a faixa direita/esquerda pra "próxima seção" sem grid 9
  quadrados)?
