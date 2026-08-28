# Research: Biblioteca de Domínio Público (Standard Ebooks)

Fase 0 do `sdd-plan`. Cobre só as incertezas técnicas genuínas encontradas
durante a exploração — não repete decisões já fechadas em `problem.md`/
`decision.md` (fase de assessment).

## 1. Formato real da URL de download do Standard Ebooks

**Decisão**: a URL de download precisa do parâmetro `?source=download` pra
retornar o binário do EPUB. Sem ele, o servidor devolve uma página HTML
interstitial ("Your Download Has Started!") com um `<meta http-equiv="refresh">`
pro mesmo caminho + `?source=download` — comportamento pensado pra navegador
(que segue o refresh automaticamente), não pra um client HTTP puro como o
`CapacitorHttp`.

- Confirmado ao vivo: `GET .../downloads/<author>_<title>.epub?source=download`
  devolve `Content-Type: application/epub+zip`, `Content-Disposition:
  attachment`, corpo começando com `PK\x03\x04` (assinatura ZIP/EPUB válida).
- Sem o parâmetro, a mesma URL devolve `Content-Type: application/xhtml+xml`
  (a página interstitial, ~8KB) — se o app salvasse isso como se fosse o
  EPUB, o import falharia silenciosamente ao tentar parsear um HTML como
  EPUB.

**Alternativas consideradas**: seguir o `meta refresh` manualmente (parsear
o HTML e extrair a URL de destino) — descartada por ser desnecessária, já
que o parâmetro `?source=download` é estável e direto.

## 2. CORS no endpoint de download

**Decisão**: não é um bloqueio, mas não muda o escopo desta feature.

O endpoint de download real (`.../downloads/*.epub?source=download`) responde
`Access-Control-Allow-Origin: *` — ou seja, tecnicamente nem precisaria do
`CapacitorHttp` pra contornar CORS (diferente do Gutendex, que foi o motivo
original da restrição a Android nativo na fase de assessment). Isso **não**
reabre a build Web nesta feature — `spec.md` já fechou "Web fica de fora"
como Non-Goal explícito após decisão deliberada do usuário — mas registra
que o bloqueio técnico que motivou essa decisão não se aplica à fonte
finalmente escolhida (Standard Ebooks). Fica documentado aqui como
informação útil pra uma eventual fase 2 (Web), não como mudança de escopo
desta fase.

## 3. Robots.txt e comportamento antibot do Standard Ebooks

**Decisão**: nenhuma automação (script de build, scraper) deve acessar
`standardebooks.org/ebooks/*/downloads/*` ou `/ebooks/*/text*` programaticamente.
A curadoria do catálogo é 100% manual (humano navegando o site e copiando
título/autor/slugs) — não um script de scraping.

- O `robots.txt` deles bloqueia explicitamente agentes de IA nomeados
  (incluindo `claude-user`, `claude-web`, `chatgpt-user`, além de bots de
  SEO) de `/ebooks/*/downloads/*` e `/ebooks/*/text*`. Não bloqueia
  `User-agent: *` genericamente desses caminhos — ou seja, o app em si
  (ação pontual disparada por um usuário humano tocando "baixar") não é o
  alvo dessa regra; ela mira scraping automatizado em massa por IA, não
  download individual sob demanda por um app leitor.
- Existe um honeypot ativo (`/honeypot`, link oculto que bane o IP por 24h
  se seguido) — sinal de defesa antibot real, reforça por que nenhuma
  automação deve varrer o site.
- **Implicação de design**: descarta a ideia (levantada informalmente na
  fase de assessment) de um script de build que faz scraping periódico do
  site pra montar/atualizar o catálogo. O catálogo (`catalog.json`) é
  escrito e mantido à mão.

## 4. Progresso de download via CapacitorHttp

**Decisão**: indicador de progresso **indeterminado** (spinner + estado
"baixando"), não uma barra percentual.

`CapacitorHttp.request()` é uma chamada promise-based de tiro único, sem
callback de progresso por bytes exposto de forma confiável nesta versão do
Capacitor — diferente de uma API tipo `XMLHttpRequest.onprogress`. Dado que
os arquivos do Standard Ebooks são pequenos (~800KB pro exemplo testado,
Pride and Prejudice), o download é rápido em qualquer conexão razoável —
uma barra percentual seria complexidade desproporcional ao ganho de UX.
FR-004 ("indicador de progresso") é satisfeito por um estado visual
claro (spinner + texto), sem exigir progresso byte-a-byte.

**Alternativas consideradas**: usar `@capacitor/filesystem`'s `Http.downloadFile`
(que tem suporte a evento de progresso em algumas versões) — descartada
para o MVP: adicionaria uma dependência/API nova só pra uma barra percentual
sem valor claro em arquivos deste tamanho.

## 5. Capas do catálogo (antes do download)

**Decisão**: capas de exibição no grid carregam sob demanda da URL remota
do Standard Ebooks (`.../downloads/cover.jpg`, mesmo padrão previsível do
EPUB), com fallback visual gracioso quando indisponível/offline — não são
bundled localmente no app.

Justificativa: mesmo padrão já usado em `NytBookCard.tsx` (`book.book_image`
carregado via `<img loading="lazy">` com fallback quando ausente) — reuso
direto de um padrão já testado no repositório, em vez de introduzir um
pipeline de bundling de imagens (que também exigiria baixar/redimensionar
dezenas de arquivos do site deles pra empacotar no app, esforço de
build/manutenção desproporcional ao MVP). Título/autor (texto) continuam
disponíveis offline via `catalog.json` bundled — só a imagem de capa exige
rede, com fallback claro quando ausente (FR-009 cobre a lista em si, não a
imagem).
