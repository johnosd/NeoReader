# Relatorio de code review - TTS

Data da revisao: 2026-06-22

Escopo: fluxo de TTS continuo e inline, mini player, integracao com o EPUB, fallback nativo, Speechify, ElevenLabs, Fish Audio, cache de audio/vozes e testes relacionados. Esta revisao nao implementa correcoes.

## Resumo executivo

A base de TTS tem uma separacao geral adequada: `ReaderScreen` orquestra o estado, `EpubViewer` extrai texto e aplica highlight no DOM do EPUB, `useTTS` controla ciclo de vida da reproducao, e os services encapsulam cada provider. Os fluxos principais estao cobertos por testes para pause/resume, fallback, cache premium, auto-avanco de secao e highlight sem destruir links.

Os riscos mais importantes encontrados estao em estados de borda: offsets de karaoke desalinhados por normalizacao de texto, reinicio de audio premium pausado sem limpar o audio anterior, crash possivel no botao de paragrafo anterior quando nao ha chunks, highlights antigos ao retargetar TTS entre secoes carregadas, e uma regressao objetiva em Fish Audio que quebra teste existente.

## Achados

### 1. Alta - Karaoke pode destacar a palavra errada em EPUBs com whitespace real

Evidencia:

- `EpubViewer` captura o texto do paragrafo com `textContent!.trim()` em `src/components/reader/EpubViewer.tsx:1215-1223`.
- `getSentenceChunks()` gera offsets a partir desse texto ja trimado em `src/components/reader/EpubViewer.tsx:2190-2199`.
- `useTTS` normaliza novamente cada chunk, substituindo controles e colapsando whitespace em `src/hooks/useTTS.ts:58-61`, e usa esse texto normalizado no loop em `src/hooks/useTTS.ts:783-785`.
- Os offsets de palavra vindos do provider/nativo/estimativa sao aplicados diretamente no DOM original do paragrafo em `src/components/reader/EpubViewer.tsx:2246-2259` e `src/components/reader/EpubViewer.tsx:1631-1664`.

Impacto:

EPUBs frequentemente tem quebras de linha, indentacao, multiplos espacos, `&nbsp;` ou texto dividido por tags inline. Como o audio e sintetizado a partir de texto trimado/normalizado, mas o highlight usa offsets sobre o `textContent` original, o karaoke pode marcar espaco, parte da palavra anterior ou uma palavra posterior.

Repro conceitual:

```html
<p>
  Hello   world.
</p>
```

O TTS sintetiza algo equivalente a `Hello world.`. O offset de `world` no texto sintetizado fica menor que o offset real no DOM. O highlight aplica esse offset menor no paragrafo original.

Recomendacao:

Manter um mapa de offsets entre texto original e texto normalizado, ou sintetizar sem colapsar whitespace quando os offsets precisam voltar para o DOM. O mesmo mapa precisa cobrir texto trimado no `EpubViewer` e normalizado em `useTTS`.

### 2. Alta - Trocar velocidade/provider enquanto audio premium esta pausado deixa o Audio antigo pendurado

Evidencia:

- `scheduleTtsConfigRestartIfPlaying()` guarda o indice quando `tts.isPaused`, mas nao chama `tts.stop()` nesse estado em `src/screens/ReaderScreen.tsx:409-416`.
- Ao apertar play depois da troca, `handleTtsToggle()` chama `startPlay()` diretamente quando ha `pendingRestart`, sem parar a sessao premium pausada anterior em `src/screens/ReaderScreen.tsx:493-502`.
- `play()` abre uma nova sessao incrementando `playSessionRef`, mas nao limpa `audioRef` anterior no inicio em `src/hooks/useTTS.ts:728-745`.
- No pause premium, `handlePause()` apenas seta estado pausado; ele nao chama cleanup, nao revoga object URL e nao resolve a promise em `src/hooks/useTTS.ts:391-400`.

Impacto:

Fluxo afetado: iniciar Speechify/ElevenLabs/Fish Audio, pausar, mudar velocidade ou provider, e apertar play. O audio pausado antigo fica com listeners e object URL vivos, a promise antiga fica pendente, e `audioRef` e sobrescrito pela nova reproducao. Em uso repetido isso vira vazamento de memoria/recursos e pode gerar estado de reproducao dificil de diagnosticar.

Recomendacao:

