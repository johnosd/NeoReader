# Quickstart: TTS Traduzido

## Pré-requisitos

- `npm install` já rodado; `npm run dev` sobe o servidor web (localhost:5173).
- Um EPUB em um idioma diferente do idioma-alvo de tradução configurado (ex.:
  um livro em francês/espanhol com `translationTargetLang` = pt-BR) já
  importado no NeoReader.
- Conexão de internet ativa (MyMemory e qualquer provedor BYOK exigem rede).
- Opcional, para validar a User Story 2: uma chave BYOK válida de DeepL,
  OpenAI ou Google já configurada e testada para esse livro (feature `017`,
  `SettingsTranslationScreen`/`BookDetailsScreen`).
- Device Android conectado (`adb devices`) para a validação final em
  dispositivo real (Constitution: "testar o fluxo principal... num browser
  real ou no device Android antes de reportar concluído").

## Checagens automatizadas

```powershell
npm run lint
npx vitest run src/__tests__/services/TranslatedAudiobookService.test.ts
npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx
npx vitest run src/__tests__/screens/ReaderScreen.test.tsx
npm test
npm run build
```

## Cenário ponta a ponta (manual)

1. Abrir o livro em idioma estrangeiro → `BookDetailsScreen` → ativar "Ouvir
   traduzido" pela primeira vez nesse livro.
2. Confirmar que aparece o aviso de consumo com estimativa de caracteres
   (FR-013) antes de qualquer áudio tocar; confirmar o aviso.
3. Abrir o livro e iniciar o audiobook (mini player). Confirmar que o áudio
   ouvido está no idioma-alvo configurado, não no idioma original.
4. Observar a transição entre parágrafos: a pausa deve ser perceptível no
   máximo 1x por parágrafo (nunca entre frases do mesmo parágrafo) — SC-001.
5. Confirmar que o destaque visual acompanha o PARÁGRAFO original inteiro
   (não uma palavra/frase específica) enquanto o áudio traduzido toca —
   FR-010.
6. Trocar de capítulo enquanto uma tradução de parágrafo está em andamento
   (ex.: pular pra próxima seção rapidamente) — nenhum áudio da tradução
   cancelada deve tocar depois da troca (FR-011/SC-004).
7. Fechar o livro no meio da sessão e reabrir — confirmar que o progresso
   retomado corresponde à posição original do EPUB, não a um offset do texto
   traduzido (FR-009).
8. Desativar "ouvir traduzido" no meio da leitura — o audiobook deve
   continuar tocando a partir da mesma posição, agora no idioma original.
9. Reativar "ouvir traduzido" no MESMO livro — o aviso de consumo NÃO deve
   reaparecer (FR-013/US3, já confirmado uma vez).
10. Repetir o passo 1-2 em OUTRO livro nunca ativado antes — o aviso DEVE
    aparecer de novo (confirmação é por livro).
11. Com uma chave BYOK configurada para o livro (feature `017`): ativar
    "ouvir traduzido" e confirmar via log de diagnóstico
    (`neoreader-*.log`/DiagnosticsLogger) que as chamadas `translation.request`
    usam o provider BYOK configurado, não `mymemory` — US2.
12. Forçar uma falha do provider BYOK (ex.: revogar a chave no painel do
    provedor) durante uma sessão ativa — confirmar que o fallback (MyMemory
    ou outro, conforme `017`) fica fixo (sticky) pelo resto da sessão, sem
    voltar a tentar o provider original a cada parágrafo — FR-007.
13. Simular falha total (desligar a internet) durante uma sessão ativa —
    confirmar que o audiobook PAUSA e mostra um erro visível, em vez de
    pular o parágrafo ou travar silenciosamente — FR-008.
14. Configurar `translationTargetLang` do livro igual ao idioma original
    (ou deixar o idioma do livro indefinido) — confirmar que o toggle "ouvir
    traduzido" fica desabilitado/oculto com indicação do motivo — FR-015.

## Validação em device Android

```powershell
npm run build
npx cap sync android
cd android; .\gradlew.bat assembleDebug; cd ..
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.johnny.neoreader/.MainActivity
```

Repetir pelo menos os passos 3-8 do cenário manual acima em device real —
audiobook contínuo em segundo plano (tela apagada, app em background) é o
caso que mais interessa validar aqui, já que reusa a arquitetura de
playback da feature `001` (foco de áudio nativo, wake lock, notificação).
