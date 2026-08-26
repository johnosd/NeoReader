# Plano: Word Lens

## Metadados

- Feature: marcar no leitor palavras em ingles acima do nivel CEFR do usuario.
- Data da reescrita: 2026-07-13.
- Status: Fase 6 implementada e validada localmente; QA Android permanece pendente por aparelho ausente no ADB.
- Contexto: plano reescrito via skill `plan-feature` depois de definir fontes, pipeline externo e acesso offline aos data packs.
- Plataformas: Web e Android via Capacitor.
- Nivel padrao: B1; selecao entre A1 e C2.
- Escopo de lancamento: marcacao simples do MVP mais definicoes offline da Fase 6; rollout continua opt-in.

## Objetivo

Entregar um Word Lens offline que, ao abrir um EPUB em ingles, marque apenas palavras classificadas acima do nivel CEFR configurado pelo usuario, sem degradar abertura, rolagem, navegacao, traducao, TTS, marcadores ou progresso.

O MVP usa classificacao simples por palavra/lema. Ele nao tenta descobrir qual significado da palavra esta sendo usado na frase.

## Experiencia Do Usuario

Nas configuracoes gerais:

- Word Lens desabilitado por padrao; o usuario pode habilita-lo nas configuracoes gerais.
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

Incremento da Fase 6:

- O toque simples em texto, inclusive sobre palavra marcada, continua abrindo a traducao exatamente como hoje.
- Quando o toque atingir uma palavra marcada, o mesmo menu contextual mostra automaticamente uma area de definicao da palavra exata junto da traducao da frase; nao existe segundo toque nem painel concorrente.
- Como o MVP nao desambigua contexto, o painel mostra os sentidos disponiveis em vez de afirmar automaticamente qual e o correto.

## Escopo E Nao Objetivos

### MVP

- Configuracao global e persistente.
- Data pack CEFR pre-processado e embutido na instalacao.
- Marcacao simples por palavra/lema em livros ingleses.
- Operacao completamente offline.
- Instrumentacao e benchmarks de desempenho sem registrar texto do livro.

### Fora Do MVP Original

- A definicao e os exemplos offline ao tocar foram entregues na Fase 6; pronuncia propria do verbete continua fora do escopo.
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
toque em "abandoned" -> caret captura localmente o alvo Word Lens "abandon"
-> inicia traducao da frase primeiro + carrega dictionary/ab.json em paralelo
-> um unico menu contextual atualiza slots independentes de definicao e traducao
-> mantem particao do dicionario em cache
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
      ab.json
      ac.json
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
  "dictionaryPartitions": ["ab", "ac"],
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

### Particao de dicionario

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

- Word Lens desabilitado por padrao em B1 para registros ausentes ou invalidos; escolhas booleanas ja persistidas continuam preservadas.
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
- Nao varrer o arquivo EPUB inteiro: processar apenas as secoes que o renderer carregar, incluindo eventuais secoes adjacentes pre-carregadas.
- Com o recurso desligado, nao carregar o data pack nem percorrer Text nodes; o leitor base continua abrindo o EPUB e as secoes necessarias para leitura.
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
- Decisao superada na Fase 8: o primeiro MVP usava default ligado; o produto passou para opt-in, mantendo early returns para desligado, C2 e livros nao ingleses.
- Boundary sugerido: arquivos da Fase 3 e este registro; commit `feat(settings): add Word Lens controls`.

## Fase 4: Marcacao No Leitor EPUB

- Status: Done.
- Proposito: marcar secoes carregadas sem interferir no leitor.
- Areas: `src/hooks/useReaderAppearance.ts`, `src/screens/ReaderScreen.tsx`, `src/components/reader/EpubViewer.tsx`, `src/utils/wordLensDom.ts` e testes.

### Revisao De Otimizacao Antes Da Implementacao

- Reutilizar o `getSettings()` que `useReaderAppearance` ja executa; nenhuma segunda query de settings sera criada no `ReaderScreen`.
- Liberar `onLoad` e o loading inicial antes de solicitar o data pack. O Word Lens entra como melhoria progressiva e nunca fica no caminho critico de abertura.
- Manter os CFIs de paragrafo calculados pelo viewer antes de qualquer marcacao e nunca recriar `foliate-view` por mudanca de configuracao.
- Processar Text nodes com `TreeWalker` em fatias cancelaveis com budget interno de 4 ms e no maximo quatro operacoes, criando margem para manter o teto observado abaixo de 8 ms no WebView real; usar `requestIdleCallback` quando disponivel e fallback assíncrono controlado.
- Remocao e reaplicacao tambem devem ser fatiadas; uma geracao mais nova cancela trabalho obsoleto e limpa resultados parciais antes de continuar.
- Spans do MVP serao metricamente neutros: sem padding, margin, mudanca de fonte/peso/line-height e com `pointer-events: none`.
- Ignorar subarvores de vocabulario salvo, traducao, TTS e UI NeoReader para evitar wrappers concorrentes. Bookmarks usam atributos no bloco e continuam compativeis.
- Registrar apenas tempo agregado, quantidade de Text nodes/tokens/matches, secao e versao; nunca texto, lema ou palavra.
- A medicao automatizada desta fase valida custo do helper e ausencia do caminho critico; a decisao de release continua condicionada ao p95 no Android da Fase 5.

### Implementacao

- [x] Obter configuracao Word Lens sem duplicar queries desnecessarias.
- [x] Ativar somente para idioma efetivo `en` ou variante.
- [x] Carregar indice depois que o leitor estiver funcional, sem bloquear `onLoad` inicial.
- [x] Passar configuracao/lookup estavel ao viewer.
- [x] Criar walker separado de `injectVocabHighlight`.
- [x] Ignorar elementos NeoReader, script/style/noscript e spans ja processados.
- [x] Definir ordem segura com vocabulario salvo, bookmark, traducao, TTS e imagens.
- [x] Aplicar `span.nr-word-lens[data-nr-cefr-level]` idempotente.
- [x] Remover/reaplicar ao mudar toggle/nivel sem recriar viewer nem perder CFI/scroll.
- [x] Aplicar estilos por tema sem alterar metricas tipograficas.
- [x] Registrar somente metricas agregadas e versao do pack.
- [x] Fatiar aplicacao e remocao com cancelamento por geracao, budget interno de 4 ms e teto estrutural de quatro operacoes por lote para respeitar o teto de 8 ms por lote no aparelho.
- [x] Preservar CFIs precomputados e garantir `pointer-events: none`/estilos metricamente neutros.