Antes de `startPlay()` consumir um `pendingRestart` enquanto pausado, finalizar explicitamente a sessao anterior. Alternativamente, `play()` deve sempre limpar/revogar qualquer audio premium anterior ao iniciar nova sessao.

### 3. Alta - Botao "paragrafo anterior" pode iniciar TTS com indice `-1`

Evidencia:

- `handleTtsPrev()` nao valida `chunks.length` antes de calcular o destino em `src/screens/ReaderScreen.tsx:523-539`.
- Se `chunks` estiver vazio, `currParaStart` vira `-1` e `targetIdx` pode virar `-1`.
- `useTTS.play()` nao normaliza `startIdx`; o loop aceita indice negativo e dereferencia `chunk.text` em `src/hooks/useTTS.ts:780-785`.

Impacto:

Se o mini player estiver visivel enquanto a secao atual ainda nao tem texto legivel, ou se o estado do player ficar stale durante auto-avanco, tocar em "paragrafo anterior" pode gerar excecao por `chunk` indefinido. Isso pode quebrar a tela de leitura.

Recomendacao:

Adicionar guard em `handleTtsPrev()` para `chunks.length === 0` e clamp defensivo de `startIdx` dentro de `useTTS.play()`.

### 4. Alta - Highlight antigo pode ficar preso ao tocar TTS em outra secao carregada

Evidencia:

- Durante TTS ativo, o click handler troca `ttsPlaybackContentRef` para a secao tocada antes de chamar `onParagraphTapForTts` em `src/components/reader/EpubViewer.tsx:2595-2602`.
- `ReaderScreen` entao chama `tts.stop().then(() => startPlay(...))` em `src/screens/ReaderScreen.tsx:856-860`.
- O `onStop` do TTS chama `clearTts()` em `src/screens/ReaderScreen.tsx:370-373`.
- `clearKnownTtsHighlights()` so limpa `ttsParagraphsRef.current` e `ttsPlaybackContentRef.current?.paragraphs` em `src/components/reader/EpubViewer.tsx:1674-1680`.

Impacto:

Se o Foliate mantiver a secao antiga e a nova carregadas ao mesmo tempo, um highlight em uma secao A pode permanecer no DOM quando o usuario toca um paragrafo na secao B durante TTS ativo. Como `ttsPlaybackContentRef` ja foi trocado para B antes do cleanup, a secao A deixa de estar no conjunto limpo.

Recomendacao:

Na limpeza de TTS, varrer todas as secoes carregadas em `loadedSectionsRef.current`, ou limpar antes de trocar `ttsPlaybackContentRef` para a nova secao.

### 5. Media - Fish Audio com voz padrao quebrou teste existente e passou a depender de `/model`

Evidencia:

- `FishAudioService.synthesize()` agora, sem `voiceId`, chama `listCompatibleVoices()` e resolve a voz mais bem rankeada em `src/services/FishAudioService.ts:733-745`.
- O teste `providerValidation` ainda espera o comportamento anterior: sintetizar com o modelo padrao sem resolver `reference_id` em `src/__tests__/services/providerValidation.test.ts:682-701`.
- Teste focado executado:

```text
npm test -- --run src/__tests__/hooks/useTTS.test.tsx src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/services/providerValidation.test.ts
```

Resultado: 104 passaram, 1 falhou. Falha: `providerValidation.test.ts > sintetiza Fish Audio com voz padrao sem resolver reference_id`, com `SyntaxError: Unexpected token 'm', "mp3-bytes" is not valid JSON`, porque a implementacao tentou interpretar a resposta mockada de audio como resposta JSON de `/model`.

Impacto:

A mudanca aumenta latencia e pontos de falha para Fish Audio sem voz selecionada. Mesmo quando `/v1/tts` com modelo padrao poderia funcionar, a leitura pode falhar antes ao listar modelos/vozes. Tambem ha divergencia clara entre teste e implementacao.

Recomendacao:

Decidir a regra de produto: voz padrao deve usar `s1` sem `reference_id`, ou deve escolher automaticamente uma voz compativel. Depois alinhar implementacao e testes. Se a escolha automatica for mantida, tratar falha de `/model` como fallback para `s1`, nao como bloqueio total.

### 6. Media - Fallback transiente vira persistente na UI e no banco

Evidencia:

