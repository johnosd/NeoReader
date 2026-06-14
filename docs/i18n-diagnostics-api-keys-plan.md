# Plano: i18n, diagnosticos locais e explicacoes de API keys

## Objetivo

Evoluir o NeoReader em tres frentes conectadas:

- Tornar a UI do app multilingue em `pt-BR`, `en` e `es`.
- Criar uma base local para analisar logs, erros silenciosos, gargalos e performance.
- Explicar melhor o uso de API keys e vozes premium, combinando onboarding curto com banners contextuais.

Nesta etapa, a observabilidade e local-first: nenhum evento sera enviado para servidor externo. Os logs devem ser sanitizados para evitar vazamento de API keys, texto de livros, traducoes, audio ou payloads sensiveis.

## Escopo e defaults

- Idiomas da UI: `pt-BR`, `en`, `es`.
- Preferencia de idioma: `auto`, `pt-BR`, `en`, `es`.
- Default: `auto`, resolvendo por idioma do dispositivo.
- Conteudo dos livros, metadados externos, reviews e traducoes geradas nao serao traduzidos pela camada de UI.
- Diagnosticos: logcat, console estruturado, scripts locais e relatorios manuais.
- Educacao do usuario: onboarding + banners/CTAs contextuais.

## Fase 1 - Base de i18n

Status: concluida. Validado com `npm.cmd run lint`, `npm.cmd run test` e `npm.cmd run build`.

### Entregaveis

- Camada leve de i18n no app.
- Catalogos `pt-BR`, `en` e `es`.
- Persistencia da preferencia de idioma em settings.
- Seletor de idioma na tela de Configuracoes.

### Checklist

- [x] Criar tipo `SupportedLocale = 'pt-BR' | 'en' | 'es'`.
- [x] Criar tipo `AppLocalePreference = 'auto' | SupportedLocale`.
- [x] Adicionar `appLocale` em `AppSettings`, com default `auto`.
- [x] Atualizar `normalizeUserSettings` para preservar usuarios legados.
- [x] Criar catalogos de mensagens para `pt-BR`, `en` e `es`.
- [x] Criar helper `resolveAppLocale(preference, navigatorLanguage)`.
- [x] Criar `I18nProvider` e hook `useI18n()`.
- [x] Criar funcao `t(key, params?)` com fallback previsivel.
- [x] Envolver `App` com o provider.
- [x] Adicionar seletor "Idioma do app" em Configuracoes.
- [x] Garantir que `pt-BR` preserve o texto atual como base.

### Criterios de aceite

- O usuario consegue escolher idioma do app em Configuracoes.
- Em `auto`, `pt*` resolve para `pt-BR`, `es*` resolve para `es` e demais idiomas resolvem para `en`.
- Chaves ausentes sao detectaveis em teste.
- A UI nao quebra se algum parametro de traducao estiver ausente.

### Testes

- [x] Teste unitario de resolucao de locale.
- [x] Teste unitario de fallback de mensagem.
- [x] Teste unitario garantindo que os tres catalogos tenham as mesmas chaves.
- [x] Teste de Settings salvando `appLocale`.
- [x] `npm run test`.
- [x] `npm run build`.

## Fase 2 - Migracao da UI para i18n

Status: concluida. Mensagens de validacao e fallback de providers que chegam ate o usuario agora usam codigos/estados traduziveis.

### Entregaveis

- Textos visiveis da UI principal migrados para `t()`.
- Mensagens de erro de usuario traduziveis.
- Sem traducao automatica de conteudo externo.

### Checklist

- [x] Migrar onboarding e login.
- [x] Migrar home/biblioteca e bottom nav.
- [x] Migrar descoberta.
- [x] Migrar perfil.
- [x] Migrar configuracoes.
- [x] Migrar detalhes do livro.
- [x] Migrar leitor e mini player TTS.
- [x] Migrar vocabulario.
- [x] Migrar paywall.
- [x] Migrar componentes compartilhados: empty states, toasts, bottom sheets, error boundary e botoes comuns.
- [x] Trocar mensagens de servicos por codigos/estados quando a mensagem aparece para o usuario.
- [x] Manter mensagens tecnicas internas em logs sem expor para UI quando apropriado.

### Criterios de aceite