### Testes

- [x] Marcar somente niveis acima; nao marcar desligado, C2, desconhecido ou livro nao ingles.
- [x] Cobrir elementos inline, capitulos repetidos, reprocessamento e desmontagem.
- [x] Cobrir coexistencia com `.nr-vocab`, traducao, bookmark, TTS, chrome e imagens.
- [x] Cobrir mudanca de nivel preservando viewer, progresso e localizacao.
- [x] Cobrir falha no pack sem erro fatal.
- [x] Benchmarkar evento `load` e processamento incremental.
- [x] Cobrir cancelamento de lote obsoleto e limpeza de resultado parcial.

### Criterios De Aceite

- Marcacoes corretas e visiveis em todos os temas.
- Nenhuma alteracao de texto, layout, selecao, CFI ou interacoes.
- Gate automatizado limita quatro operacoes por lote; mediana/p95 e percepcao real no Android permanecem gate obrigatorio da Fase 5.

- Commit sugerido: `feat(reader): highlight above-level CEFR words`
- Risco: mutacao de DOM em capitulos grandes; benchmark e cancelamento sao gates.

### Evidencias Da Fase 4

- `useReaderAppearance` reaproveita a unica leitura de settings e expoe ativacao/nivel ao `ReaderScreen`; nenhuma query adicional foi criada.
- O data pack so e solicitado depois de `EpubViewer.onLoad`, portanto falha ou parse do JSON nao bloqueiam a abertura do livro.
- `wordLensDom.ts` usa `TreeWalker`, lotes idle/fallback com budget interno de 4 ms, teto de quatro operacoes e cancelamento; matches de uma unica Text node tambem sao divididos entre lotes. O teto estrutural protege o leitor mesmo quando o relogio do WebView estiver impreciso ou o processo for preemptado.
- A marcacao ignora UI NeoReader, vocabulario salvo, traducao e TTS; imagens nao sao percorridas e bookmarks permanecem atributos do bloco.
- Troca de nivel remove/reaplica spans sem recriar `foliate-view`, preserva texto do TTS e o CFI de paragrafo calculado antes da marcacao.
- CSS usa somente fundo/sublinhado, sem padding, margin, peso, tamanho ou line-height proprios, e com `pointer-events: none`.
- Telemetria contem somente secao, versao do pack, Text nodes, tokens, matches, tempo total agregado e maior lote; teste confirma ausencia da palavra do livro nos logs.
- Benchmark automatizado cobre 200 matches em uma unica Text node, forca multiplos lotes e exige no maximo quatro operacoes por lote. O tempo de parede continua em telemetria, mas nao e usado como limite de teste porque inclui pausas externas do executor/WebView.
- `npm run lint`: passou sem erros ou avisos.
- `npm run build`: passou com avisos preexistentes do PDF.js e chunk grande.
- `npm test -- --run`: 73 arquivos passaram, 2 foram ignorados; 541 testes passaram e 2 foram ignorados.
- `npm run word-lens:check`: passou e confirmou data pack reproduzivel.
- `npx cap sync android`: passou com os assets atuais.
- `git diff --check`: passou; avisos LF/CRLF sao apenas configuracao do worktree.
- O QA Android da Fase 5 confirmou, depois do ajuste para 6 ms, lote maximo de 7,9 ms no Galaxy S23 e nenhum trabalho continuo atribuivel ao Word Lens acima de 50 ms.
- Boundary sugerido: arquivos da Fase 4 e este registro; commit `feat(reader): highlight above-level CEFR words`.

## Fase 5: QA, Atribuicao E Rollout Do MVP

- Status: Done.
- Proposito: validar release offline e garantir backout seguro.
- Areas: documentacao/licencas, testes e QA Android/Web.

### Implementacao

- [x] Exibir atribuicoes CEFR-J/Octanove em local acessivel no app.
- [x] Documentar versao do pack e limitacoes de cobertura.
- [x] Adicionar legenda visual sem depender apenas de cor.
- [x] Nao animar spans; respeitar acessibilidade e prefers-reduced-motion.
- [x] Manter kill switch via default/configuracao sem migracao destrutiva.
- [x] Atualizar README quando a feature estiver pronta.

### Testes E QA

- [x] Rodar `npm test`, `npm run lint` e `npm run build`.
- [x] Validar app completamente offline em Web e Android.
- [x] Validar temas dark, black, paper, warm, sepia, sage e contrast.
- [x] Validar A1-C2, toggle e persistencia apos reinicio.
- [x] Validar capitulos curtos, longos e literatura com vocabulario denso.
- [x] Regressao: CFI, TOC, progresso, scroll, traducao, TTS, bookmarks, vocabulario salvo e imagens.
- [x] Comparar mediana/p95 ligado versus desligado no aparelho de referencia.
- [x] Confirmar que logs nao contem palavras ou frases do livro.

### Criterios De Aceite

- Testes, lint e build passam.
- QA Web/Android e budget aprovados com evidencia registrada.
- Assets estao dentro do APK/AAB e nenhuma rede e necessaria.
- Atribuicoes acompanham a distribuicao.

- Commit sugerido: `docs(word-lens): add attribution and release evidence`
- Risco: comportamento real do Android WebView nao reproduzido por JSDOM; QA em aparelho e obrigatorio.

### Evidencias Da Fase 5

