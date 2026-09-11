# Quickstart: Indicador visual de anotação em highlights com preview flutuante

Passos de verificação manual — complementam (não substituem) os testes
automatizados de `tasks.md`. Especialmente importante aqui: posição/forma
visual da aba e comportamento de flip da caixa não são bem cobertos por
teste automatizado (JSDOM não faz layout de verdade).

## Pré-requisitos

- `npm run build` e `npm test` passando (ver `## Estratégia de Testes` em `plan.md`).
- Device Android conectado (`adb devices` mostrando `device`).
- Um livro com pelo menos 2 highlights: um com anotação (`note`
  preenchida, via fluxo "Anotar" da feature 013) e um sem.
- Idealmente, um highlight com a cor "âmbar" (a mesma paleta que a aba
  usa) COM anotação, pra testar a distinguibilidade da FR-003.

## Checagens automatizadas

```powershell
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Cenário ponta a ponta (device real)

1. Abrir o capítulo com o highlight que tem anotação → confirmar que uma
   marca amarela distinta aparece sobreposta ao início do trecho (FR-001).
2. Abrir o capítulo com o highlight SEM anotação → confirmar que nenhuma
   marca aparece sobre ele (FR-002).
3. No highlight de cor âmbar com anotação → confirmar que a marca continua
   visualmente identificável, não se confunde com a cor do highlight
   (FR-003).
4. Tocar na marca → confirma que abre uma caixa amarela flutuante próxima
   ao trecho, mostrando o texto completo da nota, sem nenhum
   campo/botão de edição (FR-004).
5. Tocar fora da caixa → confirma que ela fecha (FR-006).
6. Num highlight com nota bem longa (próxima do limite de 2000
   caracteres) → tocar na marca e confirmar que o texto rola dentro da
   caixa, sem cortar/truncar (FR-005).
7. Rolar até um highlight com anotação perto do TOPO da tela (ex: logo no
   início do capítulo) → tocar na marca e confirmar que a caixa abre
   ABAIXO do trecho (não corta no topo) (FR-007).
8. Tocar em qualquer OUTRA parte do trecho destacado (fora da marca) →
   confirmar que o menu completo de gerenciamento abre normalmente
   (Anotar/Editar anotação, Remover, Cor e estilo) — sem regressão
   (FR-008).
9. Usando o menu completo (via passo 8), remover o texto da nota (deixar
   vazio, salvar) → reabrir o capítulo/rolar de volta e confirmar que a
   marca some do highlight (FR-009).
10. Trocar o tamanho de fonte do leitor (Configurações → Aparência) para
    pelo menos 2 tamanhos diferentes → confirmar que a marca continua
    ancorada ao início do trecho (sem desalinhar) e mantém o MESMO
    tamanho visual em ambos (FR-010, SC-004).
11. Trocar o tema do leitor (claro/escuro) → confirmar que a marca e a
    caixa continuam legíveis (contraste) em ambos.
12. Girar a tela (retrato/paisagem), se aplicável ao device → confirmar
    que a marca permanece ancorada ao trecho correto após o reflow.

## Critério de aceite do quickstart

Todos os 12 passos acima se comportam conforme descrito, sem nenhuma
regressão perceptível no menu de gerenciamento de highlight existente
(remover, trocar cor, trocar estilo, Anotar/Editar anotação) nem no fluxo
de criação de highlight (menu de seleção).