- As telas principais funcionam em `pt-BR`, `en` e `es`.
- Nenhum texto principal da UI fica hardcoded em portugues fora de catalogos, exceto dados externos, nomes de providers, marcas e conteudo do livro.
- Os testes existentes continuam passando.

### Testes

- [x] Atualizar testes de tela para usar catalogo ou locale padrao.
- [x] Criar smoke test para renderizar telas principais nos tres locales quando viavel.
- [x] Validar troca de idioma sem recarregar o app.
- [x] `npm run test`.
- [x] `npm run build`.

## Fase 3 - Explicacoes de uso e API keys

Status: concluida. Onboarding, Configuracoes, leitor, detalhes do livro, Autor/Reviews e selecao de vozes receberam explicacoes contextuais sem alterar o design-system existente.

### Entregaveis

- Onboarding com explicacao curta sobre vozes e integracoes.
- Cards didaticos de integracao em Configuracoes.
- Banners contextuais onde a funcionalidade depende de key.

### Checklist

- [x] Adicionar slide de onboarding sobre leitura por voz.
- [x] Explicar que TTS nativo sempre funciona como fallback.
- [x] Explicar que Speechify, ElevenLabs e Fish Audio habilitam vozes premium.
- [x] Explicar que YouTube habilita reviews/videos/entrevistas na ficha do livro ou autor.
- [x] Criar componente reutilizavel `IntegrationHelpBanner`.
- [x] Criar componente reutilizavel `IntegrationEducationCard`.
- [x] Em Configuracoes, mostrar para cada provider:
  - [x] O que a key habilita.
  - [x] Quando vale usar.
  - [x] Como configurar.
  - [x] Status atual: nao configurado, validando, conectado, invalido.
  - [x] Aviso de privacidade: key fica no dispositivo.
- [x] No leitor/detalhes, mostrar banner quando provider premium selecionado nao tem key.
- [x] Na aba Autor/Reviews, mostrar banner quando YouTube nao esta configurado.
- [x] Na selecao de vozes, explicar a diferenca entre voz nativa e premium.
- [x] Permitir dismiss de banners contextuais.
- [x] Persistir dismiss por tipo de banner quando fizer sentido.

### Criterios de aceite

- Um usuario novo entende que pode ler com voz nativa sem configurar nada.
- Um usuario avancado entende por que configurar Speechify, ElevenLabs, Fish Audio ou YouTube.
- O caminho para abrir Configuracoes fica claro nos pontos onde a key e necessaria.
- Os banners nao bloqueiam o uso do app.

### Testes

- [x] Teste de onboarding mostrando slide de vozes.
- [x] Teste de Configuracoes renderizando cards de integracao.
- [x] Teste de banner quando provider premium esta sem key.
- [x] Teste de ausencia do banner quando key esta configurada.
- [x] Teste de dismiss quando persistido.
- [x] `npm run test`.
- [x] `npm run build`.

## Fase 4 - Logger estruturado local

Status: concluida. O app agora emite eventos locais `NeoReaderEvent` no console/logcat para erros, rede, TTS, traducao, book info, abertura do leitor e importacao, com sanitizacao de secrets e conteudo sensivel.

### Entregaveis

- Logger local sanitizado com prefixo unico.
- Eventos de erro, rede, TTS, traducao, importacao, abertura do leitor e book info.
- Integracao com handlers globais de erro.

### Formato sugerido

Prefixo de console:

```text
NeoReaderEvent <eventName> <json>
```

Campos base:

```ts
{
  eventName: string
  level: 'info' | 'warn' | 'error'
  timestamp: string
  sessionId: string
  flowId?: string
  screen?: string
  provider?: string
  status?: 'start' | 'success' | 'failure' | 'timeout' | 'fallback'
  durationMs?: number
  errorName?: string
  errorMessage?: string
  details?: Record<string, unknown>
}
```

### Checklist

