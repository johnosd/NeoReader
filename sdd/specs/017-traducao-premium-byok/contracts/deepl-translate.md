# Contract: DeepL — `POST /v2/translate`

Fonte: DeepL API Reference (verificado 2026-09-11).

## Autenticação

Header `Authorization: DeepL-Auth-Key <chave>`.

## Request

```json
POST https://api-free.deepl.com/v2/translate  (ou api.deepl.com se a chave for Pro)
{
  "text": ["<trecho selecionado, até ~500 chars — FR-013>"],
  "target_lang": "PT-BR",
  "source_lang": "EN"
}
```

Campos não usados nesta feature (fora de escopo, mas suportados pela API
se quisermos evoluir depois): `context`, `formality`, `glossary_id`.

**Nota**: existem 2 hosts (`api-free.deepl.com` pra chaves grátis,
`api.deepl.com` pra chaves Pro) — o formato da própria chave indica qual
(chaves free terminam em `:fx`). `DeepLService.ts` deve escolher o host
pela chave, não pedir isso ao usuário.

## Response (200)

```json
{
  "translations": [
    { "detected_source_language": "EN", "text": "Texto traduzido", "billed_characters": 42 }
  ]
}
```

`TranslationResult.translatedText = translations[0].text`.

## Erros

| HTTP | Categoria (`TranslationApiKeyValidationCode`) |
| --- | --- |
| 400 | `invalid` |
| 403 | `permission_denied` |
| 429 | `quota_exceeded` |
| 456 | `billing_required` |
| 500/503/504/529 | `unavailable` |
| timeout/conexão | `network_error` |
