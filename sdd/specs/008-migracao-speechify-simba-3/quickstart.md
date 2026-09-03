# Quickstart: Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0

## Pré-requisitos

- `VITE_SPEECHIFY_API_KEY` configurada em `.env` (já existe localmente).
- Dependências instaladas (`npm install`, se necessário).

## Checagens automatizadas

```powershell
npx vitest run src/__tests__/services/providerValidation.test.ts
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Todas devem passar sem erro antes de seguir pra validação manual abaixo.

## Validação manual contra a API viva (FR-008 — obrigatória, não opcional)

Sem isso a feature não pode ser considerada concluída (ver `spec.md` →
FR-008 / SC-002).

1. Rodar `npm run dev` e abrir o app no navegador.
2. Confirmar (ou configurar) a Speechify como provider de TTS em
   Configurações → Integrações, usando a key de `.env`.
3. **Cenário A — voz padrão, inglês**: abrir um livro em inglês sem ter
   escolhido voz Speechify explicitamente (usa o padrão `carly`), iniciar a
   narração. Esperado: áudio sintetiza normalmente, sem erro
   `model_retired`. Confirmar no devtools/log de diagnóstico que o `model`
   enviado foi `simba-3.0` (fallback, já que não há `modelId` conhecido pra
   voz não explicitamente selecionada).
4. **Cenário B — voz de inglês explicitamente escolhida**: em Detalhes do
   Livro, abrir o seletor de vozes Speechify pra um livro em inglês, checar
   a resposta real de `GET /v1/voices` (aba Network) pra confirmar se
   `models[].name` de alguma voz retorna literalmente `"simba-3.2"` — isso
   resolve o risco R-001 do `plan.md`. Escolher essa voz, iniciar a
   narração. Esperado: áudio sintetiza normalmente com `model: "simba-3.2"`
   no corpo da requisição.
5. **Cenário C — idioma não-inglês**: abrir um livro em pt-BR (ou es/fr/de/
   it), iniciar a narração. Esperado: áudio sintetiza normalmente com
   `model: "simba-3.0"`.
6. Se o Cenário B mostrar que nenhuma voz retorna `"simba-3.2"` em
   `models[].name` (nome real diferente do esperado), ajustar a constante de
   comparação em `SpeechifyService.ts` e repetir o cenário — sem isso a
   feature nunca usa `simba-3.2` (cai sempre no fallback seguro, sem
   quebrar, mas sem o ganho de latência).

## Cenário ponta a ponta

Fluxo completo: usuário abre um livro (qualquer idioma suportado) → inicia
narração via Speechify → áudio toca sem erro → pausa/retoma → troca de
capítulo → narração continua sem erro `model_retired` em nenhum ponto.
