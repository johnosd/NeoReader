# Bug Fix: Progresso no Drive não é restaurado pelo app

- **Slug**: progresso-no-drive-nao-restaurado-pelo
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário via orquestrador)

- Helper `restoreBookProgressBeforeOpen` no serviço: chama a restauração existente com prazo (2,5 s), nunca lança, pula com `permission-error`.
- `useReaderProgress` chama o helper antes de `getProgress` no mount (skeleton continua durante a espera).
- Livro aberto sem progresso local: `persistProgress` ignora posições no início do livro até o usuário sair dele; depois disso volta a gravar tudo (inclusive voltar ao começo).
- Sem ligação na importação (a abertura cobre o livro recém-importado).
- Testes do hook e teste novo do serviço.

## Summary

O leitor agora traz do Drive a posição remota mais recente (LWW por
`updatedAt`, regra já existente no serviço) antes de decidir a posição inicial,
com prazo para não travar offline. Um livro aberto sem progresso não grava o
"início por padrão", então abrir/fechar não publica reinício por cima de uma
posição remota que não pôde ser restaurada.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/ProgressDriveSyncService.ts` | modified | `PROGRESS_RESTORE_ON_OPEN_TIMEOUT_MS` + `restoreBookProgressBeforeOpen` (Promise.race com prazo) |
| `src/hooks/useReaderProgress.ts` | modified | restaura antes de `getProgress`; `isAtBookStart` + `openedWithoutProgressRef` no `persistProgress` |
| `src/__tests__/hooks/useReaderProgress.test.tsx` | modified | mock do serviço + 5 testes |
| `src/__tests__/services/ProgressDriveSyncService.test.ts` | added | 6 testes do helper/restauração |

## Tests Added or Updated

- `useReaderProgress.test.tsx::restaura o progresso do Drive antes de ler a posição inicial local`
- `::falha da restauração não impede abrir com o progresso local` (uso offline)
- `::livro sem progresso: abrir e fechar no início não grava reinício` (debounce, flush e unmount)
- `::livro sem progresso: grava assim que sai do início e depois aceita voltar ao começo`
- `::livro com progresso local salva normalmente a volta para o início`
- `ProgressDriveSyncService.test.ts`: remoto aplicado sem local (com `updatedAt` remoto); local mais recente vence; remoto mais recente substitui; prazo com Drive pendurado; erro inesperado não lança; `permission-error` não chama o Drive.

## Local Verification

- `npx vitest run src/__tests__/hooks/useReaderProgress.test.tsx src/__tests__/services/ProgressDriveSyncService.test.ts src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/screens/SettingsSyncScreen.test.tsx` → 4 arquivos, 138 testes passaram.
- `npx vitest run src/__tests__/App.test.tsx` → 24 passaram.
- `npx eslint` nos 4 arquivos → limpo. `npx tsc -p tsconfig.app.json --noEmit` → sem erros.

## Deviations from Assessment

- Nenhuma. `BookImportService.ts`, `ReaderScreen.tsx` e `App.tsx` não foram tocados.

## Follow-ups

- Validação ponta a ponta com dois dispositivos e Drive real (não feita).
- Se o produto quiser perguntar "continuar de onde parou no outro aparelho?" em vez do LWW automático, isso é feature (`sdd-specify`).
- Opcional: restaurar também na importação para pré-aquecer a primeira abertura.