- A tela de configuracoes exibe legenda com fundo e sublinhado, pack `1.0.0`, limitacoes do MVP e atribuicoes para CEFR-J 1.5, Octanove C1/C2 1.0 sob CC BY-SA 4.0 e Open English WordNet 2025 sob CC BY 4.0. README e arquivo de licencas tambem foram atualizados.
- Os spans declaram `animation: none` e `transition: none`, alem de continuarem sem padding, margem ou alteracao tipografica. Testes cobrem a legenda textual e o CSS sem animacao.
- APK debug gerado e instalado no Samsung Galaxy S23 SM-S911B. Inspecao do APK confirmou `manifest.json`, `levels.json` e `lemmas.json` em `assets/public/word-lens/`.
- Android realmente offline: com Wi-Fi e dados moveis desligados, o EPUB local `The Book of the Thousand and one Nights. Volume 1` abriu em 770 ms e permaneceu funcional. Secao curta: 24 Text nodes e 35 matches; secao densa: 1.929 Text nodes e 2.743 matches. Nenhuma requisicao externa foi necessaria e as redes foram restauradas depois do teste.
- Web: o build de producao foi servido em preview somente por `127.0.0.1`; os tres assets foram obtidos pela mesma origem, com pack `1.0.0`, 8.653 headwords e 9.152 flexoes. Word Lens nao exige origem externa. O shell Web ainda depende do servidor do deployment, pois o NeoReader nao possui service worker offline; isso e comportamento preexistente da plataforma, nao do data pack.
- Os sete temas foram exercitados no WebView. Cada tema manteve 2.743 spans no capitulo denso e o mesmo retangulo medido para a amostra (`59,71 x 21 px`), variando apenas paleta de fundo/texto/sublinhado. Paper e Soft night tambem foram inspecionados visualmente no aparelho.
- O seletor nativo mostrou A1, A2, B1, B2, C1 e C2; os extremos A1/C2 foram selecionados, o toggle foi desligado/ligado e ambos sobreviveram a reinicios. Estado final restaurado para ligado/B1.
- Regressao combinada: no aparelho, TOC, scroll/progresso persistido e traducao com os controles Next/Listen/Bookmark/Save funcionaram com destaques presentes. A suite automatizada cobre CFI, TTS, bookmarks, vocabulario salvo, imagens, reprocessamento e preservacao do viewer sem mutar dados do usuario durante o smoke test.
- Desempenho no S23, dez aberturas por condicao no mesmo livro/posicao: ligado mediana `476 ms`, p95 `496 ms`; desligado mediana `455 ms`, p95 `518 ms`. A mediana variou `+4,6%` (`+21 ms`), dentro do gate de 5% ou 16 ms, e o p95 nao regrediu. Com o budget interno ajustado para 6 ms, o maior lote posterior foi `7,9 ms`; com o recurso desligado houve zero eventos Word Lens.
- Logs reais continham somente secao, versao, contagens e tempos agregados. A busca por palavras conhecidas do capitulo retornou zero e o campo `tokens` permaneceu redigido; nenhum texto, palavra ou frase foi registrado.
- Gates finais: `npm test -- --run` passou com 73 arquivos/542 testes e 2 arquivos/2 testes ignorados; `npm run lint`, `npm run build`, `npm run word-lens:check`, `npx cap sync android` e `gradlew assembleDebug` passaram. O build manteve apenas avisos preexistentes de PDF.js, chunks e Gradle.
- Risco residual de rollout: o S23 e um aparelho de alto desempenho. Antes de ampliar rollout com default ligado, repetir o budget em pelo menos um Android intermediario; o kill switch persistente permite desligar o recurso sem migracao destrutiva.
- Boundary sugerido: arquivos de atribuicao/UI/testes, ajuste de budget em `wordLensDom.ts` e este registro; commit `docs(word-lens): add attribution and release evidence`.

## Fase 7: Correcao Pos-QA De Confiabilidade E Desempenho

- Status: Done.
- Proposito: corrigir falha de abertura silenciosa e regressões de desempenho encontradas no QA ampliado em dispositivo fisico.
- Areas: `src/components/reader/EpubViewer.tsx`, `src/components/reader/TocDrawer.tsx`, `src/utils/wordLensDom.ts`, testes correspondentes e QA Android.

### Diagnostico De Entrada

- Um EPUB em espanhol reproduziu carregamento infinito em 2/2 tentativas: `reader.open.start` sem `success` ou `failure`. O timeout atual cobre `open()`/`init()`, mas e encerrado antes do primeiro evento de secao interativa.
- O QA complementar reproduziu uma corrida intermitente no mesmo EPUB: o renderer ja possuia documentos carregados, mas `relocate` ativava uma secao que ainda nao havia sido promovida a `pendingSection`; o watchdog entao reportava falha apos cerca de 8 segundos. Com outra ordem de eventos, o livro abriu em `236 ms`, descartando corrupcao do arquivo.
- O indice de um livro longo montou 71 linhas por expandir todos os grupos de primeiro nivel. Em medicao isolada no Galaxy S23: p90 `17 ms`, p95 `20 ms`, `4,21%` de frames lentos, PSS `548.880 kB` e `382.296 kB` de memoria grafica.
- O Word Lens excedeu o teto de 8 ms em dois livros distintos (`12,2 ms` e `8,8 ms`), embora a rolagem isolada permanecesse fluida.

### Implementacao

- [x] Manter um watchdog ate a primeira secao realmente interativa e emitir `onError` se `open()`/`init()` resolverem sem evento de `load` utilizavel.
- [x] Impedir sucesso tardio depois que o watchdog ja declarou falha.
- [x] Expandir por padrao apenas os ancestrais do capitulo atual no indice.
- [x] Reduzir o custo de blur do bottom sheet do indice sem remover hierarquia, navegacao direta ou acessibilidade.
- [x] Reduzir budget e quantidade maxima de operacoes por lote do Word Lens, com comportamento conservador quando `requestIdleCallback` expirar.
- [x] Preservar cancelamento, idempotencia, texto, CFI e marcacoes existentes.
- [x] Promover a secao ativa para finalizacao independentemente de `load` ocorrer antes ou depois de `relocate`.
- [x] Reconciliar a secao primaria ja carregada depois de `init()`/`goTo()` sem duplicar `onLoad` ou recriar o viewer.

### Testes E QA

