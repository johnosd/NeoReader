# Code review geral — NeoReader

Data: 10/10/2026 • Base: `9d1793db2790ce97225246ceaf2358c48dd6c856` • Escopo solicitado: revisão geral do repositório.

## Parecer

O projeto tem uma base funcional considerável, tipos, serviços de domínio e uma suíte extensa. Os gates web passaram. Entretanto, encontrei **17 problemas acionáveis: 6 P1 e 11 P2**. Os riscos mais importantes são sobrescrita de dados na sincronização, isolamento incompleto entre contas e divulgação de credenciais OPDS. Também há falhas de continuidade do audiobook, cancelamento, retenção de memória e acessibilidade.

**Recomendação:** corrigir os P1 antes de ampliar o uso da sincronização e dos catálogos privados. A aprovação dos testes atuais não cobre os cenários demonstrados neste relatório. Não encontrei evidência suficiente para classificar algum achado como P0.

Nenhuma correção de produção foi aplicada. A entrega contém este relatório, inventário, logs e experimentos reproduzíveis. Os experimentos usam dados e credenciais sintéticos.

## Método, cobertura e limites

O inventário está em [inventory.json](code-review-2026-10-10/inventory.json): **479 arquivos versionados selecionados, 103.729 linhas físicas**, incluindo testes, lockfile e configurações. Esses números representam o inventário técnico, não linhas de produção efetivamente lidas nem cobertura de testes. A seleção contém 256 arquivos em `src/` fora dos testes, 165 arquivos classificados como testes, 30 arquivos Android fora dessa classificação, 16 scripts, 2 workflows e configurações da raiz.

A revisão combinou inventário e buscas no código, leitura aprofundada dos fluxos centrais, rastreamento de chamadas, execução dos gates existentes e criação de 13 reproduções isoladas.

| Área | Foco da análise |
|---|---|
| Aplicação e telas | Navegação, login, biblioteca, detalhes, leitor, configurações, catálogos |
| Persistência | Schema Dexie, migrações, exclusão, progresso, marcadores, vocabulário, preferências, contas |
| Livros | Importação, deduplicação, resolução de arquivos, EPUB, PDF, metadados e capas |
| Leitura e áudio | Viewer, sessões PDF, TTS nativo/premium, prefetch, pausa, tradução incremental |
| Integrações | Google Drive, OPDS, credenciais, auth, billing/ads e fronteiras de rede |
| Android | Plugins de biblioteca e credenciais, serviço de áudio, arquivos locais e ciclo de vida |
| Word Lens | Carregamento de assets, caches e testes do pipeline Python |
| Qualidade | Configurações Vite/Vitest/ESLint, testes, scripts, workflows e documentação |

Esta é uma revisão transversal com aprofundamento orientado a risco. **Não significa que cada linha foi auditada manualmente, que todas as combinações de execução foram testadas ou que o código esteja livre de outros problemas.** Dependências e código gerado não receberam revisão manual integral. Não houve acesso a segredos reais, alteração de dados do usuário, deploy, teste em celular, cobrança real ou operação no Google Drive real.

Classificação:

- **P1:** prioridade alta; perda de dados, exposição de credenciais ou quebra importante do fluxo principal.
- **P2:** defeito funcional, acessibilidade ou uso inadequado de recursos com gatilho específico.
- **Reproduzido:** demonstrado em teste isolado; dependências nativas/rede são simuladas quando indicado.
- **Estático:** evidência no encadeamento do código; efeito final em dispositivo/serviço real não foi exercitado.

