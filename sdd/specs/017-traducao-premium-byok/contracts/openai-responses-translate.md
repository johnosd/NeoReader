# Contract: OpenAI — `POST /v1/responses` (Structured Outputs)

Fonte: OpenAI API Reference (verificado via Context7, 2026-09-11).

## Autenticação

Header `Authorization: Bearer <chave>`.

## Request

```json
POST https://api.openai.com/v1/responses
{
  "model": "gpt-5.6-luna",
  "instructions": "Traduza o texto literário do usuário para pt-BR preservando tom, diálogo e estilo. Responda só com o JSON pedido.",
  "input": "<trecho selecionado, até ~500 chars — FR-013>",
  "text": {
    "format": {
      "type": "json_schema",
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
```

**Atenção — não confundir com Chat Completions**: a Responses API usa `name`/
`schema`/`strict` soltos dentro de `text.format` (formato acima). O
`response_format: { json_schema: { name, schema, strict } }` aninhado é da
API antiga (Chat Completions) — misturar os dois formatos gera 400
`invalid_request_error`. Bug real encontrado em teste de device (2026-09-11):
a primeira implementação usou o aninhamento errado e toda tradução caía em
`invalid` sem fallback (FR-007 não usa fallback pra `invalid`).

**Decisão de modelo**: `gpt-5.6-luna` — verificado em developers.openai.com/api/docs/models
(2026-09-11) como o modelo "otimizado pra workloads sensíveis a custo"
($0.20/MTok de entrada) atualmente disponível via Responses API; custo/
latência menores, suficiente pra tradução de um parágrafo. Não expor
seleção de modelo ao usuário nesta entrega (evita escopo novo de
configuração — constitution III). **Atenção pra retomada**: nomes de
modelo OpenAI mudam com frequência — se este modelo for descontinuado,
reverificar a doc oficial antes de trocar, não adivinhar um nome parecido.

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
