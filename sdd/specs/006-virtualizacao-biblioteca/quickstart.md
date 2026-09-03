# Quickstart: Virtualização da tela de Biblioteca

Passos de verificação manual — cobrem o que os testes automatizados (jsdom)
não conseguem provar de verdade: fluidez real de scroll, uso de memória e
comportamento em WebView Android.

## Pré-requisitos

- `npm run dev` rodando (verificação inicial no navegador é mais rápida de
  iterar que no device).
- Build atual sem erros (`npm run build` já rodado com sucesso).
- Um usuário autenticado no app (qualquer conta de teste).

## 1. Popular a biblioteca com 1.000+ livros (dado sintético)

Não existe seed automatizado no projeto — os dados de teste ficam só no
IndexedDB local, então o caminho mais direto é inserir registros sintéticos
direto no Dexie via o console do DevTools, sem passar pelo fluxo de import
real (que seria lento pra 1.000 arquivos).

1. Abra o app no navegador (`http://localhost:5173`) e faça login.
2. Abra o DevTools → Console.
3. Cole e rode (ajuste `TOTAL` se quiser testar outra escala):

   ```js
   const { db } = await import('/src/db/database.ts')
   const TOTAL = 1200
   const now = new Date()
   const rows = Array.from({ length: TOTAL }, (_, i) => ({
     title: `Livro sintético #${i + 1}`,
     author: `Autor Teste ${i % 37}`,
     format: 'EPUB',
     fileName: `livro-sintetico-${i + 1}.epub`,
     fileSize: 1024 * 1024,
     addedAt: now,
     importedAt: now,
     tags: [],
     isFavorite: i % 11 === 0,
     missingFile: false,
     storageMode: 'embedded',
   }))
   await db.books.bulkAdd(rows)
   console.log('Inseridos:', rows.length)
   ```

4. Recarregue a página (ou navegue pra Biblioteca) — o contador de livros no
   topo da tela deve mostrar o novo total.

## 2. Verificar DOM limitado (DevTools → Elements)

1. Abra a Biblioteca em modo **lista** (padrão).
2. No DevTools → Elements, use `Ctrl+F` (busca no painel de elementos) por
   `article` (ou o seletor real da linha de livro) e confira: o número de
   nós encontrados deve ser uma fração pequena do total (dezenas, não
   centenas/milhares), independentemente de quantos livros existem.
3. Role a lista até o fim — o número de nós no DOM deve permanecer estável
   (não crescer conforme rola).
4. Troque para o modo **grid** e repita — mesma verificação para os cards.

## 3. Verificar fluidez de scroll e memória

1. Com a lista em modo lista, role rapidamente do topo ao fim (scroll
   contínuo/fling) — não deve haver travamentos perceptíveis nem espaços em
   branco persistentes (SC-001).
2. DevTools → Performance → grave ~5s de scroll contínuo — confirme que o
   frame rate se mantém estável (sem quedas longas/consistentes).
3. DevTools → Memory → tire um heap snapshot antes e depois de rolar a
   lista inteira algumas vezes — o uso de memória não deve crescer de forma
   não-limitada a cada ciclo de scroll (SC-002).
4. Repita 1-3 no modo grid.

## 4. Verificar comportamento de scroll (FR-002/FR-003/FR-004)

1. Confirme que cabeçalho, busca, filtros e lista rolam juntos, como um
   scroll de página único (sem uma barra de scroll interna separada só na
   lista) — FR-002.
2. Role a lista até o meio, abra um livro (toque em qualquer card) e volte
   (botão voltar) — a Biblioteca deve reaparecer na mesma posição de scroll
   de antes — FR-003.
3. Role a lista até o meio de novo, mude o filtro ativo (ex: "Favoritos") —
   a lista resultante deve aparecer rolada para o topo — FR-004.
4. Repita o passo 3 trocando a busca e depois a ordenação, cada uma
   isoladamente.

## 5. Repetir no device Android real

Rode `npm run android:run` (ou o fluxo equivalente já documentado no
README) e repita os passos 2-4 no device físico — a WebView Android é a
plataforma de maior risco de UX pra scroll virtualizado (ver R-003 em
`plan.md`). Preste atenção especial a scroll rápido ("fling") no modo lista.

## 6. Limpeza dos dados sintéticos

Ao terminar a verificação, remova os livros sintéticos pra não poluir a
biblioteca de teste:

```js
const { db } = await import('/src/db/database.ts')
const synthetic = await db.books.where('fileName').startsWith('livro-sintetico-').toArray()
await db.books.bulkDelete(synthetic.map((b) => b.id))
console.log('Removidos:', synthetic.length)
```

## Checklist cross-cutting (constitution)

- [ ] `npm run lint` limpo
- [ ] `npm test` sem regressão
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build` sem erros
- [ ] Fluxo principal testado num browser real ou no device Android (passos
      1-5 acima) — não só nos testes automatizados
