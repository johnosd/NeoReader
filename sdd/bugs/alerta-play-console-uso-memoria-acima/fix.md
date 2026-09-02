# Bug Fix: Uso de memória acima do threshold do Play Console

- **Slug**: alerta-play-console-uso-memoria-acima
- **Corrigido**: 2026-09-01
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Implementados os 4 mecanismos pontuais identificados no assessment: o app
agora reage a `onTrimMemory`/`appStateChange` (nativo e JS) liberando
caches/bitmap não essenciais, o bitmap de capa do TTS é reciclado
corretamente, capas locais ganharam lazy-loading, e as rows sem paginação da
Home passaram a ter um teto de 20 livros.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `android/app/src/main/java/com/johnny/neoreader/MainActivity.java` | modified | `onTrimMemory(int)` override: limpa cache do WebView (`bridge.getWebView().clearCache(false)`) a partir de `TRIM_MEMORY_BACKGROUND` |
| `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java` | modified | Novo `releaseCoverBitmap()` (recycle + null-safe), chamado em `onDestroy()`, antes de reatribuir em `updateMetadata()`, e em novo override de `onTrimMemory(int)` a partir de `TRIM_MEMORY_BACKGROUND` |
| `src/services/WordLensDataService.ts` | modified | Nova função exportada `clearWordLensDictionaryPartitionsCache()` — limpa só `cachedDictionaryPartitions`, sem tocar `cachedDataPromise` (mantém `resetWordLensDataCacheForTests` intacta pros testes existentes) |
| `src/App.tsx` | modified | Listener de `appStateChange` já existente (linha ~144) passou a chamar `clearWordLensDictionaryPartitionsCache()` também, quando `!state.isActive` |
| `src/components/BookCard.tsx` | modified | `<img>` da capa ganhou `loading="lazy" decoding="async"` |
| `src/components/LibraryGridView.tsx` | modified | idem |
| `src/components/ProgressCard.tsx` | modified | idem |
| `src/screens/LibraryScreen.tsx` | modified | idem (thumbnail da lista) |
| `src/screens/BookDetailsScreen.tsx` | modified | idem (capa grande) |
| `src/components/HeroBanner.tsx` | modified | As 2 `<img>` (fundo borrado + capa nítida) ganharam só `decoding="async"` — sem `loading="lazy"`, por serem above-the-fold (decisão confirmada com o usuário) |
| `src/hooks/useLibraryGroups.ts` | modified | Novo `MAX_RECENT_BOOKS_HOME = 20`; `recentBooks` agora tem `.slice(0, 20)` |
| `src/hooks/useCategoryGroups.ts` | modified | Novo `MAX_BOOKS_PER_ROW_HOME = 20`; `books` de cada grupo agora tem `.slice(0, 20)` |

## Tests Added or Updated

- `src/__tests__/services/WordLensDataService.test.ts::limpa o cache de particoes sem afetar o cache de dados base` — trava que `clearWordLensDictionaryPartitionsCache()` esvazia só as partições, não o manifest/levels/lemmas
- `src/__tests__/hooks/useLibraryGroups.test.ts` (novo arquivo, 2 testes) — trava o limite de 20 em `recentBooks` e confirma que bibliotecas menores não são cortadas
- `src/__tests__/hooks/useCategoryGroups.test.ts` (novo arquivo, 2 testes) — trava o limite de 20 nos livros de cada row de gênero e confirma que gêneros menores não são cortados

Lado nativo (Java) permanece sem cobertura automatizada, conforme já
registrado no assessment — não há infraestrutura de teste unitário pros
Services/Activity no projeto hoje.

## Local Verification

- `npx vitest run src/__tests__/services/WordLensDataService.test.ts src/__tests__/hooks/useLibraryGroups.test.ts src/__tests__/hooks/useCategoryGroups.test.ts` → 19 passed (0 unhandled rejections após ajustar o mock de `useLiveQuery`)
- `npm run lint` → limpo
- `npx tsc --noEmit` → sem erros
- `npm test` (suite completa) → 752 passed | 2 skipped (100 arquivos, nenhuma regressão)
- `npm run build` → build de produção OK (warnings de chunk size são pré-existentes, não relacionados)
- `./gradlew.bat :app:compileDebugJavaWithJavac` (dentro de `android/`) → `BUILD SUCCESSFUL`; nota de API deprecated no `TtsPlaybackService.java` é pré-existente (import `android.support.v4.media.*`, compat shim legado já usado antes deste fix — não introduzida por ele)
- **Não verificado**: instalação/execução manual no device (RXCX103NMVZ conectado, mas não rodei `android:run` nem profiling — fica pra fase Test, junto com o proxy de reprodução já sinalizado como `[NEEDS CLARIFICATION]` no assessment)

## Deviations from Assessment

- **`WordLensDataService.ts`**: em vez de "promover `resetWordLensDataCacheForTests` a função de propósito geral" (como o assessment sugeria como abordagem preferida), criei uma função nova e menor, `clearWordLensDictionaryPartitionsCache()`, que limpa só o cache de partições (o que de fato importa pra memória) e deixei `resetWordLensDataCacheForTests` intocada. Reduz o risco de mexer numa função já usada por todos os testes existentes do arquivo, sem perder nada do objetivo original.
- Nenhuma outra divergência — todos os arquivos tocados estavam na lista "Files likely to change" do assessment.

## Follow-ups

- Rodar a fase **Test** deste bug: reprodução local/profiling (Android Studio Memory Profiler) ainda não foi feita — é o `[NEEDS CLARIFICATION]` que ficou em aberto no assessment.
- Itens fora de escopo deste bug (tratar como nova implementação, spec separada, combinado com o usuário): downsample de capa no import, virtualização real da grid/rows da biblioteca, patch no `foliate-js` pra evictar capítulos pra trás no scroll contínuo.
- Bucket "Optimization" (0%, cobertura R8) do mesmo alerta do Play Console não foi tratado — está fora do escopo deste bug (ver Report em assessment.md).