- [x] Cobrir `init()` resolvido sem secao carregada e confirmar erro apos o timeout.
- [x] Cobrir que uma secao pronta cancela o watchdog e chama `onLoad` uma unica vez.
- [x] Cobrir que somente o ramo atual do TOC inicia expandido e os demais continuam navegaveis/expansiveis.
- [x] Cobrir lotes Word Lens expirados e benchmark de capitulo grande.
- [x] Rodar testes focados, lint, build e `git diff --check`.
- [x] Gerar/sincronizar Android e repetir no aparelho o EPUB que travava, o indice longo e os maiores lotes Word Lens.
- [x] Cobrir as ordens `load -> relocate` e `relocate -> load`, incluindo secao primaria ja registrada.
- [x] Reinstalar o APK e abrir `LA TEORIA Y TU` dez vezes sem `reader.open.failure`.

### Criterios De Aceite

- Nenhuma abertura pode permanecer indefinidamente no spinner: deve chegar a sucesso ou erro observavel dentro do watchdog.
- O indice longo deve montar apenas o ramo necessario e melhorar p90/p95, jank e memoria no mesmo aparelho/cenario.
- Nenhum lote Word Lens deve exceder 8 ms no corpus Android exercitado; a rolagem deve permanecer sem regressao perceptivel.
- Nenhum crash, ANR, perda de progresso ou alteracao do texto do EPUB.

- Commit sugerido: `fix(reader): harden loading and long-book performance`
- Riscos: EPUBs muito lentos podem exigir calibracao do watchdog; listas virtualizadas ou blurs alterados precisam preservar foco e navegacao por toque.

### Evidencias Da Fase 7

- O watchdog de 8 segundos agora so e cancelado quando a primeira secao e finalizada como interativa; falha, desmontagem e erro de setup limpam o timer, e eventos tardios nao produzem `onLoad` depois da falha.
- O TOC inicia fechado, exceto pelos ancestrais do capitulo atual. O blur externo foi reduzido de `2xl` para `md` e o blur interno removido.
- Word Lens usa budget interno de 4 ms, limite normal de quatro operacoes e limite de uma operacao quando o callback idle expira.
- Testes focados finais: 3 arquivos e 74 testes passaram.
- Suite completa anterior ao ultimo teste adicional: 73 arquivos/545 testes passaram, com 2 arquivos/2 testes ignorados; o teste adicional tambem passou no gate focado.
- `npm run lint`, `npm run build`, `npx cap sync android`, `gradlew assembleDebug` e `git diff --check` passaram; permanecem apenas avisos preexistentes de PDF.js/chunk/Gradle e conversao LF/CRLF.
- APK debug `1.0.14` (`versionCode 18`) atualizado foi instalado preservando dados no Galaxy S23 SM-S911B. O EPUB em espanhol que antes ficava indefinidamente no spinner abriu com sucesso em 3/3 repeticoes (`246 ms`, `249 ms` e `182 ms`), sem `reader.open.failure`, crash ou ANR.
- No livro longo, o TOC passou de 71 para 48 linhas montadas. Em tres rodadas isoladas de dez gestos, jank ficou em `1,73%`, `1,25%` e `1,22%`, p90 em `12 ms`, p95 em `13 ms` e p99 entre `14-16 ms`; antes eram `4,21%`, p90 `17 ms`, p95 `20 ms` e p99 `40 ms`.
- Depois das rodadas do TOC, memoria grafica ficou em `261.928 kB` e PSS em `442.686 kB`, abaixo da linha de base de `382.296 kB` e `548.880 kB`. O ramo atual permaneceu aberto, os demais grupos continuaram expansiveis e um capitulo aleatorio foi aberto por toque com fechamento correto do painel.
- O maior lote Word Lens observado no corpus corretivo foi `4,2 ms` ao processar uma secao com 1.929 Text nodes. Dois documentos carregados mantiveram 417 e 929 marcacoes. Dez rolagens durante o fluxo de capitulo aleatorio ficaram em `1,53%` de jank, p90/p95 `8 ms` e p99 `13 ms`, sem crash, ANR ou perda visual das marcacoes.
- Nenhum texto do livro foi registrado: a telemetria continuou limitada a contagens, indice de secao, versao do pack e tempos agregados. O estado temporario do aparelho e os forwards ADB/CDP foram restaurados ao encerrar o QA.
- A finalizacao de secao foi centralizada em uma promocao idempotente usada por `load`, `relocate` e pela reconciliacao posterior a `init()`/`goTo()`. Isso cobre a secao ja registrada que se torna primaria depois, sem recriar o viewer nem repetir `onLoad`.
- Duas regressoes novas cobrem `load -> relocate` e `relocate -> stabilized -> load`. O arquivo `EpubViewer.test.tsx` passou com 64/64 testes; a suite completa passou com 73 arquivos/548 testes, alem de 2 arquivos/2 testes ignorados. `npm run lint`, `npm run build` e o teste direcionado do EPUB real `La teoria Let Them` tambem passaram.
- No APK debug `1.0.14` (`versionCode 18`), dez aberturas equivalentes de `LA TEORIA Y TU` tiveram 10/10 sucessos, sem `reader.open.failure`: `255`, `168`, `192`, `197`, `186`, `182`, `167`, `192`, `178` e `140 ms`; mediana `184 ms` e p95 `255 ms`.
- QA ampliado abriu quatro EPUBs distintos e exercitou abrir/fechar o menu contextual no mesmo paragrafo: `AI Engineering`, `LA TEORIA LET THEM`, `The Book of the Thousand and One Nights. Volume 1` e `Delta de Venus`. Os quatro ciclos terminaram com zero elementos `data-nr-active` e zero blocos de traducao residuais. As aberturas iniciais levaram `1.406`, `290`, `1.029` e `182 ms`, respectivamente.
- Na serie de dez aberturas, `gfxinfo` registrou 739 frames, 8,66% marcados como janky pelo Android, p50 `5 ms`, p90 `12 ms`, p95 `15 ms`, p99 `22 ms` e maior bucket nao vazio de `38 ms`. Nao houve frame longo, congelamento perceptivel, crash, ANR ou processo morto durante a reproducao.
- Achado separado, nao bloqueante para Word Lens: `AI Engineering` referencia `OEBPS/override_v1.css` (81.826 bytes no EPUB), mas o WebView tentou `https://localhost/override_v1.css`; as secoes inspecionadas exibiram stylesheet com zero regras. O livro permaneceu legivel, mas pode perder formatacao propria e merece uma correcao futura de resolucao de assets EPUB.
- Boundary sugerido: watchdog e testes de abertura, expansao/custo visual do TOC, budget do Word Lens e este registro; commit `fix(reader): harden loading and long-book performance`.

