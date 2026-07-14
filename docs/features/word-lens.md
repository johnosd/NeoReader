# Plano: Word Lens

## Metadados

- Feature: marcar no leitor palavras em ingles acima do nivel CEFR do usuario.
- Data da reescrita: 2026-07-13.
- Status: em execucao; Fases 0, 1, 2 e 3 concluidas, Fase 4 pronta para iniciar.
- Contexto: plano reescrito via skill `plan-feature` depois de definir fontes, pipeline externo e acesso offline aos data packs.
- Plataformas: Web e Android via Capacitor.
- Nivel padrao: B1; selecao entre A1 e C2.
- Escopo de lancamento: MVP com marcacao simples; painel com definicoes planejado como incremento posterior.

## Objetivo

Entregar um Word Lens offline que, ao abrir um EPUB em ingles, marque apenas palavras classificadas acima do nivel CEFR configurado pelo usuario, sem degradar abertura, rolagem, navegacao, traducao, TTS, marcadores ou progresso.

O MVP usa classificacao simples por palavra/lema. Ele nao tenta descobrir qual significado da palavra esta sendo usado na frase.

## Experiencia Do Usuario

Nas configuracoes gerais:

- Word Lens habilitado por padrao.
- Nivel padrao B1.
- Controle liga/desliga.
- Seletor A1, A2, B1, B2, C1 e C2.
- Explicacao de que palavras acima do nivel escolhido serao marcadas e de que a classificacao e aproximada.

No leitor:

- Usuario B1 ve apenas palavras B2, C1 e C2.
- Usuario C2 nao ve palavras marcadas.
- Palavras ausentes do data pack ficam sem marcacao.
- Livros nao identificados como ingles nao sao processados.
- O recurso funciona sem internet e sem download iniciado pelo usuario.

Incremento posterior:

- Toque em uma palavra marcada abre um painel com nivel, lema, classe gramatical, definicoes, exemplos disponiveis e sinonimos.
- Como o MVP nao desambigua contexto, o painel mostra os sentidos disponiveis em vez de afirmar automaticamente qual e o correto.

## Escopo E Nao Objetivos

### MVP

- Configuracao global e persistente.
- Data pack CEFR pre-processado e embutido na instalacao.
- Marcacao simples por palavra/lema em livros ingleses.
- Operacao completamente offline.
- Instrumentacao e benchmarks de desempenho sem registrar texto do livro.

### Fora Do MVP

- Definicao, traducao, pronuncia ou exemplo ao tocar.
- Desambiguacao contextual por IA/NLP.
- Classificacao de frases, gramatica ou dificuldade global do livro.
- Inferencia de nivel para palavras ausentes das fontes.
- Override por livro.
- Download ou atualizacao independente de data packs pelo usuario.

## Fontes De Dados

### Nivel CEFR

Fonte-base:

- **CEFR-J Vocabulary Profile v1.5**, compilado pelo Tono Laboratory da Tokyo University of Foreign Studies, para A1-B2.
- Repositorio: https://github.com/openlanguageprofiles/olp-en-cefrj
- O repositorio declara uso gratuito inclusive comercial mediante citacao adequada.

Complemento candidato:

- **Octanove Vocabulary Profile C1/C2 v1.0**.
- Licenca declarada: CC BY-SA 4.0.
- A incorporacao de C1/C2 depende de confirmar que as obrigacoes de atribuicao e ShareAlike do data pack derivado sao aceitaveis.

Restricao importante:

- CEFR-J sozinho nao completa de forma satisfatoria os seis niveis. A UI pode oferecer A1-C2 somente quando a cobertura C1/C2 estiver aprovada e validada.
- Se C1/C2 nao for aprovado, o produto nao deve inventar niveis. O plano deve ser reavaliado antes do rollout, possivelmente limitando o MVP a A1-B2 com comunicacao clara.

### Definicoes Para Incremento Posterior

- **Open English WordNet**, distribuido em formato estruturado e sob CC BY 4.0.
- Site: https://en-word.net/
- Fornece lemas, classes gramaticais, synsets, definicoes, relacoes lexicais e exemplos em parte dos sentidos.
- Nem toda entrada CEFR possui correspondencia ou exemplo no WordNet.
- O WordNet nao fornece nivel CEFR; ele complementa, mas nao substitui, CEFR-J/Octanove.

### Fontes Que Nao Entram No Produto Sem Licenca

- Oxford 3000/5000 pode ser usado somente como benchmark privado de cobertura; nao copiar para o bundle nem raspar definicoes.
- Cambridge English Vocabulary Profile e referencia linguistica, mas exige autorizacao/licenca para redistribuicao comercial.
- EFLLex e CC BY-NC-SA e nao entra no NeoReader comercial sem autorizacao adicional.
- Nao usar datasets derivados de GitHub/Kaggle sem proveniencia e licenca verificaveis.

