# Implementation Plan: Liberar recursos do leitor EPUB ao trocar de livro

**Slug**: `009-leitor-libera-recursos-book-destroy` | **Date**: 2026-09-04 | **Spec**: `sdd/specs/009-leitor-libera-recursos-book-destroy/spec.md`

## Summary

`view.close()` do `foliate-js` (chamado no cleanup de `EpubViewer.tsx` a cada troca de livro ou saída do leitor) nunca chama `view.book.destroy()` — então blob URLs de imagens/fontes/CSS carregados durante a leitura ficam retidos na memória indefinidamente. A correção é uma chamada adicional de uma linha, `view?.book?.destroy?.()`, no mesmo cleanup que já existe, mais a atualização do tipo `book` em `src/types/foliate.d.ts` (que hoje não declara `destroy`) e do mock global de teste em `src/__tests__/setup.ts`. Sem vendor patch, sem dependência nova, sem mudança de UX.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (componente de classe funcional com `forwardRef`), Vite 8.

**Primary Dependencies**: `foliate-js` (dependência git pinada em commit específico do fork `readest/foliate-js`, sem versionamento semver) — só consumido via API pública (`View.book.destroy()`), nenhuma mudança em `node_modules/foliate-js`.

**Storage**: N/A — feature não toca Dexie/IndexedDB; o "recurso" liberado é estado em memória do processo de renderização (blob URLs via `URL.createObjectURL`), não dado persistido.

**Testing**: Vitest + Testing Library. `src/__tests__/components/EpubViewer.test.tsx` já testa o componente contra um mock compartilhado do custom element `<foliate-view>` (`FoliateViewMock` em `src/__tests__/setup.ts`, registrado globalmente via `customElements.define`).

**Target Platform**: Android (Capacitor) + Web — `EpubViewer.tsx` é usado por `ReaderScreen.tsx` nas duas plataformas.

**Performance Goals**: Sem meta numérica obrigatória — SC-004 (verificação manual de memória em device) é opcional/não bloqueante, conforme decidido na spec. O objetivo é qualitativo: parar de reter blob URLs de um livro depois que ele é fechado.

**Constraints**: Não alterar comportamento visível durante a leitura ativa (FR-005); não tocar `node_modules/foliate-js`; a chamada deve ser segura quando `view.book` ainda não existe (FR-003) e idempotente se executada mais de uma vez (FR-004) — resolvido por optional chaining (`?.`), sem necessidade de guarda adicional.

**Scale/Scope**: Um único componente (`EpubViewer.tsx`), sua declaração de tipos (`src/types/foliate.d.ts`) e seus testes (`EpubViewer.test.tsx` + mock compartilhado `setup.ts`). Nenhum outro ponto do app cria ou fecha instâncias de `<foliate-view>` (confirmado por busca no repositório durante o `sdd-specify`).

## Decisões Invariantes

- A chamada `view?.book?.destroy?.()` roda no mesmo `useEffect` de cleanup que já existe em `EpubViewer.tsx` (dependência `[book.id]`, comentário existente: "Roda apenas quando o bookId muda"), logo após `view?.close()` e antes de `view?.remove()` — não um efeito novo. React já garante que esse cleanup roda tanto em troca de livro (novo valor de `book.id`) quanto em desmonte do componente (saída do leitor), cobrindo FR-001 e FR-002 com uma única chamada.
- `book.destroy` é declarado como **opcional** (`destroy?(): void`) em `src/types/foliate.d.ts`, não obrigatório — reflete que o tipo é uma declaração manual de uma API de terceiros sem tipos nativos, e reforça a necessidade do optional chaining em vez de assumir presença garantida.
- Nenhuma guarda/try-catch adicional em torno da chamada — `EPUB.destroy()` (vendor code, `epub.js:1015-1017`) apenas percorre um `Map` de blob URLs e chama `URL.revokeObjectURL` em cada uma; revogar uma URL já revogada é um no-op seguro pela spec do `URL` API, então a chamada já é idempotente por natureza sem código defensivo extra.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | N/A | N/A | Feature pequena (uma chamada + tipo + testes); mesmo assim passou por spec + plan completos via sdd-specify/sdd-plan. |
| II. Comentários só onde o "porquê" não é óbvio | Pass | Pass | A chamada nova precisa de um comentário curto explicando por que `view.close()` sozinho não basta (gap do vendor code) — vai junto da implementação (T0xx). |
| III. Explícito antes de mágico | Pass | Pass | Sem abstração nova — uma chamada direta no cleanup existente, sem wrapper/helper novo. |
| IV. Build limpo é a definição de "pronto" | Pass | Pass | `npm run build` (tsc -b + Vite) valida a atualização de `foliate.d.ts` antes de qualquer coisa ser reportada como concluída. |
| V. Dependências novas exigem justificativa | Pass | Pass | Nenhuma dependência nova. |

