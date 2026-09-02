# Bug Assessment: Uso de memória acima do threshold do Play Console

- **Slug**: alerta-play-console-uso-memoria-acima
- **Criado**: 2026-09-01
- **Origem**: texto colado (alerta do Google Play Console, release 20 / 1.0.16)
- **Veredito**: valid
- **Severidade**: high

## Report

> 1 issue needs attention
> App optimization is below our threshold
> Improve your percentages in the following categories:
> Optimization (0%)
> Percentages under 25% in any category of your app may impact your visibility and publishing capabilities on Google Play. To prevent this, optimize your app by the deadline. Learn more
> Memory usage
> Bad behavior
> Release name: 20 (1.0.16)

Contexto adicional (pesquisa web, 2026-09-01): é a política *Technical quality
requirements* do Google, anunciada 26/08/2026. O bucket "Memory usage / Bad
behavior" mede P90 de 28 dias de Anonymous RSS+Swap e memória de bitmaps, por
estado do app (foreground / user-perceptible / background / cached).
Enforcement (impacto real em visibilidade/publicação) começa em fevereiro de
2027 — hoje é só o alerta.

Esta assessment cobre apenas o bucket "Memory usage / Bad behavior" (uso de
RAM em runtime). O bucket separado "Optimization" (cobertura de shrink/
obfuscate do R8, prejudicada pelos `-keep class com.getcapacitor.** { *; }`
em `android/app/proguard-rules.pro`) foi identificado na mesma investigação
mas está fora de escopo deste bug — tratar separadamente se o usuário pedir.

## Symptom

O app usa mais memória do que o P90 aceito pelo Google para o estado do
processo (foreground/background/cached), classificado como "bad behavior".
Comportamento esperado: o app deveria liberar memória não essencial quando
sai de foreground ou quando o sistema sinaliza pressão de memória, e não
deveria reter/decodificar mais bitmaps do que o necessário para o que está
efetivamente visível.

## Reproduction

A evidência primária é telemetria de campo do Google (P90 de 28 dias, não
re-executável sob demanda) — não uma reprodução determinística local. Os 4
mecanismos abaixo, porém, são confirmados diretamente por leitura de código
(não são hipóteses): cada um é um defeito objetivamente verificável,
independente de perfilar o app.

1. `[NEEDS CLARIFICATION: reprodução local não foi executada nesta
   assessment]` — proxy sugerido para a fase Test: abrir uma biblioteca
   grande (100+ livros) no Android Studio Memory Profiler, navegar Home/
   Biblioteca, ler um livro longo do início ao fim em scroll contínuo,
   tocar um audiobook (TTS) trocando de capítulo várias vezes, colocar o
   app em background — observar se o RSS cresce sem limite e não cai ao
   sair de foreground.

## Suspected Code Paths

