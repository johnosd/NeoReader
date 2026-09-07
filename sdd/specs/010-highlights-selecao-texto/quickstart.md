# Fase 1 — Quickstart: verificação manual dos highlights

**Slug**: `010-highlights-selecao-texto` | **Data**: 2026-09-06

A constitution do projeto exige testar o fluxo principal e os edge cases **num
device real** antes de reportar a tarefa como concluída — testes automatizados
verificam corretude de código, não de feature. Este roteiro é essa verificação.

## Pré-requisitos

- Device Android conectado (`adb devices` deve listar `RXCX103NMVZ`).
- Um EPUB em inglês na biblioteca, com pelo menos dois capítulos e parágrafos
  longos.
- Pelo menos **uma palavra já salva no vocabulário** desse livro — necessária
  para exercitar R-001 (CFI convivendo com os `<span class="nr-vocab">`).

## Checagens automatizadas (antes de subir pro device)

```powershell
npm run lint
npm test
npm run build
```

Os três precisam passar. `npm run build` é a definição de "pronto" pela
constitution (Princípio IV).

## Subir no device

```powershell
npm run android:run
```

## Passo 0 — Validar a premissa antes de tudo (bloqueante)

Feito **antes** de escrever o gesto (task T010). Com o app na versão atual, sem
nenhuma mudança desta feature:

1. Abrir um livro, manter o dedo sobre uma palavra por ~1 segundo.
2. Anotar: **a seleção nativa aparece?** Aparecem alças arrastáveis? Aparece a
   barra do sistema (Copiar / Compartilhar / Selecionar tudo)?
3. Soltar e tocar em outro lugar para dispensar a seleção. Anotar: **esse toque
   de dispensa abriu a tradução inline?**

Resultado esperado (premissa da spec): seleção nativa funciona; a barra do
sistema aparece; o toque de dispensa pode ou não vazar para a tradução.

**Se a seleção nativa não funcionar**, a Abordagem 1 caiu — parar e reabrir o
design com a Abordagem 3 do assessment (modo de seleção explícito por botão),
que muda a User Story 1.

## Passo 1 — US1: criar highlight e reencontrá-lo

| # | Ação | Esperado |
| --- | --- | --- |
| 1.1 | Toque longo numa palavra e arrasto até o fim da frase | Texto selecionado; menu do NeoReader ancorado à seleção, com as cores |
| 1.2 | Tocar numa cor | Menu fecha, seleção some, trecho fica pintado nessa cor |
| 1.3 | Rolar para longe e voltar | Highlight continua visível, mesma posição e cor |
| 1.4 | Trocar de capítulo e voltar | Highlight continua |
| 1.5 | Fechar o app (swipe da lista de recentes), reabrir o livro | Highlight continua no mesmo trecho — **se falhar, é R-001** |
| 1.6 | Selecionar e tocar fora do menu | Menu fecha, nada é criado |
| 1.7 | Selecionar texto que atravessa dois parágrafos | Um highlight só, cobrindo tudo |
| 1.11 | Abrir a tradução inline num parágrafo e tentar selecionar texto **dentro do bloco de tradução** | Menu de seleção **não** abre (FR-006) — as demais rejeições de FR-006 são cobertas por teste automatizado (T013a) |

### As três checagens da restrição repetida pelo usuário

| # | Ação | Esperado |
| --- | --- | --- |
| 1.8 | **10 toques curtos** em parágrafos diferentes | A tradução inline abre nas **10** (SC-002). Nenhum toque "morto" |
| 1.9 | **10 rolagens** com o dedo sobre o texto | Nenhuma cria seleção nem abre menu (SC-003) |
| 1.10 | Toque curto logo após dispensar uma seleção | **Não** abre tradução no toque de dispensa; o toque seguinte abre normalmente |

Se 1.8 falhar em qualquer tentativa, a feature **não está pronta** — é
exatamente a regressão que o usuário proibiu duas vezes.

## Passo 2 — US2: menu do sistema suprimido

| # | Ação | Esperado |
| --- | --- | --- |
| 2.1 | Selecionar texto no leitor | Só o menu do NeoReader; **nenhuma** barra do sistema |
| 2.2 | Sair do leitor, ir à busca da biblioteca, selecionar texto no campo | Menu do sistema volta a funcionar normalmente |
| 2.3 | Voltar ao leitor e selecionar de novo | Suprimido outra vez (o estado alterna corretamente) |

## Passo 3 — US3: gerenciar pelo texto