## Fase 8: Default Opt-In E Compatibilidade De CSS EPUB

- Status: Done.
- Proposito: deixar Word Lens sem custo por padrao e recuperar stylesheets locais presentes no EPUB, mas omitidos do manifest.
- Areas: `src/types/settings.ts`, `src/hooks/useReaderAppearance.ts`, `src/utils/epubResources.ts`, `src/components/reader/EpubViewer.tsx`, tipos Foliate, testes e QA Android.

### Implementacao

- [x] Alterar o default e a normalizacao de `wordLensEnabled` para `false`, preservando valores booleanos ja persistidos.
- [x] Iniciar `useReaderAppearance` com Word Lens desligado para impedir ativacao transitoria antes da leitura das configuracoes.
- [x] Garantir que o estado desligado nao carregue o data pack nem percorra Text nodes do EPUB.
- [x] Registrar stylesheets `.css` existentes no ZIP e ausentes do manifest antes de `init()`/`goTo()`, permitindo que o loader Foliate resolva URLs relativas e dependencias locais.
- [x] Manter bloqueio de scripts e sanitizacao de conteudo executavel.

### Testes E QA

- [x] Cobrir default ausente/invalido desligado e preservacao explicita de `true`/`false`.
- [x] Cobrir estado inicial desligado no hook e ausencia de fetch/processamento quando desabilitado.
- [x] Cobrir registro idempotente de CSS omitido do manifest sem duplicar recursos declarados.
- [x] Rodar testes focados, suite completa, lint, build e teste do corpus EPUB real.
- [x] Validar no Android que `override_v1.css` deixa de resolver para `https://localhost/`, possui regras e nao gera erro Capacitor relacionado ao asset.

### Criterios De Aceite

- Novos registros e valores invalidos iniciam com Word Lens desligado/B1; escolhas existentes permanecem intactas.
- Word Lens desligado nao carrega os JSONs nem classifica texto; somente o leitor base acessa o EPUB.
- CSS local omitido do OPF e carregado pelo pipeline de recursos do Foliate, sem URL relativa vazando para a origem do app.
- Nenhum crash, ANR, regressao de abertura, perda de texto ou relaxamento do bloqueio de scripts.

- Commit sugerido: `fix(reader): load unlisted epub styles and default word lens off`
- Riscos: EPUBs podem conter muitos CSS fora do manifest; registrar apenas entradas `.css` e manter carregamento sob demanda.

### Evidencias Da Fase 8

- O default ausente/invalido passou para desligado/B1; valores booleanos persistidos continuam preservados. O hook tambem inicia desligado, evitando uma ativacao transitoria antes da leitura de settings.
- `WordLensDataService` continua retornando antes de qualquer fetch quando desligado, e `wordLensDom` nao cria `TreeWalker` sem configuracao ativa/dados; se ja existirem spans de uma ativacao anterior, somente a limpeza fatiada e executada.
- `registerUnmanifestedEpubStylesheets` adiciona de forma idempotente apenas entradas `.css` existentes no ZIP e ausentes do manifest. O registro ocorre depois de `open()` e antes de `init()`/`goTo()`, reutilizando o carregamento lazy e a resolucao de dependencias do Foliate.
- Testes focados: 5 arquivos/107 testes passaram. Suite completa: 73 arquivos/550 testes passaram e 2 arquivos/2 testes foram ignorados. `npm run lint`, `npm run build`, `npx cap sync android` e `gradlew assembleDebug` passaram; permanecem apenas avisos preexistentes de PDF.js, chunks e Gradle.
- O caso direcionado `AI_Engineering` do corpus EPUB real passou. Uma tentativa acidentalmente ampla tambem aprovou 69 casos, mas `4 horas para o corpo` excedeu o timeout preexistente de 30 segundos; o resultado nao esta relacionado a esta correcao.
- Com autorizacao explicita, o APK atualizado foi instalado com `adb install -r` preservando livros, progresso e configuracoes no Samsung Galaxy S23 SM-S911B, Android 16/API 36, arm64-v8a, 1080x2340; app 1.0.14 (`versionCode 18`).
- `AI Engineering` abriu pelo fluxo Home -> Resume -> Continue reading. No WebView real, `OEBPS/override_v1.css` apareceu no manifest em memoria como `text/css`; nas duas secoes carregadas, o recurso transformado usou URL `blob:`, respondeu com sucesso, tinha 81.824 caracteres e 335 regras CSS. Nenhum link resolveu para `https://localhost/override_v1.css`.
- Logcat nao registrou `Unable to open asset URL`, crash, ANR, OOM ou falha do renderer. Permanece um aviso separado do EPUB malformado em `OEBPS/toc01.html` por atributo `async` sem valor; o Foliate faz fallback e o capitulo ficou legivel, portanto o aviso nao e causado pela correcao de CSS.
- O estado de Wi-Fi, dados moveis e stay-awake foi restaurado sem divergencias; o app foi recolocado em inicializacao limpa e o forward CDP foi removido.

## Fase 6: Incremento De Definicoes Ao Tocar

- Status: In progress; fora do MVP.
- Proposito: usar Open English WordNet offline sem aumentar o caminho critico do leitor nem alterar o contrato critico do menu contextual de traducao.
- Areas: pipeline Python, `public/word-lens/dictionary/`, `WordLensDataService`, estado combinado no viewer, menu contextual inline e testes.

### Investigacao De Compatibilidade Com A Traducao