**1. Ausência de reação a pressão de memória / app em background**
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java:1-15` — nenhum override de `onTrimMemory`/`onLowMemory`; nenhuma classe `Application` customizada existe no projeto (confirmado: `AndroidManifest.xml` não tem `android:name` na tag `<application>`).
- `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java:36-134` — `Service` também não implementa `onTrimMemory`/`onLowMemory`, apesar de rodar como foreground service (`android:foregroundServiceType="mediaPlayback"`, `AndroidManifest.xml:48-51`) durante sessões de audiobook.
- `src/services/WordLensDataService.ts:19-20` — `cachedDataPromise` e `cachedDictionaryPartitions` (Map de até ~222 partições, ~7MB de JSON parseado) são module-level, sem TTL/limite, só zerados em `resetWordLensDataCacheForTests()` (`:203-206`), chamada apenas em testes.
- `src/App.tsx:138-156` — já existe um listener de `appStateChange` (`CapApp.addListener`) que reage a `!state.isActive` cancelando import ativo (`BookImportService.cancelActiveImport`), mas não limpa nenhum cache de memória.

**2. Bitmap de capa do TTS não reciclado**
- `TtsPlaybackService.java:60` — campo `private Bitmap currentCoverBitmap`.
- `TtsPlaybackService.java:143` — `currentCoverBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length)` a cada `updateMetadata()`, sem `.recycle()` do bitmap anterior antes de sobrescrever a referência.
- `TtsPlaybackService.java:123-134` (`onDestroy`) — libera wake lock/audio focus/media session, mas nunca recicla/zera `currentCoverBitmap`.
- Usado em `:292-293` (`MediaMetadataCompat`) e `:350-351` (`NotificationCompat.setLargeIcon`).

**3. Capas locais sem `loading="lazy"`/`decoding="async"`**
- `src/components/BookCard.tsx:42`
- `src/components/LibraryGridView.tsx:32-37`
- `src/components/HeroBanner.tsx:38-44` (fundo borrado) e `:46-52` (capa nítida — mesma imagem decodificada 2×)
- `src/components/ProgressCard.tsx:35`
- `src/screens/LibraryScreen.tsx:778`
- `src/screens/BookDetailsScreen.tsx:503`
- Contraste: `src/components/OpdsEntryCard.tsx:114-121` e `src/components/PublicDomainBookCard.tsx:54-61` (capas remotas do catálogo OPDS) já usam `loading="lazy"` — o padrão existe no projeto, só não foi aplicado às capas locais.

**4. Listas de capas sem limite alimentando a Home**
- `src/hooks/useLibraryGroups.ts:72-74` — `recentBooks` = todos os livros da biblioteca exceto o hero, sem `.slice()`, consumido em `src/screens/HomeScreen.tsx:183` (`<BookRow ... books={recentBooks} .../>`).
- `src/hooks/useCategoryGroups.ts:66-73` — `MAX_ROWS_HOME = 6` (`:27`) limita quantas **rows** de gênero aparecem, mas `books: grouped.get(genre)!` (`:72`) não limita quantos livros cada row individual carrega; consumido em `src/screens/HomeScreen.tsx:185-194`.
- Nenhum componente de biblioteca (`LibraryGridView.tsx`, `LibraryScreen.tsx`, `BookRow.tsx`) faz virtualização — todos os `<img>` do array passado ficam no DOM simultaneamente. Virtualização de verdade fica fora de escopo (é nova implementação, precisa de dependência nova); aqui o fix é só parar de alimentar as rows com a biblioteca inteira sem limite.

## Root Cause Hypothesis

Confiança: **high** (cada mecanismo abaixo é verificado por leitura direta do
código, não inferido). O app nunca foi projetado para reagir a pressão de
memória ou ao ficar em background — nem no lado nativo (sem
`onTrimMemory`/`onLowMemory` em nenhum componente) nem no lado JS (caches
com TTL próprio, mas sem gatilho externo de liberação). Isso é agravado por
alguns pontos que retêm mais bitmap do que o necessário: o bitmap de capa do
TTS nunca reciclado, a ausência de lazy-loading nas capas locais (ao
contrário do padrão já usado para capas remotas do OPDS) e listas de
biblioteca sem limite alimentando rows inteiras na Home. Nenhum desses é uma
regressão recente — são lacunas estruturais presentes desde que essas partes
do código foram escritas.

## Proposed Remediation

**Preferida**: corrigir os 4 mecanismos como mudanças pontuais e isoladas,
cada uma no padrão já existente no projeto (não introduzir abstrações novas):

1. **Reação a pressão de memória**: `TtsPlaybackService` ganha um override
   de `onTrimMemory(int level)` que recicla `currentCoverBitmap` e zera a
   referência a partir de um nível de trim relevante (ex.:
   `TRIM_MEMORY_BACKGROUND` ou pior); `onDestroy()` passa a reciclar/zerar
   o bitmap também. `MainActivity` ganha um override de `onTrimMemory` que
   limpa o cache do WebView (`bridge.getWebView().clearCache(false)`) a
   partir do mesmo patamar. No lado JS, estender o listener de
   `appStateChange` já existente em `App.tsx:144-148` (mesmo bloco que hoje
   cancela import ativo) para também limpar
   `WordLensDataService.cachedDictionaryPartitions` quando `!state.isActive`
   — reaproveita a dependência `@capacitor/app` e o hook já instalados, sem
   inventar plumbing nativo→JS novo. Isso exige promover
   `resetWordLensDataCacheForTests()` a uma função exportada de propósito
   geral (não só-teste) — provavelmente só remover o sufixo "ForTests" do
   nome e ajustar o import no teste existente.
2. **Bitmap do TTS**: reciclar o bitmap anterior antes de sobrescrever
   `currentCoverBitmap` em `updateMetadata()`, e reciclar/zerar em
   `onDestroy()`.
3. **Lazy loading de capas locais**: adicionar `loading="lazy"
   decoding="async"` em `BookCard.tsx:42`, `LibraryGridView.tsx:32-37`,
   `ProgressCard.tsx:35`, `LibraryScreen.tsx:778`, `BookDetailsScreen.tsx:503`.
   **Decidido com o usuário**: as duas imagens do `HeroBanner` (`:38-44` e
   `:46-52`) ficam de fora do `loading="lazy"` (são above-the-fold, sempre
   visíveis ao abrir a Home — lazy ali é inútil e pode atrasar a primeira
   pintura), mas recebem `decoding="async"` sozinho.
4. **Limite nas rows sem paginação da Home**: aplicar `.slice(0, 20)` em
   `recentBooks` (`useLibraryGroups.ts:72-74`) e no `books` de cada grupo em
   `useCategoryGroups.ts:69-73`. **Decidido com o usuário: N = 20** —
   cobre bem o scroll horizontal típico e prioriza bounding de memória, já
   que `onViewAll` continua acessível pra lista completa.

**Alternativas** (opcional):
- Para o item 1, criar uma classe `Application` customizada em vez de usar
  `MainActivity`/`Service` diretamente — mais "correto" arquiteturalmente
  (callback de memória é processo-wide por natureza), mas adiciona uma
  classe nova + registro no manifest só pra isso. Rejeitada como preferida
  porque `Service.onTrimMemory`/`Activity.onTrimMemory` já são chamados
  automaticamente pelo framework sem esse registro extra, e o projeto só
  tem 2 componentes relevantes (Activity + o único Service) — menor
  superfície de mudança.

**Files likely to change**:
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`
- `android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java`
- `src/App.tsx`
- `src/services/WordLensDataService.ts`
- `src/__tests__/services/WordLensDataService.test.ts`
- `src/components/BookCard.tsx`
- `src/components/LibraryGridView.tsx`
- `src/components/HeroBanner.tsx`
- `src/components/ProgressCard.tsx`
- `src/screens/LibraryScreen.tsx`
- `src/screens/BookDetailsScreen.tsx`
- `src/hooks/useLibraryGroups.ts`
- `src/hooks/useCategoryGroups.ts`

