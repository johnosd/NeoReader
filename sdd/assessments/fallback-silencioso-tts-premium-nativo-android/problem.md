# Assessment Problem: Fallback silencioso do TTS premium para o nativo Android

- **Slug**: fallback-silencioso-tts-premium-nativo-android
- **Criado**: 2026-09-23
- **Explora**: ./explora.md

## Problem Statement

Durante o audiobook, uma única falha pontual do provider premium (ex. 429,
5xx, falha de `audio.play()` em background) troca a sessão inteira para o TTS
nativo **e grava essa troca na config do livro**, avisando só por um toast de
6,5 s que ninguém vê com a tela apagada. O usuário perde a voz premium pela
qual pagou sem saber por quê, e ela não volta sozinha.

## Usuários / Partes Afetadas

- Usuário com key BYOK de TTS premium (ElevenLabs, Speechify, Fish Audio) —
  ouve a voz trocar para a do Android no meio do capítulo, sem explicação;
  precisa perceber e trocar o provider de volta manualmente, livro a livro.
- Usuário Pro / em avaliação do produto — o diferencial "TTS realista" (um
  dos 3 pilares do app, ver `CLAUDE.md`) parece instável ou quebrado.
- Dev — sem reprodução nem telemetria de campo, o bug parece "fantasma".

## Goals

- Identificar o(s) erro(s) que de fato disparam o fallback numa ocorrência
  real (via `tts.provider.fallback` no logcat/diagnóstico).
- Uma falha pontual/recuperável do premium não deve derrubar a sessão nem
  gravar `native` no livro.
- Quando o fallback acontecer de verdade, o usuário deve conseguir saber que
  aconteceu e por quê, mesmo tendo ouvido com a tela apagada.

## Non-Goals

- Remover o fallback para native — ele continua correto para falhas
  realmente permanentes (key inválida, sem créditos, voz inexistente).
- Redesenhar o pipeline de prefetch/lookahead (isso é a feature 020, em
  execução) — no máximo limitar concorrência se a causa for 429.
- Telemetria remota/analytics de fallback — o diagnóstico local existente
  basta para a investigação.
- Trocar de um provider premium para outro premium automaticamente.

## Success Metrics

- Causa-raiz documentada com o erro real capturado em device
  (`RXCX103NMVZ`), não só hipótese.
- Sessão de audiobook premium de 30+ min com tela apagada sem troca para
  native (teste manual em device), com saldo disponível.
- Teste automatizado: erro 429/5xx isolado em um chunk → próximo chunk volta
  a ser premium e `ttsProvider` do livro não muda.
- Quando o fallback permanente ocorre, há indicação persistente (não só o
  toast de 6,5 s) visível ao voltar para o app.

## Cost of Inaction

Usuários com key premium — o público mais engajado e o que paga pela
experiência — continuam perdendo a voz premium silenciosamente, livro a
livro, e tendem a concluir que o TTS premium "não funciona direito". A
branch atual (feature 020) aumenta a concorrência de requisições, então o
problema tende a **piorar**, não estabilizar, se nada for feito.