## Como Os Data Packs Chegam Ao NeoReader

O Python nao roda dentro do aplicativo e o usuario nao baixa os arquivos. O pipeline acontece antes do build:

```text
CEFR-J/Octanove + Open English WordNet
                 |
                 v
scripts/word-lens/build_word_lens.py
                 |
                 v
public/word-lens/manifest.json
public/word-lens/levels.json
public/word-lens/lemmas.json (se aprovado pelos benchmarks)
public/word-lens/dictionary/*.json (incremento posterior)
                 |
                 v
npm run build -> dist/word-lens/
                 |
                 v
npx cap sync android -> assets locais do APK/AAB
```

Em runtime:

```text
Word Lens ligado + livro em ingles + nivel menor que C2
                 |
                 v
fetch('/word-lens/manifest.json') e fetch('/word-lens/levels.json')
                 |
                 v
arquivos servidos pelo proprio app/WebView, sem internet
                 |
                 v
indice memoizado em memoria -> processa somente a secao EPUB carregada
```

No incremento de definicoes:

```text
toque em "abandoned" -> resolve "abandon" -> carrega dictionary/a.json localmente
-> procura sentidos -> abre painel -> mantem particao em cache
```

## Estrutura De Arquivos Proposta

```text
scripts/
  word-lens/
    build_word_lens.py
    requirements.txt
    README.md
    tests/
      test_build_word_lens.py

data-sources/
  word-lens/
    sources.lock.json
    licenses/
    # fontes brutas podem ser baixadas pelo script e ficar fora do Git se forem grandes

public/
  word-lens/
    manifest.json
    levels.json
    lemmas.json              # somente se tamanho/cobertura justificarem
    dictionary/              # gerado agora ou no incremento de definicoes
      a.json
      b.json
      ...
      other.json

src/
  services/
    WordLensDataService.ts
  utils/
    wordLens.ts
```

`sources.lock.json` deve registrar URL, versao, data de obtencao, licenca e SHA-256. `manifest.json` deve registrar versao do data pack, fontes, schema, contagens e caminhos dos artefatos.

## Formatos Propostos

### `manifest.json`

```json
{
  "schemaVersion": 1,
  "packVersion": "1.0.0",
  "cefrSources": ["CEFR-J 1.5", "Octanove C1/C2 1.0"],
  "dictionarySource": "Open English WordNet 2025",
  "levelsPath": "levels.json",
  "dictionaryPath": "dictionary",
  "generatedAt": "2026-07-13T00:00:00Z"
}
```

### `levels.json`

Formato final deve ser escolhido por benchmark. Representacao conceitual:

```json
{
  "abandon": 4,
  "ability": 3,
  "reluctant": 5
}
```

Codificacao ordinal:

- A1 = 1
- A2 = 2
- B1 = 3
- B2 = 4
- C1 = 5
- C2 = 6

### Particao de dicionario futura

```json
{
  "abandon": {
    "partsOfSpeech": ["verb"],
    "senses": [
      {
        "partOfSpeech": "verb",
        "definition": "...",
        "examples": ["..."],
        "synonyms": ["..."]
      }
    ]
  }
}
```

As definicoes reais devem vir somente do Open English WordNet, com atribuicao; exemplos ilustrativos no plano nao devem ser copiados para o produto.

## Estado Atual E Pontos De Integracao

- `src/types/settings.ts`: tipos, defaults e normalizacao retrocompativel de configuracoes.
- `src/db/settings.ts`: persistencia global em Dexie; campos aninhados novos nao exigem nova tabela.
- `src/screens/SettingsScreen.tsx`: UI de configuracoes globais e padrao de persistencia de patches.
- `src/hooks/useReaderAppearance.ts`: ja resolve configuracoes e idioma efetivo do livro; avaliar se Word Lens entra aqui ou em hook dedicado para nao misturar responsabilidades.
- `src/screens/ReaderScreen.tsx`: coordena idioma, dados reativos e propriedades entregues ao viewer.
- `src/components/reader/EpubViewer.tsx`: recebe o `Document` de cada iframe no evento `load`.
- `injectVocabHighlight` em `EpubViewer.tsx`: precedente para caminhar nos Text nodes; Word Lens deve usar helper separado e nao misturar marcacao de vocabulario salvo.
- `src/i18n/messages.ts`: mensagens pt-BR, en e es.
- Testes: `src/__tests__/db/settings.test.ts`, `src/__tests__/screens/SettingsScreen.test.tsx`, `src/__tests__/screens/ReaderScreen.test.tsx` e `src/__tests__/components/EpubViewer.test.tsx`.

