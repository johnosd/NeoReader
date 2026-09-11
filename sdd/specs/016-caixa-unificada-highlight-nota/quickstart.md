# Quickstart: Caixa unificada de cor, estilo e nota

Passos de verificação manual — rodar depois da fase Polish, num browser
real (`npm run dev`) e, se possível, no device Android como reforço (esta
feature muda a árvore DOM dentro do iframe do EPUB, mais risco visual que
features anteriores puramente-fora ou puramente-dentro do iframe).

## Pré-requisitos

- `npm run dev` rodando (ou build instalado no device).
- Um livro EPUB aberto no leitor, com texto selecionável na tela.

## Checagens automatizadas (rodar antes do manual)

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Cenário ponta a ponta — US1 (criação)

1. Selecionar um trecho de texto → tocar "Destacar".
2. **Esperado**: abre a caixa unificada (cor + estilo + campo de nota),
   NENHUM highlight visível ainda no texto (FR-001, FR-003).
3. Confirmar sem mudar nada.
4. **Esperado**: highlight aparece com a cor/estilo padrão (primeira vez:
   indigo/fundo); toast pós-criação aparece (nota ficou vazia — FR-006).
5. Selecionar outro trecho → tocar "Destacar".
6. **Esperado**: cor/estilo pré-selecionados são os do highlight anterior
   (FR-002) — não mais o padrão fixo.
7. Trocar a cor, escrever uma nota, confirmar.
8. **Esperado**: highlight criado com a cor nova e a nota; toast NÃO
   aparece desta vez (nota não ficou vazia — FR-006); indicador visual da
   feature 014 aparece no highlight (tem nota).

## Edge case — cancelar a criação

9. Selecionar texto → "Destacar" → cancelar sem confirmar.
10. **Esperado**: nenhum highlight criado, texto volta ao normal (FR-004).

## Cenário ponta a ponta — US2 (edição)

11. Tocar num highlight já existente.
12. **Esperado**: o menu de gerenciamento oferece um único ponto de entrada
    que abre a MESMA caixa unificada, pré-preenchida com cor/estilo/nota
    atuais (FR-005).
13. Mudar a cor E a nota, confirmar.
14. **Esperado**: as duas mudanças aplicadas juntas ao highlight.
15. Tocar no highlight de novo → mudar algo → cancelar.
16. **Esperado**: highlight permanece EXATAMENTE como estava antes do
    cancelamento (FR-007) — nenhuma mudança parcial aplicada.
17. Tocar no highlight → confirmar "Remover" (fora da caixa unificada).
18. **Esperado**: highlight excluído normalmente (FR-008, sem regressão).

## Não regressão — toast da feature 015 tocado depois

19. Criar um highlight sem nota (toast aparece) → tocar no toast.
20. **Esperado**: abre a MESMA caixa unificada, em modo edição, pré-preenchida
    com a cor/estilo do highlight recém-criado e nota vazia.

## Validação de performance percebida (R-002 de plan.md)

21. Confirmar a criação/edição várias vezes seguidas, prestando atenção ao
    tempo entre tocar "Salvar" e o highlight aparecer pintado no texto.
22. **Esperado**: sem atraso perceptível (a pintura agora é reativa, não
    mais otimista — ver `plan.md` D-003/R-002). Se houver atraso visível,
    anotar para reabrir a decisão.