Nenhuma violação — Complexity Tracking fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/009-leitor-libera-recursos-book-destroy/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — passos de verificação manual
├── tasks.md               # Saída do sdd-plan (fase de tasks)
└── history.md              # Condicional, criado pelo sdd-execute quando arquiva
```

Sem `research.md` (nenhuma incerteza técnica genuína — o gap já foi confirmado por leitura direta do vendor code na fase de assessment), sem `data-model.md` (sem entidade de dados) e sem `contracts/` (sem superfície de API exposta/alterada).

### Source Code (repository root)

```text
src/
├── components/
│   └── reader/
│       └── EpubViewer.tsx        # Cleanup do useEffect principal (~linha 3257)
├── types/
│   └── foliate.d.ts              # Tipo View.book — adicionar destroy?(): void
└── __tests__/
    ├── setup.ts                   # FoliateViewMock compartilhado — adicionar book.destroy = vi.fn()
    └── components/
        └── EpubViewer.test.tsx    # Novos casos: troca de livro e desmonte
```

**Structure Decision**: Projeto único (React + TypeScript, sem separação backend/frontend — Dexie roda no próprio cliente). Todos os arquivos tocados já existem; nenhuma pasta nova.

## Complexity Tracking

*Vazio — Constitution Check não encontrou violação.*

## Estratégia de Testes

Prioridade: unitário → manual em browser/device (constitution exige testar UI/frontend real antes de reportar concluído; sem contrato de API/E2E nesta feature, dado o escopo pequeno e sem superfície nova).

- **Unitário** (obrigatório, cobre SC-001/SC-002): estender `EpubViewer.test.tsx` com dois casos usando o `FoliateViewMock` já existente — (1) trocar `book.id` via rerender e confirmar que `book.destroy` da instância **anterior** foi chamado; (2) desmontar o componente e confirmar que `book.destroy` da instância ativa foi chamado.
- **Manual/device** (SC-004, opcional/não bloqueante): roteiro em `quickstart.md` usando Chrome DevTools (via `adb forward` pra `webview_devtools_remote`, mesmo padrão já usado em `sdd/bugs/alerta-play-console-uso-memoria-acima/test.md`) para inspecionar blob URLs retidos após múltiplas trocas de livro.

Comandos-base:

```powershell
npm run lint
npm test
npx vitest run src/__tests__/components/EpubViewer.test.tsx
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (baseline) | Concluído — lint/test/build limpos antes de qualquer mudança |
| Foundational (tipo + mock) | Concluído — `foliate.d.ts` e `setup.ts` atualizados, `tsc --noEmit` limpo |
| User Story 1 (chamada + testes) | Concluído — `view?.book?.destroy?.()` implementado em `EpubViewer.tsx`, 2 testes novos passando (76/76 no arquivo) |
| Polish (suíte completa) | Concluído — 806/808 testes passed/skipped (baseline 804 + 2 novos), lint e build limpos |
| Polish (validação manual) | Concluído — instalado e testado em device real (RXCX103NMVZ), roteiro do `quickstart.md` executado, logcat limpo |
| Feature | **Implementada** — todas as 13 tasks concluídas |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `foliate.d.ts` é uma declaração manual de tipos de terceiro sem tipos nativos — se o commit pinado de `foliate-js` mudar no futuro e a API de `book.destroy()` mudar de nome/assinatura, o tipo ficaria desatualizado silenciosamente (TS não valida contra o pacote real). | Baixo — mesmo risco que já existe hoje para todo o resto de `foliate.d.ts`; não é introduzido por esta feature. | Nenhuma ação nova necessária; comportamento consistente com o padrão já aceito no projeto para esse arquivo. |
| R-002 | O `FoliateViewMock` em `setup.ts` inicializa `book` como campo de classe sempre presente (nunca `undefined`), diferente do `foliate-js` real onde `view.book` só existe depois de `open()` resolver — não é possível reproduzir no mock o cenário exato de FR-003 (cleanup rodando antes do book carregar). | Baixo — FR-003 já é satisfeito estruturalmente pelo optional chaining (`view?.book?.destroy?.()`), que é seguro por construção TypeScript/JS, não por um teste específico. | **Resolvido (revisado por T010)**: o mock foi reescrito — `book` agora só é populado dentro de `open()` (igual ao real), com controle `deferNextOpen()`/`resolveDeferredOpen()` pra testar timing. Motivo da revisão: esse gap de mock acabou mascarando um bug de verdade (ver R-003), então a decisão original de não testar foi refeita. |
| R-003 | **(Achado em code review externo do PR #67, bot `chatgpt-codex-connector`, P2)** `view.open()` (`EpubViewer.tsx:3151`) é `await`ado antes de `view.book` existir de verdade (no `foliate-js` real, `this.book` só é atribuído dentro de `open()`, depois do parse). Se o cleanup rodar (troca de livro/saída do leitor) enquanto esse `open()` ainda está em voo, `view?.book?.destroy?.()` do cleanup não acha nada pra destruir, e o código original só fazia `if (cancelled) return` quando `open()` finalmente resolvia — vazando o book recém-criado pra sempre. Reintroduzia exatamente a classe de bug que esta feature corrige, no caso "abandonar um livro que ainda está carregando" (EPUB grande/rede lenta/device lento). | Médio — não é crash, mas é uma lacuna real na correção que esta própria feature entrega; plausível em uso real (OPDS remoto, sync na nuvem, devices lentos). | **Resolvido (T010)**: `EpubViewer.tsx:3152-3157` agora chama `view.book?.destroy?.()` antes de retornar quando `cancelled` já é `true` no momento em que `open()` resolve. Validado com teste de regressão (fix revertido temporariamente → teste falhou exatamente como previsto → fix restaurado → teste passa). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-04 | Setup + Foundational | Baseline confirmado (lint limpo, 804 testes passed/2 skipped, build OK). `destroy?(): void` adicionado ao tipo `View.book` (`src/types/foliate.d.ts`) e `destroy: vi.fn()` adicionado ao mock `FoliateViewMock.book` (`src/__tests__/setup.ts`); `tsc --noEmit` limpo depois das duas mudanças. | Nenhuma — pronto para T004-T006 (User Story 1). |
| 2026-09-04 | User Story 1 | TDD: T004/T005 escritos e confirmados falhando (0 chamadas a `book.destroy`) antes de T006. T006 implementado — `view?.book?.destroy?.()` no cleanup de `EpubViewer.tsx` (~linha 3257-3260), com comentário explicando o gap do vendor code. `npx vitest run src/__tests__/components/EpubViewer.test.tsx` → 76/76 passed. | Nenhuma — pronto para Polish (suíte completa + quickstart manual). |
| 2026-09-04 | Polish (T007) | Suíte completa: `npm run lint` limpo, `npm test` → 806 passed / 2 skipped (808) — zero regressão sobre o baseline (804+2 novos), `npm run build` OK. | T008 (roteiro manual de `quickstart.md`) exige browser real/device — fora do alcance de execução automática; aguardando o usuário rodar ou pedir explicitamente pra eu tentar via `npm run dev`. |
| 2026-09-04 | Polish (T008/T009) | Instalado em device real via `npm run android:run` (RXCX103NMVZ) — primeira tentativa travou em `gradlew.bat installDebug` por queda de conexão USB do device (confirmado via `adb devices` vazio + processo Gradle idle); processo travado encerrado (`TaskStop` + `Stop-Process`) e reinstalação rodou limpa após reconectar (`lastUpdateTime` no device bateu com o novo build). Usuário navegou no device (abrir → trocar de livro → sair do leitor) enquanto eu capturava `adb logcat --pid` em paralelo: log de 2306 linhas, zero `FATAL`/`Exception`/`ANR`, alternância confirmada entre 2 livros (bookId 15 e 84) em 5+ ciclos `reader.open.start`→`reader.open.success`, PID do app estável o tempo todo. T009 (profiler de memória) pulado deliberadamente — coberto parcialmente pelos ciclos reais do T008, decisão de não-bloqueio já registrada em `spec.md`/`plan.md`. | Nenhuma — feature completa. |
| 2026-09-04 | T010 (ad-hoc, pós-PR) | Commit `5def216` já feito e PR #67 aberto quando o bot `chatgpt-codex-connector` apontou race real (ver R-003): `view.book` ainda não existe quando o cleanup roda se `open()` estiver em voo, e o `if (cancelled) return` original não destruía o book depois que `open()` resolvia. Corrigido em `EpubViewer.tsx:3152-3157`. Pra tornar isso testável, reescrevi o timing do `FoliateViewMock.book` em `setup.ts` (só populado quando `open()` resolve, com novo controle `deferNextOpen()`/`resolveDeferredOpen()`) — fechando o R-002 que antes dizia "não testável". Novo teste de regressão confirmado (fix revertido → falhou → restaurado → passou). `tsc --noEmit`, lint, `npm test` (807/809, +1 sobre os 806 anteriores) e build — todos limpos. | Nenhuma — falta só push do novo commit pro PR #67 já aberto. |

**PRÓXIMO**: — (todas as tasks + T010 concluídas; falta só commitar/empurrar a correção do R-003 pro PR #67 já aberto, quando o usuário pedir).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/types/foliate.d.ts` — `View.book.destroy?(): void` adicionado.
- `src/__tests__/setup.ts` — `book` do `FoliateViewMock` reescrito: só populado dentro de `open()` (igual ao real), com `deferNextOpen()`/`resolveDeferredOpen()` pra controlar timing em teste.
- `src/components/reader/EpubViewer.tsx` — `view?.book?.destroy?.()` no cleanup do `useEffect` principal (troca de livro/saída do leitor) **e** no ponto onde `open()` resolve depois de `cancelled` já ser `true` (~linha 3152-3157) — cobre a race do R-003.
- `src/__tests__/components/EpubViewer.test.tsx` — `renderViewer()` expõe `unmount`; novo describe com 3 testes (saída, troca de livro, e o caso de `open()` pendente durante saída).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Se `gradlew.bat installDebug` (via `npm run android:run` / `scripts/run-android.ps1`) ficar com CPU do processo `java` parado (não crescendo por 10-15s) e `adb devices` vazio, o device caiu da conexão USB no meio do install — o processo Gradle não se recupera sozinho mesmo depois do device reconectar (a conexão adb que ele segurava fica obsoleta). Precisa encerrar o processo (`Stop-Process` no PID do `java`) e rodar `npm run android:run` de novo do zero.