## Decisoes Funcionais

- Word Lens habilitado por padrao em B1 para usuarios novos e existentes, por normalizacao de settings.
- “Acima do nivel” e comparacao estrita: B1 marca B2/C1/C2.
- C2 e early return: nao existe nivel acima e o data pack nao deve ser carregado.
- Termos sem classificacao ficam sem marcacao.
- Nomes proprios, numeros e simbolos ficam sem marcacao quando ausentes do indice; nao excluir toda palavra capitalizada porque isso removeria palavras validas no inicio de frases.
- Em conflitos de uma mesma grafia com varios niveis, o MVP usa o menor nivel registrado para reduzir falsos positivos.
- Multiword expressions e sentidos contextuais ficam fora do MVP, salvo se o pipeline provar uma forma deterministica e barata de suporta-los.
- O texto exibido nunca e substituido pela forma normalizada.

## Lemas E Flexoes

Problema:

```text
data pack: abandon
livro: abandons, abandoned, abandoning
```

Decisao proposta:

- Nao executar um lematizador pesado no caminho de renderizacao.
- O Python deve avaliar a geracao offline de um mapa forma -> lema usando dados morfologicos com licenca compativel, preferencialmente os recursos do Open English WordNet.
- Incluir apenas variantes verificadas; nao usar stemming ingenuo.
- Se `lemmas.json` ficar grande ou produzir falsos positivos, o MVP inicia com headwords e formas irregulares comprovadas, documentando a cobertura.
- A decisao final depende de benchmark de tamanho, cobertura e precisao na Fase 1.

## Arquitetura De Runtime

### `WordLensDataService`

Responsabilidades:

- Resolver URLs com `import.meta.env.BASE_URL`, evitando assumir raiz `/` em todos os builds.
- Carregar e validar `manifest.json` e `levels.json` por `fetch` local.
- Memoizar promises e indice pronto.
- Expor estado de indisponibilidade sem bloquear abertura do leitor.
- Carregar particao do dicionario somente no incremento de clique.
- Nunca chamar dominios externos.

### Classificador puro

Responsabilidades:

- Tokenizacao Unicode com offsets originais.
- Normalizacao de case e apostrofos.
- Resolucao opcional forma -> lema.
- Lookup O(1) de nivel.
- Retorno de ranges `{ start, end, level, lemma }` apenas quando `wordLevel > userLevel`.
- Nenhuma mutacao de DOM.

### Integracao com o iframe EPUB

- Processar somente documentos emitidos pelo evento `load`.
- Percorrer Text nodes elegiveis.
- Ignorar `script`, `style`, `noscript`, UI/traducao NeoReader e spans ja processados.
- Envolver ranges em `span.nr-word-lens[data-nr-cefr-level]`.
- Manter spans inline sem alterar peso, tamanho, line-height ou largura.
- Ser idempotente e suportar remocao/reaplicacao quando toggle ou nivel mudar.
- Nao recriar `foliate-view` nem perder CFI/scroll.

## Budget De Desempenho

Requisito: o Word Lens nao pode afetar perceptivelmente o leitor.

Gate proposto:

- Mediana e p95 de abertura/ativacao de secao nao podem regredir mais de 5% ou 16 ms, o que for maior, no aparelho Android de referencia.
- Rolagem nao pode apresentar long tasks novas acima de 50 ms atribuiveis ao Word Lens.
- Com recurso desligado, livro nao ingles ou nivel C2, overhead deve ser desprezivel e nenhum data pack deve ser carregado.
- O pack de definicoes nunca entra no caminho de abertura do livro.

Estrategias:

- Lookup em `Map`/objeto/set; nunca regex com milhares de alternativas.
- Indice carregado uma vez e memoizado.
- Processamento apenas da secao carregada.
- Lotes via `requestIdleCallback`, com fallback controlado, se benchmark mostrar necessidade.
- Cancelamento quando documento desmontar ou configuracao mudar.
- Instrumentacao somente com duracao, quantidade de tokens, matches e versao; nunca texto do livro.

## Fase 0: Validacao De Fontes E Spike De Cobertura

- Status: Done.
- Proposito: confirmar licencas, campos, cobertura, tamanho e qualidade antes de construir a feature.
- Areas: `docs/features/word-lens.md`, artefatos temporarios fora do bundle e relatorio de spike.

### Implementacao

