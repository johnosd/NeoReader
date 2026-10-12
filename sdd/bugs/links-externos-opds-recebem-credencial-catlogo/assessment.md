- **Slug**: links-externos-opds-recebem-credencial-catlogo
- **Criado**: 2026-10-12
- **Origem**: reports/code-review-2026-10-10.md (R07)
- **Veredito**: valid
- **Severidade**: critical

## Report

O review R07 reproduziu que requisições OPDS montam `Authorization: Basic ...` independentemente da origem do link. Um catálogo privado pode anunciar paginação, busca, capa ou aquisição em outro domínio, fazendo a credencial do catálogo ser enviada ao servidor externo.

## Symptom

Links OPDS para outra origem recebem a credencial do catálogo de origem. O esperado é enviar credencial apenas à origem autorizada; links externos devem ser acessados sem esse header, salvo autorização explícita inexistente no fluxo atual.

## Reproduction

1. Configurar catálogo `https://private.example/opds` com credencial.
2. Fazer o feed anunciar link de página, capa ou aquisição em `https://external.example/...`.
3. Observar a chamada `CapacitorHttp`/plugin: o header `Authorization` é incluído para `external.example`.

A reprodução do review usa rede mockada e não envia credenciais reais.

## Suspected Code Paths

- `src/services/opds/OpdsCatalogService.ts:58-76,121-125` — `rawRequest` recebe a credencial sem conferir a origem do destino.
- `src/services/opds/OpdsCatalogService.ts:157-166` — documento OpenSearch pode estar em outra origem e usa credencial do catálogo.
- `src/services/opds/OpdsCatalogService.ts:175-185` — capas autenticadas montam header sem validar origem.
- `src/services/opds/OpdsDownloadService.ts:44-68` — download de aquisição sempre usa a credencial do catálogo.

## Root Cause Hypothesis

**Confiança: alta.** O contrato de autenticação é baseado apenas em `catalog.hasCredential`; não existe comparação entre a origem efetiva da URL e a origem do catálogo antes de montar o header.

## Proposed Remediation

**Preferida**: calcular a origem efetiva após a mesma normalização HTTPS usada na requisição e fornecer credencial somente quando ela coincide com a origem do `baseUrl`. Aplicar a regra a feeds, OpenSearch, capas e downloads; `testConnection` continua permitindo a credencial explícita para o próprio `baseUrl`.

**Alternativas**:
- Exigir uma lista de origens autorizadas por catálogo — mais flexível, mas muda o modelo e a UI.

**Files likely to change**:
- `src/services/opds/OpdsCatalogService.ts`
- `src/services/opds/OpdsDownloadService.ts`
- `src/__tests__/services/opds/OpdsCatalogService.test.ts`
- `src/__tests__/services/opds/OpdsDownloadService.test.ts` (se já houver cobertura adequada do header)

**Tests to add or update**:
- Feed/paginação externa não recebe Authorization.
- Origem do catálogo continua recebendo Authorization.
- Capa e documento OpenSearch externos não recebem Authorization.
- Download de aquisição externo não recebe Authorization; download same-origin mantém o header.

## Risks & Considerations

- Links HTTP anunciados por catálogo HTTPS já são promovidos para HTTPS; a comparação deve ocorrer depois dessa normalização.
- Redirecionamentos nativos não são controlados pelo JS; a validação cobre a URL solicitada, e o comportamento final de redirect precisa de QA nativo.
- Catálogos que dependem conscientemente de múltiplas origens precisarão de autorização explícita futura.

## Open Questions

- Nenhuma para o fix pontual.
