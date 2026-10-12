# Bug Fix: Modelo de síntese ausente da chave do cache de áudio TTS

- **Slug**: modelo-sintese-ausente-chave-cache-audio
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário via orquestrador)

- Adicionar `modelId` a `PremiumTtsAudioCacheParams` e à chave, normalizado (`null`/vazio → `'default'`).
- Subir `PREMIUM_TTS_AUDIO_CACHE_VERSION` de 1 para 2.
- Passar `modelId` nos `cacheParams` de reprodução e de prefetch em `useTTS`.
- Teste unitário de chave/hit/miss por modelo + teste de hook (prefetch ↔ reprodução compartilham hit).

## Summary

A chave do cache de áudio premium agora inclui o modelo de síntese pedido (normalizado), e a versão
da chave subiu para `v2`. Reprodução e prefetch passam o mesmo `modelId` que já mandavam para a síntese.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/TtsAudioCache.ts` | modified | campo `modelId` nos params, segmento normalizado na chave, versão 2 |
| `src/hooks/useTTS.ts` | modified | `modelId` nos dois `cacheParams` (reprodução e prefetch) |
| `src/__tests__/services/TtsAudioCache.test.ts` | modified | teste R13 |
| `src/__tests__/hooks/useTTS.test.tsx` | modified | teste R13 de hook |

## Tests Added or Updated

- `TtsAudioCache.test.ts::separa o cache por modelo de sintese e normaliza o modelo default` — modelos diferentes geram chaves/entradas diferentes; ausente/null/vazio = default; prefixo `v2::`; mesmo modelo = hit.
- `useTTS.test.tsx::reproducao reaproveita o prefetch do mesmo modelo de sintese (R13)` — `modelId` chega à síntese e o chunk pré-sintetizado não é sintetizado de novo (prefetch e reprodução calculam a mesma chave). Observação: este teste também passaria antes do fix (os dois caminhos omitiam o modelo igualmente); ele trava a aceitação "reprodução/prefetch calculam a mesma chave".

## Local Verification

- `npx vitest run src/__tests__/services/TtsAudioCache.test.ts src/__tests__/hooks/useTTS.test.tsx src/__tests__/hooks/useTtsSleepTimer.test.ts src/__tests__/hooks/useTranslatedAudiobookPlayback.test.tsx` → 50 passed.
- Probe R13 (`translation.probe.ts -t R13`, config de review) → agora falha (`v2::...::eleven_mu…` ≠ `v2::...::eleven_v3…`), ou seja, a colisão não ocorre mais.
- `npx tsc -p tsconfig.app.json --noEmit` → limpo; `npx eslint` nos 4 arquivos → limpo.

## Deviations from Assessment

- Nenhuma.

## Follow-ups

- O segmento usa o modelo *pedido*, não o efetivo: para Speechify em idioma não-inglês, `simba-3.2` e `default` resolvem os dois para `simba-3.0` e geram chaves diferentes (só um cache miss extra, sem áudio errado). ElevenLabs hoje ignora `options.modelId` e escolhe o modelo pelo metadata da voz.