- `useTTS` classifica `AbortError`/rede como falha transiente e retorna o provider original para tentar premium novamente no proximo chunk em `src/hooks/useTTS.ts:128-137` e `src/hooks/useTTS.ts:660-677`.
- `ReaderScreen`, ao receber qualquer `onProviderFallback`, sempre chama `switchToNativeTts()` em `src/screens/ReaderScreen.tsx:362-368`.
- `switchToNativeTts()` persiste `ttsProvider: 'native'` no banco em `src/hooks/useReaderAppearance.ts:201-205`.

Impacto:

Uma falha temporaria de rede ou abort por WebView suspensa pode mudar permanentemente o livro para TTS nativo. Ha tambem uma incoerencia de estado: o hook pode tentar premium no chunk seguinte, mas a UI/config ja indicam nativo.

Recomendacao:

Propagar um codigo de motivo ou flag `transient` no callback de fallback. Persistir `native` apenas para falhas permanentes, como key invalida, provider sem credito, voz inexistente ou provider nao configurado.

### 7. Media - Erros terminais nao tem estado visual claro e podem deixar mini player preso

Evidencia:

- Erros no loop sao capturados e logados em `src/hooks/useTTS.ts:806-810`.
- No `finally`, em caso de erro, o hook chama `onStop()` mas nao informa a UI sobre erro em `src/hooks/useTTS.ts:815-830`.
- No `ReaderScreen`, `onStop` apenas limpa highlight/back-to-audio em `src/screens/ReaderScreen.tsx:370-373`.
- O mini player so e escondido em fim de livro ou stop manual em `src/screens/ReaderScreen.tsx:435-443` e `src/screens/ReaderScreen.tsx:584-594`.

Impacto:

Falhas como idioma nativo nao suportado, engine nativo ainda nao inicializado, ou premium falhando seguido de fallback nativo falhando podem deixar o mini player aberto, sem tocar, sem toast de erro e com o botao principal em estado ambiguo.

Recomendacao:

Adicionar callback de erro para o `ReaderScreen` e tratar a UI com mensagem clara, escondendo ou resetando o mini player conforme a severidade.

### 8. Media - Cache de vozes nativas fica permanentemente rejeitado apos primeira falha

Evidencia:

- `NativeTtsService` usa `voicesPromise ??= TextToSpeech.getSupportedVoices()` em `src/services/NativeTtsService.ts:25-30`.
- Se a primeira chamada rejeitar, a promise rejeitada fica memoizada.
- O plugin Android rejeita chamadas de voz quando ha excecao em `getSupportedVoices` em `node_modules/@capacitor-community/text-to-speech/android/src/main/java/com/getcapacitor/community/tts/TextToSpeechPlugin.java:105-114`.

Impacto:

Se o usuario abrir a selecao de vozes cedo demais, antes do engine nativo estabilizar, ou se ocorrer uma falha transiente, a lista de vozes pode continuar falhando ate recarregar o app.

Recomendacao:

Limpar `voicesPromise` no `catch`, ou usar cache somente para sucesso. Opcionalmente adicionar retry/backoff.

### 9. Media - Fallback premium para nativo nao usa eventos reais `onRangeStart`

Evidencia:

- O listener nativo `onRangeStart` so e registrado quando o provider resolvido inicial e `native` em `src/hooks/useTTS.ts:770-777`.
- Quando um provider premium falha e cai para `fallbackToNative()`, a leitura nativa usa apenas highlight sintetico/estimado em `src/hooks/useTTS.ts:632-674`.

Impacto:

Quando a queda para nativo acontece durante uma sessao premium, o karaoke nativo fica menos preciso que no modo nativo selecionado desde o inicio. Em Android, o plugin suporta `onRangeStart`, entao ha perda de qualidade desnecessaria.

Recomendacao:

Registrar o listener nativo para toda sessao em que fallback nativo possa acontecer, ou registrar sob demanda antes de `fallbackToNative`.

### 10. Media - Stop/cancel nao interrompe todas as requisicoes premium em voo

Evidencia:

- `stop()` aborta apenas `premiumSynthesisAbortControllerRef` em `src/hooks/useTTS.ts:893-900`.
- O prefetch premium nao recebe `AbortSignal` por decisao explicita em `src/hooks/useTTS.ts:713-719`.
- No Fish Audio nativo, `fishAudioRequest()` usa `CapacitorHttp.request()` sem observar `cancelSignal` em `src/services/FishAudioService.ts:331-342`.
- O fallback simples da ElevenLabs cria timeout sem repassar `options.signal` em `src/services/ElevenLabsService.ts:716-729`.

