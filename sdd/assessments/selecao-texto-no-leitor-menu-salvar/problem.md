# Assessment Problem: Seleção de texto no leitor com menu "salvar trecho"

- **Slug**: selecao-texto-no-leitor-menu-salvar
- **Criado**: 2026-09-05
- **Explora**: ./explora.md

## Problem Statement

No leitor do NeoReader, a menor unidade de texto que o usuário consegue salvar é
o **parágrafo inteiro** (ação `Marcador` do bloco de tradução inline) ou a
**frase que ele tocou** (ação `Salvar`, que vai pro vocabulário). Não existe
nenhuma forma de capturar um trecho **arbitrário** — meia frase, duas linhas de
um parágrafo longo, uma citação que atravessa duas frases — que é justamente o
recorte que o leitor quer guardar quando algo lhe chama atenção.

## Usuários / Partes Afetadas

- **Leitor que coleciona citações** — quer guardar a frase exata, não o parágrafo
  de 8 linhas em volta dela. Hoje salva o bloco inteiro e o recorte se perde na
  lista de marcadores.
- **Leitor aprendendo inglês** (público central do produto) — quer guardar uma
  construção ou expressão de várias palavras. O `Salvar` atual manda a frase
  inteira detectada pelo clique pro vocabulário, sem controle sobre os limites.
- **Usuário vindo de Kindle / Play Books / Apple Books** — long-press para
  selecionar é gesto aprendido. Hoje o gesto ou não faz nada de útil, ou levanta o
  menu nativo do Android (Copiar / Compartilhar), que é estranho ao app.
- **Quem mantém o leitor (o próprio dev)** — o roteamento de toque do
  `EpubViewer` é o ponto mais denso do código; qualquer gesto novo entra ali e
  aumenta o risco de regressão no fluxo de tradução que hoje funciona.

## Goals

- Long-press sobre o texto inicia seleção; arrastar estende; soltar mantém a
  seleção visível.
- Ao terminar a seleção, abrir um **menu próprio do NeoReader** (não o do
  Android) com a ação **salvar trecho**.
- **Preservar integralmente** o tap rápido no parágrafo: continua abrindo o
  fluxo de tradução inline com as ações atuais, sem atraso perceptível
  introduzido pela detecção de long-press.
- O trecho salvo guarda um CFI de **intervalo** (não colapsado), de modo que a
  posição exata seja recuperável depois — não só o texto solto.
- O usuário consegue **ver depois** o que salvou, numa superfície já existente ou
  nova (ver Pergunta em aberto no `explora.md`).
- Funcionar no Android (alvo primário) e degradar de forma sã na web.

## Non-Goals

- **Grifo persistente renderizado no texto** (overlayer do foliate, cores de
  destaque, editar/apagar grifo pelo texto) — só o registro salvo nesta rodada.
- **Notas/anotações escritas** sobre o trecho.
- **Compartilhar / copiar / traduzir o trecho** a partir do menu novo — o usuário
  pediu explicitamente "inicialmente com opção de salvar".
- **Seleção atravessando capítulos** (documentos/iframes diferentes) — cada
  seção do EPUB é um iframe próprio; seleção fica contida em uma seção.
- **Modo paginado** — o leitor roda em `flow=scrolled`; nada de auto page-turn
  por canto durante a seleção.
- **Sync do trecho no Google Drive**, caso o modelo de dados escolhido não o
  herde de graça de `bookmarks`.
- Reescrever o roteamento de toque do `EpubViewer` — a feature entra no fluxo
  existente, não o refatora.

## Success Metrics

- Long-press + arrasto seleciona texto e abre o menu NeoReader em **≥ 9 de 10**
  tentativas em device real (RXCX103NMVZ), sem o menu nativo do Android aparecer
  por cima.
- **Zero regressão** no tap rápido: os ramos de guarda atuais do listener de
  `click` ([EpubViewer.tsx:2966](src/components/reader/EpubViewer.tsx#L2966))
  continuam passando nos testes existentes, e o tap de tradução dispara em ≤ 1
  tentativa no device.
- Um trecho salvo é recuperável: reabrir o livro e localizar o registro pelo CFI
  de intervalo gravado (verificável em teste, sem depender de UI de grifo).
- Scroll com o dedo sobre o texto **não** dispara seleção (o `didScroll` /
  `TAP_SLOP_PX` continua vencendo o long-press).
- `npm run lint && npm test && npm run build` limpos.

## Cost of Inaction

Baixo-a-médio e sem prazo. O app não quebra e já oferece dois caminhos parciais
(marcador de parágrafo, salvar frase no vocabulário) — ninguém fica sem conseguir
guardar texto, só sem conseguir guardar **o recorte certo**. O custo real é de
percepção: um leitor que veio do Kindle tenta long-press, recebe o menu cinza do
Android (Copiar / Compartilhar / Selecionar tudo) e lê isso como app inacabado.
Enquanto isso não for feito, o gesto mais universal de leitor digital continua
sendo um buraco visível no NeoReader.