- [x] Confirmar os termos publicados do CEFR-J para redistribuicao comercial com atribuicao; aprovacao juridica final permanece recomendada.
- [x] Octanove C1/C2 sob CC BY-SA 4.0 aprovado pelo produto em 2026-07-13, incluindo atribuicao e ShareAlike do data pack derivado.
- [x] Confirmar Open English WordNet 2025 sob CC BY 4.0 como versao do spike, com URL e SHA-256 registrados.
- [x] Contar entradas por nivel, POS, duplicatas e conflitos.
- [x] Cruzar CEFR-J/Octanove com WordNet e medir quantas entradas possuem definicao e exemplo.
- [x] Testar cobertura em capitulos ingleses reais representativos do NeoReader.
- [x] Comparar privadamente com Oxford 3000/5000 somente para medir lacunas; nenhum conteudo Oxford foi salvo no produto.
- [x] Politica C1/C2: incorporar Octanove com atribuicao e distribuir o data pack derivado sob CC BY-SA 4.0. Para flexoes, o spike rejeitou regras inversas em runtime e definiu geracao lema -> formas com exclusao de colisoes, faltando implementar/medir o gerador na Fase 1.
- [x] Aparelho primario: Samsung Galaxy S23 SM-S911B, Android 16/API 36, ARM64, 7.242.452 kB de memoria reportada e display fisico 1080x2340. Budget aprovado no plano: regressao maxima de 5% ou 16 ms e nenhuma long task nova acima de 50 ms.

### Testes/validacoes

- [x] Produzir relatorio de cobertura e conflitos em `docs/features/word-lens-phase-0-spike.md`, com metodologia, URLs e checksums.
- [x] Revisar amostra estratificada de cinco headwords por nivel; a amostra confirmou cobertura WordNet alta e expos entradas funcionais/contracoes sem definicao, como `'m`, que devem ter tratamento proprio.
- [x] Verificar atribuicoes e obrigacoes publicadas; aceite de ShareAlike continua pendente.

### Criterios De Aceite

- Fontes e licencas aprovadas.
- Cobertura A1-C2 possui decisao explicita.
- Politica de flexoes e budget aprovados.
- Nenhuma fonte proprietaria entra nos artefatos distribuiveis.

- Commit sugerido: `docs(word-lens): validate data sources and coverage`
- Risco: C1/C2 ou ShareAlike inviabilizar a UX prometida; esta fase e gate antes da implementacao.

### Registro De Progresso: 2026-07-13

- Relatorio criado: `docs/features/word-lens-phase-0-spike.md`.
- CEFR-J: 7.799 registros, 6.863 headwords unicos e 573 conflitos de nivel por POS.
- Octanove: 2.136 registros, 1.955 headwords unicos, 26 conflitos C1/C2 e 165 overlaps com CEFR-J.
- Com regra do menor nivel: 8.653 headwords A1-C2.
- Open English WordNet 2025: definicao para 94,5% e algum exemplo para 72,4% dos headwords resolvidos.
- Lookup exato no corpus EPUB: 72,6%-83,1% dos tokens; flexoes e contracoes justificam mapa morfologico offline.
- Regras WordNet elevaram a cobertura para 85,2%-91,9%, mas ainda produziram falso positivo sem POS contextual; decisao: gerar flexoes a partir do lema e rejeitar colisoes.
- Produto aprovou Octanove C1/C2 e as obrigacoes CC BY-SA 4.0 em 2026-07-13.
- Nenhum arquivo-fonte ou conteudo proprietario foi adicionado ao repositorio.
- Linha de base: 62 testes focados passaram e `npm run build` passou; nenhum Android estava conectado para benchmark.
- Aparelho de referencia conectado depois da linha de base: Samsung Galaxy S23 SM-S911B, Android 16/API 36. Como e um aparelho de alto desempenho, manter QA complementar em aparelho intermediario antes do rollout.
- Fase 0 concluida. Proximo passo: iniciar Fase 1 pelo `sources.lock.json`, testes Python e gerador deterministico de `manifest.json`/`levels.json`.

## Fase 1: Pipeline Python E Assets Offline

- Status: Done.
- Proposito: gerar data packs deterministas, auditaveis e prontos para Vite/Capacitor.
- Areas: `scripts/word-lens/`, `data-sources/word-lens/`, `public/word-lens/`, `package.json` e testes Python.

### Implementacao