Impacto:

Ao parar TTS durante sintese premium, algumas requisicoes podem continuar consumindo rede, bateria, credito do provider e gerar logs/cache depois de a sessao ter sido encerrada.

Recomendacao:

Definir politica de cancelamento: prefetch pode ser abortavel em stop manual, Fish Audio nativo precisa de estrategia propria ou checagem forte antes de cache/log, e ElevenLabs simple fallback deve receber o mesmo signal.

### 11. Baixa - Speechify usa voz padrao fixa sem resolver compatibilidade por idioma

Evidencia:

- `SpeechifyService.synthesize()` usa `DEFAULT_VOICE_ID = 'carly'` quando nao ha `voiceId` em `src/services/SpeechifyService.ts:8-9` e `src/services/SpeechifyService.ts:321-340`.
- O servico tem `listCompatibleVoices()`, mas essa lista nao participa da escolha de voz padrao na sintese.

Impacto:

Para livros nao ingleses, a voz default pode ser inadequada ou rejeitada pelo provider, gerando fallback nativo mesmo quando ha vozes Speechify compativeis disponiveis.

Recomendacao:

Aplicar regra parecida com ElevenLabs/Fish Audio, ou exigir selecao explicita de voz para Speechify em idiomas fora do suporte garantido da voz default.

### 12. Baixa - Controles do mini player dependem de `pointerup`

Evidencia:

- Os botoes do `TtsMiniPlayer` usam `onPointerUp` para stop, prev, play/pause, next e back-to-audio em `src/components/reader/TtsMiniPlayer.tsx:104-160`.

Impacto:

Ativacao por teclado, alguns leitores de tela e eventos sinteticos de click podem nao acionar os controles. Em mobile isso e menos visivel, mas ainda e uma falha de acessibilidade e testabilidade.

Recomendacao:

Usar `onClick` como caminho principal, mantendo `pointerup` apenas se houver uma necessidade especifica de gesto.

## Cobertura de testes observada

Coberto:

- Pausa/retomada premium sem nova sintese.
- Stop/unmount para TTS nativo e premium.
- Fallback premium para nativo.
- Cache de audio premium por provider/voz/idioma/rate/texto.
- Destaque de palavra sem destruir links/tags inline.
- Auto-avanco para proxima secao.
- Tap em paragrafo durante TTS ativo navegando o TTS.

Lacunas:

- Offsets com whitespace inicial, multiplos espacos, `&nbsp;`, quebras de linha e texto normalizado.
- Troca de provider/velocidade enquanto audio premium esta pausado.
- `handleTtsPrev()` com lista vazia ou indice stale.
- Retarget de TTS entre secoes diferentes carregadas simultaneamente.
- Erro terminal do TTS nativo e estado visual do mini player.
- Diferenca entre fallback transiente e permanente.
- Cancelamento de prefetch e requests premium em Android nativo.

## Verificacao executada

Comando focado:

```text
npm test -- --run src/__tests__/hooks/useTTS.test.tsx src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/services/providerValidation.test.ts
```

Resultado:

- 4 arquivos executados.
- 105 testes no total.
- 104 passaram.
- 1 falhou: Fish Audio com voz padrao, descrito no achado 5.

Comando completo:

```text
npm test
```

Resultado:

- Encerrado por timeout do comando apos aproximadamente 184 segundos.
- Nao houve saida util antes do timeout.
- Nao foi identificado processo Vitest orfao apos o timeout.

Logs locais:

- `reports/diagnostics-report.md` nao contem eventos estruturados de TTS nem fallbacks.
- `adb_log.txt` mostra inicializacao e conexao do engine nativo Android, sem falha especifica de TTS.

## Prioridade sugerida

1. Corrigir o mapeamento de offsets texto-normalizado -> DOM original.
2. Corrigir cleanup/restart de audio premium pausado.
3. Blindar `handleTtsPrev()` e `useTTS.play()` contra chunks vazios/indices invalidos.
4. Corrigir limpeza de highlights entre secoes carregadas.
5. Decidir e alinhar regra de Fish Audio sem voz selecionada.
6. Separar fallback transiente de fallback permanente.
7. Adicionar UX de erro terminal de TTS.
