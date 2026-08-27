# Bug Assessment: Timeouts flaky no Vitest sob carga (hookTimeout/testTimeout)

<!--
  Preenchido pela fase Assess do sdd-bugfix. Este arquivo é o CONTRATO que a
  fase Fix trabalha em cima — ela fica travada aos arquivos listados em
  "Files likely to change" a menos que descubra evidência nova (o que precisa
  ser registrado em fix.md, nunca reescrito aqui).
-->

- **Slug**: bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit
- **Criado**: 2026-08-27
- **Origem**: `.planning/backlog.md` (entrada `[Bug]`, achado em 2026-08-26 e atualizado em 2026-08-27 na feature `001-audiobook-background-playback`)
- **Veredito**: valid
- **Severidade**: medium

## Report

> `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` — o `beforeAll` (dynamic imports de `fake-indexeddb/auto` + `@/db/database` + services de sync) estoura o hookTimeout (10s, e ainda estoura em 20s) quando a suíte completa do Vitest roda em paralelo — passa normalmente isolado. Parece contenção de recursos entre workers, não bug de lógica do teste; investigar `vitest.config.ts` (pool de workers) ou mover esses imports pra fora do `beforeAll`.
>
> **Atualização 2026-08-27**: mesma classe de flakiness (timeout de 5s) apareceu também em `SettingsScreen.test.tsx` ("explica o que cada API key habilita nas integracoes") e `BookDetailsScreen.test.tsx` (2 testes) numa rodada de `npm test` completo sob carga total — todos passam normalmente quando o arquivo é rodado isolado. Reforça que é contenção de recursos entre workers do Vitest sob carga, não bug de teste específico.

## Symptom

Rodar `npm test` completo intermitentemente estoura `hookTimeout`/`testTimeout` em testes sem relação lógica entre si (`BookmarkDriveSyncIntegration`, `SettingsScreen`, `BookDetailsScreen`); os mesmos testes passam de forma consistente quando rodados isolados via `npx vitest run <arquivo>`.

## Reproduction

1. Rodar `npm test` (suíte completa) numa máquina sob carga (muitos processos/cores ocupados).
2. Observar falha por timeout em `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` (`beforeAll`) e/ou nos testes citados de `SettingsScreen.test.tsx`/`BookDetailsScreen.test.tsx`.
3. Rodar o mesmo arquivo isolado (`npx vitest run src/__tests__/services/BookmarkDriveSyncIntegration.test.ts`) — passa normalmente.

<!-- Não depende de dado externo pra reproduzir; a intermitência depende de contenção real de CPU no host, então pode não reproduzir em toda tentativa. -->

## Suspected Code Paths

- `vitest.config.ts:5-19` — nenhuma configuração de `pool`/`poolOptions`/`hookTimeout`/`testTimeout`/`fileParallelism`; tudo roda nos defaults do Vitest 4 (pool `threads`, workers = nº de CPUs, `hookTimeout` 10000ms, `testTimeout` 5000ms). Sem limite de paralelismo, os ~76 arquivos de teste do repo competem por todos os cores ao mesmo tempo.
- `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts:59-66` — `beforeAll` com 6 `import()` dinâmicos sequenciais (`fake-indexeddb/auto`, `@/db/database`, `@/db/books`, `@/services/BookmarkDriveSyncService`, `@/services/BookmarkDriveRestoreService`, `@/services/BookmarkDriveSyncModel`), cada um instanciando um grafo de módulos real (Dexie + schema) pela primeira vez naquele worker — custo de setup alto, amortizado por só 2 testes no arquivo.
- `src/__tests__/screens/SettingsScreen.test.tsx` e `src/__tests__/screens/BookDetailsScreen.test.tsx` — setup pesado (`vi.mock()` de 12+ módulos, `render()` de telas completas em jsdom, `waitFor`/`findByText`), sem lógica de teste em comum entre si — o único padrão compartilhado é custo de setup sensível a atraso de scheduler.
- `src/__tests__/screens/BookDetailsScreen.test.tsx:184` — já existe `SLOW_BOOK_DETAILS_TEST_TIMEOUT_MS = 15_000` aplicado pontualmente a 2 testes (linhas 568 e 920), evidência de que esse tipo de flakiness já foi mitigado localmente antes, mas não cobre o arquivo todo nem se sustenta sob contenção mais severa.

## Root Cause Hypothesis

Contenção de CPU/scheduler entre workers do Vitest quando a suíte completa roda em paralelo sem limite de `maxThreads`/`maxForks` configurado: workers demoram mais que o normal para ganhar fatia de CPU, e hooks/testes com setup mais pesado (imports dinâmicos de um grafo de módulos real, ou `render()` de telas inteiras com muitos mocks) estouram os timeouts default (10s no hook, 5s no teste) mesmo sem nenhuma lógica quebrada — o padrão "passa isolado, falha sob carga total, em arquivos não relacionados entre si, bem no limite dos defaults" é a assinatura clássica de scheduler starvation, não de bug de teste. **Confiança: high.**

## Proposed Remediation

**Preferida**: em `vitest.config.ts`, limitar o paralelismo (`poolOptions.threads.maxThreads`, evitando saturar todos os cores simultaneamente) **e** aumentar `hookTimeout`/`testTimeout` globalmente como rede de segurança (ex.: 20000ms/10000ms) — ataca a causa raiz (menos contenção) sem exigir tocar nos 3 arquivos de teste afetados nem em outros que possam ser pegos pela mesma classe de flakiness no futuro.

**Alternativas** (opcional):
- Só aumentar `hookTimeout`/`testTimeout` globalmente, sem mexer em paralelismo — mais simples, mas não reduz a contenção real; se a máquina ficar ainda mais carregada, o problema pode voltar com timeouts maiores.
- Timeout pontual por arquivo/teste (`beforeAll(fn, 30000)` em `BookmarkDriveSyncIntegration.test.ts`; terceiro argumento de `it(...)` nos testes específicos de `SettingsScreen`/`BookDetailsScreen`) — blast radius mínimo, mas paliativo caso a caso e não protege outros arquivos que venham a sofrer do mesmo padrão sob carga.
- Mover os imports dinâmicos do `beforeAll` de `BookmarkDriveSyncIntegration.test.ts` para import estático no topo do arquivo (preservando a ordem de `fake-indexeddb/auto` antes de `@/db/database`) — reduz overhead por hook, mas ganho pequeno perto do efeito da contenção entre workers, e não ajuda em nada os outros dois arquivos.

**Files likely to change**:
- `vitest.config.ts`

**Tests to add or update**:
- Nenhum teste novo — a mudança é de configuração de execução. Validação é rodar `npm test` completo (mais de uma vez, sob carga se possível) e confirmar ausência de timeout nos 3 arquivos citados.

## Risks & Considerations

- Reduzir `maxThreads` aumenta o wall-time total da suíte completa (`npm test` demora mais) — trade-off aceito em troca de confiabilidade.
- Aumentar os timeouts globais mascara, em tese, um hang real em um teste futuro (ele demoraria mais pra falhar) — mitigado pelo fato de a causa raiz (contenção) ser tratada em conjunto, não só o timeout.
- Não há CI (`.github/workflows/`) rodando `npm test` automaticamente hoje — o impacto é só na experiência local do dev rodando a suíte completa.

## Open Questions

- [NEEDS CLARIFICATION: qual valor de `maxThreads` (ou `maxForks`, se trocar de pool) é razoável — a fase Fix pode calibrar com base no nº de cores da máquina de dev (relatado como 6 cores/12 threads pela investigação), reservando cores livres para não saturar o SO.]
