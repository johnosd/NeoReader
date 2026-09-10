# Bug Assessment: Menu de chrome do leitor some sozinho após ~2.5s

- **Slug**: menu-chrome-leitor-some-sozinho-apos
- **Criado**: 2026-09-10
- **Origem**: texto colado (relato do usuário, na mesma conversa)
- **Veredito**: valid
- **Severidade**: medium

## Report

"hoje quando clico na borda direita inferior aparece o menu por alguns
segundos e ele some sozinho, aqui eu gostaria que o menu aparecesse e só
sumisse se eu clicasse novamente na borda ele desaparece."

## Symptom

Observado: o chrome do leitor (barra de topo/rodapé com voltar, aparência,
marcadores, TOC, vocabulário, TTS) aparece ao toque numa zona de chrome
(ex: canto inferior direito) e desaparece sozinho ~2.5s depois, mesmo sem
nenhuma interação do usuário.
Esperado: o chrome deve aparecer ao toque e só desaparecer quando o
usuário tocar novamente na zona que fecha o chrome — comportamento de
toggle puro, sem temporizador.

## Reproduction

1. Abrir um livro no leitor.
2. Tocar numa zona de chrome (ex: canto inferior direito — ativa tanto
   `isVisibleChromeTapZone` quanto `isRightChromeTapZone` em
   `src/components/reader/EpubViewer.tsx`) pra abrir o chrome, se ele
   estiver fechado.
3. Não tocar em mais nada por ~2.5s.
4. Observar: o chrome desaparece sozinho.

Não precisa de reprodução em device — o comportamento é determinístico e
está explícito no código-fonte (`delayMs = 2500` como default), sem
depender de timing de rede ou estado assíncrono.

## Suspected Code Paths

- `src/hooks/useChromeAutoHide.ts:11-32` — fonte do bug. `resetAutoHide()`
  sempre agenda um `setTimeout(() => setChromeVisible(false), delayMs)`
  (default 2500ms); `handleCenterTap()` chama `resetAutoHide()` toda vez
  que o chrome é reaberto (linha 24).
- `src/screens/ReaderScreen.tsx:167` — consome o hook
  (`chromeVisible, setChromeVisible, resetAutoHide, handleCenterTap`).
- `src/screens/ReaderScreen.tsx:342-358` — chama `resetAutoHide()` no
  mount do leitor (chrome começa visível pra orientar o usuário, depois
  some sozinho).
- `src/screens/ReaderScreen.tsx:832-835` — `handleOpenImage` chama
  `resetAutoHide()` antes de abrir o preview de imagem (defensivo, não
  depende de hide automático pra funcionar — o preview é um overlay
  separado, ver `ReaderImagePreview`).
- `src/screens/ReaderScreen.tsx:1155-1165` — `ReaderChrome` recebe
  `visible={chromeVisible}` e `onDismiss={() => setChromeVisible(false)}`;
  `onAppearanceOpen`/`onBookmarkList`/`onTocOpen`/`onOpenVocabulary`/
  `onTtsToggle` chamam `resetAutoHide()` antes de abrir os respectivos
  sheets — só reinicia o timer, sem outro efeito colateral.
- `src/components/reader/EpubViewer.tsx:3946` — quando o chrome está
  visível, qualquer toque no iframe já chama `onCenterTapRef.current()`
  (fecha o chrome) — ou seja, o toggle manual ("tocar de novo fecha")
  **já funciona hoje**; o único problema é o timer paralelo que fecha
  sozinho antes disso.

## Root Cause Hypothesis

**Confiança: high.** `useChromeAutoHide` implementa visibilidade do chrome
como toggle + temporizador obrigatório: toda vez que o chrome é aberto
(via toque numa zona de chrome, ou via reabertura depois de fechar um
sheet de Aparência/Marcadores/TOC/Vocabulário/TTS), `resetAutoHide()`
agenda um `setTimeout` de 2500ms que força `chromeVisible = false`,
independente de o usuário estar interagindo ou não. Não existe hoje um
modo "toggle puro sem timer" — o comportamento de fechar ao tocar de novo
já existe (via `EpubViewer.tsx:3946`), mas convive com o auto-hide, que
dispara primeiro na prática.

