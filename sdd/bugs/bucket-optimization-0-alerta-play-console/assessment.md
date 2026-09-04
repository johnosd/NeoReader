# Bug Assessment: Bucket "Optimization" (0%) do alerta de qualidade técnica do Play Console

- **Slug**: bucket-optimization-0-alerta-play-console
- **Criado**: 2026-09-04
- **Origem**: entrada `[Bug]` de `.planning/backlog.md` → "Ideias Futuras", originada da investigação do bug `alerta-play-console-uso-memoria-acima` (2026-09-01)
- **Veredito**: valid, held (ver Root Cause Hypothesis e Status Final — impacto real no Play Console é marginal; usuário decidiu não prosseguir)
- **Severidade**: low

## Report

> Bucket "Optimization" (0%) do alerta de qualidade técnica do Play Console (release 20/1.0.16) — cobertura de shrink/obfuscate/optimize do R8 no DEX nativo. `minifyEnabled true`/`shrinkResources true` já ligados desde a versionCode 2, mas `android/app/proguard-rules.pro` tem `-keep class com.getcapacitor.** { *; }` genérico demais, isentando praticamente todo o código nativo (majoritariamente runtime do Capacitor) da otimização real. Achado durante a investigação do bug de memória (2026-09-01), tratado como fora de escopo daquele fix. Enforcement do Google só em fev/2027, sem urgência.

## Symptom

Nenhum sintoma funcional — nada quebra para o usuário. O Play Console classifica o bucket "Optimization" (cobertura de shrink/obfuscate/optimize do R8) como 0%/abaixo do threshold para a release 20 (1.0.16), o que pode afetar visibilidade/publicação a partir de fev/2027 (sem impacto hoje).

## Reproduction

Não é reprodução determinística local — é telemetria/análise estática do Google sobre o AAB publicado. Proxy usado nesta assessment: analisar as regras de ProGuard/R8 efetivamente aplicadas e o output real de um build de release já existente localmente (`android/app/build/outputs/mapping/release/`, gerado 2026-08-29, mesmo `proguard-rules.pro` e mesma árvore de dependências de hoje — `[NEEDS CLARIFICATION: não é byte-idêntico à release 20/1.0.16 avaliada pelo Google, mas reflete a mesma configuração de regras e dependências atuais]`).

## Suspected Code Paths

- `android/app/proguard-rules.pro:23` — `-keep class com.getcapacitor.** { *; }`: mantém **toda** a árvore de pacotes `com.getcapacitor.*` (runtime core do Capacitor + os 3 plugins community que ainda usam esse namespace legado) sem shrink/obfuscate/otimização, incluindo membros não usados (`{ *; }`).
- `android/app/proguard-rules.pro:25` — `-keep class com.getcapacitor.community.tts.** { *; }`: subconjunto redundante da linha 23 (já coberto por ela).
- `android/app/build.gradle:40-42` — confirma `minifyEnabled true`, `shrinkResources true`, `proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'` — o pipeline de otimização do R8 **está** ligado corretamente; o problema é só a amplitude das regras de `-keep`, não a ausência de otimização.
- `node_modules/@capacitor/android/capacitor/proguard-rules.pro:8-16` — regras oficiais do próprio Capacitor (mescladas automaticamente no build via consumer proguard do AAR, independente do que este projeto declara): `-keep public class * extends com.getcapacitor.Plugin { *; }` + regras específicas por método anotado (`@PluginMethod`, `@PermissionCallback`, etc.). **Todas as 5 classes de plugin deste app** (`TextToSpeechPlugin`, `AdMob`, `KeepAwakePlugin`, `NeoReaderLibraryPlugin`, `NeoReaderTtsPlaybackPlugin` — confirmado via `grep "extends Plugin"`) já estendem `com.getcapacitor.Plugin` e são anotadas `@CapacitorPlugin`, então **já são mantidas pela regra oficial do Capacitor**, independente das linhas 23/25 do projeto.
- `android/app/build/outputs/mapping/release/seeds.txt` (build local de 2026-08-29, 113.093 linhas — todas as classes/membros que o R8 manteve sem shrink/obfuscate em toda a árvore de dependências, não só Capacitor): das 11.802 classes-raiz mantidas, a quebra por pacote de topo é:

  | Pacote | Classes-raiz mantidas | % do total |
  | --- | --- | --- |
  | `com.google.*` (Firebase + Play Services + AdMob) | 8.892 | ~75% |
  | `com.revenuecat.*` | 2.090 | ~18% |
  | `com.amazon.*` (mediação de ads) | 402 | ~3,4% |
  | `com.getcapacitor.*` | 138 | ~1,2% |
  | `com.capacitorjs.*` (plugins oficiais mais novos: `@capacitor/app`, `@capacitor/preferences`) | 3 | ~0,03% |
  | `com.johnny.*` (plugins próprios do NeoReader) | 4 | ~0,03% |
  | outros (androidx, kotlin, chromium, apache) | ~273 | ~2,3% |

## Root Cause Hypothesis

Confiança: **high** para a causa técnica direta (regra `-keep class com.getcapacitor.** { *; }` genérica demais, verificada por leitura de código e por output real de build), mas **a hipótese de impacto do report original está superestimada** — não é "high" que corrigir isso resolva o alerta do Play Console.

`-keep class com.getcapacitor.** { *; }` é de fato desnecessariamente amplo: o próprio Capacitor já mescla suas regras oficiais de consumer-proguard automaticamente (confirmado no artefato de build), e todas as classes de plugin deste app já são cobertas por essa regra oficial (`extends Plugin` + `@CapacitorPlugin`) — a regra manual do projeto é, na prática, **quase inteiramente redundante**, mantendo só o runtime interno do Capacitor (Bridge, JSObject, PluginCall etc.) sem necessidade aparente.