| # | Ação | Esperado |
| --- | --- | --- |
| 3.1 | Toque curto sobre um highlight | Abre o menu do highlight (remover / cor). Tradução **não** abre |
| 3.2 | Trocar a cor | Repinta na hora; sobrevive a reabrir o livro |
| 3.3 | Remover | Pintura some imediatamente; não volta ao reabrir |
| 3.4 | Toque curto numa parte **sem** highlight do mesmo parágrafo | Tradução inline abre normalmente |

## Passo 4 — US4: lista na tela de detalhes

| # | Ação | Esperado |
| --- | --- | --- |
| 4.1 | Sair do leitor, abrir detalhes do livro, aba Highlights | Lista na ordem em que aparecem no texto, com trecho, cor, posição e data |
| 4.2 | Tocar num item | Livro abre naquele trecho, com o highlight visível |
| 4.3 | Remover pela lista | Some da lista e do texto ao reabrir o livro |
| 4.4 | Livro sem highlights | Estado vazio explicando como criar |
| 4.5 | Contador de highlights | Aparece junto de marcadores e vocabulário |

## Passo 5 — Cross-cutting

| # | Ação | Esperado |
| --- | --- | --- |
| 5.1 | Com highlight visível, mudar fonte, tamanho e tema | Continua cobrindo o texto certo (SC-009) |
| 5.2 | Girar a tela | Idem |
| 5.3 | Tema claro e escuro | Texto legível sob a cor nos dois |
| 5.4 | Ligar o TTS e selecionar texto | Menu abre; com seleção ativa o toque não navega o TTS |
| 5.5 | Criar highlight num parágrafo que contém palavra do vocabulário, fechar e reabrir o app | Highlight continua correto — **checagem direta de R-001** |
| 5.6 | Apagar o livro da biblioteca e recriar/reimportar | Nenhum highlight fantasma reaparece (FR-018a) |

## Passo 6 — Web: verificação básica (FR-029)

A web não é alvo de polimento — o critério aqui é **não estar quebrada**, não
estar à altura do Android. Com `npm run dev` e um livro importado:

| # | Ação | Esperado |
| --- | --- | --- |
| 6.1 | Arrastar o mouse sobre o texto para selecionar | Seleção nativa do browser; o menu do NeoReader abre |
| 6.2 | Clicar numa cor | Trecho marcado; persiste ao recarregar a página |
| 6.3 | Clique curto num parágrafo | Tradução inline abre como sempre |
| 6.4 | Console do browser | Nenhum erro vindo da ponte nativa — as chamadas de supressão do menu do sistema são no-op fora do Android (T027a) |
| 6.5 | Aba de highlights na tela de detalhes | Lista e navegação funcionam |

Diferenças aceitas nesta rodada: sem alças de arraste no estilo mobile e sem
ajuste fino de seleção por duplo clique ou teclado.

### Rodando o Passo 6 automatizado (Playwright MCP)

Este passo foi executado em Chromium real dirigindo o dev server, e vale repetir
assim antes de cada ida ao device — é barato e pegou três bugs que a suíte jsdom
não pegava (R-010, R-011, R-012):

1. `npm run dev` e navegar para `http://localhost:5173`.
2. Importar um EPUB pelo `input[type=file][accept=".epub"]` da Home.
3. Abrir o leitor e achar **o iframe visível** (o foliate mantém 2-3 montados;
   só um cruza o viewport — filtrar por `boundingBox`).
4. Selecionar com `page.mouse.down()` + vários `move` + `up` sobre um parágrafo
   (arrasto de verdade, não `setSelection` por script — foi o arrasto real que
   revelou o R-010).
5. Asserções úteis: `#nr-selection-menu` visível no doc do iframe; o registro em
   `indexedDB.open('NeoReaderDB') → store 'highlights'`; e a pintura no
   `<svg>` do overlayer (`foliate-view` → shadowRoot → `foliate-paginator` →
   shadowRoot → `g[fill]`).

O que este roteiro **não** cobre e continua exigindo device: toque longo, alças
de seleção, barra do sistema Android, reflow por mudança de fonte e rotação.

## Se algo falhar

Usar o fluxo de debug já estabelecido no projeto (skill `android-debug`):
`npm run android:logs:diagnostics:run`, reproduzir, e ler o arquivo de log. Os
eventos `reader.tap.ignored` trazem o `reason`, o que torna o roteamento de
toque diagnosticável sem adivinhação — inclusive o novo `text-selection`.
