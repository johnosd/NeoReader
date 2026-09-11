# Contract: OpenAI — `POST /v1/responses` (Structured Outputs)

Fonte: OpenAI API Reference (verificado via Context7, 2026-09-11).

## Autenticação

Header `Authorization: Bearer <chave>`.

## Request

```json
POST https://api.openai.com/v1/responses
{
  "model": "gpt-5-mini",
  "instructions": "Traduza o texto literário do usuário para pt-BR preservando tom, diálogo e estilo. Responda só com o JSON pedido.",
  "input": "<trecho selecionado, até ~500 chars — FR-013>",
  "text": {
    "format": {
      "type": "json_schema",
      "json_schema": {
        "name": "translation_result",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "translated_text": { "type": "string" }
          },
          "required": ["translated_text"],
          "additionalProperties": false
        }
      }
    }
  }
}
```

**Decisão de modelo**: `gpt-5-mini` (ou o modelo mini equivalente
disponível na conta do usuário) — custo/latência menores, suficiente pra
tradução de um parágrafo; não expor seleção de modelo ao usuário nesta
entrega (evita escopo novo de configuração — constitution III).

## Response (200)

```json
{
  "status": "completed",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "{\"translated_text\":\"Texto traduzido\"}" }
      ]
    }
  ]
}
```

`TranslationResult.translatedText` = `JSON.parse(output[0].content[0].text).translated_text`.
Falha ao fazer parse do JSON (resposta fora do schema, apesar de
`strict: true`) conta como categoria `invalid` (erro de requisição/bug
interno — FR-007, sem fallback automático).

## Erros

Formato do corpo: `{ "error": { "type": string, "code": string, "message": string } }`.

| HTTP | `error.code` (quando distingue) | Categoria |
| --- | --- | --- |
| 400 | `invalid_request_error` | `invalid` |
| 401 | `invalid_api_key` | `permission_denied` |
| 403 | `permission_denied` | `permission_denied` |
| 429 | `rate_limit_exceeded` | `quota_exceeded` |
| 429 | `insufficient_quota` | `billing_required` |
| 500/503 | — | `unavailable` |
| timeout/conexão | — | `network_error` |
