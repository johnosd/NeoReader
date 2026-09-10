# Quickstart: Anotações associadas a highlights

Passos de verificação manual — complementam (não substituem) os testes
automatizados de `tasks.md`. Especialmente importante aqui: é o
primeiro `<textarea>`/formulário de texto multi-linha do projeto, então
o comportamento do teclado virtual Android merece checagem real.

## Pré-requisitos

- `npm run build` e `npm test` passando (ver `## Estratégia de Testes` em `plan.md`).
- Device Android conectado (`adb devices` mostrando `device`).
- Um livro com pelo menos 1 highlight já criado (ou criar um durante o teste).

## Checagens automatizadas

```powershell
npx vitest run src/__tests__/db/highlights.test.ts
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npx vitest run src/__tests__/screens/ReaderScreen.test.tsx
npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Cenário ponta a ponta (device real)

1. Criar um highlight num trecho do livro (seleção → Destacar).
2. Tocar no highlight recém-criado → o menu abre com a ação "Anotar"
   (não "Editar anotação", já que ainda não tem nota).
3. Tocar em "Anotar" → abre o sheet de escrita, vazio, teclado virtual
   sobe sem cobrir o campo de texto nem os botões Salvar/Cancelar.
4. Escrever um texto multi-linha (testar quebra de linha real no
   teclado) e tocar em Salvar → sheet fecha, sem erro.
5. Tocar no mesmo highlight de novo → o menu agora mostra "Editar
   anotação"; tocar nela abre o sheet já preenchido com o texto salvo.
6. Editar o texto, tocar em Cancelar (sem salvar) → reabrir o menu e
   confirmar que o texto **antigo** continua salvo (mudança descartada).
7. Editar de novo, apagar todo o texto, tocar em Salvar → reabrir o
   menu e confirmar que voltou a mostrar "Anotar" (nota removida).
8. Escrever uma nota de novo, salvar. Abrir a tela de detalhes do
   livro → aba Destaques → confirmar que o texto da nota aparece
   visível abaixo do trecho destacado.
9. Escrever uma nota bem longa (perto/acima de 2000 caracteres) num
   highlight → confirmar que o sistema impede ultrapassar o limite, com
   alguma indicação visível.
10. Numa nota longa, conferir que a aba Destaques trunca o texto com
    reticências (sem quebrar o layout da lista).
11. Excluir um highlight que tem anotação (botão de remover no menu) →
    confirmar que ele some da aba Destaques (e, por construção — campo
    na mesma linha —, a nota some junto, sem precisar de checagem
    separada).
12. Repetir os passos 2-5 com o app no idioma `en` e depois `es` →
    confirmar que os rótulos ("Anotar"/"Editar anotação", título do
    sheet, botões) aparecem traduzidos.

## Critério de aceite do quickstart

Todos os 12 passos acima se comportam conforme descrito, sem nenhuma
regressão perceptível nas ações existentes do menu de highlight
(remover, trocar cor, trocar estilo) nem na lista de Destaques já
existente pra highlights sem anotação.