- Resultado: existe conflito se definicao e traducao instalarem handlers ou paineis separados para o mesmo toque, mas o toque direto na palavra e viavel com um unico dispatcher e um unico menu combinado.
- Hoje o dispatcher do iframe prioriza, nesta ordem, gesto de scroll, acoes/bloco de traducao, imagem, zonas do chrome, icone de bookmark, TTS, lock de traducao e toggle do paragrafo ativo; todo outro toque em texto legivel chama `selectTextForInlineTranslation` e inicia a traducao da frase.
- Os spans `.nr-word-lens` usam `pointer-events: none`. Isso preserva o target e o fluxo atual de traducao, TTS, bookmarks e chrome. Tornar o span clicavel ou interceptar o evento antes da traducao quebraria esse contrato; executar ambos abriria duas interfaces e criaria concorrencia de estado.
- Long press e double tap nao sao alternativas seguras: competem com selecao nativa, scroll, callout do WebView, acessibilidade e eventos residuais de click.
- Decisao aprovada: manter `pointer-events: none`, detectar pelo caret a palavra marcada exata e usar o mesmo toque para iniciar a traducao da frase e a definicao da palavra dentro do mesmo bloco contextual inline.
- `onTranslate` continua sendo chamado primeiro e exatamente uma vez. O lookup local do dicionario comeca depois, em fluxo assincrono independente, e nunca bloqueia criacao do spinner, requisicao ou renderizacao da traducao.
- O bloco `#nr-translation-block` passa a ter slots estaveis separados para definicao, traducao e acoes. Atualizacoes nao podem substituir o `innerHTML` do bloco inteiro, pois hoje `injectTranslation()` faria uma resposta apagar a outra.
- A grade critica existente com `Next`, `Listen`, `Bookmark` e `Save` nao sera substituida, comprimida ou reordenada. A definicao aparece como conteudo informativo condicional acima da traducao, nao como quinto botao e nao como bottom sheet.
- Toque em palavra nao marcada mantem o bloco atual sem slot visivel de definicao e sem carregar dicionario. Word Lens desligado, nivel C2 e livro nao ingles preservam exatamente o fluxo atual.
- Se o menu ja estiver aberto e o usuario tocar outra palavra marcada do mesmo paragrafo, o alvo da definicao deve mudar para a palavra exata. Na mesma frase a traducao existente pode ser reutilizada; em outra frase, a selecao inicia no maximo uma nova traducao. Tocar novamente a mesma palavra preserva o toggle de fechamento.
- Respostas de definicao e traducao usam o mesmo id de selecao e validam esse id antes de alterar DOM. Troca de palavra, frase, secao ou livro invalida respostas antigas.
- [Resolvida] A regressao combinada toca diretamente um `.nr-word-lens` e prova que definicao e traducao coexistem sem duplicacao ou sobrescrita.
- Linha de base da investigacao: `EpubViewer.test.tsx` e `wordLensDom.test.ts` passaram com 73/73 testes antes da Fase 6; a nova regressao combinada deve ser adicionada primeiro e permanecer verde durante toda a implementacao.

### Implementacao

- [x] Gerar particoes deterministicas por letra/faixa a partir do WordNet.
- [x] Incluir somente entradas necessarias ou justificar cobertura ampliada pelo tamanho.
- [x] Carregar e memoizar a particao somente quando o toque direto atingir palavra Word Lens; nunca carregar na abertura do livro ou em toque de palavra nao marcada.
- [x] Resolver forma flexionada para lema antes do lookup.
- [x] Persistir no span somente metadados locais necessarios (`lemma` e nivel), mantendo `pointer-events: none` e sem enviar palavra para telemetria.
- [x] Resolver o span Word Lens pelo caret no ponto do toque antes de qualquer highlight/split/normalize da traducao e copiar o alvo para um objeto imutavel; nao depender do elemento DOM depois.
- [x] Quando o caret do WebView cair no paragrafo, localizar somente o marcador cujo retangulo de texto contem o ponto do toque, sem handlers novos ou mudanca de `pointer-events`.
- [x] Manter `selectTextForInlineTranslation`, `onTranslate` e a ordem atual dos eventos como caminho obrigatorio; chamar traducao primeiro e lookup de definicao depois, sem handlers concorrentes.
- [x] Refatorar o bloco inline para slots estaveis de definicao, traducao e acoes; cada resultado atualiza somente seu slot e a grade de quatro acoes continua pertencendo a traducao.
- [x] Expor callbacks/metodos de definicao com `selectionId`; ignorar resposta assincrona cujo id nao corresponda mais a palavra/frase ativa.
- [x] Renderizar loading, sucesso, vazio e erro da definicao de forma compacta no mesmo menu, sem bloquear ou esconder os estados da traducao.
- [x] Ao tocar outra palavra marcada, atualizar o alvo exato; reutilizar traducao se a frase nao mudou e evitar qualquer requisicao duplicada.
- [x] Mostrar nivel, lema, POS, sentidos, exemplos disponiveis e sinonimos.
- [x] Informar quando ha varios sentidos; nao afirmar desambiguacao contextual.
- [x] Mostrar fallback claro quando nao houver definicao/exemplo.
- [x] Preservar integralmente prioridades de traducao, TTS, bookmark, imagem e chrome; durante TTS o toque continua pertencendo somente ao TTS.
- [x] Preservar toggle de fechamento, `data-nr-active`, remainder da frase, CFI, progresso e scroll; nenhum resultado de dicionario pode recriar o viewer ou mover o leitor.
- [x] Garantir semantica acessivel no slot (`aria-live` apropriado, heading/rotulos e ordem de leitura definicao -> traducao -> acoes) sem introduzir nova camada modal.
- [x] Exibir atribuicao Open English WordNet.
- [x] Registrar somente nivel, particao, duracao, contagens e resultado; nunca palavra, lema, definicao, frase ou texto traduzido.

### Testes

