# Relatório de Code Review — Decisão de Release Play Store

- Data: 2026-06-23
- Branch revisada: `feature/book-import-drive`
- Alvo: produção Android / Google Play
- App em produção: sim (versão atual `versionName 1.0.13` / `versionCode 17`)
- Revisor: code review automatizado (somente leitura; nenhum arquivo de código/config/teste alterado)

---

## 1. Resumo executivo

A base do NeoReader está sólida e madura: o build de produção web (`tsc -b && vite build`) passa, o
plugin nativo de importação tem hardening real (proteção XXE no parser de OPF, anti-path-traversal em
`deleteLocalBookFile`, leitura em chunks com sessão de `FileChannel`, dedupe por SHA-256, limite de capa),
o `BillingService` (RevenueCat) e o `AdsService` (AdMob) são defensivos e viram no-op silencioso quando
faltam credenciais, não há segredos versionados no Git, as permissões Android são mínimas (apenas
`INTERNET` + SAF via `ACTION_OPEN_DOCUMENT`, compatível com scoped storage), e os ícones adaptativos /
splash estão completos.

**Não encontrei bloqueador de crash, perda de dados ou cobrança incorreta no código.** Porém, a branch
candidata a release introduz uma feature **incompleta** (`driveImportCount`: migração de schema v16 +
tipos, mas sem nenhuma lógica que a leia/incremente) que **quebra a suíte de testes** e a checagem de
**lint** — ambas são gates de release explícitos do próprio projeto (`AGENTS.md`: "Run tests before opening
a PR"; `CLAUDE.md` regra 5: só concluir se o build passar sem erros). Além disso, dois pontos de checklist
de publicação não puderam ser verificados neste ambiente e são críticos para monetização (injeção das
chaves `VITE_REVENUECAT_*`/`VITE_ADMOB_*` no build de release e a geração/assinatura do AAB via Gradle).

## 2. Decisão Go/No-Go

**NO-GO (condicional)** para esta branch como está.

Não por risco catastrófico no código, mas porque a release sairia com:
1. suíte de testes vermelha (`npm test` falha);
2. lint vermelho (`npm run lint` falha com 4 erros);
3. scaffolding de feature incompleto (`driveImportCount`) mergeado, incluindo uma migração de banco v16
   que roda em todos os usuários sem nenhuma funcionalidade que a consuma;
4. dois itens críticos de monetização/publicação **não verificados** (env de release + AAB assinado).

Após resolver os itens de severidade **Alta** abaixo e confirmar os dois itens "Não verificado" do
checklist, a branch fica apta a **GO**.

## 3. Bloqueadores

Nenhum bloqueador "hard" (crash em runtime, perda de dados, cobrança incorreta, fluxo essencial quebrado
em produção) foi identificado no código revisado.

Os itens que **impedem o release neste estado** são gates de qualidade/publicação e estão listados como
**Alta** (A1–A4). Trate A1, A2 e A4 como condição de merge/release.

---

## 4. Achados por severidade

### Alta

#### A1 — `npm test` falhando: teste de settings dessincronizado pela feature `driveImportCount`

- Arquivos:
  - [src/__tests__/db/settings.test.ts:51-71](src/__tests__/db/settings.test.ts#L51-L71)
  - [src/types/settings.ts:76](src/types/settings.ts#L76)
  - [src/db/database.ts:299-323](src/db/database.ts#L299-L323)
- Evidência: `npm test` → `1 failed | 471 passed | 2 skipped`. O teste
  "normaliza registros legados para appSettings + readerDefaults" usa `expect(settings).toEqual({...})`
  (igualdade exata) e não inclui o campo novo. `normalizeUserSettings` agora retorna sempre
  `driveImportCount: 0`, então o objeto recebido tem uma chave a mais que a esperada.
  ```
  AssertionError: expected { id: 7, driveImportCount: +0, …(3) } to deeply equal { id: 7, appSettings: { …(6) }, …(2) }
  +   "driveImportCount": 0,
  ```
- Impacto: a suíte de testes do projeto fica vermelha, violando o gate de `AGENTS.md`/`CLAUDE.md`.
  Sinaliza que a feature foi mergeada sem atualizar os testes que ela afeta.
- Reprodução: `npm test` (ou `npx vitest run src/__tests__/db/settings.test.ts`).
- Recomendação: atualizar a asserção do teste para incluir `driveImportCount: 0` **ou** concluir/remover
  a feature (ver A4). Não é bug de runtime — `normalizeUserSettings` está correto — é asserção
  desatualizada.

#### A2 — `npm run lint` falhando (4 erros) — gate de qualidade vermelho

- Evidência (`npm run lint` → `✖ 4 problems (4 errors, 0 warnings)`, exit 1):
  - [src/__tests__/components/EpubViewer.test.tsx:470](src/__tests__/components/EpubViewer.test.tsx#L470) e
    [:490](src/__tests__/components/EpubViewer.test.tsx#L490) — `'para' is assigned a value but never used`.
  - [src/components/ui/Button.tsx:18](src/components/ui/Button.tsx#L18) — `'_tone' is defined but never used`.
    O parâmetro `_tone` é recebido por `variantClasses` mas a função ignora completamente o tom; o
    comentário diz que "tone só afeta primary/outline", mas a implementação não usa `tone` em lugar nenhum
    (dead parameter).
  - [src/screens/DiscoverScreen.tsx:45](src/screens/DiscoverScreen.tsx#L45) — `react-hooks/set-state-in-effect`
    (ver A3).
- Impacto: lint vermelho bloqueia qualquer pipeline que rode `npm run lint` e viola a regra 5 do
  `CLAUDE.md`.
- Recomendação: remover variáveis não usadas nos testes, remover o parâmetro morto `_tone` de
  `variantClasses` (ou efetivamente usá-lo), e tratar A3.

#### A3 — `DiscoverScreen` consome quota Free dentro de `useEffect` em cada montagem

- Arquivo: [src/screens/DiscoverScreen.tsx:43-49](src/screens/DiscoverScreen.tsx#L43-L49)
- Evidência: o `useEffect` chama `FeatureQuotaService.consume('nyt-discovery', …)` (efeito colateral:
  grava em `localStorage` e decrementa a quota mensal) e `setQuotaState(...)` de forma síncrona. O lint
  marca `set-state-in-effect`. O efeito depende de `[hasNytApiKey, isPro]`, então re-executa quando
  `isPro` sai de `null` (cold start do RevenueCat) para `false`.
- Impacto: um usuário Free perde 1 das 5 cotas mensais de "Descubra/NYT" **apenas por abrir a tela**, sem
  nenhuma ação explícita. Cinco aberturas da aba zeram a cota do mês. É consumo de recurso que pode
  parecer arbitrário ao usuário (UX/correção de produto), embora não envolva dinheiro. O `consume` é
  guardado contra `billingLoading`, então não decrementa enquanto `isPro === null` — o decremento ocorre
  só após o billing assentar, o que é correto, mas ainda assim acontece por montagem.
- Reprodução: como Free com `VITE_NYT_API_KEY` e sem cache válido, abrir a aba Descubra repetidamente;
  observar `neoreader:feature-quota:v1:*:nyt-discovery` incrementando em cada montagem.
- Recomendação: consumir a quota apenas quando a tela realmente dispara busca de rede (quando
  `allowNytNetwork` leva a um fetch novo), não em todo mount; ou mover o `consume` para o ponto de fetch
  do `NytBooksService`. Idealmente seguir o padrão de `getSnapshot` para exibição e `consume` só na ação.

#### A4 — Feature `driveImportCount` incompleta mergeada (migração v16 sem consumidor)

- Arquivos:
  - [src/db/database.ts:299-323](src/db/database.ts#L299-L323) (migração v16)
  - [src/types/settings.ts:30](src/types/settings.ts#L30) e [:76](src/types/settings.ts#L76)
- Evidência: `driveImportCount` é declarado no tipo `UserSettings`, default-ado em
  `normalizeUserSettings`, e populado por uma migração de schema v16 que roda em **todos os usuários**.
  Busca em `src/**/*.{ts,tsx}` mostra que o campo **nunca é lido nem incrementado** por nenhuma tela ou
  serviço — não há gating de "contador freemium de imports do Drive" implementado. A branch chama-se
  `feature/book-import-drive`, mas o único código de Drive presente é o sync de bookmarks/progresso/
  vocabulário (`GoogleDriveAppDataService` + `*DriveSyncService`); não há fluxo de *importar arquivo de
  livro a partir do Drive* consumindo esse contador.
- Impacto: código morto + migração de banco entregue a produção sem funcionalidade. Custo: a migração v16
  é segura (apenas adiciona `driveImportCount = 0`), mas qualquer rollback de schema fica mais difícil, e
  é a causa-raiz de A1. Sinaliza release de trabalho pela metade.
- Recomendação: decidir antes do release — (a) concluir a feature (UI + gating que de fato leia/incremente
  `driveImportCount` via `getSettings`/`updateAppSettings`), ou (b) remover o campo, a migração v16 e os
  defaults, deixando o schema em v15. Em ambos os casos, alinhar o teste A1.

#### A5 — Injeção das chaves de release (RevenueCat/AdMob) não verificável — risco de monetização quebrada

- Arquivos/contexto:
  - [src/services/BillingService.ts:40-50](src/services/BillingService.ts#L40-L50)
  - [src/services/AdsService.ts:17-30](src/services/AdsService.ts#L17-L30)
  - `.env.example` (todas as chaves `VITE_*` são opcionais)
- Evidência: billing só funciona se `VITE_REVENUECAT_ANDROID_API_KEY` estiver presente **no momento do
  `vite build`** (variáveis `VITE_` são embutidas no bundle). Se ausente no build de release,
  `isBillingAvailable()` retorna `false`, o paywall renderiza estado `unavailable` e **nenhuma compra é
  possível** — Pro nunca ativa. O mesmo vale para `VITE_ADMOB_BANNER_UNIT_ID_ANDROID`: sem ele em produção,
  `getBannerUnitId()` cai no **ad unit de teste do Google** ([AdsService.ts:17-21](src/services/AdsService.ts#L17-L21)),
  ou seja, anúncios de teste em produção (zero receita; e exibir test ads em produção também é desencorajado
  pelo AdMob).
- Impacto: monetização (assinatura e ads) silenciosamente quebrada se o pipeline de release não injetar as
  envs. Não é crash, mas é "cobrança/monetização incorreta" do ponto de vista de negócio.
- Reprodução: gerar AAB de release sem `.env` populado e abrir o Paywall → "indisponível".
- Recomendação: confirmar no pipeline/CI de release que todas as `VITE_*` de produção estão definidas
  antes do `vite build`; adicionar uma verificação de build que falhe se `VITE_REVENUECAT_ANDROID_API_KEY`
  ou `VITE_ADMOB_BANNER_UNIT_ID_ANDROID` estiverem vazias em modo produção.

### Média

#### M1 — Disclosure de assinatura parcial no Paywall (política Play Billing)

- Arquivos:
  - [src/screens/PaywallScreen.tsx:362-373](src/screens/PaywallScreen.tsx#L362-L373)
  - [src/i18n/messages.ts:333-342](src/i18n/messages.ts#L333-L342)
- Evidência: o paywall **divulga** preço, periodicidade e renovação automática ("R$ 4,90 por mes,
  renovacao automatica pelo Google Play", "R$ 39,90 por ano") e linka a **política de privacidade**. Porém
  **não** há link para **Termos de Serviço/EULA** nem instrução explícita de **como cancelar** (gerenciar
  assinatura no Google Play). A política do Google Play para apps de assinatura exige divulgação clara de
  termos e meio de cancelamento.
- Impacto: risco de rejeição/observação na revisão do Google Play para apps de assinatura.
- Recomendação: adicionar link de Termos de Serviço e uma linha curta de cancelamento ("Cancele a qualquer
  momento em Google Play > Assinaturas") junto ao bloco de preços.

#### M2 — Imagens de Play Store listing dentro do APK/AAB (500 KB de bloat)

- Arquivo: `android/app/src/main/res/play-store-assets/` (introduzido em commit `6831d3a Feature/monetizacao`)
- Evidência: dois arquivos de listing da Play Store estão dentro do diretório `res/` do projeto Android:
  - `play-store-feature-graphic-1024x500.png` — 152 KB
  - `play-store-icon-512.png` — 348 KB
  Total: ~500 KB.
  Esses arquivos são usados somente no painel da Play Console (upload manual); não têm função em runtime.
  Colocá-los dentro de `res/` faz com que o AAPT2 os processe durante o build e os inclua nos assets do
  APK/AAB, inflando desnecessariamente o binário final.
- Impacto: ~500 KB a mais no AAB entregue aos usuários; não causa crash (o build já convive com o diretório
  desde a feature de monetização). Impacto em download/install size dependendo de como o AAPT2 os codifica.
- Recomendação: mover os arquivos para uma pasta fora do projeto Android (ex.: `store-listing/`) e
  adicionar `android/app/src/main/res/play-store-assets/` ao `.gitignore` ou simplesmente remover do
  repositório — esses arquivos pertencem ao processo de publicação, não ao código.

#### M3 — README desatualizado vs. estado real de release (versão e schema)

- Arquivos: [README.md:375-381](README.md#L375-L381), [README.md:417](README.md#L417)
- Evidência: README diz `versionName 1.0.10` / `versionCode 12` e schema Dexie "versão 14". O real é
  `versionName 1.0.13` / `versionCode 17` ([android/app/build.gradle:16-17](android/app/build.gradle#L16-L17))
  e schema **v16** ([src/db/database.ts:300](src/db/database.ts#L300)).

- Impacto: documentação de release enganosa; risco de erro humano ao versionar o próximo AAB (o
  `versionCode` precisa ser estritamente maior que o último publicado).
- Recomendação: atualizar README e confirmar que o próximo `versionCode` é maior que o já publicado na
  Play Console antes do upload.

### Baixa

#### B1 — Detecção de "arquivo ausente" acoplada a substring em português

- Arquivos:
  - [src/screens/ReaderScreen.tsx:858](src/screens/ReaderScreen.tsx#L858)
  - [src/services/BookFileResolver.ts:18](src/services/BookFileResolver.ts#L18), [:40](src/services/BookFileResolver.ts#L40), [:63](src/services/BookFileResolver.ts#L63)
- Evidência: `onError` decide marcar `detectedMissingFile` via
  `err.message.includes('movido') || err.message.includes('permissao de acesso')`. Hoje funciona porque o
  `BookFileResolver` **sempre** lança a string fixa em pt-BR (independente do locale da UI). Mas é
  acoplamento frágil: qualquer reformulação da mensagem de erro quebra silenciosamente a UI de remoção.
- Impacto: baixo hoje; risco de regressão futura. Esta é exatamente a melhoria sugerida no relatório
  anterior da tela de leitura (achado P2) e foi parcialmente implementada nesta branch.
- Recomendação: lançar um erro tipado (ex.: `class MissingBookFileError extends Error`) e testar
  `err instanceof MissingBookFileError` em vez de comparar texto.

#### B2 — `readFileAsBase64` carrega o arquivo inteiro em memória

- Arquivo: [android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java:643-656](android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java#L643-L656)
- Evidência: `readFile` lê o arquivo todo para um `ByteArrayOutputStream` e converte para Base64. Para
  EPUBs muito grandes isso pode pressionar memória. O caminho principal de importação usa leitura em
  chunks/sessão (`readFileChunk`/`openFileReadSession`), que mitiga; `readFile` parece ser caminho legado/
  fallback.
- Impacto: baixo — risco de OOM apenas em arquivos atípicos pelo caminho não-chunked.
- Recomendação: garantir que o fluxo de importação use sempre o caminho chunked e, se `readFile` não for
  mais usado, removê-lo.

#### B3 — `chunk` JS principal grande (886 kB / 254 kB gzip)

- Evidência (saída do build): `dist/assets/index-*.js 886.63 kB │ gzip: 254.57 kB` + aviso
  "Some chunks are larger than 500 kB".
- Impacto: tempo de primeira carga da WebView maior no cold start (assets são locais no APK, então sem
  custo de rede, mas há custo de parse/execução). `foliate-js`/PDF.js já estão lazy.
- Recomendação: opcional pós-release — code-splitting adicional por rota/tela. Não bloqueante.

#### B4 — `handleOnPause` força `webView.onResume()` para manter TTS em background

- Arquivo: [android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java:1160-1167](android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java#L1160-L1167)
- Evidência: para manter o áudio (TTS premium via `HTMLAudioElement`) tocando com tela bloqueada, o plugin
  re-ativa a WebView logo após o pause. É uma decisão deliberada de feature de audiobook, combinada com
  keep-awake.
- Impacto: baixo, mas mantém a WebView ativa em background — observar consumo de bateria e eventuais
  políticas de atividade em background. Sem evidência de ANR.
- Recomendação: validar em device real o consumo de bateria com TTS longo em background; documentar a
  decisão.

#### B5 — `loggingBehavior: 'debug'` em produção expõe bridge logging nativo

- Arquivo: [capacitor.config.ts:9-11](capacitor.config.ts#L9-L11)
- Evidência:
  ```typescript
  android: {
    loggingBehavior: 'debug',
  }
  ```
  `loggingBehavior: 'debug'` instrui o Capacitor nativo (Android) a logar todas as chamadas de plugin e
  mensagens de bridge via `Log.d` no logcat em produção. O app já mitiga o risco mais grave — chunks
  base64 de EPUB — via `disableCapacitorBridgePayloadLogging()` em `main.tsx`, que desativa o flag JS
  `window.Capacitor.isLoggingEnabled`. Mas o logging nativo de nível `debug` continua ativo
  independentemente: nomes de métodos, `console.log`/`warn`/`error` do JS e eventos internos do bridge
  são encaminhados ao logcat.
- Impacto: baixo em termos de segurança (nomes de método não são sensíveis). Consequências práticas:
  overhead leve de I/O por Log.d em cada chamada de plugin, e qualquer `console.*` do código JS fica
  visível em `adb logcat` para quem tiver acesso físico + USB ao device. Não é bloqueante.
- Recomendação: trocar para `loggingBehavior: 'production'` antes da release. Essa configuração mantém
  apenas erros no logcat e é o padrão recomendado pelo Capacitor para produção. O `disableCapacitorBridgePayloadLogging()` pode permanecer como camada extra de proteção para payloads JS.

#### B6 — Preços hardcoded nas descrições do Paywall podem divergir do RevenueCat

- Arquivos:
  - [src/i18n/messages.ts:333](src/i18n/messages.ts#L333) e [:337](src/i18n/messages.ts#L337)
  - [src/screens/PaywallScreen.tsx:408-410](src/screens/PaywallScreen.tsx#L408-L410)
- Evidência: as *descrições* dos planos contêm preços em texto fixo: `'R$ 4,90 por mes, renovacao
  automatica pelo Google Play'` e `'R$ 39,90 por ano para manter Pro ativo com desconto.'`. O *botão* de
  compra exibe `plan.pkg.product.priceString`, que vem diretamente do RevenueCat e reflete o preço real
  configurado na Play Console. Se o preço for alterado no painel RevenueCat/Play Console sem atualizar as
  mensagens i18n, o usuário verá uma descrição com preço errado e um botão com preço correto — inconsistência
  que pode confundir ou, pior, criar aparência de preço abusivo.
- Impacto: baixo enquanto os preços não mudam; moderado se houver ajuste de pricing sem atualizar o i18n.
- Recomendação: substituir os valores fixos nas chaves de descrição por um placeholder genérico (ex.:
  `'Renovacao automatica pelo Google Play'`) e exibir o preço real via `priceString`. Ou, se o texto
  preciso for mantido, criar um processo de release que sincronize os textos i18n com os preços do painel.

---

## 5. Checklist Play Store

| Item | Status | Observação |
|---|---|---|
| Build web de produção (`tsc -b && vite build`) | OK | Passou em 20,7s; apenas warnings benignos (externalização de `https/http/fs/url` do pdfjs e aviso de chunk >500 kB). |
| Build/assinatura AAB release (`:app:bundleRelease`) | Não verificado | Não executado neste ambiente (sem SDK/keystore garantidos). `signingConfigs.release` é condicional às props `NEOREADER_RELEASE_*` ([build.gradle:25-44](android/app/build.gradle#L25-L44)). **Validar antes do release.** |
| AndroidManifest | OK | Permissão mínima (`INTERNET`), `allowBackup=false`, `FileProvider` configurado, AdMob `APPLICATION_ID` presente, `MainActivity exported=true` apenas com LAUNCHER. |
| Permissões | OK | Sem permissões excessivas; importação via SAF (`ACTION_OPEN_DOCUMENT`/`OPEN_DOCUMENT_TREE`) sem `READ_EXTERNAL_STORAGE` — compatível com scoped storage. |
| Versionamento | Risco | `versionCode 17`/`versionName 1.0.13` no gradle, mas README diz 12/1.0.10 (M2). Confirmar que 17 > último publicado na Console. |
| Ícones / Splash | OK | Ícones adaptativos (`mipmap-anydpi-v26`) + todas as densidades + splash (`drawable-*`) presentes. |
| ProGuard / R8 | OK (com ressalva) | `minifyEnabled true` + `shrinkResources true`. Regras mantêm Capacitor, plugins anotados e TTS community; `postinstall` aplica patch de ProGuard ([scripts/patch-capacitor-tts-proguard.mjs]). RevenueCat/AdMob/Firebase trazem consumer-rules nos AARs. **Recomenda-se smoke test do AAB minificado** (login, compra, ads, import, leitor, TTS). |
| Assinatura / config de release | Não verificado | Depende de props locais fora do Git; não validável aqui. |
| Billing (RevenueCat) | Risco | Código correto e defensivo, mas depende de `VITE_REVENUECAT_ANDROID_API_KEY` no build (A5) e de produtos `pro_monthly`/`pro_annual` mapeados ao entitlement `NeoReader Pro` na Play Console/RevenueCat. Validar compra real + restore em device. |
| Disclosure de assinatura | Risco | Preço/periodicidade/renovação divulgados; faltam Termos de Serviço e instrução de cancelamento (M1). |
| Play Store assets no APK | Risco | ~500 KB de imagens de listing empacotadas dentro de `res/`; mover para fora do projeto Android (M2). |
| Ads (AdMob) | Risco | `APPLICATION_ID` no manifest OK; mas sem `VITE_ADMOB_BANNER_UNIT_ID_ANDROID` em produção cai em **ad unit de teste** (A5). Sem fluxo de consentimento UMP/GDPR visível (avaliar conforme mercados-alvo). |
| `loggingBehavior` em release | Risco | `capacitor.config.ts` define `loggingBehavior: 'debug'`, expondo logs de bridge no logcat em produção. Trocar para `'production'` antes do release (B5). |
| Crashes / ANR | OK (sem evidência) | Operações de I/O pesado no plugin rodam em `ExecutorService`; serviços JS são try/catch + no-op. Sem ANR identificado por inspeção. Validar com device real. |
| Compatibilidade | OK | `minSdk 24`, `compileSdk/targetSdk 36`, AGP 9.1.1. `targetSdk 36` atende exigências atuais da Play. |
| Testes (`npm test`) | Bloqueado | 1 falha (A1). Gate vermelho. |
| Lint (`npm run lint`) | Bloqueado | 4 erros (A2). Gate vermelho. |
| Segredos | OK | `.env` e `android/app/google-services.json` estão no `.gitignore` e não versionados; nenhum `console.*` logando apiKey/token/secret. |

---

## 6. Comandos executados e resultados

| Comando | Resultado | Observação |
|---|---|---|
| `npm run lint` | **Falhou (exit 1)** | 4 erros: 2 vars não usadas em `EpubViewer.test.tsx`, `_tone` em `Button.tsx`, `set-state-in-effect` em `DiscoverScreen.tsx`. |
| `npm test` (`vitest run`) | **Falhou (exit 1)** | `1 failed | 471 passed | 2 skipped` — `src/__tests__/db/settings.test.ts` (A1). Duração ~147s. |
| `npm run build` (`tsc -b && vite build`) | **Passou (exit 0)** | Build em ~20,7s. Warnings: módulos node do pdfjs externalizados (benigno) e chunk principal >500 kB. |
| Build Android/Gradle release | **Não executado** | Ambiente sem SDK/keystore garantidos; evitado para não produzir resultado falso. |
| Inspeção de segredos versionados (`git ls-files` + `git check-ignore`) | OK | Nenhum `.env`/`google-services.json`/keystore versionado. |

Observação sobre o ambiente: a saída de `stderr` dos comandos via PowerShell aparece embrulhada como
`NativeCommandError`, mas os **exit codes** acima são os reais (build = 0; lint/test = 1).

## 7. Lacunas de teste/verificação

- **AAB de release não gerado/assinado** neste ambiente — o item mais importante ainda em aberto para a
  decisão final. Precisa rodar `:app:bundleRelease` com as props de assinatura e fazer smoke test do
  binário minificado (R8) em device real.
- **Billing real não validado** — compra mensal/anual, `restore`, grants manuais de admin no RevenueCat e
  comportamento do entitlement `NeoReader Pro` exigem device com conta Google Play de teste.
- **Ads em produção não validados** — exibição com `VITE_ADMOB_BANNER_UNIT_ID_ANDROID` real e
  ocultação para usuário Pro.
- **TTS premium em background** (B4) — consumo de bateria com tela bloqueada não medido.
- **Importação em device** — fluxo SAF (arquivo único, pasta, cancelamento, EPUB corrompido) não exercido
  em hardware; o backlog do projeto (`docs/test-backlog.md`) já registra falta de teste para EPUB
  corrompido e restauração e2e de progresso.
- **Não foi feita auditoria profunda de privacidade/LGPD** (fora de escopo); registrados apenas riscos
  óbvios de Play (M1, A5/UMP).

## 8. Ordem sugerida de correção antes do release

1. **A4** — Decidir o destino de `driveImportCount`: concluir a feature ou remover (campo + migração v16).
   Isso define A1.
2. **A1** — Alinhar `settings.test.ts` ao resultado de `driveImportCount` (ou removê-lo conforme A4) →
   `npm test` verde.
3. **A2** — Corrigir os 4 erros de lint (vars não usadas, `_tone`, e A3) → `npm run lint` verde.
4. **A3** — Mover o `consume` da quota de Descubra para o ponto de fetch real (não em todo mount).
5. **A5** — Garantir/validar `VITE_REVENUECAT_*` e `VITE_ADMOB_*` no build de release; adicionar guarda de
   build.
6. **M1** — Adicionar Termos de Serviço + nota de cancelamento no Paywall.
7. **M2** — Mover `play-store-assets/` para fora de `res/` (ex.: `store-listing/` na raiz) e remover do projeto Android.
8. **M3** — Atualizar README (versão/schema) e confirmar `versionCode` na Console.
9. Verificações finais (Lacunas): gerar AAB assinado, smoke test do binário R8, validar billing/ads/import/
   TTS em device real.
10. **B5** — Trocar `loggingBehavior: 'debug'` para `'production'` em `capacitor.config.ts` — mudança de uma linha, baixo risco, recomendado antes do release.
11. **B1–B4, B6** — Pós-release ou na mesma janela, conforme capacidade.

---

### Nota de método

Revisão somente-leitura. Nenhum arquivo de código, teste, config ou documentação existente foi alterado;
apenas este relatório foi criado em `docs/`. Severidades seguem o critério conservador solicitado:
qualquer item que impeça o gate de release do projeto ou a monetização foi tratado como **Alta**, mesmo
sem ser crash. Não foram listados problemas genéricos sem evidência de arquivo/linha.
