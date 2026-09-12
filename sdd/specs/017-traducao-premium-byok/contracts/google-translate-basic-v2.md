# Contract: Google Cloud Translation — Basic v2

Fonte: Google Cloud Translation REST v2 (verificado 2026-09-11).

## Autenticação

Query param `key=<chave>` na própria URL — **sem** header (ver
`research.md` R4 pro cuidado de log associado; `DiagnosticsLogger.ts` já
redige isso genericamente, nenhuma mudança necessária lá).

## Validação de chave ("Testar chave")

```
GET https://translation.googleapis.com/language/translate/v2/languages?key=<chave>&target=en
```

Endpoint mais barato pra validar uma chave sem gastar caracteres de
tradução (mesmo espírito do `GET /v2/usage` da DeepL e do `GET /v1/models`
da OpenAI) — lista os idiomas suportados, não consome quota de tradução.
200 = chave válida; erro segue a mesma tabela de `## Erros` abaixo.

## Request

```
POST https://translation.googleapis.com/language/translate/v2?key=<chave>
{
  "q": ["<trecho selecionado, até ~500 chars — FR-013>"],
  "target": "pt-BR",
  "source": "en",
  "format": "text"
}
```

`format: "text"` é obrigatório (o padrão da API é `html`, que escaparia o
texto do EPUB innecessariamente).

## Response (200)

```json
{
  "data": {
    "translations": [
      { "translatedText": "Texto traduzido", "detectedSourceLanguage": "en" }
    ]
  }
}
```

`TranslationResult.translatedText = data.translations[0].translatedText`.

## Erros

Formato do corpo: `{ "error": { "code": number, "message": string, "status": string } }`.

| HTTP | `error.status` | Categoria |
| --- | --- | --- |
| 400 | `INVALID_ARGUMENT` (inclui idioma não suportado) | `invalid` |
| 403 | `PERMISSION_DENIED` (chave inválida ou API Cloud Translation não habilitada no projeto Google) | `permission_denied` |
| 429 | `RESOURCE_EXHAUSTED` | `quota_exceeded` |
| 5xx | — | `unavailable` |
| timeout/conexão | — | `network_error` |

Google Basic v2 não tem uma categoria HTTP distinta pra "billing
necessário" — cai em `quota_exceeded` (ver `research.md` R2).
