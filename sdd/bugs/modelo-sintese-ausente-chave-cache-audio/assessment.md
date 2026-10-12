# Bug Assessment: Modelo de síntese ausente da chave do cache de áudio TTS

- **Slug**: modelo-sintese-ausente-chave-cache-audio
- **Criado**: 2026-10-12
- **Origem**: texto colado — R13 de `reports/code-review-2026-10-10.md` (reprodução em `reports/code-review-2026-10-10/translation.probe.ts`)
- **Veredito**: valid
- **Severidade**: low

## Report

R13 — P2 — "Síntese recebe `modelId`, mas parâmetros/chave do cache não. Provider, voz, idioma,
velocidade e texto iguais geram mesma chave quando muda o modelo. Prefetch tem a mesma omissão."
Aceitação: modelos diferentes não compartilham áudio; mesmo modelo mantém hit; reprodução/prefetch
calculam a mesma chave.

## Symptom

Trocar o modelo da voz premium (mesma voz/idioma/velocidade/texto) continua tocando o áudio
sintetizado com o modelo anterior por até 6 h (retenção do cache). Esperado: modelo diferente = cache miss.

## Reproduction

1. `buildPremiumTtsAudioCacheKey({...base, modelId: 'eleven_multilingual_v2'})` e `({...base, modelId: 'eleven_v3'})`.
2. As chaves são iguais (probe R13 confirma) — `PremiumTtsAudioCacheParams` nem tem o campo.

## Suspected Code Paths

- `src/services/TtsAudioCache.ts:9-15,25-35` — params/chave sem `modelId`; versão `v1`.
- `src/hooks/useTTS.ts:~540-554` (`synthesizePremiumChunk`) e `~849-856` (`prefetchPremiumChunk`) — calculam `modelId` via `getPlaybackTtsVoiceModelId` e passam para a síntese, mas não para `cacheParams`.

## Root Cause Hypothesis

Confiança: high. A identidade do cache foi definida antes de `modelId` existir na seleção de voz e
não foi atualizada. Impacto real por provider: Speechify usa `modelId` (`simba-3.2` vs `simba-3.0`
em inglês) → colisão real; ElevenLabs hoje ignora `options.modelId` (escolhe pelo metadata da voz)
e Fish Audio deriva o modelo de `voiceId` → para esses dois, sem colisão observável, mas a chave
fica correta se passarem a usar o campo.

## Proposed Remediation

**Preferida**: adicionar `modelId?: string | null` a `PremiumTtsAudioCacheParams`, incluí-lo na chave
normalizado (`null`/`undefined`/vazio → `'default'`, mesma regra do `voiceId`) e subir
`PREMIUM_TTS_AUDIO_CACHE_VERSION` para 2. Em `useTTS`, passar `modelId` nos dois `cacheParams`
(reprodução e prefetch), que já usam a mesma função `getPlaybackTtsVoiceModelId`.

**Alternativas**:
- Normalizar para o modelo *efetivo* de cada provider (ex.: `pickSpeechifyModel`) — evita miss quando `simba-3.2` cai pra `simba-3.0` em pt, mas exigiria expor lógica interna dos services; o custo de um miss extra é só uma síntese. Rejeitado (mudança mínima).

**Files likely to change**:
- `src/services/TtsAudioCache.ts`
- `src/hooks/useTTS.ts`
- `src/__tests__/services/TtsAudioCache.test.ts`
- `src/__tests__/hooks/useTTS.test.tsx` (se viável: prefetch e reprodução compartilham hit)

## Risks & Considerations

- Cache é só em memória (Map) — bump de versão não precisa de migração.
- `useTTS.ts` também foi alterado no R08 (outra região); não sobrepor.

## Open Questions

- Nenhuma.