- [x] Criar modulo `DiagnosticsLogger`.
- [x] Criar `createFlowId(prefix)`.
- [x] Criar `logEvent`, `logWarn`, `logError`.
- [x] Sanitizar API keys por padrao.
- [x] Sanitizar URLs com query sensivel.
- [x] Bloquear log de texto de livros, texto selecionado, traducao, audio/base64 e payloads completos.
- [x] Adicionar `sessionId` por sessao de app.
- [x] Integrar com `ErrorBoundary`.
- [x] Integrar com `window.onerror`.
- [x] Integrar com `window.onunhandledrejection`.
- [x] Integrar com `fetchWithTimeout` para medir rede.
- [x] Integrar com TTS premium e fallback nativo.
- [x] Integrar com TranslationService.
- [x] Integrar com BookInfoService/useBookInfo.
- [x] Integrar com abertura do leitor.
- [x] Espelhar ou migrar `ImportDiagnostics` para o novo formato.

### Eventos minimos

- [x] `app.error.render`.
- [x] `app.error.unhandled`.
- [x] `network.request`.
- [x] `network.timeout`.
- [x] `reader.open.start`.
- [x] `reader.open.success`.
- [x] `reader.open.failure`.
- [x] `translation.request`.
- [x] `translation.failure`.
- [x] `tts.synthesize.start`.
- [x] `tts.synthesize.success`.
- [x] `tts.synthesize.failure`.
- [x] `tts.provider.fallback`.
- [x] `bookinfo.collect.start`.
- [x] `bookinfo.collect.failure`.
- [x] `import.start`.
- [x] `import.failure`.
- [x] `import.slow-stage`.

### Thresholds iniciais

- Rede lenta: `>3000ms`.
- Provider TTS lento: `>8000ms`.
- Abertura do leitor lenta: `>3000ms`.
- Tarefa local longa: `>250ms`.
- Importacao de metadata/hash/save lenta: manter thresholds atuais e reportar tambem no novo formato.

### Criterios de aceite

- Erros silenciosos passam a aparecer como eventos estruturados no logcat/console.
- Logs nao contem secrets nem conteudo dos livros.
- Um evento de falha tem contexto suficiente para orientar investigacao.

### Testes

- [x] Teste unitario de sanitizacao de secrets.
- [x] Teste unitario de sanitizacao de URL.
- [x] Teste unitario garantindo que texto longo sensivel nao e logado.
- [x] Teste de ErrorBoundary emitindo evento.
- [x] Teste de `fetchWithTimeout` emitindo sucesso, falha e timeout.
- [x] Teste de fallback TTS emitindo evento.
- [x] `npm run test`.
- [x] `npm run build`.

## Fase 5 - Captura e analise de logs

Status: concluida. Ha um capturador Android generico e um analisador local que gera relatorios Markdown/JSON a partir de arquivos ou pastas de logs.

### Entregaveis

- Script para analisar logs existentes.
- Relatorio local em Markdown/JSON com erros, lentidao e sinais Android.
- Playbook de captura por fluxo.

### Checklist

- [x] Criar `scripts/analyze-diagnostics.mjs`.
- [x] Aceitar entrada por argumento: arquivo ou pasta de logs.
- [x] Parsear linhas `NeoReaderEvent`.
- [x] Parsear eventos legados `NeoReaderImport`.
- [x] Detectar `AndroidRuntime`, `FATAL EXCEPTION`, ANR e `Input dispatching timed out`.
- [x] Detectar `Choreographer`, `Skipped frames`, `Davey` e sinais de jank.
- [x] Detectar GC e memoria quando disponivel.
- [x] Agrupar falhas por `eventName`, `screen`, `provider`, `errorMessage`.
- [x] Rankear operacoes por `durationMs`.
- [x] Listar timeouts por provider/endpoint sanitizado.
- [x] Listar fallback premium -> nativo.
- [x] Gerar resumo executivo no topo do relatorio.
- [x] Gerar "proximas acoes sugeridas" com base nos achados.
- [x] Adicionar script npm `diagnostics:analyze`.
- [x] Criar ou evoluir script PowerShell geral de captura Android.
- [x] Documentar comandos no README ou em doc dedicado.

### Playbook inicial

1. Conectar dispositivo/emulador com adb.
2. Rodar captura geral:

```powershell
npm run android:logs:diagnostics:run
```

3. Navegar pelo fluxo que queremos investigar: abrir app, importar livro, abrir leitor, traduzir trecho, iniciar TTS nativo/premium, abrir detalhes/Autor/YouTube.
4. Analisar o log filtrado gerado em `logs/`:

```powershell
npm run diagnostics:analyze -- logs\android-diagnostics-YYYYMMDD-HHMMSS-filtered.log
```

