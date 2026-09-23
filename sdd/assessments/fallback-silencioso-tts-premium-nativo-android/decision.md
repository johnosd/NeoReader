# Assessment Decision: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Decidido**: 2026-09-23
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Sintoma relatado pelo próprio usuário em device + mecanismo confirmado no código: erro não transiente → sessão vira native (`useTTS.ts:893`) → persistido no livro (`ReaderScreen.tsx:620`) → toast de 6,5 s (`ReaderScreen.tsx:1704`). |
| Força da evidência | adequate | O *porquê é silencioso e persistente* está provado no código. O *gatilho exato* (qual erro) é **unknown** — não há log de ocorrência real. Aceitável aqui porque descobrir o gatilho é o primeiro passo do trabalho, e o log `tts.provider.fallback` já existe para capturá-lo. |
| Valor vs. custo de inação | strong | Afeta o público pagante e um dos 3 pilares do produto; tende a piorar com o lookahead de 3 chunks da feature 020. |
| Viabilidade / apetite | strong | Escopo local (`useTTS.ts`, `ReaderScreen.tsx`, classificação de erro); captura via skill `android-debug` já estabelecida. Pequeno. |
| Fit estratégico | strong | TTS realista é pilar declarado do produto (`CLAUDE.md`). |

## Abordagens Candidatas

### A. Capturar primeiro, corrigir depois (bugfix guiado por log)

- Reproduzir em device com `npm run android:logs:diagnostics:run`, sessão
  longa de ElevenLabs com tela apagada, filtrando `tts.provider.fallback`.
  Com o erro real em mãos, corrigir a classificação/retry para aquele caso,
  e em paralelo corrigir os dois problemas de UX já provados (persistência no
  livro e toast efêmero).
- **Recomendada**: sim — evita "consertar" na base de hipótese e ainda
  entrega as correções que independem da causa.

### B. Correção defensiva sem capturar

- Tratar 429/5xx/`NotAllowedError`/`MediaError` como transientes, adicionar
  1 retry no chunk principal, não persistir `native` no livro por falha de
  playback.
- **Recomendada**: não sozinha — provavelmente resolve, mas sem confirmar a
  causa arrisca mascarar outro erro (ex. `401 quota_exceeded` classificado
  errado) e não gera aprendizado.

### C. Circuit breaker por sessão

- Só cair para native após N falhas seguidas (ex. 3) do premium, voltando a
  tentar premium periodicamente.
- **Recomendada**: não agora — mais complexo; considerar só se A mostrar
  falhas frequentes de fato.

## Veredito

**go**. Problema válido e provado no código (strong), valor e fit fortes,
custo baixo. O único `unknown` — qual erro dispara o fallback — está
explicitamente reconhecido e é resolvido pela primeira etapa da abordagem A,
não um buraco escondido.

**Ressalva de funil**: isto é um **bug**, não uma feature. O próximo passo
certo é `sdd-bugfix` (Assess → Fix → Test), não `sdd-specify`.

### Se go — Handoff

- **Problema**: uma falha pontual do TTS premium troca a sessão para native,
  grava `ttsProvider: 'native'` no livro e avisa só por um toast de 6,5 s,
  invisível com a tela apagada.
- **Abordagem recomendada**: A — capturar o erro real via logcat
  (`tts.provider.fallback`), corrigir a classificação/retry para ele, e
  independentemente: (1) não persistir `native` no livro por falha de
  playback/rate-limit; (2) indicação persistente de fallback (ex. no
  mini-player/notificação) em vez de só o toast.
- **Escopo sugerido**: entra `useTTS.ts` (`isTransientTtsFailure`,
  `speakChunk`, retry do chunk principal, dedupe de prefetch em voo),
  `ReaderScreen.tsx` (`onProviderFallback`, toast), testes em
  `src/__tests__/hooks/useTTS.test.tsx`. Não entra: redesenho do lookahead
  (feature 020), fallback premium→premium, telemetria remota.
- **Métricas de sucesso**: causa-raiz capturada em device; 30+ min premium
  com tela apagada sem troca; teste de 429/5xx isolado não muda o provider
  do livro; fallback permanente fica visível ao voltar ao app.
- **Perguntas em aberto**: qual erro real aparece no log? Só ElevenLabs ou
  todos os premium? Só com tela apagada? Os limites de concorrência da
  ElevenLabs por plano (ASSUMPTION no explora.md) batem com a doc atual?
  Deduplicar prefetch em voo deveria entrar aqui ou na feature 020?