**Tests to add or update**:
- `src/__tests__/services/WordLensDataService.test.ts` — renomear/estender o
  teste que hoje usa `resetWordLensDataCacheForTests` e adicionar um caso
  que confirma que a nova função de limpeza esvazia
  `cachedDictionaryPartitions`.
- Novo `src/__tests__/hooks/useLibraryGroups.test.tsx` (ou estender se já
  existir teste correlato) — confirmar que `recentBooks` respeita o limite
  aplicado.
- Novo `src/__tests__/hooks/useCategoryGroups.test.ts` — confirmar que
  `books` de cada grupo respeita o limite aplicado.
- Lado nativo (Java): não há infraestrutura de teste unitário pros
  Services/Activity no projeto hoje (só `androidTestImplementation`
  instrumentado, não usado pra isso). Recycle do bitmap e `onTrimMemory`
  ficam sem cobertura automatizada — verificação será manual (logcat/
  profiler) na fase Test. Registrar isso explicitamente, não fingir
  cobertura que não existe.

## Risks & Considerations

- Reciclar `currentCoverBitmap` sob `onTrimMemory` pode fazer a
  notificação/lockscreen do TTS perder a arte da capa temporariamente até o
  próximo `updateMetadata()` — trade-off aceitável (memória > cosmético),
  mas vale confirmar visualmente no device.
- Limitar `recentBooks`/`categoryGroups` muda comportamento visível (rows
  da Home mostram menos itens) — não é só um fix invisível de performance,
  o usuário pode notar. Vale confirmar o valor de N com o usuário antes de
  aplicar, já que é uma decisão de produto pequena embutida num bug fix.
- `loading="lazy"` em navegadores/WebView mais antigos é ignorado
  graciosamente (atributo desconhecido, sem erro) — baixo risco de
  regressão cross-platform.
- Limpar `cachedDictionaryPartitions` a cada `appStateChange` de
  backgrounding pode gerar re-fetch (de asset local, não rede — barato) se
  o usuário voltar ao app rapidamente e tocar a mesma palavra de novo; não
  é um problema de custo real já que os arquivos são locais
  (`public/word-lens/`), só uma pequena perda de cache.
- `Service.onTrimMemory`/`Activity.onTrimMemory` só disparam enquanto o
  processo do app está vivo; não substituem o SO matando o processo sob
  pressão extrema — é mitigação, não garantia.

## Open Questions

- `[NEEDS CLARIFICATION: reprodução local/profiling não foi feita — a
  fase Test deve rodar o proxy de reprodução sugerido acima antes de
  marcar verified]`
- ~~valor exato de N~~ — **resolvido**: N = 20, confirmado com o usuário.
- ~~loading="lazy" no HeroBanner~~ — **resolvido**: sem `loading="lazy"`
  nas 2 imagens do HeroBanner (above-the-fold), só `decoding="async"`,
  confirmado com o usuário.
- Nível de trim exato (`TRIM_MEMORY_BACKGROUND` vs `TRIM_MEMORY_MODERATE`
  vs `TRIM_MEMORY_RUNNING_LOW`) a usar como gatilho nos overrides nativos —
  decidir na fase Fix, favorecendo o nível que já cobre "app em
  background" já que é o bucket citado no alerta original.
