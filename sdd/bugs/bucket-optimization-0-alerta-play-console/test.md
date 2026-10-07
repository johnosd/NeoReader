# Bug Verification: Regras R8 amplas do Capacitor

- **Slug**: bucket-optimization-0-alerta-play-console
- **Testado**: 2026-10-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

O release minificado e assinado compilou e as regras amplas não aparecem mais na configuração final do R8. O mapping demonstra otimização/ofuscação do runtime Capacitor, enquanto os oito plugins de dependências e os três plugins próprios continuam com os nomes preservados. Sem smoke no aparelho nem acesso à métrica atual do Play Console, o resultado fica parcial.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Consumer rules | `node_modules/@capacitor/android/capacitor/proguard-rules.pro` e build.gradle da lib | pass | `consumerProguardFiles` configurado; subclasses de Plugin e callbacks anotados protegidos. |
| Bundle web atual | `npm run build` | pass | Type-check e bundle aprovados. |
| Sincronização Android | `npx cap sync android` | pass | Assets atuais copiados, 8 plugins reconhecidos, sem alteração adicional de código versionado. |
| Build release minificado | `android/gradlew.bat --offline assembleRelease` | pass | `BUILD SUCCESSFUL in 2m 36s`; 437 tasks, 52 executadas. Inclui `minifyReleaseWithR8`, `lintVitalRelease`, empacotamento e assinatura configurada localmente. |
| Assinatura APK | SDK build-tools 37.0.0 `apksigner.bat verify --verbose android/app/build/outputs/apk/release/app-release.apk` | pass | `Verifies`, esquema v2 válido, 1 assinante. |
| Regras finais | `android/app/build/outputs/mapping/release/configuration.txt` | pass | Ausentes as regras genéricas de `com.getcapacitor.**` e `com.getcapacitor.community.tts.**`. |
| Seeds e mapping | Comparação com cópias temporárias dos artefatos locais anteriores | pass | Classes-raiz Capacitor listadas em seeds: 138 → 10. Bridge/JSObject/PluginCall antes sem renomeação, agora ofuscados. |
| Preservação dos plugins | Mapping versus classpaths de `capacitor.plugins.json` e registros de MainActivity | pass | 8/8 plugins das dependências e 3/3 plugins próprios preservados. Isso verifica a proteção estática, não a execução em runtime. |
| Regressão web | `npm test` e `npm run lint` | pass | 1.555 testes aprovados, 2 ignorados; lint sem erro. Não substitui smoke nativo. |
| Smoke no Android | Picker/importação, TTS, AdMob, Firebase Auth, disponibilidade do plano/RevenueCat | skipped | Nenhum aparelho conectado; usuário pediu explicitamente deixar pendente. |
| Alerta/métrica Play Console | — | not-run | Depende de análise do Google sobre release publicado; nenhum upload foi realizado. |

## Output Excerpts

```text
Antes: Bridge -> com.getcapacitor.Bridge
Depois: Bridge -> wg
JSObject -> fp0
PluginCall -> za1

NeoReaderLibraryPlugin -> com.johnny.neoreader.NeoReaderLibraryPlugin
NeoReaderTtsPlaybackPlugin -> com.johnny.neoreader.NeoReaderTtsPlaybackPlugin
GoogleDriveAuthPlugin -> com.johnny.neoreader.GoogleDriveAuthPlugin

Classes Capacitor em seeds: 138 -> 10
Assinatura: Verifies; v2 true; 1 signer
```

## Artefato de validação

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- Gerado: 2026-10-07, 16:02:55 (America/Sao_Paulo)
- Tamanho: 17.155.562 bytes
- SHA256: `e38cb6a6d90e161296dcd1f9939839f410cdf10a3708299a1c28b90926ee4d86`
- Mapping: `android/app/build/outputs/mapping/release/mapping.txt`
- VersionCode/versionName mantidos: 23 / 1.0.19. Build de diagnóstico, sem publicação e sem bump.

## Residual Risks

- R8 pode expor problemas de reflexão/bridge apenas durante execução; manter nomes de plugins no mapping e compilar não prova todos os fluxos em runtime.
- O alerta de otimização do Play Console é dominado também por consumer rules de SDKs terceiros; a melhoria local não implica que o bucket/alerta do Google esteja resolvido.
- A comparação usa o build local anterior e o atual, não dois AABs publicados equivalentes. Não foi feita comparação controlada de tamanho/telemetria.
- Warnings de opções Gradle depreciadas e flatDir já pertencem à configuração do projeto; não bloquearam o build e não foram alterados por este fix.

## Recommendation

Manter `partial`. Antes de publicar a alteração R8, instalar este APK release no aparelho e exercitar os cinco grupos de recursos nativos acima. Não há necessidade de compra real para validar a disponibilidade do bridge/RevenueCat. Depois acompanhar o Play Console sem prometer que esta alteração resolverá o alerta.
