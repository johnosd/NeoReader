# Quickstart: Atalho pra anotar highlight logo após criar

Passos de verificação manual — rodar depois da fase Polish, num browser
real (`npm run dev`) e, se possível, no device Android como reforço.

## Pré-requisitos

- `npm run dev` rodando (ou build instalado no device).
- Um livro EPUB aberto no leitor, com algum texto selecionável na tela.

## Checagens automatizadas (rodar antes do manual)

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Cenário ponta a ponta (US1)

1. Selecionar um trecho de texto → tocar "Destacar" → escolher uma cor.
2. **Esperado**: um toast aparece na parte inferior da tela, convidando a
   anotar (FR-001).
3. Tocar no toast.
4. **Esperado**: `HighlightNoteSheet` abre vazio (sem nenhum texto
   pré-preenchido), o toast desaparece (FR-002).
5. Escrever uma nota e tocar "Salvar".
6. **Esperado**: o sheet fecha; o indicador visual da feature 014
   (aba/cor no início do trecho) aparece no highlight certo — confirma
   que a nota foi associada ao highlight recém-criado, não a outro.

## Edge case — ignorar o toast

7. Criar outro highlight (repetir passo 1) e NÃO tocar no toast.
8. Esperar ~6 segundos sem interagir.
9. **Esperado**: o toast desaparece sozinho; o highlight fica sem
   anotação (sem indicador visual da 014) — igual ao comportamento de
   hoje (FR-003/FR-004).

## Edge case — criação rápida em sequência

10. Criar um highlight (toast aparece) e, antes dele sumir, criar um
    SEGUNDO highlight noutro trecho.
11. **Esperado**: nunca dois toasts visíveis ao mesmo tempo — o toast do
    2º highlight substitui o do 1º (FR-005). Tocar nele deve abrir o
    sheet do 2º highlight, não do 1º.

## Edge case — Cancelar a partir do toast

12. Criar um highlight, tocar no toast, escrever algo no sheet e tocar
    "Cancelar" (sem salvar).
13. **Esperado**: comportamento idêntico a cancelar pelo fluxo de menu
    já existente — o highlight fica sem nota, sem efeito colateral
    (FR-007).

## Não regressão — fluxo de menu já existente

14. Tocar num highlight já existente (sem toast visível) → menu de
    gerenciamento abre → tocar "Anotar"/"Editar anotação".
15. **Esperado**: `HighlightNoteSheet` abre exatamente como hoje — zero
    mudança de comportamento (FR-008).
16. Repetir o passo 1 (criar highlight, toast aparece) e, com o toast
    ainda visível, tocar diretamente no highlight recém-criado pra abrir
    o menu de gerenciamento (em vez de tocar no toast).
17. **Esperado**: o toast some (evita ficar pairando sobre uma ação já
    em andamento) e o menu abre normalmente.
