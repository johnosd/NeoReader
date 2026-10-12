# Bug Fix: BottomSheet fechado continua acessível e focável

- **Slug**: bottomsheet-fechado-continua-acessivel-focavel
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada sem pausa pelo usuário)

- Manter o sheet montado quando fechado (preserva animação e estado dos filhos/chamadores).
- Fechado: `inert` + `aria-hidden="true"` no `div role="dialog"`.
- Nome acessível: `aria-labelledby` → `<h2 id>` gerado por `useId`.
- Foco: ao abrir, focar o diálogo (`tabIndex=-1`, `preventScroll`) só se o foco ainda não estiver dentro dele; ao fechar/desmontar, devolver ao acionador (se ainda conectado). Efeito separado com deps `[open]`.
- Escape já fechava (handler existente, inalterado).
- Teste novo cobrindo fechado/aberto/Escape+retorno de foco/autoFocus de filho.

## Summary

O diálogo fechado agora é `inert` e `aria-hidden`, então some da árvore de acessibilidade e não recebe foco, sem desmontar (animação e estado preservados). Bônus: nome acessível pelo título, foco inicial ao abrir e retorno de foco ao acionador.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/components/ui/BottomSheet.tsx` | modified | `inert`/`aria-hidden` quando fechado; `aria-labelledby`+`useId`; `tabIndex=-1`+`outline-none`; efeito de foco com deps `[open]` |
| `src/__tests__/components/ui/BottomSheet.test.tsx` | added | 4 testes |

## Tests Added or Updated

- `src/__tests__/components/ui/BottomSheet.test.tsx::fechado: fica inert e fora da árvore de acessibilidade` — reprodução do probe R16 invertida.
- `::aberto: nome acessível vem do título e o foco vai para o diálogo`
- `::Escape fecha e o foco volta ao acionador`
- `::não rouba o foco de um filho com autoFocus` — protege o HighlightComposerSheet.

## Local Verification

- `npx vitest run src/__tests__/components/ui/BottomSheet.test.tsx` → 4/4 pass
- `npx vitest run` nas suítes dos chamadores (HighlightComposerSheet, QuickBookActionsSheet, TocDrawer, BookDetailsScreen, LibraryScreen, ReaderScreen, SettingsLanguageScreen) → 7 arquivos, 220/220 pass
- `npx tsc -p tsconfig.app.json --noEmit` → ok
- `npx eslint src/components/ui/BottomSheet.tsx src/__tests__/components/ui/BottomSheet.test.tsx` → ok
- Observação: durante a sessão outro agente fez `git stash`/`stash pop` temporário no working tree; as checagens foram reexecutadas depois, com o diff do BottomSheet confirmado presente.

## Deviations from Assessment

Nenhum. Nenhum chamador foi alterado.

## Follow-ups

- Contenção de foco (Tab cíclico) e `inert` no restante da página com sheet aberto não foram feitos (exigiria mexer além do componente).
- Validar com TalkBack/teclado em device real.
- O probe `reports/code-review-2026-10-10/ui.probe.tsx` (R16) afirma o comportamento defeituoso e passará a falhar — esperado.
