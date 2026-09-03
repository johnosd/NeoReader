# Assessment Problem: Migrar Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

- **Slug**: migrar-speechify-simba-englishsimba-multilingual-simba-32sim
- **Criado**: 2026-09-03
- **Explora**: ./explora.md

## Problem Statement

`SpeechifyService.pickSpeechifyModel` hardcoda os modelos TTS `simba-english`
e `simba-multilingual`, que a Speechify está retirando: deixam de ser
selecionáveis (erro `400 model_retired`) a partir da versão de API
`2026-09-21` e são desligados incondicionalmente em `2026-11-21`. Como o
projeto não fixa `Speechify-Version`, a data que efetivamente derruba a
narração por Speechify é `2026-09-21` — ~18 dias a partir de hoje — não
21/11.

## Usuários / Partes Afetadas

- Usuários com API key da Speechify configurada (própria ou via
  `VITE_SPEECHIFY_API_KEY`) usando narração TTS pelo provider Speechify —
  perdem a funcionalidade de síntese de voz nesse provider a partir de
  21/09/2026.
- Usuários que dependem especificamente de vozes/qualidade Speechify para
  aprendizado de inglês (um dos focos centrais do produto) — impacto maior
  que em outros providers (native, ElevenLabs, Fish Audio), que não são
  afetados por este aviso.

## Goals

- Trocar os nomes de modelo em `pickSpeechifyModel` para `simba-3.2`/`simba-3.0`
  (ou consolidar em `simba-3.0`) antes de 2026-09-21.
- Garantir que a voz padrão (`carly`) e vozes já salvas nas preferências dos
  usuários continuem funcionando após a troca (sem regressão silenciosa por
  voz rejeitada).
- Confirmar cobertura de idioma para os idiomas suportados pelo app
  (`en, pt-BR, es, fr, de, it, ja`) no(s) modelo(s) escolhido(s).

## Non-Goals

- Não é sobre trocar de provider de TTS — Speechify continua sendo um dos
  providers (ao lado de native, ElevenLabs, Fish Audio).
- Não é sobre implementar um mecanismo de pin de `Speechify-Version` como
  solução definitiva — pin é no máximo um paliativo de curto prazo, não
  resolve o problema (o guia é explícito: "não é uma isenção").
- Não cobre mudanças nos outros providers de TTS, que não são afetados por
  este aviso de depreciação.

## Success Metrics

- Chamadas de síntese via Speechify (`SpeechifyService.synthesize`) usam
  `simba-3.2`/`simba-3.0` e continuam retornando áudio válido (sem `400
  model_retired`) antes de 2026-09-21.
- Nenhuma voz hoje selecionável (default `carly` + vozes salvas de usuários
  reais, se houver como checar) passa a ser rejeitada pelo modelo novo.
- Narração em `ja` (se de fato usada por algum usuário) tem comportamento
  definido — coberta pelo modelo escolhido ou fallback claro — em vez de
  falhar silenciosamente.

## Cost of Inaction

Narração via Speechify quebra para todo usuário com API key configurada a
partir de ~2026-09-21 (400 model_retired), agravando para falha garantida em
toda versão de API a partir de 2026-11-21. É uma regressão de produção com
prazo externo rígido — não uma melhoria opcional — e afeta diretamente um
dos pilares do produto (TTS realista para leitura/aprendizado de inglês).
