# Quickstart: Audiobook sem interrupção em segundo plano

Roteiro de verificação manual em device Android real — o comportamento
central desta feature (Service em foreground, tela apagada, chamada
telefônica, Doze) não é simulável em Vitest/JSDOM.

## Pré-requisitos

- `adb devices` mostra um device conectado (ver preferência de debugging já
  registrada: device de referência `RXCX103NMVZ`, package
  `com.johnny.neoreader`).
- Um livro EPUB já importado na biblioteca, com capa.
- `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem
  erro antes de instalar no device.

## Build + instalação

```powershell
npm run android:run
```

## Checks automatizados (rodar antes do roteiro manual)

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

## Cenário ponta a ponta (cobre US1-US4)

1. Abrir um livro no leitor, iniciar o modo audiobook (TTS contínuo).
2. Confirmar que a notificação de reprodução aparece (barra de notificações),
   com capa, título do livro e controles de play/pause/avançar (US3,
   FR-004).
3. **US1**: Deixar o celular parado sem tocar até a tela apagar sozinha por
   inatividade. Aguardar pelo menos 5 minutos (per SC-001) e confirmar que a
   narração continua audível sem parar.
4. Ligar a tela e reabrir o app — confirmar que o leitor mostra o parágrafo
   sendo narrado no momento, com highlight correto (FR-009).
5. **US2**: Com o audiobook tocando, apertar Home. Aguardar pelo menos 5
   minutos (per SC-002) e confirmar que a narração continuou. Reabrir o app e
   confirmar que o progresso avançou de acordo com o tempo decorrido.
6. Repetir o passo 5 pressionando o botão de energia pra bloquear o celular
   manualmente, em vez de apertar Home.
7. **US3**: Com a tela apagada/bloqueada, usar o botão de pause na
   notificação (ou nos controles da tela de bloqueio). Confirmar que a
   narração pausa. Tocar em play novamente e confirmar que retoma do ponto
   exato. Usar "avançar" e confirmar que pula pro próximo parágrafo/frase.
8. Parar o audiobook (stop, ou deixar o livro terminar) e confirmar que a
   notificação desaparece.
9. **US4**: Com o audiobook tocando, receber uma ligação (ou simular via
   outro celular). Confirmar que a narração pausa automaticamente antes do
   toque. Encerrar a ligação e confirmar que a narração retoma sozinha.
10. Com o audiobook tocando, abrir o Spotify (ou outro player) e iniciar uma
    música. Confirmar que a narração pausa e **não** retoma sozinha enquanto
    o Spotify continuar tocando.

## Verificação de regressão (comportamento existente que não deve mudar)

- Reprodução avulsa de TTS (ex: pronúncia de palavra no Word Lens) não deve
  abrir notificação nem Service em foreground (FR-013).
- O toggle "Manter tela ligada" em Configurações > Narração continua
  funcionando como antes, independente desta feature.
- Fallback automático entre provedor premium (Speechify/ElevenLabs/Fish
  Audio) e TTS nativo continua funcionando com o audiobook em segundo plano
  (testável desligando o Wi-Fi/dados momentaneamente durante a narração em
  segundo plano).

## Logs úteis durante o roteiro

Capture o logcat com o celular conectado por USB para ver o que está
acontecendo do lado nativo (wake lock, Service em foreground, MediaSession,
foco de áudio) enquanto o cenário roda de verdade — ver `plan.md` →
Estratégia de Testes, "Debug real no device via captura de log".

- Passos curtos (controles de notificação, chamada simulada): captura com
  tempo fixo, já filtrada.

  ```powershell
  npm run android:logs:diagnostics:run
  ```

- Passos longos (US1: aguardar a tela apagar sozinha por até 5 min; US2:
  até 5 min em segundo plano): captura sem limite de tempo, parada
  manualmente quando o passo terminar.

  ```powershell
  adb logcat -v threadtime *> android-tts-playback.log
  ```

Toda a atividade nativa desta feature usa a tag `NeoReaderTtsPlayback` — ao
ler o log, procure por essa tag pra confirmar cada evento esperado do
roteiro (wake lock, início/fim do Service, callback de play/pause/skip,
mudança de foco de áudio).