- [x] Criar `sources.lock.json` com URLs, versoes, licencas e checksums.
- [x] Criar download opcional das fontes fixadas, com verificacao SHA-256, tres tentativas e cache local ignorado pelo Git.
- [x] Criar parser/normalizador para CEFR-J e Octanove.
- [x] Criar parser das excecoes morfologicas do Open English WordNet.
- [x] Resolver conflitos pelo menor nivel e emitir `report.json`.
- [x] Gerar `manifest.json` e `levels.json` em ordem deterministica.
- [x] Gerar `lemmas.json` por flexao lema -> forma, priorizando excecoes e excluindo colisoes.
- [x] Preparar contrato do dicionario com `dictionaryPath: null`; geracao particionada foi deliberadamente adiada para a Fase 6 e nao entra no MVP.
- [x] Adicionar `npm run word-lens:build`, `word-lens:check` e `word-lens:test` com mensagens de erro do pipeline.
- [x] Documentar regeneracao, cache, atualizacao de fontes, licencas e artefatos versionados.
- [x] Confirmar que Vite copia os assets para `dist/word-lens/` e Capacitor os inclui no Android.

### Testes

- [x] Testar parsing, campos ausentes, niveis invalidos, case, apostrofos e duplicatas.
- [x] Testar checksums e falha fechada quando a fonte divergir.
- [x] Testar reproducibilidade byte a byte com fixtures e `word-lens:check` real.
- [x] Validar schema e contagens do manifest.
- [x] Medir tamanho bruto, gzip, parse e pico de memoria dos JSONs.
- [x] Executar `npm run build`, verificar `dist/word-lens/`, executar `npx cap sync android` e verificar assets Android.

### Criterios De Aceite

- Um comando reproduz os mesmos artefatos.
- Assets distribuidos possuem proveniencia/licenca/checksum.
- Build Web e Android acessam os mesmos caminhos locais.
- O artefato nao contem conteudo Oxford/Cambridge/EFLLex.

- Commit sugerido: `feat(word-lens): add offline data pack pipeline`
- Riscos: dependencias Python complexas e assets grandes; manter pipeline pequeno, fixado e independente do runtime.

### Registro De Progresso: 2026-07-13

- Pipeline implementado somente com a biblioteca padrao Python; nenhum pacote Python de runtime foi adicionado.
- Fontes fixadas: CEFR-J 1.5, Octanove C1/C2 1.0 e Open English WordNet 2025 WNDB.
- Artefatos: 8.653 headwords, 9.152 formas flexionadas deterministicas, 758 conflitos CEFR resolvidos pelo menor nivel e 4 colisoes morfologicas excluidas.
- Tamanhos: `levels.json` 110.035 bytes/33.553 gzip; `lemmas.json` 189.718 bytes/42.527 gzip; `manifest.json` 1.391 bytes/758 gzip; `report.json` 118.823 bytes/6.308 gzip.
- Auditoria corrigiu formas artificiais como `stoping`, `seing` e `maked`; formas validas `stopping`, `seeing`, `making` e `saying` resolvem corretamente.
- `npm run word-lens:test`: 6 testes passaram.
- `npm run word-lens:check`: passou e confirmou reproducibilidade.
- `npm run lint`: passou.
- `npm test`: 70 arquivos passaram, 2 foram ignorados; 511 testes passaram e 2 foram ignorados.
- `npm run build`: passou com avisos preexistentes do PDF.js/chunk grande.
- `npx cap sync android`: passou; os quatro assets foram copiados com os mesmos tamanhos para `android/app/src/main/assets/public/word-lens/`.
- Risco residual: a cobertura e o custo no JavaScript/Android serao medidos novamente nas Fases 2 e 4; o S23 continua exigindo QA complementar em aparelho intermediario.
- Boundary sugerido: todos os arquivos da Fase 1, sem `docs/backlog.md`; commit `feat(word-lens): add offline data pack pipeline`.

## Fase 2: Servico De Dados E Classificador

- Status: Done.
- Proposito: carregar assets locais e classificar texto com API pura e custo previsivel.
- Areas: `src/services/WordLensDataService.ts`, `src/utils/wordLens.ts` e testes unitarios.

### Implementacao

- [x] Definir `CefrLevel` e funcoes ordinais.
- [x] Resolver caminhos via `import.meta.env.BASE_URL`.
- [x] Implementar fetch local, validacao basica de schema, memoizacao e erro nao bloqueante.
- [x] Garantir early return antes do fetch quando desligado, C2 ou livro nao ingles.
- [x] Implementar tokenizacao Unicode e ranges originais.
- [x] Implementar normalizacao de case/apostrofos e resolucao opcional de lema.
- [x] Retornar somente palavras estritamente acima do nivel.
- [x] Garantir que o servico nunca usa URL externa.

### Testes

- [x] Cobrir A1-C2, comparacao estrita, termo ausente e conflitos.
- [x] Cobrir pontuacao, apostrofos, hifens, case, Unicode e offsets.
- [x] Cobrir flexoes conforme politica aprovada.
- [x] Cobrir memoizacao, erro de asset, base path e ausencia de fetch nos early returns.
- [x] Benchmarkar texto pequeno, medio e extremo sem DOM.

