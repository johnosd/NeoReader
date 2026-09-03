# Quickstart: Redimensionamento e recompressão de capas de EPUB

Passos de verificação manual — cobrem o que os testes automatizados
(jsdom, sem Canvas real) não conseguem provar: o resultado visual real do
redimensionamento e a exibição em telas largas (`HeroBanner`, grid da
Biblioteca).

## Pré-requisitos

- `npm run dev` rodando, ou app instalado no device Android
  (`npm run android:run`).
- Build atual sem erros (`npm run build` já rodado com sucesso).
- Um EPUB com capa de resolução alta (a maioria dos EPUBs de scan de
  domínio público tem capas grandes; Standard Ebooks/Project Gutenberg
  costumam servir bem) e uma foto de alta resolução qualquer (pra testar
  "Escolher imagem").

## 1. Importar um EPUB com capa grande (User Story 1)

1. Importe o EPUB pela tela de Biblioteca (botão `+`).
2. Abra o DevTools → Console e confira as dimensões da capa salva:

   ```js
   const { db } = await import('/src/db/database.ts')
   const books = await db.books.orderBy('id').reverse().limit(1).toArray()
   const book = books[0]
   const cover = await db.bookCovers.get(book.id)
   const bitmap = await createImageBitmap(cover.blob)
   console.log('Livro:', book.title, '| Capa:', bitmap.width, 'x', bitmap.height, '| tipo:', cover.blob.type, '| bytes:', cover.blob.size)
   ```

3. Confirme que `Math.max(width, height) <= 2000` (SC-001).
4. Se a capa original já era menor que 2000px no lado mais longo, confirme
   que as dimensões batem exatamente com o original (sem upscale, SC-002)
   — compare abrindo o EPUB original num visualizador de imagens/zip.

## 2. Conferir exibição visual (sem regressão)

1. Abra a tela Home — confira o `HeroBanner` (se esse livro for o mais
   recente) e a row "Meus Livros".
2. Abra a Biblioteca em modo lista e grid.
3. Abra a tela de Detalhes do livro importado.
4. Em todas essas telas, a capa deve aparecer nítida, sem esticar/pixelar
   perceptivelmente, igual a antes desta feature.

## 3. Conferir em viewport largo (tablet/desktop — achado da spec)

1. No DevTools, mude a simulação de dispositivo pra um tablet (ex: iPad,
   ~1024px de largura) ou simplesmente redimensione a janela do browser
   pra uma largura grande.
2. Confira a Home (`HeroBanner`, que ocupa `w-full`) e o grid da
   Biblioteca (3 colunas, também sem `max-w-`) — a capa deve continuar
   nítida o bastante mesmo esticada nessa largura (é exatamente o cenário
   que motivou o teto de 2000px em vez de um valor menor).

## 4. Testar "Escolher imagem" com foto de alta resolução (User Story 2)

1. Na tela de Detalhes de um livro (ou menu "Quick actions" na Home),
   acione "Escolher imagem" e selecione uma foto de alta resolução da
   galeria/arquivos (ex: foto de celular moderno, tipicamente 3000-4000px
   no lado maior).
2. Repita a verificação do passo 1 (console) pra essa capa — deve estar
   redimensionada pro mesmo teto de 2000px.

## 5. Testar "Recriar capa"

1. Na tela de Detalhes, acione "Recriar capa" (reextrai do EPUB).
2. Repita a verificação do passo 1 — mesmo teto aplicado.

## 6. Edge cases

- Importe um EPUB sem nenhuma capa detectável — confirme que a capa de
  fallback (SVG gerado, ícone/título estilizado) aparece normalmente, sem
  erro no console.
- Importe um EPUB com capa já pequena (bem abaixo de 2000px) — confirme
  que não há upscale (dimensão salva = dimensão original).

## Checklist cross-cutting (constitution)

- [ ] `npm run lint` limpo
- [ ] `npm test` sem regressão
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build` sem erros
- [ ] Fluxo principal testado num browser real ou no device Android (passos
      1-6 acima) — não só nos testes automatizados
