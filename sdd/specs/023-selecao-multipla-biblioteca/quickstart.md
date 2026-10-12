# Quickstart: Seleção múltipla na biblioteca

Verificação manual da feature 023. Rode depois das checagens automatizadas.

## Pré-requisitos

- Biblioteca com pelo menos 8 livros, incluindo:
  - um livro `local` (importado pelo picker nativo do Android ou baixado via OPDS);
  - um livro já favorito;
  - um livro já numa coleção.
- Pelo menos uma coleção existente.
- Device Android conectado (`adb devices`) para os passos de gesto.

## 1. Checagens automatizadas

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm test
npm run build
```

Todas passam sem erros.

## 2. Browser real (Chromium via Playwright MCP, `npm run dev`)

Rode o fluxo inteiro num único `browser_run_code_unsafe`, com emulação de toque mobile.

1. Lista: segure um livro por ~600 ms. O cabeçalho vira a barra "1 selecionado" e o livro aparece marcado.
2. Toque em mais 2 livros: "3 selecionados". Nenhum livro abre.
3. Toque no "⋯" e na tag de um livro marcado: só alterna a seleção, sem abrir a folha individual.
4. Desmarque os 3: o modo termina e o cabeçalho volta com a mesma busca e o mesmo filtro de antes.
5. Repita os passos 1 e 2 na **grade**.
6. Fora do modo, um toque curto na lista e na grade **abre** o livro (sem regressão, SC-002).

## 3. Gesto no device (R-001)

`npm run android:run` (ou `gradlew.bat` + `adb install`, se `cap run` falhar no Windows).

1. Role rápido a lista e a grade começando com o dedo sobre um livro: **não** entra no modo de seleção.
2. Segure uma capa na grade: não aparece o menu de contexto do sistema nem o callout da imagem, e nenhum texto é selecionado.
3. Ao soltar o dedo depois do long-press, o livro **não** abre.
4. Com o modo ativo, o botão voltar do Android sai do modo e continua na Biblioteca.

## 4. Ações P2 e P3

1. Marque 3 livros (um deles já numa coleção) → Ações → Mover para coleção → coleção existente C. O filtro C mostra os 3, e o toast diz "3 livros movidos para C".
2. Marque 2 → Mover → criar a coleção "Teste 023". A coleção é criada com os 2.
3. Marque os 2 → Mover → "Sem coleção". Eles saem da coleção.
4. Marque 3 (1 já favorito) → Ações: aparece "Favoritar". Aplique: os 3 viram favoritos. Marque os mesmos 3: aparece "Remover dos favoritos".
5. Marque 2 → Status → Lido. O filtro "Finalizados" mostra os 2, e o progresso salvo de cada um não muda.

## 5. Exclusão

1. Marque 3 livros (um `local`) → Excluir. A confirmação diz "Excluir 3 livros?" e cita progresso, marcadores e vocabulário.
2. Cancelar: nada some e a seleção continua.
3. Confirmar: os 3 somem e o toast diz "3 livros excluídos".
4. No device: `adb shell run-as com.johnny.neoreader ls files/books/` não lista mais o arquivo do livro `local` excluído (SC-004).

## 6. Desempenho (SC-003, R-003)

Importe uma pasta com 50 ou mais livros. Selecione 50 → Status → Lido e meça; depois selecione 50 → Excluir e meça. Os dois concluem em menos de 3 s, com indicação de "processando" visível durante a operação.

## 7. Idiomas

Troque o idioma para en e es. A barra, a folha, a confirmação e os toasts aparecem traduzidos, com singular correto para 1 livro.