### Criterios De Aceite

- Classificacao e deterministica e nao altera texto.
- Assets sao carregados apenas quando necessarios.
- Falha no data pack desativa Word Lens para a sessao sem impedir leitura.

- Commit sugerido: `feat(word-lens): add local CEFR classifier`
- Risco: base path divergente entre Web e Capacitor; validar nos dois ambientes.

### Evidencias Da Fase 2

- Tipos CEFR e contratos do data pack adicionados em `src/types/wordLens.ts`.
- `WordLensDataService` carrega apenas assets same-origin, valida schema, memoiza sucesso ou indisponibilidade da sessao e evita fetch nos early returns.
- Classificador puro preserva offsets do texto, normaliza case/apostrofos, usa flexoes precomputadas e aplica comparacao CEFR estrita.
- 16 testes focados passaram, incluindo benchmark sem DOM para textos pequeno, medio e extremo.
- `npm run lint`: passou.
- `npm run build`: passou com os avisos preexistentes de PDF.js e chunk grande.
- `npm test -- --run`: 72 arquivos passaram, 2 foram ignorados; 527 testes passaram e 2 foram ignorados.
- `git diff --check`: passou; o aviso de conversao LF/CRLF do plano e apenas configuracao do worktree.
- Risco residual: a medicao decisiva de frame/long task continua na integracao real com o walker e no Android durante a Fase 4.
- Boundary sugerido: arquivos da Fase 2 e este registro no plano; commit `feat(word-lens): add local CEFR classifier`.

## Fase 3: Configuracoes Globais

- Status: Done.
- Proposito: persistir ativacao e nivel B1 padrao com UI acessivel.
- Areas: `src/types/settings.ts`, `src/db/settings.ts`, `src/screens/SettingsScreen.tsx`, `src/i18n/messages.ts` e testes.

### Implementacao

- [x] Adicionar `wordLensEnabled: boolean` e `wordLensLevel: CefrLevel` ao grupo global apropriado.
- [x] Normalizar ausentes/invalidos para `true` e `B1`, preservando settings legados.
- [x] Criar secao com Switch, seletor A1-C2, descricao e nota de classificacao aproximada.
- [x] Desabilitar/ajustar niveis na UI se a Fase 0 nao aprovar cobertura C1/C2.
- [x] Traduzir pt-BR, en e es.
- [x] Nao carregar data packs ao apenas abrir a tela de configuracoes.

### Testes

- [x] Cobrir defaults, normalizacao invalida, persistencia e patches concorrentes.
- [x] Cobrir toggle, selecao de nivel, estado inicial e rotulos acessiveis.
- [x] Cobrir chaves completas de i18n.
- [x] Confirmar ausencia de fetch do pack na tela de configuracoes.

### Criterios De Aceite

- Usuario controla o recurso globalmente.
- Usuarios existentes recebem default sem quebra de dados.
- UI promete somente niveis com cobertura aprovada.

- Commit sugerido: `feat(settings): add Word Lens controls`
- Risco: ativacao automatica surpreender usuarios existentes; oferecer toggle claro e backout por default.

### Evidencias Da Fase 3

- `ReaderDefaults` agora persiste `wordLensEnabled` e `wordLensLevel`; registros ausentes ou invalidos recebem `true` e `B1` sem migracao destrutiva.
- Configuracoes gerais exibem switch acessivel, seletor A1-C2 e aviso de classificacao aproximada; o seletor fica indisponivel quando o recurso esta desligado.
- C1/C2 permaneceram visiveis porque a cobertura complementar foi aprovada na Fase 0.
- Mensagens adicionadas em pt-BR, ingles e espanhol, validadas pelo contrato tipado de i18n durante o build.
- A tela nao importa o servico Word Lens nem faz fetch do data pack; teste dedicado confirma a ausencia de chamada.
- 20 testes focados passaram para persistencia e tela de configuracoes.
- `npm run lint`: passou.
- `npm run build`: passou com avisos preexistentes do PDF.js e chunk grande.
- `npm test -- --run`: 72 arquivos passaram, 2 foram ignorados; 531 testes passaram e 2 foram ignorados.
- `git diff --check`: passou; avisos LF/CRLF sao apenas configuracao do worktree.
- Risco residual: o default ligado so produz custo quando a Fase 4 integrar o leitor; early returns do servico continuam sendo a protecao para C2 e livros nao ingleses.
- Boundary sugerido: arquivos da Fase 3 e este registro; commit `feat(settings): add Word Lens controls`.

## Fase 4: Marcacao No Leitor EPUB