- [x] Cobrir palavra com um/multiplos sentidos, sem exemplo e sem entrada.
- [x] Cobrir flexao, particao, cache e falha de asset.
- [x] Regressao critica: toque simples diretamente em palavra Word Lens chama `onTranslate` primeiro e exatamente uma vez, mantem `selection.start -> contextMenu.open -> translation.tap` e inicia um unico lookup da palavra exata.
- [x] Confirmar zero fetch de dicionario na abertura/navegacao do livro e em palavra nao marcada; primeiro fetch ocorre somente no toque direto sobre span Word Lens.
- [x] Cobrir caret dentro da palavra, pontuacao/espaco adjacente, palavra em elemento inline e duas palavras marcadas vizinhas sem escolher o alvo errado.
- [x] Cobrir regressao do renderer WebView em que o caret cai no Text node do paragrafo, mas o ponto esta dentro do retangulo do marcador.
- [x] Cobrir que o slot de definicao aparece somente para alvo Word Lens valido e nao chama novamente traducao, chrome, TTS, bookmark ou imagem.
- [x] Cobrir definicao lenta/falha com traducao bem-sucedida e traducao lenta/falha com definicao bem-sucedida; um slot nunca apaga loading, resultado ou erro do outro.
- [x] Cobrir respostas fora de ordem com `selectionId`, troca de palavra na mesma frase sem retraduzir, troca para outra frase com no maximo uma traducao e toggle ao tocar a mesma palavra.
- [x] Manter a grade e o comportamento de `Next`, `Listen`, `Bookmark` e `Save`, inclusive loading, toggle do paragrafo, troca de paragrafo e falha da traducao.
- [x] Cobrir TTS ativo, chrome visivel, icone de bookmark, imagem e gesto de scroll sobre/ao lado de palavra marcada.
- [x] Cobrir acessibilidade e ordem de leitura do menu combinado sem alterar comportamento de Back Android/Escape do leitor.
- [x] Confirmar que dicionario nao e carregado na abertura do livro.
- [ ] Medir tempo ate spinner/requisicao da traducao, tempo ate definicao e memoria do cache; lookup nao pode atrasar o caminho da traducao alem do gate existente de 5% ou 16 ms.
- [x] Confirmar que logs nao contem surface, lema, definicao, frase ou traducao.
- [ ] QA Android em pelo menos um livro com varias palavras marcadas no mesmo paragrafo: tocar cada palavra, validar o menu combinado, usar as quatro acoes existentes, fechar/reabrir e repetir com TTS/chrome ativos.

### Evidencias Locais Da Fase 6

- O pipeline usa o snapshot Open English WordNet 2025 ja fixado por SHA-256 e gera somente entradas presentes na lista CEFR. O pack tem 8.175 headwords com definicao entre 8.653 headwords CEFR (94,48%), 34.211 sentidos e 41.468 exemplos.
- As 222 particoes usam as duas primeiras letras, somam 6.471.370 bytes e limitam o maior JSON a 289.886 bytes. O manifesto lista explicitamente as particoes e o runtime rejeita caminhos externos ou nomes invalidos.
- Uma auditoria do primeiro APK encontrou particoes de uma letra divergentes do validador por causa da semantica de string vazia do Python. A geracao foi corrigida para `a-other`/`i-other`, ganhou regressao e o APK reconstruido contem 222/222 particoes validas.
- Testes focados finais: 5 arquivos/133 testes TypeScript e 7 testes Python passaram. A regressao combinada cobre ordem da traducao, caret exato, pontuacao, elemento inline, duas palavras na mesma frase, resposta obsoleta, slots independentes, quatro acoes, TTS e acessibilidade. O benchmark de 200 matches valida teto estrutural de quatro operacoes por lote; o tempo de parede continua apenas em telemetria porque inclui pausas externas do executor/WebView.
- A suite global atingiu 559 testes aprovados e 2 ignorados; os dois restantes (`BookDetailsScreen`) excederam o timeout preexistente de 5 s apenas sob carga paralela. O arquivo passou isolado com 18/18 em timeout ampliado, e o conjunto focado do Word Lens passou com 133/133.
- `npm run lint`, `npm run build`, `word-lens check --offline`, `npx cap sync android`, `gradlew assembleDebug` e `git diff --check` passaram. O APK debug final tem 26.748.633 bytes e inclui o manifesto corrigido e todas as particoes.
- QA fisico ainda nao executado: `adb start-server` funcionou, mas `adb devices -l` nao listou dispositivo. Nenhuma instalacao, limpeza de log, mudanca de rede ou alteracao de dados do usuario foi realizada.
- QA Android parcial executado em 2026-07-14 no Galaxy S23 (Android 16/API 36, `arm64-v8a`, 1080x2340), app `1.0.14`/`versionCode 18`: a configuracao pessoal original era Word Lens desligado em B2, foi ativada somente durante o smoke test e voltou a desligada em B2. O leitor abriu na posicao salva, marcou palavras e registrou dois lotes com maximos de 3,6 ms e 2,4 ms; nao houve `FATAL EXCEPTION`, ANR ou crash no log do processo.
- Esse aparelho ainda executava `index-Dp9ErTTF.js`, enquanto o APK debug atual contem `index-DG1CBfdW.js`. Por isso, ao tocar uma palavra marcada, a traducao antiga abriu normalmente mas nenhum evento de definicao foi emitido. A validacao fisica do menu combinado e do lookup offline esta bloqueada ate instalar explicitamente o APK debug atual; os dados e as configuracoes do aparelho foram restaurados, inclusive `stay_on_while_plugged_in=0`.
- QA Android do APK atual executado em 2026-07-14 apos instalar `index-DG1CBfdW.js`: os assets `manifest.json`, `levels.json` e `lemmas.json` responderam `200`, e o WebView continha 100 e 193 spans Word Lens nas duas secoes carregadas, com estilo e `pointer-events: none` corretos. Os lotes observados tiveram maximos de 1,7 ms e 4,4 ms; sem crash, ANR ou erro fatal no log do processo.
- Falha confirmada no menu de definicao: tocar uma palavra marcada abre a traducao e preserva as quatro acoes, mas nao emite `reader.wordLens.definition` nem mostra a definicao. A inspecao CDP somente-leitura confirmou que, no renderer continuo do Foliate, `caretRangeFromPoint()` retorna um Text node do paragrafo em vez do span `.nr-word-lens` sob o toque; consequentemente `getWordLensTargetFromClick()` devolve `null`. A causa e a combinacao do caret com `pointer-events: none`, mantido para nao quebrar o contrato da traducao. A correcao deve localizar o span por intervalo/retangulo de texto sem interceptar o evento; o QA do menu combinado permanece pendente ate essa correcao.
- Correcao de seguimento: o lookup do alvo agora preserva o caret como caminho rapido e, somente quando ele nao resolve um marcador, procura o span cujo `getClientRects()` contem o ponto exato do toque. Nao foram alterados handlers, `pointer-events`, ordem de `onTranslate` ou o carregamento do dicionario. A regressao cobre caret no paragrafo com toque dentro do retangulo e toque imediatamente fora dele.
- Gates locais da correcao: 5 arquivos/134 testes TypeScript, 7 testes do pipeline Python, lint, build web, `npx cap sync android`, `gradlew assembleDebug` e `git diff --check` passaram. O APK debug resultante tem 26.748.771 bytes e contem `index-Bl2VduSf.js`; a validacao fisica do menu combinado permanece pendente.
- QA Android complementar em 2026-07-14 no Galaxy S23 confirmou que a build `index-Bl2VduSf.js` carrega o pack e marca 100 ocorrencias na secao testada. Um toque direto em uma marcacao abriu a traducao e preservou `Next`, `Listen`, `Bookmark` e `Save`, mas nao exibiu o slot de definicao. Nos logs controlados houve exatamente uma `reader.translation.tap`, zero `reader.wordLens.definition` e zero requisicoes de `word-lens/dictionary/`; nao houve crash, ANR ou erro fatal. Portanto, o criterio do menu combinado ainda falha no WebView real e a Fase 6 permanece em andamento.
- A mesma secao registrou `maxBatchMs` de 13,6 ms em uma amostra, acima do alvo de 8 ms. Isso nao isola causa nem mede p95, mas tambem mantem a medicao de desempenho da Fase 6 pendente. A configuracao pessoal foi devolvida visualmente a Word Lens desligado/B2; Wi-Fi, dados moveis, `stay_on_while_plugged_in=0` e o forward CDP tambem foram restaurados.

