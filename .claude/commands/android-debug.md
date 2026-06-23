---
name: android-debug
description: >
  Workflow completo de debug para o NeoReader Android. Use quando um bug é difícil
  de reproduzir só lendo código: adiciona console.log temporários nos pontos suspeitos,
  faz build + deploy no device, captura adb logcat, analisa o que aconteceu e
  remove os logs ao final. Aciona com /android-debug ou quando o usuário pedir
  para "adicionar logs", "ver o que acontece no device", "debugar no celular".
---

# Android Debug Workflow — NeoReader

Você vai executar o ciclo completo de debug no device Android do usuário.
Siga as fases **em ordem**. Não pule etapas.

---

## Fase 1 — Entender o bug e planejar os logs

Antes de qualquer código:

1. Pergunte (se não souber): qual é o comportamento esperado? Qual é o comportamento observado? Em qual tela/ação acontece?
2. Identifique os arquivos e funções suspeitas.
3. Planeje **onde** colocar `console.log` — priorize:
   - Entrada de funções relevantes (com os parâmetros-chave como `JSON.stringify`)
   - Pontos de decisão / branches (`if`, `return` antecipado)
   - Callbacks assíncronos (`onStop`, `onError`, `onFallback`)
   - Pontos de resolução de Promises (`await` que pode travar)

> **Regra:** use `console.log('[DEBUG-TAG] descrição', JSON.stringify(valor))` — não `console.log(objeto)` puro,
> pois o Capacitor Android loga objetos como `[object Object]`.
> Use uma tag única (ex: `[TTS-DEBUG]`, `[READER-DEBUG]`) para filtrar depois.

---

## Fase 2 — Adicionar os logs

Edite os arquivos identificados. Seja cirúrgico: logs em funções-chave, não em cada linha.

Exemplo de bom log em função async:

```typescript
async function handleProviderChange(provider: string) {
  console.log('[FEAT-DEBUG] handleProviderChange', JSON.stringify({ provider, currentState }))
  if (condition) {
    console.warn('[FEAT-DEBUG] handleProviderChange BLOCKED', JSON.stringify({ reason: 'x' }))
    return
  }
  // ...
  console.log('[FEAT-DEBUG] handleProviderChange proceeding')
}
```

---

## Fase 3 — Build e deploy

Execute em sequência:

```powershell
# 1. Build web
npm run build

# 2. Sync Capacitor
npx cap sync android

# 3. Build APK debug
cd android; ./gradlew assembleDebug; cd ..

# 4. Verificar device conectado
adb devices

# 5. Instalar no device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Se `adb devices` retornar vazio: peça ao usuário para conectar o device via USB com USB Debugging ativado.

O device padrão deste projeto é: `RXCX103NMVZ` (package: `com.johnny.neoreader`).

---

## Fase 4 — Capturar logs

Limpe o buffer e peça ao usuário para reproduzir:

```powershell
adb logcat -c
```

Depois peça: **"Por favor reproduza o bug no celular e me avise quando terminar."**

Quando o usuário confirmar, leia os logs com:

```powershell
# Filtra por tag específica (mais rápido):
adb logcat -d 2>&1 | Select-String "DEBUG-TAG"

# Se precisar de mais contexto (logs do Capacitor):
adb logcat -d 2>&1 | Select-String "Capacitor/Console" | Select-Object -Last 100
```

> **Por que `-d`?** Lê o buffer atual e sai — mais confiável em PowerShell do que streaming
> contínuo com `Out-File`, que não faz flush incremental.

---

## Fase 5 — Analisar

Com os logs em mão:

1. Identifique qual log apareceu e qual não apareceu (sequência quebrada = ponto do bug)
2. Verifique se Promises travaram (log de entrada sem log de saída)
3. Verifique se callbacks dispararam na ordem errada
4. Correlacione timestamps para ver race conditions

Se os logs não aparecerem:
- Confirme que o APK instalado é o correto (`adb shell pm dump com.johnny.neoreader | Select-String versionName`)
- Tente a tag mais ampla: `adb logcat -d 2>&1 | Select-String "CONSOLE"`

---

## Fase 6 — Corrigir e remover os logs

1. Implemente o fix com base nos logs
2. **Remova todos os `console.log` temporários** — eles são ruído em produção
3. Rode `npm run build` novamente para confirmar que o build passa limpo
4. Faça o deploy final e peça ao usuário para validar

---

## Referência rápida — comandos do projeto

| Ação | Comando |
|---|---|
| Build web | `npm run build` |
| Sync Capacitor | `npx cap sync android` |
| Build APK debug | `cd android; ./gradlew assembleDebug; cd ..` |
| Instalar APK | `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` |
| Limpar buffer logcat | `adb logcat -c` |
| Ler logs por tag | `adb logcat -d 2>&1 \| Select-String "TAG"` |
| Ver últimas linhas | `... \| Select-Object -Last 100` |
| Checar device | `adb devices` |
| Package do app | `com.johnny.neoreader` |
| Device padrão | `RXCX103NMVZ` |
