# Bug Assessment: Progresso no Drive não é restaurado pelo app

- **Slug**: progresso-no-drive-nao-restaurado-pelo
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md`, achado R02 (P2) — evidência estática, sem sessão Drive real
- **Veredito**: valid
- **Severidade**: medium

## Report

> **R02 — P2 — Progresso no Drive não é restaurado pelo app.** A restauração
> existe, mas não tem chamada de produção. O leitor inicializa com progresso
> local. Na importação há restauração de marcadores, sem ligação equivalente
> para progresso.
>
> **Cenário/impacto:** A salva posição no Drive. B importa o mesmo arquivo e
> abre do começo. Novo progresso local em B pode ter timestamp superior e
> substituir a posição anterior.
>
> **Aceitação:** mesmo hash abre na posição remota mais recente; abrir/fechar
> sem navegar não publica reinício; posição local realmente mais recente vence.

## Symptom

Usuário Pro lê num dispositivo (progresso publicado no Drive) e abre o mesmo
livro em outro: o livro abre na posição local (ou no início) e, ao abrir/fechar,
o início do livro é gravado com timestamp novo e publicado por cima da posição
remota. Esperado: abrir na posição remota mais recente e nunca publicar o
"início por padrão" sobre ela.

## Reproduction

Estática (confirmada por leitura de código):
1. `restoreBookProgressFromDrive` (`ProgressDriveSyncService.ts:109`) — `grep` não acha chamador fora de testes (nem há teste dele).
2. `useReaderProgress.ts:55-66` carrega só `getProgress(bookId)` local.
3. Livro sem progresso local abre no início; `ReaderScreen.handleRelocate` (`~l.1143`) chama `saveProgress` já no relocate inicial; o flush ao sair (`flushCurrentProgress`) também persiste.
4. `upsertProgress` grava `updatedAt: new Date()` e agenda `syncBookProgress`, cujo LWW (`localUpdatedAt >= remoteUpdatedAt`) sobrescreve o remoto com o início.

## Suspected Code Paths

- `src/services/ProgressDriveSyncService.ts:109-158` — restauração pronta (LWW remoto→local, grava `updatedAt` remoto), sem chamador.
- `src/hooks/useReaderProgress.ts:55-66` — posição inicial vem só do Dexie.
- `src/hooks/useReaderProgress.ts:27-52` — persiste qualquer posição reportada, inclusive o início "por padrão" de um livro sem progresso.
- `src/db/progress.ts:23-56` — `updatedAt = now` + `scheduleProgressDriveSync` (gatilho da publicação).

## Root Cause Hypothesis

Confiança: high. O sync de progresso só tem a metade "push"; a metade "pull"
foi escrita mas nunca ligada. Além disso, o timestamp local mede "quando o
leitor reportou uma posição", não "quando o usuário navegou" — então abrir um
livro sem progresso gera um registro "mais novo" que o remoto, e o LWW o publica.

## Proposed Remediation

**Preferida (mínima, sem decisão de produto nova — reusa o LWW já existente):**

1. **Restaurar na abertura, antes da posição inicial**: `useReaderProgress`
   chama a restauração antes de `getProgress`, com prazo (≈2,5 s) para manter o
   uso offline — o `ReaderSkeleton` já aparece enquanto `initialLoadDone` é
   false. Helper novo no serviço (`restoreBookProgressBeforeOpen`) que nunca
   lança, respeita o prazo e pula quando o status já é `permission-error`
   (mesma regra do `scheduleProgressDriveSync`). A abertura cobre também a
   importação: livro recém-importado não tem progresso local, então o remoto
   vence na primeira abertura — por isso **não** ligo na importação (evita
   chamada Drive duplicada e mexer em 3 arquivos de teste do BookImportService
   compartilhados com outros agentes).
2. **Não persistir o "início por padrão"**: quando o livro abriu sem progresso
   local, `persistProgress` ignora posições no início do livro (`fraction`/
   `percentage` = 0). Se a restauração falhou (offline/prazo), abrir e fechar não
   cria registro com timestamp novo, e o remoto não é sobrescrito no próximo
   sync. Assim que o usuário sai do início, grava normalmente.
3. Posição local realmente mais recente continua vencendo (o LWW da restauração
   só aplica remoto com `updatedAt` maior).

**Por que não virou feature**: a regra de conflito (LWW por timestamp) já
estava decidida no próprio serviço; não há UI nova (ex.: perguntar "continuar
de onde parou no outro aparelho?"). Se o produto quiser esse prompt, aí sim é
feature via `sdd-specify`.

**Alternativas**:
- Restaurar na importação (como marcadores): não cobre o caso principal (dois
  aparelhos lendo o mesmo livro já importado). Rejeitado como única medida.
- Restaurar em background e saltar de posição depois de aberto: muda a UX
  (pulo no meio da leitura). Rejeitado.
- Proteger no `syncBookProgress` (não publicar se local < remoto em fração):
  voltar atrás é legítimo; rejeitado.

**Files likely to change**:
- `src/services/ProgressDriveSyncService.ts`
- `src/hooks/useReaderProgress.ts`
- `src/__tests__/hooks/useReaderProgress.test.tsx`
- `src/__tests__/services/ProgressDriveSyncService.test.ts` (novo)

**Tests to add or update**:
- Hook: restauração é chamada antes de `getProgress`, e o progresso restaurado vira `savedProgress`.
- Hook: sem progresso local, posição no início não é persistida (nem no flush ao desmontar); posição > 0 é.
- Serviço: remoto mais novo é aplicado; local mais novo vence; prazo estourado/erro → `{ restored: false }` sem lançar; `permission-error` pula.

## Risks & Considerations

- Abrir um livro (Pro com Drive) fica até ~2,5 s mais lento no pior caso (rede ruim). Web/free resolvem rápido (entitlement).
- Restauração que termina depois do prazo ainda grava no Dexie (não é cancelada); a posição só vale na próxima abertura e, como usa o `updatedAt` remoto, uma posição local mais nova da sessão atual a sobrescreve.
- Dano pré-existente: se B já gravou o início com timestamp novo antes desta correção, o LWW considera B mais recente — não dá para distinguir sem semântica adicional.
- Abrir um livro novo direto num capítulo (startHref) continua gravando (fraction > 0) — comportamento esperado.

## Open Questions

- Nenhuma bloqueante.