5. Ler `reports/diagnostics-report.md` e converter os achados em acoes pequenas de melhoria.

### Relatorio esperado

- Total de eventos analisados.
- Top 10 erros.
- Top 10 operacoes lentas.
- Falhas por provider.
- Timeouts de rede.
- Eventos de fallback TTS.
- Sinais Android de crash/ANR/jank.
- Fluxos mais problematicos por `flowId`.
- Artefatos analisados e data da analise.

### Criterios de aceite

- Dado um `logcat.txt`, o script gera um relatorio legivel.
- O relatorio aponta pelo menos erros, operacoes lentas e sinais Android.
- O script tolera linhas malformadas sem abortar a analise.

### Testes

- [x] Fixture de log com eventos validos.
- [x] Fixture de log com JSON malformado.
- [x] Fixture com `AndroidRuntime`.
- [x] Fixture com `Skipped frames`/`Davey`.
- [x] Teste de ranking por duracao.
- [x] `npm run diagnostics:analyze -- src\__tests__\fixtures\diagnostics` em uma amostra controlada.
- [x] `npm run test`.

## Fase 6 - Rotina de performance e melhoria continua

### Entregaveis

- Playbook para investigar fluxos especificos.
- Baselines iniciais de performance.
- Lista de acoes de melhoria baseada em evidencias.

### Fluxos prioritarios

- [ ] Cold start ate tela inicial.
- [ ] Importar EPUB pequeno.
- [ ] Importar EPUB grande.
- [ ] Abrir livro ja importado.
- [ ] Traduzir trecho.
- [ ] Iniciar TTS nativo.
- [ ] Iniciar TTS premium.
- [ ] Carregar detalhes do livro.
- [ ] Carregar Autor/YouTube.

### Checklist

- [ ] Definir um dispositivo/emulador de referencia.
- [ ] Definir build usada para medicao.
- [ ] Capturar log estruturado por fluxo.
- [ ] Rodar `diagnostics:analyze` por fluxo.
- [ ] Registrar tempos base em doc de acompanhamento.
- [ ] Quando houver jank, capturar `gfxinfo framestats`.
- [ ] Quando houver causa incerta, capturar Perfetto focado.
- [ ] Quando houver CPU alto, usar Simpleperf se build permitir.
- [ ] Quando houver suspeita de memoria, capturar `dumpsys meminfo` e heap dump quando necessario.
- [ ] Converter achados em issues/acoes pequenas.

### Criterios de aceite

- Cada fluxo prioritario tem pelo menos uma captura analisada.
- Gargalos sao priorizados por evidencia, nao por impressao.
- O time consegue comparar antes/depois de uma otimizacao.

## Ordem recomendada de implementacao

1. Fase 1: Base de i18n.
2. Fase 4: Logger estruturado local.
3. Fase 5: Analise de logs.
4. Fase 3: Explicacoes de uso e API keys.
5. Fase 2: Migracao completa da UI.
6. Fase 6: Rotina de performance e melhorias.

Motivo: i18n e logger sao fundacoes. O parser de logs deve vir cedo para gerar aprendizado real. A educacao de uso pode ser implementada antes da migracao total da UI, desde que ja use o catalogo.

## Riscos e cuidados

- Migrar toda a UI de uma vez pode gerar regressao visual; preferir PRs pequenos por tela.
- Mensagens hardcoded em testes podem quebrar; ajustar testes para usar o catalogo quando fizer sentido.
- Logar detalhes demais pode vazar informacao sensivel; sanitizacao deve ser testada antes de instrumentar amplamente.
- YouTube nao tem validacao simples de key na UI hoje; tratar como "salvo" e registrar falhas reais de chamada nos diagnosticos.
- Nao alterar o comportamento de leitura, traducao ou TTS durante a migracao de texto.

## Definition of done geral

- [x] `npm run test` passando.
- [x] `npm run build` passando.
- [x] Nenhum secret aparece em logs ou snapshots.
- [x] UI principal disponivel em `pt-BR`, `en` e `es`.
- [x] Usuario consegue entender quando e por que configurar cada API key.
- [x] Logs locais geram relatorio acionavel para erros e performance.
- [ ] Mudancas divididas em commits pequenos e focados.