## Validações executadas

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run lint` | Passou | [lint.log](code-review-2026-10-10/lint.log) |
| `npm test` | 150 arquivos passaram, 2 ignorados; **1.559 testes passaram, 2 ignorados**; 141,23 s | [tests.log](code-review-2026-10-10/tests.log) |
| `npm run build` | Passou; aviso de chunk acima de 500 kB | [build.log](code-review-2026-10-10/build.log) |
| `npm run word-lens:test` | **7 testes passaram** | [word-lens-tests.log](code-review-2026-10-10/word-lens-tests.log) |
| Reproduções desta revisão | **13 testes passaram em 4 arquivos** | [probes.log](code-review-2026-10-10/probes.log) |
| Gradle `:app:testDebugUnitTest --offline` | Não concluiu: JUnit 4.13.2 e Hamcrest 1.3 ausentes do cache; compilação Java de produção estava atualizada | [android-tests.log](code-review-2026-10-10/android-tests.log) |
| `npm audit --omit=dev` | **Não executado:** revisão automática de permissões rejeitou envio de metadados de dependências ao registro externo | Análise de vulnerabilidades conhecidas pendente |

O log de Vitest contém mensagens `Window.scrollTo` não implementado no jsdom. Não causaram falha, mas dificultam localizar avisos relevantes. O erro Gradle é uma limitação da execução offline, não evidência de defeito Java. Compilação Java atualizada não equivale a build Android limpo ou QA em dispositivo.

**Interpretação das reproduções:** os testes `*.probe.ts`/`*.probe.tsx` passam quando observam o comportamento defeituoso. São evidência da revisão, não testes de aceitação de uma correção. Para convertê-los em regressão, inverter as expectativas pertinentes e colocá-los na suíte normal.

```powershell
npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts
```

A configuração separada mantém esses experimentos fora da descoberta padrão. Usam fake-indexeddb e não precisam de contas, arquivos pessoais ou rede real.

## Lista priorizada

| ID | Prioridade | Problema | Evidência |
|---|---|---|---|
| R01 | P1 | Login com vocabulário local vazio pode apagar o backup remoto | Reproduzido |
| R03 | P1 | Upload de marcadores substitui os de outro dispositivo | Reproduzido |
| R04 | P1 | Exclusão de arquivo local ignora outras contas | Reproduzido na camada JS + análise nativa |
| R05 | P1 | Credenciais OPDS de contas diferentes usam as mesmas chaves | Estático |
| R07 | P1 | Credenciais OPDS seguem links para outra origem | Reproduzido na fronteira HTTP |
| R09 | P1 | Audiobook termina antes de concluir a próxima tradução | Reproduzido com hooks reais |
| R02 | P2 | Restauração de progresso remoto não está ligada ao app | Estático |
| R06 | P2 | Re-download OPDS após exclusão viola índice único | Reproduzido |
| R08 | P2 | Pausa do TTS nativo pode aguardar indefinidamente | Reproduzido com plugin simulado |
| R10 | P2 | Tradução MyMemory ignora cancelamento | Reproduzido |
| R11 | P2 | Cache de EPUB retém conteúdo descompactado sem limite | Reproduzido e medido |
| R12 | P2 | Backup de API keys é restaurado em outra conta | Reproduzido |
| R13 | P2 | Cache de áudio não diferencia o modelo de síntese | Reproduzido |
| R14 | P2 | Falha de Range do PDF não encerra abertura pendente | Estático |
| R15 | P2 | Pausa mantém wake lock parcial do Android | Estático |
| R16 | P2 | Sheet fechado continua acessível e focável | Reproduzido no DOM |
| R17 | P2 | Paginação OPDS atrasada contamina outra pasta | Reproduzido |

Os IDs seguem os experimentos e a organização da análise; a tabela está ordenada por prioridade.

## Achados detalhados — prioridade alta

### R01 — P1 — Vocabulário remoto pode ser apagado ao entrar em outro dispositivo

**Código:** [App.tsx:114](../src/App.tsx#L114), [VocabularyDriveSyncService.ts:68](../src/services/VocabularyDriveSyncService.ts#L68), [VocabularyDriveSyncService.ts:96](../src/services/VocabularyDriveSyncService.ts#L96).

O efeito de login agenda imediatamente a sincronização. `syncVocabulary` lê a tabela local, monta um snapshot e substitui o arquivo remoto existente. Não lê nem mescla seu conteúdo. Existe `restoreVocabularyFromDrive`, mas a busca por referências encontrou a declaração sem chamada no fluxo de produção.

**Cenário:** A possui palavras sincronizadas. O usuário Pro entra em B com tabela vazia e Drive autorizado. O upload de B envia `items: []`, removendo as palavras do arquivo remoto. Nem é necessário adicionar uma palavra em B.

**Evidência:** R01 inicializa conteúdo remoto sintético, executa o serviço real com banco vazio e verifica que o arquivo termina vazio sem chamada a `getJson`. A rede é simulada; payload e decisão de escrita são reais.

**Correção:** restaurar e reconciliar antes da primeira publicação. Diferenciar banco não hidratado de exclusão intencional. Definir identidade estável, registros de exclusão e política de conflito. Proteger escrita concorrente por versão/condição de atualização; leitura seguida de escrita ainda permite perda em corridas.

**Aceitação:** login em B preserva palavras de A; inclusões offline em ambos sobrevivem; exclusão intencional propaga sem ressuscitar; falha de restauração impede sobrescrita destrutiva mantendo uso local.

### R03 — P1 — Marcadores de outro dispositivo são substituídos

**Código:** [BookmarkDriveSyncService.ts:104](../src/services/BookmarkDriveSyncService.ts#L104), [BookmarkDriveSyncService.ts:25](../src/services/BookmarkDriveSyncService.ts#L25), [BookImportService.ts:895](../src/services/BookImportService.ts#L895).

O upload constrói o arquivo somente com a tabela local e executa `updateJson`. A interface desse fluxo nem inclui leitura do JSON. A restauração na importação não resolve alterações posteriores de outro dispositivo.

**Cenário:** A e B já importaram o livro. A cria X. B, ainda com snapshot antigo, cria Y e publica seu conjunto local; X desaparece do remoto. O mecanismo também pode remover informações de exclusão necessárias à reconciliação.

**Evidência:** R03 demonstra substituição de marcador exclusivamente remoto pelo local. Ter `syncKey`, timestamps e estado de sincronização no modelo não evita perda quando a publicação não reconcilia.

**Correção:** mesclar por identidade e timestamp, incluindo exclusões, preservar alterações pendentes e tratar concorrência na escrita. Status conectado deve representar uma operação que preservou dados relevantes.

**Aceitação:** dois dispositivos adicionam sem reimportar; ambos os marcadores aparecem nos dois lados. Cobrir exclusão versus edição, publicação simultânea, offline e retry sem duplicação.

### R04 — P1 — Excluir livro de uma conta pode remover o arquivo de outra

**Código:** [database.ts:39](../src/db/database.ts#L39), [books.ts:67](../src/db/books.ts#L67), [NeoReaderLibraryPlugin.java:492](../android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java#L492).

Os registros Dexie são separados por usuário. Arquivos nativos são nomeados pelo hash em um diretório comum do app. Antes da exclusão física, `deleteLocalCopyIfUnused` procura referências apenas no banco ativo.

**Cenário:** A e B, no mesmo celular, importam o mesmo arquivo e compartilham a URI. A exclui seu livro. A consulta retorna zero referências, mas o livro de B continua apontando para o caminho. A exclusão física torna o livro de B indisponível.

**Evidência:** R04 mantém referência em outro banco Dexie e demonstra que a exclusão real chama o bridge de remoção mesmo assim. O bridge é mockado para preservar o dispositivo; o compartilhamento do caminho está na implementação Java. O efeito físico entre duas contas não foi exercitado em celular.

**Correção:** definir propriedade: diretórios por conta ou registro global de referências antes de apagar. Considerar importações em andamento. A migração precisa preservar arquivos já compartilhados; mudar o nome apenas para importações futuras não resolve o legado.

**Aceitação:** importar em A/B, excluir em A e abrir em B; somente a última referência autoriza remoção. Testar conta legada e interrupção de importação.

### R05 — P1 — Credenciais OPDS colidem entre contas

**Código:** [OpdsCredentialStore.ts:9](../src/services/opds/OpdsCredentialStore.ts#L9), [NeoReaderLibraryPlugin.java:77](../android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java#L77), [NeoReaderLibraryPlugin.java:1505](../android/app/src/main/java/com/johnny/neoreader/NeoReaderLibraryPlugin.java#L1505), [database.ts:333](../src/db/database.ts#L333).

O banco de catálogos é por conta, com IDs numéricos locais. A credencial fica em um único `EncryptedSharedPreferences`, com chaves derivadas somente de `catalogId`. Usuário/namespace não atravessam a API do bridge.

**Cenário:** catálogos de A/B recebem o mesmo ID em bancos diferentes. Salvar B substitui a credencial de A. Ao voltar, A pode enviar a senha de B ao servidor de A. Excluir catálogo em uma conta também pode apagar a credencial da outra.

**Evidência:** análise da composição das chaves e escopo dos bancos. Criptografia protege o conteúdo armazenado, mas não distingue proprietários. Não houve uso de contas ou senhas reais.

**Correção:** incluir identidade estável de conta e catálogo na chave; preferir UUID persistente a ID autoincremental isolado. Passar/validar contexto no plugin. Migrar chaves antigas com atribuição explícita, evitando entregá-las automaticamente a qualquer conta.

**Aceitação:** contas com o mesmo ID local armazenam, recuperam e removem independentemente; cada servidor recebe somente a credencial de seu catálogo.

### R07 — P1 — Links externos OPDS recebem a credencial do catálogo

**Código:** [OpdsCatalogService.ts:60](../src/services/opds/OpdsCatalogService.ts#L60), [OpdsCatalogService.ts:175](../src/services/opds/OpdsCatalogService.ts#L175), [OpdsDownloadService.ts:44](../src/services/opds/OpdsDownloadService.ts#L44).

As requisições adicionam `Authorization: Basic ...` independentemente da origem da URL de destino. Feeds podem ter links de navegação, paginação, busca, capa e aquisição em outro servidor. Converter HTTP em HTTPS não verifica propriedade do destino.

**Cenário:** catálogo privado em `private.example` anuncia recurso em `external.example`. A requisição ao segundo domínio leva usuário e senha do primeiro, mesmo que o recurso seja público.

**Evidência:** R07 usa `fetchPage` real com origens diferentes e captura `Authorization` na chamada mockada a `CapacitorHttp`, sem tráfego externo. O download também prepara headers sem verificar origem. Não foi validado comportamento de headers em redirects nativos.

**Correção:** comparar origem efetiva com origem autorizada antes de montar autenticação. Buscar recursos externos sem credenciais; autenticação em outra origem exige autorização explícita. Aplicar a todos os caminhos e verificar redirects nativos.

**Aceitação:** destino externo nunca recebe a credencial; destino autorizado funciona; mudança de porta/esquema e redirect externo têm testes próprios.

### R09 — P1 — Audiobook traduzido pode pular o restante da seção

**Código:** [useTTS.ts:927](../src/hooks/useTTS.ts#L927), [useTTS.ts:991](../src/hooks/useTTS.ts#L991), [useTranslatedAudiobook.ts:108](../src/hooks/useTranslatedAudiobook.ts#L108), [ReaderScreen.tsx:676](../src/screens/ReaderScreen.tsx#L676).

O TTS itera um array mutável até `index < chunks.length`. A tradução seguinte acontece em segundo plano e acrescenta chunks depois. Se a fala termina antes dela, o loop encontra o fim momentâneo do array e dispara `onFinished`. No leitor, esse callback inicia avanço de seção. `hasPendingTranslation` protege avanços manuais, mas não coordena o fim natural.

**Evidência:** R09 integra os dois hooks reais, conclui a primeira fala e mantém a segunda tradução pendente. `onFinished` ocorre enquanto `hasPendingTranslation()` é verdadeiro; resolver a tradução depois não reproduz o segundo parágrafo.

**Impacto:** frases curtas com rede lenta podem encerrar capítulos sem narrar todo o texto. É uma corrida produtor/consumidor, não uma falha exclusiva de um provedor.

**Correção:** fila assíncrona/iterador que espere novos chunks e receba sinal explícito de fim. Coordenar erro, cancelamento e prefetch por sessão. Bloquear só o callback de fim não garante retomada do áudio.

**Aceitação:** atraso na tradução espera e depois continua; fim somente quando a fonte terminou. Cobrir cancelamento durante espera e erro do produtor.

## Achados detalhados — demais correções

### R02 — P2 — Progresso no Drive não é restaurado pelo app

**Código:** [ProgressDriveSyncService.ts:109](../src/services/ProgressDriveSyncService.ts#L109), [useReaderProgress.ts:55](../src/hooks/useReaderProgress.ts#L55), [ProgressDriveSyncService.ts:80](../src/services/ProgressDriveSyncService.ts#L80).

A restauração existe, mas não tem chamada de produção encontrada na busca de referências. O leitor inicializa com progresso local. Na importação há restauração de marcadores, sem ligação equivalente para progresso.

**Cenário/impacto:** A salva posição no Drive. B importa o mesmo arquivo e abre do começo. Novo progresso local em B pode ter timestamp superior e substituir a posição anterior. O comparador de timestamps na publicação não recupera posição nunca aplicada localmente.

**Correção:** ligar restauração à importação/abertura antes da posição inicial definitiva e primeira publicação. Preservar uso offline com prazo e estado explícito de restauração pendente.

**Aceitação:** mesmo hash abre na posição remota mais recente; abrir/fechar sem navegar não publica reinício; posição local realmente mais recente vence. Evidência estática, sem sessão Drive real.

### R06 — P2 — Re-download OPDS falha após excluir o livro

**Código:** [opdsDownloadedEntries.ts:4](../src/db/opdsDownloadedEntries.ts#L4), [database.ts:417](../src/db/database.ts#L417), [books.ts:40](../src/db/books.ts#L40), [OpdsDownloadService.ts:99](../src/services/opds/OpdsDownloadService.ts#L99).

`deleteBook` não limpa `opdsDownloadedEntries`. A consulta detecta que o livro acabou e retorna `null`, mas o vínculo permanece sob índice único `[catalogId+entryId]`. O registro do novo download usa `add`.

**Evidência:** R06 exclui o primeiro livro, confirma que a consulta permite novo download e observa `ConstraintError` ao registrar o segundo. O serviço importa antes de gravar o vínculo; pode mostrar falha apesar de já ter salvo o livro.

**Correção:** limpar referências na transação e/ou tornar o registro atualização idempotente. Invalidar o coordenador em memória, evitando “já baixado” para livro ausente.

**Aceitação:** excluir e baixar novamente funciona na mesma sessão e após reiniciar; retry não duplica vínculo; UI/banco concordam sobre sucesso.

### R08 — P2 — Pausa do TTS nativo não libera espera de interrupção

**Código:** [useTTS.ts:680](../src/hooks/useTTS.ts#L680), [useTTS.ts:1001](../src/hooks/useTTS.ts#L1001), [useTTS.ts:1083](../src/hooks/useTTS.ts#L1083).

O código prevê `speak()` nativo pendente após interrupção: usa `Promise.race` com confirmação local de stop. `stop()` aciona essa confirmação após o plugin responder. `pause()` chama o plugin e espera `playbackDone`, mas não aciona a confirmação.

**Evidência:** R08 simula esse comportamento do plugin. Stop nativo responde, mas a pausa permanece pendente; um `stop()` posterior do hook libera a espera.

**Impacto:** pausa e loop anterior podem permanecer pendentes; retomadas podem deixar sessões antigas órfãs. Não significa que retomar fique inutilizável em toda execução.

**Correção:** centralizar interrupção/confirmacão para stop, pausa e teardown, com idempotência e proteção por sessão.

**Aceitação:** pausa conclui mesmo que `speak()` não resolva sozinho; não sobra listener/loop; repetir pause/stop/resume não provoca callback tardio.

### R10 — P2 — Cancelamento não chega à tradução MyMemory

**Código:** [TranslationService.ts:93](../src/services/TranslationService.ts#L93), [TranslationService.ts:218](../src/services/TranslationService.ts#L218), [http.ts:45](../src/services/http.ts#L45).

`TranslateOptions` expõe `signal`, mas caminhos MyMemory não o encaminham. A função interna chama `fetchWithTimeout(url)` sem cancelamento. O helper HTTP também substitui `init.signal` pelo controlador de timeout sem compor sinais.

**Evidência:** R10 fornece sinal já abortado e demonstra que a requisição é despachada e retorna sucesso. HTTP simulado, sem transmitir texto real.

**Impacto:** trocar seleção/capítulo ou sair pode descartar resposta na UI e manter tráfego/trabalho desnecessário. Textos divididos precisam também interromper a sequência restante. Consumo de bateria/rede não foi medido.

**Correção:** verificar cancelamento antes de despachar, propagar signal em todos os caminhos, compor timeout/cancelamento externo e remover listeners ao finalizar. Abort não deve disparar fallback.

**Aceitação:** sinal já abortado não despacha; abort interrompe request; não há retry/fallback nem próximas partes depois de cancelar.

### R11 — P2 — Cache de EPUB mantém pacotes descompactados sem limite

**Código:** [EpubService.ts:97](../src/services/EpubService.ts#L97), [EpubService.ts:107](../src/services/EpubService.ts#L107), [EpubService.ts:122](../src/services/EpubService.ts#L122).

`packageCache` é um `Map` estático de pacotes com arquivos descompactados. Não há orçamento de bytes, LRU ou descarte normal quando o consumidor termina. Existe invalidação em alguns fluxos de erro/reextração de capa, sem ciclo de vida que limite retenção na navegação habitual.

**Medição:** R11 abre oito ZIPs sintéticos com 1 MiB cada. Somam **9.352 bytes comprimidos**, mas o cache mantém **8.388.608 bytes de arrays descompactados**, com oito entradas após a última leitura. São bytes referenciados pelo cache, não heap completo, RSS ou pico em celular. O pacote mínimo comprova retenção/descompressão, não fidelidade a corpus real de EPUBs.

**Impacto:** visitar muitos livros, especialmente ilustrados, acumula conteúdo até recarregar o processo ou invalidar entradas. Outras representações podem elevar o pico.

**Correção:** limite em bytes e descarte previsível, compartilhando operações em andamento quando possível. Avaliar extração seletiva de metadados/capa em vez de descompactar todas as imagens.

**Aceitação:** medir ao visitar corpus representativo; cache fica no orçamento e libera conteúdo sem consumidores. Confirmar abertura repetida/importação concorrente sem regressão.

### R12 — P2 — Backup de API keys atravessa contas

**Código:** [settings.ts:13](../src/db/settings.ts#L13), [settings.ts:28](../src/db/settings.ts#L28), [settings.ts:48](../src/db/settings.ts#L48).

Configurações Dexie são por conta, mas as quatro chaves de backup em Preferences usam `neoreader:settings:${field}`, sem usuário. `getSettings` restaura quando chaves locais estão vazias, inclusive na primeira entrada de outra conta.

**Evidência:** R12 usa banco sem settings e Preferences mockado com chave sintética de A. O `getSettings` real retorna a chave para a nova conta. Nenhuma chave real foi lida.

**Impacto:** B herda credenciais de A, pode consumir sua quota e sobrescrever o backup compartilhado. Sandbox Android não separa contas lógicas do app.

**Correção:** namespace por proprietário estável e migração segura. Se compartilhar chave no dispositivo for desejado, precisa ser opção explícita na UI, não restauração implícita.

**Aceitação:** novo login não recebe chave anterior; atualização/restauração preserva a conta correta; apagar chave não a faz reaparecer do backup antigo.

### R13 — P2 — Modelo de síntese ausente da identidade do cache

**Código:** [TtsAudioCache.ts:10](../src/services/TtsAudioCache.ts#L10), [TtsAudioCache.ts:27](../src/services/TtsAudioCache.ts#L27), [useTTS.ts:526](../src/hooks/useTTS.ts#L526), [useTTS.ts:827](../src/hooks/useTTS.ts#L827).

Síntese recebe `modelId`, mas parâmetros/chave do cache não. Provider, voz, idioma, velocidade e texto iguais geram mesma chave quando muda o modelo. Prefetch tem a mesma omissão.

**Evidência:** R13 demonstra igualdade da chave entre dois modelos da mesma voz. A retenção configurada chega a seis horas. Não foi preciso chamar provedor real para demonstrar a colisão semântica.

**Impacto:** selecionar/atualizar modelo pode continuar reproduzindo áudio anterior, tornando comparação/configuração inconsistentes.

**Correção:** incluir modelo efetivo e parâmetros que alterem síntese, normalizando default/fallback. Incrementar versão da chave ao mudar identidade.

**Aceitação:** modelos diferentes não compartilham áudio; mesmo modelo mantém hit; reprodução/prefetch calculam a mesma chave.

### R14 — P2 — Erro de Range em PDF não encerra abertura

**Código:** [PdfBookFactory.ts:123](../src/services/pdf/PdfBookFactory.ts#L123), [PdfBookFactory.ts:129](../src/services/pdf/PdfBookFactory.ts#L129), [usePdfReaderSession.ts:51](../src/hooks/usePdfReaderSession.ts#L51), [usePdfReaderSession.ts:79](../src/hooks/usePdfReaderSession.ts#L79).

Falha de leitura em `requestDataRange` cai em `console.warn`; o transporte não recebe dados nem encerramento associado ao erro. A factory aguarda `getDocument().promise`, sem guardar tarefa de carregamento cancelável nesse caminho. Cleanup do hook só destrói sessão que já abriu.

**Cenário/impacto:** Range rejeitado durante abertura pode deixar PDF.js aguardando bytes que nunca chegarão. Sair marca `cancelled`, mas não interrompe abertura pendente. Risco de spinner permanente e tarefas/recursos mantidos. Conclusão estática: não foi reproduzido travamento real do PDF.js no celular.

**Correção:** manter loading task, propagar erro para conclusão rejeitada, destruir tarefa/transporte em falha e aceitar AbortSignal desde abertura. Definir prazo de abertura e tratamento de metadados/primeira página.

**Aceitação:** erro no primeiro Range e em posterior tem resposta finita; sair durante abertura cancela requests/worker; reabrir funciona sem recursos antigos.

### R15 — P2 — Android mantém CPU acordada durante pausa

**Código:** [TtsPlaybackService.java:124](../android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java#L124), [TtsPlaybackService.java:215](../android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java#L215), [TtsPlaybackService.java:227](../android/app/src/main/java/com/johnny/neoreader/TtsPlaybackService.java#L227), [useTTS.ts:1007](../src/hooks/useTTS.ts#L1007).

O serviço adquire `PARTIAL_WAKE_LOCK` sem timeout. Atualizar estado para pausado muda notificação/MediaSession, mas não libera o lock. O hook preserva deliberadamente o serviço na pausa. Liberar manter tela ligada no JS é diferente do lock parcial nativo.

**Impacto:** sessão pausada pode manter CPU acordada até serviço terminar. Não houve medição de consumo; não atribuo percentual de bateria ou autonomia.

**Correção:** liberar lock quando reprodução não precisa de CPU e readquirir ao retomar. Preservar notificação não exige lock indefinido. Coordenar foco de áudio/interrupções.

**Aceitação:** no aparelho, `dumpsys power` ou diagnóstico equivalente demonstra liberação na pausa, aquisição na retomada e ausência após stop/erro; áudio com tela apagada permanece correto. Evidência atual estática.

### R16 — P2 — BottomSheet fechado continua acessível e focável

**Código:** [BottomSheet.tsx:40](../src/components/ui/BottomSheet.tsx#L40), [LibraryScreen.tsx](../src/screens/LibraryScreen.tsx).

O diálogo permanece montado com `role="dialog"` e `aria-modal="true"`. Fechar só aplica `translate-y-full`. `aria-hidden` está no backdrop, não no diálogo. Conteúdo não recebe `inert` nem é desmontado. Faltam nome acessível vinculado ao título e gerenciamento completo de foco modal.

**Evidência:** R16 renderiza `open={false}`, encontra o diálogo pelo papel acessível e foca seu botão. É DOM/jsdom, não TalkBack real. Transformação visual não remove conteúdo da árvore de acessibilidade.

**Impacto:** sheets fechados, inclusive vários montados na biblioteca, expõem ações fora da tela ao teclado/leitor de tela e anunciam modalidade indevida.

**Correção:** conteúdo fechado inerte/oculto semanticamente ou desmontado após animação. Ao abrir, definir nome, foco inicial, contenção de foco e retorno ao acionador.

**Aceitação:** fechado não é diálogo acessível nem recebe foco; aberto recebe foco correto, Escape fecha e foco retorna. Complementar com TalkBack/teclado.

### R17 — P2 — Paginação OPDS antiga altera pasta atual

**Código:** [useOpdsCatalogBrowse.ts:165](../src/hooks/useOpdsCatalogBrowse.ts#L165).

O efeito principal tem cancelamento, mas `loadMore` não verifica geração, URL atual ou desmontagem antes de anexar resultados e substituir `nextPageUrl`.

**Evidência:** R17 carrega A, inicia página 2, navega para B e resolve A depois. A lista final mistura B/A; `hasMore` reflete paginação de A.

**Impacto:** navegação rápida/rede lenta mistura pastas e pode levar a download de item que não pertence à localização exibida. Busca e ordenação também precisam invalidar paginação anterior.

**Correção:** geração por consulta; ignorar resultados obsoletos em sucesso, erro e finally; cancelar requests quando possível. Resetar paginação ao trocar contexto.

**Aceitação:** respostas de A nunca alteram B; mudar busca/ordem durante paginação mantém lista e próxima página atuais; desmontagem não deixa operações aplicáveis à sessão posterior.

## Arquitetura e manutenção

### Corrigir contratos de fluxo antes de refatorar telas

Os problemas mais graves são contratos incompletos entre partes existentes: local/remoto, conta/armazenamento compartilhado, produtor/consumidor de áudio e tela/requisição. Documentar invariantes curtas junto aos coordenadores:

1. Upload não substitui dados remotos sem reconciliar identidade e versão corretas.
2. Operação de arquivo ou segredo de uma conta não interfere em outra.
3. Fila momentaneamente vazia não representa fim de conteúdo assíncrono.
4. Encerrar sessão invalida callbacks e recursos que ela iniciou.

Não recomendo começar por reescrever navegação ou trocar framework. Estabilizar contratos e testes primeiro reduz o risco de transportar defeitos para outra arquitetura.

### Responsabilidades concentradas

O inventário mostra `EpubViewer.tsx` com **4.537 linhas**, `BookDetailsScreen.tsx` com **2.372**, `ReaderScreen.tsx` com **2.107**, o plugin de biblioteca com **1.639** e `PdfPageViewer.tsx` com **1.457**. Tamanho não prova defeito, mas esses arquivos concentram ciclo de vida, integração, processamento e UI; as corridas encontradas tornam o custo de revisão concreto.

Extrair fronteiras com contrato próprio: sessão de leitura, alimentação assíncrona de chunks, sync e armazenamento nativo. Evitar divisão apenas por tamanho ou hooks que continuam compartilhando dezenas de refs sem estado bem definido. Manter comentários curtos para decisões não óbvias, conforme a convenção do projeto.

### Desempenho: medições adicionais

O build gerou chunk principal de **1.221,42 kB, 351,08 kB gzip** e aviso de tamanho. O `App` importa telas diretamente. Investigar carregamento por rota, mas esses números não demonstram tempo de abertura em Android nem garantem ganho com lazy loading.

`useLibrary` obtém registros completos via `toArray`, incluindo campos/blobs embedded quando presentes. Virtualização reduz DOM, não necessariamente volume obtido do banco. Medir bibliotecas pequenas/grandes, tempo até interação e memória no aparelho. Considerar separar metadados leves de blobs se houver custo confirmado.

Cache de áudio limita quantidade de entradas, enquanto o peso varia. Avaliar orçamento por bytes em sessão longa, separadamente de R11, cuja retenção já foi demonstrada. Não há benchmark suficiente para ganhos percentuais ou limites definitivos de produção.

### Testes e integração contínua

A suíte é um ativo relevante, mas os defeitos reproduzidos sobreviveram a 1.559 testes verdes. Faltam cenários entre bancos/dispositivos, isolamento de contas e ordem adversa de resolução de Promises. Testar comportamento observável e preservação de dados, evitando espelhar implementação.

Os workflows presentes são `claude.yml` e `claude-code-review.yml`; não identifiquei workflow dedicado aos gates lint/test/build. Automatizar gates em PR e, separadamente, validação Android com dependências disponíveis. Exemplos Android não substituem testes próprios dos plugins/serviço.

Separar unidade/jsdom, integração com parser/renderizador real e QA no aparelho. Mocks de native/foliate são úteis, mas não comprovam sandbox, TalkBack, notificação, wake lock, arquivo físico ou lifecycle do WebView. Limpar o ruído `scrollTo` sem suprimir indiscriminadamente logs de erro.

### Documentação e operação

O guia fornecido descreve schema v16; implementação chega à **v19**. Atualizar inventário arquitetural e preservar a regra de adicionar versões sem reescrever migrações.

O README referencia `docs/test-backlog.md`, `docs/monetization-status.md` e `docs/persistence-audit.md`, mas esses três caminhos não existem no checkout revisado. Corrigir os links ou recuperar a documentação correspondente. Auditoria histórica não é evidência de estado atual. Registrar limitações de QA no artefato de cada entrega.

Scripts que aplicam patches em dependências precisam detectar mudança da âncora esperada. Avisar e seguir pode deixar o app sem comportamento requerido após upgrade. É recomendação de robustez, não confirmação de falha de patch no build desta revisão.

## Proteções existentes que vale preservar

- Bancos Dexie por conta e migrações incrementais; os achados indicam recursos externos ao banco que escapam dessa separação.
- Exclusão de dados relacionados em transação; ampliar para vínculos OPDS e propriedade do arquivo físico.
- Endurecimento do sandbox de renderizadores no Vite, inclusive em dev, e tratamento de conteúdo EPUB. Não foi demonstrada execução arbitrária de scripts nesta revisão.
- PDF.js com `isEvalSupported: false` e liberação de recursos de sessões já abertas.
- Credenciais OPDS em armazenamento criptografado; preservar ao corrigir namespace e destino de headers.
- `allowBackup="false"`, sanitização e controle de logs. Não substituem isolamento lógico entre contas.
- Download/importação local evitando transportar arquivos grandes inteiros em base64 pelo bridge, e validações nativas de caminhos.
- Pipeline Word Lens com testes e validação de assets.

Permitir HTTP para catálogos self-hosted é escolha explícita no código. Não classifiquei essa escolha isolada como defeito. Ela não autoriza enviar credenciais a qualquer origem do feed.

## Sequência recomendada

| Etapa | Escopo | Evidência de conclusão |
|---|---|---|
| 1 | R01/R03/R02: restauração e reconciliação | Dois dispositivos, offline, concorrência e exclusões preservam dados |
| 2 | R07/R05/R04/R12: origem, conta e arquivo | Requests externos sem auth; contas com IDs/arquivos iguais independentes |
| 3 | R09/R08/R10: alimentação e cancelamento de áudio | Tradução lenta continua; pausa/stop encerram a sessão correta |
| 4 | R06/R17/R13/R14: referências, respostas e caches | Re-download, navegação rápida, modelos e Range determinísticos |
| 5 | R11/R15/R16: memória, energia e acessibilidade | Cache medido, lock liberado na pausa, TalkBack/teclado validados |
| 6 | CI e manutenção | Gates obrigatórios, integração nativa, contratos documentados |

São agrupamentos técnicos, não estimativas de prazo. Mudanças de schema/namespace/arquivos precisam preservar dados existentes durante migração.

## Pendências de validação

- Auditoria de vulnerabilidades conhecidas não executada: não há conclusão de dependências sem CVEs. A tentativa de `npm audit` foi rejeitada automaticamente porque enviaria a árvore de dependências a registro externo não verificado; esse envio depende de autorização específica.
- Testes Java não concluíram offline; instrumentação Android não foi executada.
- Sem servidor OPDS/Drive real, duas contas reais ou leitura de credenciais pessoais.
- Sem benchmark de bateria, RSS, cold start ou corpus amplo no aparelho. Medição de retenção limitada ao experimento sintético R11.
- Sem inspeção visual integral de telas/idiomas. Acessibilidade foi demonstrada no DOM e precisa de validação assistiva após correção.
- Billing/ads/integrações foram inspecionados em código, sem transações comerciais ou verificação de disponibilidade atual dos provedores.

## Artefatos entregues

- [Inventário técnico](code-review-2026-10-10/inventory.json).
- [Persistência, rede e memória](code-review-2026-10-10/data.probe.ts): R01/R03/R04/R06/R07/R11/R12.
- [TTS](code-review-2026-10-10/tts.probe.tsx): R08/R09.
- [Tradução e cache](code-review-2026-10-10/translation.probe.ts): R10/R13.
- [UI e paginação](code-review-2026-10-10/ui.probe.tsx): R16/R17.
- [Configuração isolada](code-review-2026-10-10/vitest.review.config.ts) e [resultado](code-review-2026-10-10/probes.log).
- Logs dos gates na mesma pasta, vinculados na tabela de validações.
