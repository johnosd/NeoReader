# Assessment Explora: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Criado**: 2026-09-23
- **Origem**: ideia do backlog (`.planning/backlog.md` → Ideias Futuras #1)

## Ideia Bruta

Investigar a troca não intencional e silenciosa do TTS Premium (ex.
ElevenLabs) para o TTS default do Android após alguns minutos de audiobook.
Ocorre sem erro visível no app e com saldo de créditos disponível no
provider.

## Evidência a Favor

Leitura do código (branch `feature/tts-fallback-gap-sync`, commit `adb0429`)
confirma que **existe um caminho que produz exatamente o sintoma relatado**:

- **Qualquer erro "não transiente" em um único chunk troca o provider da
  sessão inteira pra native** — `speakChunk` (`src/hooks/useTTS.ts:697-741`)
  retorna `usedProvider: 'native'` e `play()` (`useTTS.ts:893-894`) passa a
  usar native até o fim da sessão. Só `AbortError`, `failed to fetch` e
  `networkerror` são transientes (`isTransientTtsFailure`, `useTTS.ts:132`).
  HTTP 429 (rate limit/concorrência), 5xx, `NotAllowedError` do
  `audio.play()` e `MediaError` de decode do `<audio>` caem todos como
  **permanentes**.
- **A troca é persistida no livro** — `ReaderScreen.tsx:614-622` chama
  `switchToNativeTts()` em falha não transiente, que grava
  `ttsProvider: 'native'` via `updateBookSettings` (`useReaderAppearance.ts:231-235`).
  Ou seja: um único 429 ou 503 isolado vira "este livro agora usa TTS nativo"
  para sempre, até o usuário trocar à mão.
- **O aviso é efêmero e fácil de perder** — `TtsFallbackToast` some sozinho em
  6,5 s (`ReaderScreen.tsx:1703-1706`) e só aparece uma vez por provider por
  livro aberto (`ttsFallbackNoticeShownRef`). Em uso de audiobook (tela
  apagada, app em background — cenário da feature 001), o toast dispara e
  some sem ninguém ver. Isso explica "sem erros visíveis".
- **Não há retry no chunk principal** — o prefetch tem 1 retry para erro
  transiente (`useTTS.ts:774-798`), mas o `speakWithPremium` principal cai
  direto pro fallback na primeira falha.
- **Concorrência de requisições aumentou nesta branch** — o lookahead agora
  dispara até 3 prefetches por chunk (`useTTS.ts:877-886`), e o loop principal
  não deduplica com um prefetch em voo do mesmo chunk (checa só o cache
  resolvido). Em `main` já existia 1 prefetch concorrente. Mais requisições
  simultâneas → mais chance de 429.
- ASSUMPTION: ElevenLabs limita requisições concorrentes por plano (valores
  aproximados: Free ~2, Starter ~3, Creator ~5) e responde 429 ao exceder.
  Precisa de confirmação na documentação atual da ElevenLabs.
- "Após alguns minutos" é consistente com um evento raro por chunk (429/5xx
  esporádico, ou `audio.play()` rejeitado quando a WebView está em background)
  — com dezenas de chunks por minuto, basta um.

## Evidência Contra

- **A causa-raiz concreta não foi observada** — não há logcat/diagnóstico de
  uma ocorrência real. O código já emite `tts.provider.fallback` com o erro
  original (`useTTS.ts:719-729`), então a causa está recuperável, mas ninguém
  capturou ainda. Tudo acima explica *por que é silencioso e persistente*,
  não *qual erro dispara*.
- **Parte do comportamento é intencional** — o fallback para native em falha
  permanente (key inválida, sem créditos) foi desenhado assim de propósito
  (comentário em `ReaderScreen.tsx:618-619`). O problema não é existir
  fallback, é a classificação ampla demais de "permanente" + a persistência
  + a visibilidade.
- Não é uma ideia de feature — é um bug. O funil certo depois deste
  assessment é `sdd-bugfix`, não `sdd-specify`.

## Perguntas em Aberto

- Qual erro exato aparece no evento `tts.provider.fallback` numa ocorrência
  real? (429? 5xx? `NotAllowedError`? `MediaError`?)
- Acontece só com ElevenLabs ou também com Speechify/Fish Audio?
- Acontece com a tela ligada, ou só com tela apagada/background?
- Depois do fallback, o livro fica em "native" ao reabrir? (Pelo código,
  deveria ficar — confirmar confirma a hipótese da persistência.)