## Proposed Remediation

**Preferida**: remover o temporizador de auto-hide de
`useChromeAutoHide.ts` — chrome passa a ser controlado só por toggle
explícito (toque que abre/fecha, `onDismiss`, `setChromeVisible`). Sem
`setTimeout` algum. Como consequência, `resetAutoHide()` deixa de ter
função e seus call sites em `ReaderScreen.tsx` (mount, `handleOpenImage`,
e os 4 handlers de abertura de sheet) podem ser removidos — não há
efeito colateral em nenhum desses call sites além de reiniciar o timer
(confirmado lendo cada um).

**Alternativas**:
- Manter o auto-hide **só** no mount inicial (chrome aparece brevemente
  pra orientar quem acabou de abrir o livro, depois some sozinho uma
  única vez) e remover o timer de todo o resto (toque manual, reabertura
  após fechar sheet). Trade-off: preserva a primeira impressão atual do
  leitor (chrome não fica permanentemente aberto assim que o livro
  carrega), mas mantém 2 comportamentos diferentes no mesmo hook — menos
  "óbvio" que a opção preferida. Ver Open Questions abaixo — é o usuário
  quem deveria decidir isso, não uma suposição minha.

**Files likely to change**:
- `src/hooks/useChromeAutoHide.ts`
- `src/screens/ReaderScreen.tsx`
- `src/__tests__/hooks/useChromeAutoHide.test.ts`

**Tests to add or update**:
- Reescrever `src/__tests__/hooks/useChromeAutoHide.test.ts`: remover os
  testes que validam o timer (`'resetAutoHide esconde o chrome após o
  delay configurado'`, `'handleCenterTap inicia auto-hide ao reabrir o
  chrome'`, `'resetAutoHide reinicia o timer cancelando o anterior'`);
  manter/ajustar os que validam toggle puro
  (`'handleCenterTap alterna visibilidade'`,
  `'handleCenterTap ao fechar não inicia auto-hide'`,
  `'setChromeVisible força visibilidade diretamente'`); adicionar um
  teste explícito tipo "chrome permanece visível mesmo depois de muito
  tempo passado, sem toque algum" pra travar a regressão relatada.

## Risks & Considerations

- **Mudança de UX na abertura do livro**: hoje o chrome aparece e some
  sozinho ~2.5s depois de abrir qualquer livro (onboarding implícito). Se
  o timer for removido por completo (opção Preferida), essa primeira tela
  passa a exigir toque manual pra fechar o chrome toda vez que o usuário
  abre um livro — mudança perceptível, não só do canto inferior direito
  que o usuário reportou. Ver Open Questions.
- Baixo risco técnico — o hook é pequeno, isolado, com teste dedicado, e
  os call sites de `resetAutoHide()` não têm efeito colateral além do
  timer (confirmado por leitura).
- Nenhum outro consumidor de `useChromeAutoHide` além de `ReaderScreen.tsx`
  (`resetAutoHide`/`handleCenterTap` não são usados em outro lugar do
  código) — mudança de assinatura do hook não vaza pra outros componentes.

## Open Questions

- [NEEDS CLARIFICATION: o auto-hide deve sumir por completo, inclusive na
  abertura inicial do livro (chrome fica visível até o usuário tocar,
  desde o primeiro segundo)? Ou só o auto-hide "depois de reaberto por
  toque do usuário" deve sumir, mantendo o piscar inicial de orientação
  ao abrir um livro? O relato do usuário fala especificamente do toque no
  canto — não deixa explícito se a tela inicial do livro deve mudar
  também.]
