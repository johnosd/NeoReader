# Bug Fix: Regras R8 amplas do Capacitor

- **Slug**: bucket-optimization-0-alerta-play-console
- **Corrigido**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

Removidas as duas regras que mantinham todo o pacote Capacitor/TTS sem otimização. Mantida a proteção específica de plugins anotados; as consumer rules oficiais continuam preservando subclasses de Plugin e callbacks. A alteração de configuração foi aplicada, mas a validação de runtime em release permanece pendente.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `android/app/proguard-rules.pro` | modified | Remove `-keep class com.getcapacitor.** { *; }` e a regra redundante `com.getcapacitor.community.tts.**`; mantém a regra de `@CapacitorPlugin` e acrescenta comentário curto. |

## Tests Added or Updated

Não foram adicionados testes Vitest para texto de configuração. Verificação adequada: build release minificado, assinatura, mapping/seeds reais e smoke dos recursos nativos no aparelho.

## Local Verification

- Confirmadas as consumer rules de `node_modules/@capacitor/android/capacitor/proguard-rules.pro`: subclasses de Plugin e métodos anotados preservados.
- Baseline local anterior copiada para arquivos temporários antes de reconstruir: **138 classes Capacitor mantidas**; Bridge, JSObject e PluginCall sem renomeação no mapping.
- Build release, assinatura e comparação posterior registrados em `test.md` pela fase Test.

## Deviations from Assessment

- O assessment histórico está em `held` por decisão de 2026-09-04. O usuário autorizou retomar os dois bugs presentes em 2026-10-07; essa autorização substitui a decisão anterior, sem reescrever o histórico.
- `adb devices` não encontrou aparelho. Consultado durante o trabalho, o usuário pediu: **“Siga com build e testes locais; deixe o teste no aparelho pendente”**. Por isso o fix fica **partial**, respeitando a exigência de não concluir a validação de R8 sem smoke em release no device.
- Nenhuma expansão de arquivos de código/configuração.

## Follow-ups

- Validar o APK release assinado no aparelho: picker/importação, TTS, AdMob, login Firebase e disponibilidade de plano/RevenueCat; não é necessário realizar compra real.
- A métrica do Play Console depende de análise do Google sobre release publicado e não será considerada resolvida apenas por este patch.
- Ponto de commit sugerido: `fix: restringe regras de preservação do Capacitor no R8`, com a ressalva do smoke test antes de publicar.
