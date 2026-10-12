# Bug Assessment: BottomSheet fechado continua acessível e focável

- **Slug**: bottomsheet-fechado-continua-acessivel-focavel
- **Criado**: 2026-10-12
- **Origem**: reports/code-review-2026-10-10.md — R16 (P2); probe em reports/code-review-2026-10-10/ui.probe.tsx (teste R16)
- **Veredito**: valid
- **Severidade**: medium

## Report

"O diálogo permanece montado com `role="dialog"` e `aria-modal="true"`. Fechar só aplica `translate-y-full`. `aria-hidden` está no backdrop, não no diálogo. Conteúdo não recebe `inert` nem é desmontado. Faltam nome acessível vinculado ao título e gerenciamento completo de foco modal."
Aceitação: fechado não é diálogo acessível nem recebe foco; aberto recebe foco correto, Escape fecha e foco retorna.

## Symptom

Com `open={false}`, o sheet continua exposto como diálogo modal na árvore de acessibilidade e seus botões recebem foco (teclado/TalkBack alcançam ações fora da tela). Esperado: fechado = fora da árvore de acessibilidade e não focável.

## Reproduction

1. Renderizar `<BottomSheet open={false} ...><button>Hidden action</button></BottomSheet>`.
2. `screen.getByRole('dialog')` encontra o diálogo com `aria-modal="true"`; o botão é encontrável por papel e `focus()` funciona (probe R16 passa no código atual).

## Suspected Code Paths

- `src/components/ui/BottomSheet.tsx:39-50` — `div role="dialog"` sempre montado, sem `inert`/`aria-hidden` quando fechado; sem `aria-labelledby`; sem gestão de foco.
- Chamadores (LibraryScreen, BookDetailsScreen, ReaderScreen, SettingsLanguageScreen, QuickBookActionsSheet, BookmarkSheet, TocDrawer, HighlightComposerSheet) — dependem do conteúdo montado (animação de saída; estado interno preservado). Não precisam mudar.

## Root Cause Hypothesis

Confiança high. O componente usa só transformação visual para "fechar"; nenhuma semântica de ocultação é aplicada ao contêiner do diálogo.

## Proposed Remediation

**Preferida**: manter o conteúdo montado (preserva animação e estado dos chamadores) e, quando fechado, aplicar `inert` + `aria-hidden="true"` no diálogo. Bônus pequeno: `aria-labelledby` apontando para o `<h2>` do título (via `useId`), foco inicial no diálogo (`tabIndex=-1`, `preventScroll`) ao abrir se o foco ainda não estiver dentro dele (não roubar `autoFocus` de filhos, ex.: HighlightComposerSheet), e devolver o foco ao acionador ao fechar. Escape já fecha (handler existente).

**Alternativas**:
- Desmontar após a animação (`onTransitionEnd`) — perde estado interno dos chamadores entre aberturas e complica testes; descartada.
- Focus trap completo (Tab cíclico) — maior; `inert` no resto da página exigiria mexer no App. Fica como follow-up.

**Files likely to change**:
- `src/components/ui/BottomSheet.tsx`

**Tests to add or update**:
- Novo `src/__tests__/components/ui/BottomSheet.test.tsx`: fechado não expõe diálogo/botões e tem `inert`; aberto tem nome acessível do título e recebe foco; Escape chama `onClose`; ao fechar o foco volta ao acionador; não rouba foco de filho com autoFocus.

## Risks & Considerations

- Testes de telas que consultam `getByRole` dentro de sheets fechados passariam a falhar (aria-hidden filtra). Rodar as suítes das telas chamadoras.
- Foco programático no Android: usar `preventScroll` e `outline-none` no contêiner para não exibir anel/saltar.

## Open Questions

- Nenhuma bloqueante.