- Status: Not started.
- Proposito: marcar secoes carregadas sem interferir no leitor.
- Areas: `src/screens/ReaderScreen.tsx`, `src/components/reader/EpubViewer.tsx`, novo helper DOM e testes.

### Implementacao

- [ ] Obter configuracao Word Lens sem duplicar queries desnecessarias.
- [ ] Ativar somente para idioma efetivo `en` ou variante.
- [ ] Carregar indice depois que o leitor estiver funcional, sem bloquear `onLoad` inicial.
- [ ] Passar configuracao/lookup estavel ao viewer.
- [ ] Criar walker separado de `injectVocabHighlight`.
- [ ] Ignorar elementos NeoReader, script/style/noscript e spans ja processados.
- [ ] Definir ordem segura com vocabulario salvo, bookmark, traducao, TTS e imagens.
- [ ] Aplicar `span.nr-word-lens[data-nr-cefr-level]` idempotente.
- [ ] Remover/reaplicar ao mudar toggle/nivel sem recriar viewer nem perder CFI/scroll.
- [ ] Aplicar estilos por tema sem alterar metricas tipograficas.
- [ ] Registrar somente metricas agregadas e versao do pack.

### Testes

- [ ] Marcar somente niveis acima; nao marcar desligado, C2, desconhecido ou livro nao ingles.
- [ ] Cobrir elementos inline, capitulos repetidos, reprocessamento e desmontagem.
- [ ] Cobrir coexistencia com `.nr-vocab`, traducao, bookmark, TTS, chrome e imagens.
- [ ] Cobrir mudanca de nivel preservando viewer, progresso e localizacao.
- [ ] Cobrir falha no pack sem erro fatal.
- [ ] Benchmarkar evento `load` e processamento incremental.

### Criterios De Aceite

- Marcacoes corretas e visiveis em todos os temas.
- Nenhuma alteracao de texto, layout, selecao, CFI ou interacoes.
- Budget de desempenho cumprido no Android de referencia.

- Commit sugerido: `feat(reader): highlight above-level CEFR words`
- Risco: mutacao de DOM em capitulos grandes; benchmark e cancelamento sao gates.

## Fase 5: QA, Atribuicao E Rollout Do MVP

- Status: Not started.
- Proposito: validar release offline e garantir backout seguro.
- Areas: documentacao/licencas, testes e QA Android/Web.

### Implementacao

- [ ] Exibir atribuicoes CEFR-J/Octanove em local acessivel no app.
- [ ] Documentar versao do pack e limitacoes de cobertura.
- [ ] Adicionar legenda visual sem depender apenas de cor.
- [ ] Nao animar spans; respeitar acessibilidade e prefers-reduced-motion.
- [ ] Manter kill switch via default/configuracao sem migracao destrutiva.
- [ ] Atualizar README quando a feature estiver pronta.

### Testes E QA

- [ ] Rodar `npm test`, `npm run lint` e `npm run build`.
- [ ] Validar app completamente offline em Web e Android.
- [ ] Validar temas dark, black, paper, warm, sepia, sage e contrast.
- [ ] Validar A1-C2, toggle e persistencia apos reinicio.
- [ ] Validar capitulos curtos, longos e literatura com vocabulario denso.
- [ ] Regressao: CFI, TOC, progresso, scroll, traducao, TTS, bookmarks, vocabulario salvo e imagens.
- [ ] Comparar mediana/p95 ligado versus desligado no aparelho de referencia.
- [ ] Confirmar que logs nao contem palavras ou frases do livro.

### Criterios De Aceite

- Testes, lint e build passam.
- QA Web/Android e budget aprovados com evidencia registrada.
- Assets estao dentro do APK/AAB e nenhuma rede e necessaria.
- Atribuicoes acompanham a distribuicao.

- Commit sugerido: `docs(word-lens): add attribution and release evidence`
- Risco: comportamento real do Android WebView nao reproduzido por JSDOM; QA em aparelho e obrigatorio.

## Fase 6: Incremento De Definicoes Ao Tocar

- Status: Not started; fora do MVP.
- Proposito: usar Open English WordNet offline sem aumentar o caminho critico do leitor.
- Areas: pipeline Python, `public/word-lens/dictionary/`, `WordLensDataService`, viewer, novo bottom sheet e testes.

### Implementacao