Porém, o output real do R8 (seeds.txt de um build de release local, mesma configuração de hoje) mostra que **`com.getcapacitor.*` representa só ~1,2% das classes-raiz mantidas sem otimização** — o resto (~97%) vem de regras de consumer-proguard **de bibliotecas de terceiros fora do controle deste projeto**: Firebase/Play Services/AdMob (`com.google.*`, ~75%), RevenueCat (`com.revenuecat.*`, ~18%) e mediação de ads da Amazon (`com.amazon.*`, ~3,4%). Essas regras vêm embutidas nos próprios AARs dessas SDKs e são mescladas automaticamente pelo Gradle — `android/app/proguard-rules.pro` não tem como "desfazer" ou restringir keep rules que outra dependência declara (R8 combina regras de forma aditiva, nunca subtrativa).

**Conclusão prática**: mesmo removendo por completo as linhas 23 e 25 de `proguard-rules.pro`, o bucket "Optimization" do Play Console muito provavelmente continuaria baixo, porque a maior parte da superfície não otimizada é estrutural ao uso de Firebase + AdMob + RevenueCat, não a uma escolha deste projeto. Vale corrigir a regra genérica mesmo assim (é hygiene real — menos classes retidas sem necessidade, binário ligeiramente menor), mas **sem prometer que isso resolve o alerta do Play Console**.

## Proposed Remediation

**Preferida**: remover a linha 23 (`-keep class com.getcapacitor.** { *; }`) e a linha 25 (`-keep class com.getcapacitor.community.tts.** { *; }`, redundante) de `android/app/proguard-rules.pro`, confiando nas regras oficiais já mescladas automaticamente pelo `@capacitor/android` (que já cobrem as 5 classes de plugin deste app via `extends Plugin`/`@CapacitorPlugin`). Manter a linha 24 (`-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }`) — mais estreita (só classes anotadas, não o pacote inteiro), baixo risco, baixo ganho em removê-la também.

**Alternativas** (opcional):
- Não fazer nada — dado que o impacto real no Play Console é marginal (ver Root Cause Hypothesis) e o enforcement só começa em fev/2027, é uma opção legítima de baixa prioridade. Rejeitada como "preferida" só porque a limpeza em si é de baixo risco e baixo esforço, não porque haja urgência.
- Narrow ainda mais (ex.: `-keepclassmembers` em vez de `-keep class ... { *; }` para casos específicos) — desnecessário dado que as regras oficiais do Capacitor já são suficientemente precisas; reinventar isso manualmente adiciona risco sem benefício sobre simplesmente confiar no consumer-proguard oficial.

**Files likely to change**:
- `android/app/proguard-rules.pro`

**Tests to add or update**:
- Não há suíte de teste automatizado pra regras ProGuard/R8 neste projeto (mudança é config de build nativo, não código testável via Vitest). Validação é via build de release real + smoke test manual (ver Risks & Considerations) — igual ao padrão já usado no projeto pra mudanças nativas Android sem cobertura automatizada (ex.: bitmap recycle do TTS, `onTrimMemory`).

## Risks & Considerations

- **Risco real, precisa validação em build de release assinado**: remover regras de `-keep` é uma mudança que só quebra em build de **release** (minified), nunca em debug — um erro aqui (`ClassNotFoundException`/`NoSuchMethodException` em runtime) só apareceria depois de publicado, ou em teste manual explícito de um APK/AAB release instalado num device real. A fase Fix **não deve considerar isso concluído sem** gerar um build de release real (`./gradlew.bat bundleRelease` ou `assembleRelease`), instalar num device, e exercitar manualmente cada funcionalidade que passa pela ponte nativa: importar EPUB (picker nativo), TTS (community plugin), AdMob (anúncios), login Firebase, compra/RevenueCat.
- Mesmo com a correção, o alerta do Play Console **não deve ser esperado como resolvido** — comunicado explicitamente para não gerar expectativa errada (ver Root Cause Hypothesis). O ganho real é hygiene/binário ligeiramente menor, não a métrica do Play Console.
- O `seeds.txt`/`mapping.txt` usados como evidência são de um build local de 2026-08-29 — não é byte-idêntico à release 20/1.0.16 que o Google avaliou, mas usa a mesma configuração de regras e árvore de dependências atual do repositório (nenhuma mudança em `proguard-rules.pro` ou nas versões de `@capacitor/*`/`@capacitor-firebase/*`/`@revenuecat/*` desde então, até onde verificado nesta assessment).

## Open Questions

- ~~confirmar se vale prosseguir com o fix dado que o impacto real na métrica do Play Console é marginal~~ — **resolvido**: usuário decidiu não prosseguir (2026-09-04), dado o ganho pequeno frente ao esforço/risco de validar em build de release real. Fica em `held` — a fase Fix não roda. Reabrir se a prioridade mudar (ex.: se o enforcement de fev/2027 se aproximar, ou se houver motivação nova além da hygiene).

## Status Final

**Held** (2026-09-04) — assessment concluída, veredito `valid`/`low`, mas o usuário optou por não prosseguir pra fase Fix: o ganho real (limpeza de ~1,2% da superfície não otimizada) não justifica o esforço de validar em build de release assinado + smoke test manual no device, especialmente sabendo que isso **não resolve** o alerta do Play Console (dominado por regras de Firebase/RevenueCat/AdMob fora do controle do projeto — ver Root Cause Hypothesis). Nenhuma mudança de código foi feita.