### Criterios De Aceite

- Definicoes funcionam offline.
- Nenhum impacto mensuravel na abertura do leitor.
- Multiplos sentidos e ausencias sao comunicados corretamente.
- Toque simples na palavra marcada identifica exatamente essa palavra e mostra definicao + traducao no mesmo menu; palavra nao marcada preserva o menu atual.
- Traducao e iniciada primeiro, exatamente uma vez, e permanece funcional mesmo se dicionario atrasar ou falhar; definicao tambem permanece se traducao falhar.
- Slots independentes impedem que respostas assincronas se apaguem, e respostas obsoletas nao alteram a selecao atual.
- As quatro acoes existentes, TTS, bookmarks, imagens, chrome, CFI, progresso e scroll permanecem sem regressao.
- Nenhuma particao de dicionario e carregada antes de um toque direto em palavra marcada.

- Commit sugerido: `feat(word-lens): add offline dictionary lookup`
- Riscos: definicoes WordNet podem ser tecnicas para aprendizes; deteccao por caret e respostas concorrentes exigem cobertura em WebView real; particao grande pode disputar main thread com a traducao e deve ser reduzida/medida; o menu combinado nao pode crescer a ponto de ocultar texto e a grade critica.

## Seguranca E Privacidade

- Nenhum trecho do livro sai do dispositivo.
- Nenhuma API key ou servidor e necessario.
- Runtime acessa somente assets locais versionados.
- Pipeline valida formato, checksum e schema antes de gerar arquivos.
- Diagnosticos contem apenas duracao, contagens, nivel e versao do pack.
- Licencas e atribuicoes sao preservadas nos artefatos e na distribuicao.

## Rollout E Backout

- Comecar com build interno e diagnosticos agregados.
- Validar Android de baixo/medio desempenho antes de reconsiderar qualquer rollout com default ligado; o estado atual e opt-in.
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

Fases 0 a 5 e as Fases 7 e 8 corretivas estao concluidas. A Fase 6 de definicoes offline esta implementada, com pipeline, assets, runtime, menu combinado e gates locais aprovados. Word Lens continua opt-in e processa apenas secoes carregadas; nenhuma particao de dicionario entra no caminho de abertura. O unico gate restante e o QA Android manual, bloqueado em 2026-07-14 porque o ADB nao listou o aparelho. Ao reconectar, instalar o APK debug somente com autorizacao explicita, executar o roteiro da Fase 6 e registrar mediana/p95, logs e restauracao do estado.

Arquivos-chave:

- `docs/features/word-lens.md`
- `src/types/settings.ts`
- `src/db/settings.ts`
- `src/screens/SettingsScreen.tsx`
- `src/services/WordLensDataService.ts`
- `src/utils/wordLens.ts`
- `src/utils/wordLensDom.ts`
- `src/utils/epubResources.ts`
- `src/hooks/useReaderAppearance.ts`
- `src/screens/ReaderScreen.tsx`
- `src/components/reader/EpubViewer.tsx`
- `src/i18n/messages.ts`
- testes correspondentes em `src/__tests__/`

Comandos recomendados para o QA complementar em aparelho intermediario:

```powershell
git status --short
adb devices -l
npx cap run android --target <device-id>
# Repetir watchdog, TOC longo, mediana/p95 e maxBatchMs < 8 ms antes do rollout amplo.
```

Decisoes pendentes que precisam ser registradas na Fase 0:

1. [Resolvida] Octanove C1/C2 aprovado sob CC BY-SA 4.0.
2. [Resolvida para iniciar] Meta minima de 85% dos tokens no corpus apos morfologia, sem falsos positivos conhecidos na revisao das 500 formas mais frequentes; reavaliar por nivel na Fase 1.
3. [Resolvida para iniciar] Gerar lema -> formas offline e excluir colisoes; medir tamanho final na Fase 1.
4. [Resolvida] Samsung Galaxy S23 SM-S911B, Android 16/API 36; budget de 5% ou 16 ms e nenhuma long task nova acima de 50 ms.