- [ ] Gerar particoes deterministicas por letra/faixa a partir do WordNet.
- [ ] Incluir somente entradas necessarias ou justificar cobertura ampliada pelo tamanho.
- [ ] Carregar particao apenas no primeiro toque e memoizar.
- [ ] Resolver forma flexionada para lema antes do lookup.
- [ ] Mostrar nivel, lema, POS, sentidos, exemplos disponiveis e sinonimos.
- [ ] Informar quando ha varios sentidos; nao afirmar desambiguacao contextual.
- [ ] Mostrar fallback claro quando nao houver definicao/exemplo.
- [ ] Integrar prioridade de toque sem quebrar traducao, TTS, bookmark ou chrome.
- [ ] Exibir atribuicao Open English WordNet.

### Testes

- [ ] Cobrir palavra com um/multiplos sentidos, sem exemplo e sem entrada.
- [ ] Cobrir flexao, particao, cache e falha de asset.
- [ ] Cobrir acessibilidade, Back Android, Escape e foco do bottom sheet.
- [ ] Confirmar que dicionario nao e carregado na abertura do livro.
- [ ] Medir latencia do primeiro toque e memoria do cache.

### Criterios De Aceite

- Definicoes funcionam offline.
- Nenhum impacto mensuravel na abertura do leitor.
- Multiplos sentidos e ausencias sao comunicados corretamente.

- Commit sugerido: `feat(word-lens): add offline dictionary lookup`
- Risco: definicoes WordNet podem ser tecnicas para aprendizes; avaliar UX antes de prometer linguagem pedagogica.

## Seguranca E Privacidade

- Nenhum trecho do livro sai do dispositivo.
- Nenhuma API key ou servidor e necessario.
- Runtime acessa somente assets locais versionados.
- Pipeline valida formato, checksum e schema antes de gerar arquivos.
- Diagnosticos contem apenas duracao, contagens, nivel e versao do pack.
- Licencas e atribuicoes sao preservadas nos artefatos e na distribuicao.

## Rollout E Backout

- Comecar com build interno e diagnosticos agregados.
- Validar Android de baixo/medio desempenho antes de manter default ligado.
- Backout: alterar default para desligado ou ocultar o controle, preservando settings.
- Falha de asset em runtime desativa apenas Word Lens na sessao.
- Se C1/C2 falhar em licenca/cobertura, nao reclassificar silenciosamente; limitar escopo e comunicar.
- Data packs sao atualizados junto com nova versao do app, nao remotamente.

## Plano De Commits

1. `docs(word-lens): validate data sources and coverage`
2. `feat(word-lens): add offline data pack pipeline`
3. `feat(word-lens): add local CEFR classifier`
4. `feat(settings): add Word Lens controls`
5. `feat(reader): highlight above-level CEFR words`
6. `docs(word-lens): add attribution and release evidence`
7. Futuro: `feat(word-lens): add offline dictionary lookup`

Cada commit deve ser pequeno, focado e testado. Nao incluir a alteracao preexistente em `docs/backlog.md`.

## Acompanhamento Durante A Execucao

- Este arquivo e a fonte de verdade.
- Marcar somente uma fase como `In progress`.
- Ao concluir fase, atualizar checkboxes, arquivos, comandos, resultados e riscos residuais.
- Registrar qualquer mudanca de fonte, licenca, formato ou budget com motivo.
- Nao criar commits automaticamente; sugerir boundary e aguardar pedido.

## Handoff Para A Proxima Sessao

Fases 0, 1, 2 e 3 concluidas. Pipeline, servico, classificador e configuracoes globais estao prontos. A proxima fase integra o Word Lens apenas em EPUBs ingleses, processando secoes carregadas de forma incremental e reversivel, com budget de desempenho medido.

Arquivos-chave:

- `docs/features/word-lens.md`
- `src/types/settings.ts`
- `src/db/settings.ts`
- `src/screens/SettingsScreen.tsx`
- `src/services/WordLensDataService.ts`
- `src/utils/wordLens.ts`
- `src/hooks/useReaderAppearance.ts`
- `src/screens/ReaderScreen.tsx`
- `src/components/reader/EpubViewer.tsx`
- `src/i18n/messages.ts`
- testes correspondentes em `src/__tests__/`

Comandos iniciais:

```powershell
git status --short
npm test -- src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx
npm run build
```

Decisoes pendentes que precisam ser registradas na Fase 0:

1. [Resolvida] Octanove C1/C2 aprovado sob CC BY-SA 4.0.
2. [Resolvida para iniciar] Meta minima de 85% dos tokens no corpus apos morfologia, sem falsos positivos conhecidos na revisao das 500 formas mais frequentes; reavaliar por nivel na Fase 1.
3. [Resolvida para iniciar] Gerar lema -> formas offline e excluir colisoes; medir tamanho final na Fase 1.
4. [Resolvida] Samsung Galaxy S23 SM-S911B, Android 16/API 36; budget de 5% ou 16 ms e nenhuma long task nova acima de 50 ms.
